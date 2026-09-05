-- LOCAL SUPABASE ONLY. Run as supabase_admin so dblink can overlap formal
-- numbering and repeated claims against their database locks.

\set ON_ERROR_STOP on

create extension if not exists dblink schema extensions;

drop table if exists public.signup_account_rollout_test_context;
create table public.signup_account_rollout_test_context (
  user_one uuid not null,
  user_two uuid not null
);

revoke all on public.signup_account_rollout_test_context
  from public, anon, authenticated;

insert into public.signup_account_rollout_test_context
values (gen_random_uuid(), gen_random_uuid());

update private.signup_rollout_state
set
  account_class = 'a',
  last_registration_sequence = 0,
  trial_slots_granted = 0,
  trial_grants_enabled = false,
  updated_at = now()
where singleton;

update private.cloud_trial_settings
set
  storage_limit_bytes = 30000000,
  trial_duration_days = 90,
  handling_period_days = 90,
  platform_storage_pause_bytes = 700000000,
  claims_enabled = true,
  updated_at = now()
where singleton;

create or replace function public.signup_account_rollout_test_attempt(
  p_user_id uuid,
  p_email text,
  p_hold_seconds double precision
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_account_number text;
  v_trial_slot integer;
begin
  select created_account_number, granted_trial_slot
  into v_account_number, v_trial_slot
  from private.initialize_new_account(p_user_id, p_email, now());

  perform pg_catalog.pg_sleep(greatest(coalesce(p_hold_seconds, 0), 0));

  return format(
    '%s:%s',
    v_account_number,
    coalesce(v_trial_slot::text, 'none')
  );
end;
$$;

select extensions.dblink_connect(
  'signup_rollout_one',
  'dbname=postgres user=postgres'
);
select extensions.dblink_connect(
  'signup_rollout_two',
  'dbname=postgres user=postgres'
);

select extensions.dblink_send_query(
  'signup_rollout_one',
  format(
    'select public.signup_account_rollout_test_attempt(%L::uuid, %L, 2)',
    c.user_one,
    'signup-rollout-one@example.test'
  )
)
from public.signup_account_rollout_test_context as c;

select extensions.dblink_send_query(
  'signup_rollout_two',
  format(
    'select public.signup_account_rollout_test_attempt(%L::uuid, %L, 0)',
    c.user_two,
    'signup-rollout-two@example.test'
  )
)
from public.signup_account_rollout_test_context as c;

create temporary table signup_rollout_results (result text not null);
insert into signup_rollout_results
select *
from extensions.dblink_get_result('signup_rollout_one') as r(result text);
insert into signup_rollout_results
select *
from extensions.dblink_get_result('signup_rollout_two') as r(result text);

do $$
declare
  c public.signup_account_rollout_test_context%rowtype;
  v_year integer := extract(year from now() at time zone 'UTC')::integer;
begin
  select * into c from public.signup_account_rollout_test_context;

  if (
    select count(*)
    from public.users as u
    where u.id in (c.user_one, c.user_two)
      and not u.is_internal_test
      and u.registration_sequence in (1, 2)
      and u.account_number in (
        format('LSa-%s-0001', v_year),
        format('LSa-%s-0002', v_year)
      )
      and u.signup_trial_slot is null
      and u.signup_trial_granted_at is null
      and not u.cloud_enabled
  ) <> 2 then
    raise exception 'concurrent numbering did not create two local-free formal accounts';
  end if;

  if (
    select count(distinct u.registration_sequence)
    from public.users as u
    where u.id in (c.user_one, c.user_two)
  ) <> 2 then
    raise exception 'concurrent numbering produced a duplicate rank';
  end if;

  if exists (
    select 1
    from public.user_memberships as m
    where m.user_id in (c.user_one, c.user_two)
  ) then
    raise exception 'registration still created an automatic membership';
  end if;

  if (
    select count(*)
    from public.profiles as p
    where p.id in (c.user_one, c.user_two)
      and p.storage_limit = 0
  ) <> 2 then
    raise exception 'formal accounts did not start with zero cloud capacity';
  end if;

  if (
    select s.last_registration_sequence
    from private.signup_rollout_state as s
    where s.singleton
  ) <> 2 then
    raise exception 'formal account sequence is incorrect after concurrency';
  end if;
end;
$$;

select extensions.dblink_disconnect('signup_rollout_one');
select extensions.dblink_disconnect('signup_rollout_two');

-- Retrying account initialization must not consume a second number.
select *
from private.initialize_new_account(
  (select user_one from public.signup_account_rollout_test_context),
  'signup-rollout-one@example.test',
  now()
);

do $$
begin
  if (
    select last_registration_sequence
    from private.signup_rollout_state
    where singleton
  ) <> 2 then
    raise exception 'idempotent account retry consumed another rank';
  end if;
end;
$$;

-- Add matching confirmed Auth identities. The auth trigger takes the
-- initializer idempotency path because the public account rows already exist.
insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  created_at,
  updated_at
)
select
  fixture.user_id,
  'authenticated',
  'authenticated',
  fixture.email,
  now(),
  now(),
  now()
