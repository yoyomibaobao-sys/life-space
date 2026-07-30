-- LOCAL SUPABASE ONLY. Run as supabase_admin so dblink can overlap two formal
-- account initializations against the singleton rollout lock.

\set ON_ERROR_STOP on

create extension if not exists dblink schema extensions;

drop table if exists public.signup_account_rollout_test_context;
create table public.signup_account_rollout_test_context (
  user_one uuid not null,
  user_two uuid not null,
  user_threshold uuid not null,
  user_after_window uuid not null
);

revoke all on public.signup_account_rollout_test_context
  from public, anon, authenticated;

insert into public.signup_account_rollout_test_context
values (
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid()
);

update private.signup_rollout_state
set
  account_class = 'a',
  last_registration_sequence = 0,
  trial_slot_limit = 1,
  trial_slots_granted = 0,
  trial_allowance_bytes = 30000000,
  platform_storage_pause_bytes = 700000000,
  trial_grants_enabled = true,
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
  select
    created_account_number,
    granted_trial_slot
  into
    v_account_number,
    v_trial_slot
  from private.initialize_new_account(
    p_user_id,
    p_email,
    now()
  );

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

create temporary table signup_rollout_results (
  result text not null
);

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
  select * into c
  from public.signup_account_rollout_test_context;

  if (
    select count(*)
    from public.users as u
    where u.id in (c.user_one, c.user_two)
      and not u.is_internal_test
      and u.account_class = 'a'
      and u.registration_year = v_year
      and u.registration_sequence in (1, 2)
      and u.account_number in (
        format('LSa-%s-0001', v_year),
        format('LSa-%s-0002', v_year)
      )
  ) <> 2 then
    raise exception 'concurrent formal numbering did not produce ranks 1 and 2';
  end if;

  if (
    select count(distinct u.registration_sequence)
    from public.users as u
    where u.id in (c.user_one, c.user_two)
  ) <> 2 then
    raise exception 'concurrent formal numbering produced a duplicate rank';
  end if;

  if (
    select count(*)
    from public.users as u
    where u.id in (c.user_one, c.user_two)
      and u.signup_trial_slot = 1
      and u.signup_trial_granted_at is not null
  ) <> 1 then
    raise exception 'concurrent signup did not grant exactly one trial slot';
  end if;

  if (
    select count(*)
    from public.user_memberships as m
    where m.user_id in (c.user_one, c.user_two)
      and m.plan = 'trial'
      and m.status = 'trialing'
      and m.trial_ends_at is null
      and m.storage_limit_bytes = 30000000
  ) <> 1 then
    raise exception 'concurrent signup created the wrong 30 MB membership rows';
  end if;

  if (
    select count(*)
    from public.profiles as p
    where p.id in (c.user_one, c.user_two)
      and p.storage_limit = 30000000
  ) <> 1
  or (
    select count(*)
    from public.profiles as p
    where p.id in (c.user_one, c.user_two)
      and p.storage_limit = 0
  ) <> 1 then
    raise exception 'profile capacity did not reflect trial versus local-free';
  end if;

  if (
    select s.last_registration_sequence
    from private.signup_rollout_state as s
    where s.singleton
  ) <> 2
  or (
    select s.trial_slots_granted
    from private.signup_rollout_state as s
    where s.singleton
  ) <> 1 then
    raise exception 'rollout singleton counters are incorrect after concurrency';
  end if;
end;
$$;

select extensions.dblink_disconnect('signup_rollout_one');
select extensions.dblink_disconnect('signup_rollout_two');

-- Retrying the same auth trigger must not consume a second rank or trial slot.
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
  ) <> 2
  or (
    select trial_slots_granted
    from private.signup_rollout_state
    where singleton
  ) <> 1 then
    raise exception 'idempotent account retry consumed another rank or slot';
  end if;
end;
$$;

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

update private.signup_rollout_state
set
  last_registration_sequence = 0,
  trial_slot_limit = 20,
  trial_slots_granted = 0,
  platform_storage_pause_bytes = 0,
  updated_at = now()
where singleton;

-- Crossing the storage line suppresses only the allowance. The formal account
-- and permanent number must still be created.
select *
from private.initialize_new_account(
  (select user_threshold from public.signup_account_rollout_test_context),
  'signup-rollout-threshold@example.test',
  now()
);

do $$
declare
  v_user_id uuid := (
    select user_threshold
    from public.signup_account_rollout_test_context
  );
begin
  if not exists (
    select 1
    from public.users as u
    where u.id = v_user_id
      and u.registration_sequence = 1
      and u.account_number like 'LSa-%-0001'
      and u.signup_trial_slot is null
  ) then
    raise exception 'storage pause incorrectly blocked formal registration';
  end if;

  if exists (
    select 1
    from public.user_memberships as m
    where m.user_id = v_user_id
  ) then
    raise exception 'storage pause still granted a trial membership';
  end if;
end;
$$;

delete from public.profiles
where id = (
  select user_threshold
  from public.signup_account_rollout_test_context
);

delete from public.users
where id = (
  select user_threshold
  from public.signup_account_rollout_test_context
);

update private.signup_rollout_state
set
  last_registration_sequence = 20,
  trial_slot_limit = 20,
  trial_slots_granted = 0,
  platform_storage_pause_bytes = 700000000,
  updated_at = now()
where singleton;

-- A rank after the first-20 registration window must not receive a leftover
-- allowance, even if fewer than 20 grants were issued and storage is available.
select *
from private.initialize_new_account(
  (select user_after_window from public.signup_account_rollout_test_context),
  'signup-rollout-after-window@example.test',
  now()
);

do $$
declare
  v_user_id uuid := (
    select user_after_window
    from public.signup_account_rollout_test_context
  );
begin
  if not exists (
    select 1
    from public.users as u
    where u.id = v_user_id
      and u.registration_sequence = 21
      and u.account_number like 'LSa-%-0021'
      and u.signup_trial_slot is null
  ) then
    raise exception 'rank 21 did not remain local-free';
  end if;

  if exists (
    select 1
    from public.user_memberships as m
    where m.user_id = v_user_id
  ) then
    raise exception 'rank 21 incorrectly received a signup allowance';
  end if;
end;
$$;

delete from public.profiles
where id = (
  select user_after_window
  from public.signup_account_rollout_test_context
);

delete from public.users
where id = (
  select user_after_window
  from public.signup_account_rollout_test_context
);

update private.signup_rollout_state
set
  account_class = 'a',
  last_registration_sequence = 0,
  trial_slot_limit = 20,
  trial_slots_granted = 0,
  trial_allowance_bytes = 30000000,
  platform_storage_pause_bytes = 700000000,
  trial_grants_enabled = true,
  updated_at = now()
where singleton;

drop function public.signup_account_rollout_test_attempt(
  uuid,
  text,
  double precision
);

drop table public.signup_account_rollout_test_context;