from public.signup_account_rollout_test_context as c
cross join lateral (
  values
    (c.user_one, 'signup-rollout-one@example.test'),
    (c.user_two, 'signup-rollout-two@example.test')
) as fixture(user_id, email);

create or replace function public.cloud_trial_claim_test_attempt(
  p_user_id uuid,
  p_hold_seconds double precision
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_ok boolean;
  v_already_claimed boolean;
  v_trial_ends_at timestamptz;
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);

  select c.ok, c.already_claimed, c.trial_ends_at
  into v_ok, v_already_claimed, v_trial_ends_at
  from public.claim_my_cloud_trial() as c;

  perform pg_catalog.pg_sleep(greatest(coalesce(p_hold_seconds, 0), 0));

  return format(
    '%s:%s:%s',
    coalesce(v_ok::text, 'null'),
    coalesce(v_already_claimed::text, 'null'),
    coalesce(v_trial_ends_at::text, 'null')
  );
end;
$$;

select extensions.dblink_connect(
  'cloud_trial_claim_one',
  'dbname=postgres user=postgres'
);
select extensions.dblink_connect(
  'cloud_trial_claim_two',
  'dbname=postgres user=postgres'
);

select extensions.dblink_send_query(
  'cloud_trial_claim_one',
  format(
    'select public.cloud_trial_claim_test_attempt(%L::uuid, 2)',
    c.user_one
  )
)
from public.signup_account_rollout_test_context as c;

select extensions.dblink_send_query(
  'cloud_trial_claim_two',
  format(
    'select public.cloud_trial_claim_test_attempt(%L::uuid, 0)',
    c.user_one
  )
)
from public.signup_account_rollout_test_context as c;

create temporary table cloud_trial_claim_results (result text not null);
insert into cloud_trial_claim_results
select *
from extensions.dblink_get_result('cloud_trial_claim_one') as r(result text);
insert into cloud_trial_claim_results
select *
from extensions.dblink_get_result('cloud_trial_claim_two') as r(result text);

do $$
declare
  c public.signup_account_rollout_test_context%rowtype;
begin
  select * into c from public.signup_account_rollout_test_context;

  if (select count(*) from private.cloud_trial_claims where user_id = c.user_one) <> 1 then
    raise exception 'concurrent claim created more or fewer than one ledger row';
  end if;

  if (
    select count(*)
    from private.cloud_trial_claims as claim
    join public.user_memberships as membership
      on membership.user_id = claim.user_id
    where claim.user_id = c.user_one
      and claim.trial_ends_at = claim.claimed_at + interval '90 days'
      and claim.cleanup_due_at = claim.trial_ends_at + interval '90 days'
      and membership.plan = 'trial'
      and membership.status = 'trialing'
      and membership.trial_started_at = claim.claimed_at
      and membership.trial_ends_at = claim.trial_ends_at
      and membership.storage_limit_bytes = 30000000
  ) <> 1 then
    raise exception 'claim did not create the fixed 30 MB / 90-day membership';
  end if;

  if (select storage_limit from public.profiles where id = c.user_one) <> 30000000 then
    raise exception 'claim did not synchronize profile capacity';
  end if;

  if (
    select count(*)
    from cloud_trial_claim_results
    where result like 'true:%'
  ) <> 2 then
    raise exception 'concurrent claim calls were not idempotent successes';
  end if;
end;
$$;

select extensions.dblink_disconnect('cloud_trial_claim_one');
select extensions.dblink_disconnect('cloud_trial_claim_two');

-- A confirmed paid term permanently excludes a formal account from claiming
-- the one-time free trial, even when it does not currently have active access.
insert into public.membership_payments (
  user_id,
  plan,
  status,
  amount,
  currency,
  payment_method
)
select
  user_two,
  'basic',
  'confirmed',
  64,
  'CNY',
  'manual'
from public.signup_account_rollout_test_context;

do $$
declare
  c public.signup_account_rollout_test_context%rowtype;
  v_ok boolean;
  v_reason text;
begin
  select * into c from public.signup_account_rollout_test_context;
  perform set_config('request.jwt.claim.sub', c.user_two::text, true);

  select claim.ok, claim.reason
  into v_ok, v_reason
  from public.claim_my_cloud_trial() as claim;

  if coalesce(v_ok, false) or v_reason <> 'paid_membership_history' then
    raise exception 'confirmed paid history did not block a later free-trial claim';
  end if;

  if exists (
    select 1 from private.cloud_trial_claims as claim
    where claim.user_id = c.user_two
  ) then
    raise exception 'paid-history rejection still consumed a trial claim';
  end if;
end;
$$;

delete from public.membership_payments
where user_id = (select user_two from public.signup_account_rollout_test_context);

-- One active 30 MB commitment plus the next 30 MB claim exceeds this 30 MB
-- safety line. Registration remains intact while only the second claim pauses.
update private.cloud_trial_settings
set platform_storage_pause_bytes = 30000000,
    updated_at = now()
where singleton;

do $$
declare
  c public.signup_account_rollout_test_context%rowtype;
  v_ok boolean;
  v_reason text;
begin
  select * into c from public.signup_account_rollout_test_context;
  perform set_config('request.jwt.claim.sub', c.user_two::text, true);

  select claim.ok, claim.reason
  into v_ok, v_reason
  from public.claim_my_cloud_trial() as claim;

  if coalesce(v_ok, false) or v_reason <> 'storage_safety_threshold' then
    raise exception 'storage safety line did not pause only the new claim';
  end if;

  if not exists (
    select 1
    from public.users as u
    where u.id = c.user_two
      and not u.cloud_enabled
      and u.account_number is not null
  ) then
    raise exception 'paused claim modified or removed the formal account';
  end if;
end;
$$;

-- If the daily worker first runs inside the final seven days, it sends only
-- the timely seven-day notice and marks the stale 30-day milestone as skipped.
update private.cloud_trial_claims as claim
set
  claimed_at = now() - interval '84 days',
  trial_ends_at = now() + interval '6 days',
  cleanup_due_at = now() + interval '96 days',
  trial_thirty_day_notice_sent_at = null,
  trial_seven_day_notice_sent_at = null,
  expiry_notice_sent_at = null,
  cleanup_thirty_day_notice_sent_at = null,
  cleanup_seven_day_notice_sent_at = null,
  cleanup_started_at = null,
  cleanup_completed_at = null,
  cleanup_last_attempt_at = null,
  cleanup_attempt_count = 0,
  cleanup_last_error_code = null,
  updated_at = now()
where claim.user_id = (
  select user_one from public.signup_account_rollout_test_context
);

update public.user_memberships as membership
set
  status = 'trialing',
  trial_started_at = claim.claimed_at,
  trial_ends_at = claim.trial_ends_at,
  updated_at = now()
from private.cloud_trial_claims as claim
where membership.user_id = claim.user_id
  and claim.user_id = (
    select user_one from public.signup_account_rollout_test_context
  );

select public.process_cloud_trial_lifecycle(25);
select public.process_cloud_trial_lifecycle(25);

do $$
declare
  c public.signup_account_rollout_test_context%rowtype;
begin
  select * into c from public.signup_account_rollout_test_context;

  if (
    select count(*)
    from public.notifications as n
    where n.user_id = c.user_one
      and n.type = 'cloud_trial'
      and n.metadata->>'event' in ('trial_thirty_days', 'trial_seven_days')
  ) <> 1 then
    raise exception 'late lifecycle run created duplicate 30-day and 7-day notices';
  end if;

  if not exists (
    select 1
    from public.notifications as n
    where n.user_id = c.user_one
      and n.metadata->>'event' = 'trial_seven_days'
  ) then
    raise exception 'final seven-day site notice was not created';
  end if;

  if exists (
    select 1
    from private.cloud_trial_claims as claim
    where claim.user_id = c.user_one
      and (
        claim.trial_thirty_day_notice_sent_at is null
        or claim.trial_seven_day_notice_sent_at is null
      )
  ) then
    raise exception 'stale trial notice milestone was not closed';
  end if;
end;
$$;

-- At the end of the handling period, an empty never-paid trial finishes in
-- one idempotent pass and the account is presented as a local user again.
update private.cloud_trial_claims as claim
set
  claimed_at = now() - interval '181 days',
  trial_ends_at = now() - interval '91 days',
  cleanup_due_at = now() - interval '1 day',
  cleanup_started_at = null,
  cleanup_completed_at = null,
  cleanup_last_attempt_at = null,
  cleanup_attempt_count = 0,
  cleanup_last_error_code = null,
  updated_at = now()
where claim.user_id = (
  select user_one from public.signup_account_rollout_test_context
);

update public.user_memberships as membership
set
  status = 'trialing',
  trial_started_at = claim.claimed_at,
  trial_ends_at = claim.trial_ends_at,
  updated_at = now()
from private.cloud_trial_claims as claim
where membership.user_id = claim.user_id
  and claim.user_id = (
    select user_one from public.signup_account_rollout_test_context
  );

select public.process_cloud_trial_lifecycle(25);

do $$
declare
  c public.signup_account_rollout_test_context%rowtype;
begin
  select * into c from public.signup_account_rollout_test_context;

  if not exists (
    select 1
    from private.cloud_trial_claims as claim
    where claim.user_id = c.user_one
      and claim.cleanup_started_at is not null
      and claim.cleanup_completed_at is not null
      and claim.cleanup_attempt_count = 1
  ) then
    raise exception 'empty expired trial did not complete its lifecycle';
  end if;

  if not exists (
    select 1
    from public.user_memberships as membership
    where membership.user_id = c.user_one
      and membership.status = 'expired'
  ) then
    raise exception 'expired trial membership audit row was not retained';
  end if;

  perform set_config('request.jwt.claim.sub', c.user_one::text, true);
  if exists (select 1 from public.get_my_membership()) then
    raise exception 'completed trial was not presented as local-free access';
  end if;
end;
$$;

select public.process_cloud_trial_lifecycle(25);

do $$
declare
  c public.signup_account_rollout_test_context%rowtype;
begin
  select * into c from public.signup_account_rollout_test_context;
  if (
    select count(*)
    from public.notifications as n
    where n.user_id = c.user_one
      and n.metadata->>'event' in ('cleanup_started', 'cleanup_completed')
  ) <> 2 then
    raise exception 'completed lifecycle was not idempotent';
  end if;
end;
$$;

delete from public.user_memberships
where user_id in (
  select user_one from public.signup_account_rollout_test_context
  union all
  select user_two from public.signup_account_rollout_test_context
);
delete from private.cloud_trial_claims
where user_id in (
  select user_one from public.signup_account_rollout_test_context
  union all
  select user_two from public.signup_account_rollout_test_context
);
delete from public.notifications
where user_id in (
  select user_one from public.signup_account_rollout_test_context
  union all
  select user_two from public.signup_account_rollout_test_context
);
delete from public.profiles
where id in (
  select user_one from public.signup_account_rollout_test_context
  union all
  select user_two from public.signup_account_rollout_test_context
);
delete from public.users
where id in (
  select user_one from public.signup_account_rollout_test_context
  union all
  select user_two from public.signup_account_rollout_test_context
);
delete from auth.users
where id in (
  select user_one from public.signup_account_rollout_test_context
  union all
  select user_two from public.signup_account_rollout_test_context
);

update private.signup_rollout_state
set
  account_class = 'a',
  last_registration_sequence = 0,
  trial_slots_granted = 0,
  trial_grants_enabled = false,
  updated_at = now()
where singleton;

update private.cloud_trial_settings
set
  platform_storage_pause_bytes = 700000000,
  claims_enabled = true,
  updated_at = now()
where singleton;

drop function public.cloud_trial_claim_test_attempt(uuid, double precision);
drop function public.signup_account_rollout_test_attempt(uuid, text, double precision);
drop table public.signup_account_rollout_test_context;
