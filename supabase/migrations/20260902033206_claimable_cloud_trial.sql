-- Replace the launch-only automatic signup allowance with a user-claimed
-- cloud trial and a bounded post-expiry handling period.
--
-- Formal accounts:
--   * registration never starts cloud access;
--   * after email confirmation, each account may claim once;
--   * the claim grants 30 MB for 90 days;
--   * expiry makes cloud content read-only and starts a further 90-day
--     handling period for upgrade, export, or return to local storage;
--   * after that handling period, cloud projects and Market posts for an
--     account that never converted to paid access are deleted through the
--     existing idempotent Storage deletion queue.
--
-- Existing internal-test accounts are deliberately excluded. Their current
-- membership dates, capacity, and Market limits remain unchanged.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Private configuration and the durable one-claim-per-account ledger.
-- ---------------------------------------------------------------------------

create table if not exists private.cloud_trial_settings (
  singleton boolean primary key default true check (singleton),
  storage_limit_bytes bigint not null default 30000000
    check (storage_limit_bytes = 30000000),
  trial_duration_days integer not null default 90
    check (trial_duration_days = 90),
  handling_period_days integer not null default 90
    check (handling_period_days = 90),
  market_post_limit integer not null default 3
    check (market_post_limit >= 0),
  platform_storage_pause_bytes bigint not null default 700000000
    check (platform_storage_pause_bytes >= storage_limit_bytes),
  claims_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.cloud_trial_settings enable row level security;
revoke all on table private.cloud_trial_settings
  from public, anon, authenticated, service_role;

insert into private.cloud_trial_settings (
  singleton,
  storage_limit_bytes,
  trial_duration_days,
  handling_period_days,
  market_post_limit,
  platform_storage_pause_bytes,
  claims_enabled
)
values (true, 30000000, 90, 90, 3, 700000000, true)
on conflict (singleton) do update
set
  storage_limit_bytes = excluded.storage_limit_bytes,
  trial_duration_days = excluded.trial_duration_days,
  handling_period_days = excluded.handling_period_days,
  market_post_limit = excluded.market_post_limit,
  updated_at = now();

comment on table private.cloud_trial_settings is
  'Private singleton configuration for the claimable 30 MB / 90-day cloud trial and its 90-day handling period.';

create table if not exists private.cloud_trial_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claimed_at timestamptz not null,
  trial_ends_at timestamptz not null,
  cleanup_due_at timestamptz not null,
  storage_limit_bytes bigint not null check (storage_limit_bytes = 30000000),
  market_post_limit integer not null check (market_post_limit >= 0),
  trial_thirty_day_notice_sent_at timestamptz,
  trial_seven_day_notice_sent_at timestamptz,
  expiry_notice_sent_at timestamptz,
  cleanup_thirty_day_notice_sent_at timestamptz,
  cleanup_seven_day_notice_sent_at timestamptz,
  converted_to_paid_at timestamptz,
  cleanup_started_at timestamptz,
  cleanup_completed_at timestamptz,
  cleanup_last_attempt_at timestamptz,
  cleanup_attempt_count integer not null default 0
    check (cleanup_attempt_count >= 0),
  cleanup_last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cloud_trial_claims_trial_range_check
    check (trial_ends_at = claimed_at + interval '90 days'),
  constraint cloud_trial_claims_cleanup_range_check
    check (cleanup_due_at = trial_ends_at + interval '90 days'),
  constraint cloud_trial_claims_error_code_check
    check (
      cleanup_last_error_code is null
      or cleanup_last_error_code ~ '^[a-z0-9_]{1,64}$'
    ),
  constraint cloud_trial_claims_cleanup_state_check
    check (
      cleanup_completed_at is null
      or cleanup_started_at is not null
    )
);

create index if not exists cloud_trial_claims_trial_end_idx
  on private.cloud_trial_claims (trial_ends_at)
  where converted_to_paid_at is null;

create index if not exists cloud_trial_claims_cleanup_due_idx
  on private.cloud_trial_claims (cleanup_due_at)
  where converted_to_paid_at is null
    and cleanup_completed_at is null;

alter table private.cloud_trial_claims enable row level security;
revoke all on table private.cloud_trial_claims
  from public, anon, authenticated, service_role;

comment on table private.cloud_trial_claims is
  'Private immutable claim ledger plus notification and cleanup progress. One primary-key row means the account has used its single cloud trial.';

-- Keep formal-account numbering in the existing rollout singleton but retire
-- its former automatic first-20 grant switch.
update private.signup_rollout_state
set
  trial_grants_enabled = false,
  updated_at = now()
where singleton;

comment on table private.signup_rollout_state is
  'Private singleton for permanent formal-account ordering. Former first-20 automatic grant fields remain only for deployment compatibility.';

comment on column public.users.signup_trial_slot is
  'Legacy automatic-trial marker retained for audit compatibility. New claims use private.cloud_trial_claims and do not modify account identity.';
comment on column public.users.signup_trial_granted_at is
  'Legacy automatic-trial timestamp retained for audit compatibility. New claims use private.cloud_trial_claims.';

-- Existing formal automatic grants, if any, consume the one claim and receive
-- fixed dates. Internal-test accounts are not copied or rewritten.
insert into private.cloud_trial_claims (
  user_id,
  claimed_at,
  trial_ends_at,
  cleanup_due_at,
  storage_limit_bytes,
  market_post_limit
)
select
  u.id,
  u.signup_trial_granted_at,
  u.signup_trial_granted_at + interval '90 days',
  u.signup_trial_granted_at + interval '180 days',
  30000000,
  3
from public.users as u
where not u.is_internal_test
  and u.signup_trial_granted_at is not null
on conflict (user_id) do nothing;

update public.user_memberships as m
set
  plan = 'trial',
  status = case
    when c.trial_ends_at > now() then 'trialing'
    else 'expired'
  end,
  trial_started_at = c.claimed_at,
  trial_ends_at = c.trial_ends_at,
  paid_until = null,
  storage_limit_bytes = c.storage_limit_bytes,
  base_market_post_limit = c.market_post_limit,
  updated_at = now()
from private.cloud_trial_claims as c
join public.users as u on u.id = c.user_id
where m.user_id = c.user_id
  and not u.is_internal_test
  and m.plan = 'trial';

alter table public.user_memberships
  alter column trial_ends_at drop default;

comment on column public.user_memberships.trial_ends_at is
  'Fixed trial end. NULL is supported only for preserved internal-test memberships; formal cloud trials always have a 90-day end.';
comment on column public.user_memberships.storage_limit_bytes is
  'Cloud capacity in bytes. Formal one-time trial = 30 MB; launch paid cloud plan = 1 GB; internal-test rows retain their existing values.';

-- ---------------------------------------------------------------------------
-- 2. Capacity accounting for currently active formal trials.
-- ---------------------------------------------------------------------------

create or replace function private.cloud_trial_unrealized_allowance_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  with active_main_reservations as (
    select
      rp.owner_user_id,
      coalesce(sum(rp.reserved_bytes), 0)::bigint as reserved_bytes
    from public.storage_upload_reservation_paths as rp
    join public.storage_upload_reservations as r
      on r.id = rp.reservation_id
     and r.owner_user_id = rp.owner_user_id
    where r.status = 'reserved'
      and rp.active
      and rp.path_kind = 'main'
    group by rp.owner_user_id
  ),
  active_trials as (
    select
      c.user_id,
      c.storage_limit_bytes,
      greatest(
        coalesce(p.storage_used, 0)
        - coalesce(ar.reserved_bytes, 0),
        0
      )::bigint as realized_main_bytes
    from private.cloud_trial_claims as c
    join public.user_memberships as m
      on m.user_id = c.user_id
     and m.plan = 'trial'
     and m.status = 'trialing'
     and m.trial_ends_at = c.trial_ends_at
    left join public.profiles as p on p.id = c.user_id
    left join active_main_reservations as ar
      on ar.owner_user_id = c.user_id
    where c.trial_ends_at > now()
      and c.converted_to_paid_at is null
      and c.cleanup_completed_at is null
  )
  select coalesce(
    sum(
      greatest(
        storage_limit_bytes
        - least(realized_main_bytes, storage_limit_bytes),
        0
      )
    ),
    0
  )::bigint
  from active_trials;
$$;

revoke all on function private.cloud_trial_unrealized_allowance_bytes()
  from public, anon, authenticated, service_role;

comment on function private.cloud_trial_unrealized_allowance_bytes() is
  'Remaining committed capacity for active formal cloud trials, without double-counting physical Storage or active main-upload reservations.';

-- ---------------------------------------------------------------------------
-- 3. Registration creates a numbered local-free account only.
-- ---------------------------------------------------------------------------

create or replace function private.initialize_new_account(
  p_user_id uuid,
  p_email text,
  p_created_at timestamptz
)
returns table (
  created_account_number text,
  granted_trial_slot integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.signup_rollout_state%rowtype;
  v_created_at timestamptz := coalesce(p_created_at, now());
  v_username text := coalesce(
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'user'
  );
  v_registration_year integer;
  v_registration_sequence bigint;
  v_account_number text;
begin
  if p_user_id is null then
    raise exception using
      errcode = '23502',
      message = 'missing_user_id';
  end if;

  -- Keep the existing singleton as the serialization lock for the permanent
  -- global account sequence. Trial claims use a separate per-account lock.
  select *
  into v_state
  from private.signup_rollout_state as s
  where s.singleton
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'signup_rollout_state_missing';
  end if;

  if exists (
    select 1
    from public.users as u
    where u.id = p_user_id
  ) then
    return query
    select u.account_number, null::integer
    from public.users as u
    where u.id = p_user_id;
    return;
  end if;

  v_registration_year :=
    extract(year from v_created_at at time zone 'UTC')::integer;
  v_registration_sequence := v_state.last_registration_sequence + 1;
  v_account_number :=
    'LS'
    || v_state.account_class
    || '-'
    || v_registration_year::text
    || '-'
    || lpad(
      v_registration_sequence::text,
      greatest(4, char_length(v_registration_sequence::text)),
      '0'
    );

  update private.signup_rollout_state
  set
    last_registration_sequence = v_registration_sequence,
    updated_at = now()
  where singleton;

  insert into public.profiles (
    id,
    email,
    username,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_email,
    v_username,
    v_created_at at time zone 'UTC',
    now() at time zone 'UTC'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    username = coalesce(public.profiles.username, excluded.username);

  insert into public.users (
    id,
    username,
    created_at,
    last_login_at,
    cloud_enabled,
    role,
    status,
    account_class,
    registration_year,
    registration_sequence,
    account_number,
    is_internal_test,
    signup_trial_slot,
    signup_trial_granted_at
  )
  values (
    p_user_id,
    v_username,
    v_created_at,
    v_created_at,
    false,
    'user',
    'active',
    v_state.account_class,
    v_registration_year,
    v_registration_sequence,
    v_account_number,
    false,
    null,
    null
  );

  return query select v_account_number, null::integer;
end;
$$;

revoke all on function private.initialize_new_account(uuid, text, timestamptz)
  from public, anon, authenticated, service_role;

comment on function private.initialize_new_account(uuid, text, timestamptz) is
  'Trigger-only atomic formal account creation. Registration receives a permanent number but starts with local-free access and no automatic cloud trial.';

comment on function public.handle_new_user() is
  'Auth trigger wrapper for atomic formal account numbering. Registration no longer grants or starts cloud access.';

-- ---------------------------------------------------------------------------
-- 4. Fixed-date trial access. NULL-ended trial rows remain valid only for the
--    preserved internal-test accounts.
-- ---------------------------------------------------------------------------

create or replace function public.is_user_membership_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_memberships as m
    where m.user_id = p_user_id
      and (
        m.plan = 'admin'
        or (
          m.paid_until is not null
          and m.paid_until > now()
        )
        or (
          m.plan = 'trial'
          and m.status = 'trialing'
          and (
            (m.trial_ends_at is not null and m.trial_ends_at > now())
            or (
              m.trial_ends_at is null
              and exists (
                select 1
                from public.users as u
                where u.id = m.user_id
                  and u.is_internal_test
              )
            )
          )
        )
      )
  );
$$;

comment on function public.is_user_membership_active(uuid) is
  'True for admin, unexpired paid access, a fixed-date active formal trial, or a preserved NULL-ended internal-test trial.';

create or replace function public.get_my_membership()
returns table (
  user_id uuid,
  plan text,
  status text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  paid_until timestamptz,
  storage_limit_bytes bigint,
  base_market_post_limit integer,
  active_market_post_count integer,
  market_post_limit integer,
  can_create_content boolean,
  can_create_market_post boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.user_id,
    m.plan,
    case
      when m.plan = 'admin' then 'active'
      when m.paid_until is not null and m.paid_until > now() then 'active'
      when m.plan = 'trial'
       and m.status = 'trialing'
       and (
         (m.trial_ends_at is not null and m.trial_ends_at > now())
         or (
           m.trial_ends_at is null
           and coalesce(u.is_internal_test, false)
         )
       ) then 'trialing'
      when m.status in ('past_due', 'canceled') then m.status
      else 'expired'
    end as status,
    m.trial_started_at,
    m.trial_ends_at,
    m.paid_until,
    m.storage_limit_bytes,
    m.base_market_post_limit,
    public.get_user_active_market_post_count(m.user_id),
    public.get_user_market_post_limit(m.user_id),
    public.is_user_membership_active(m.user_id),
    public.can_user_create_market_post(m.user_id)
  from public.user_memberships as m
  left join public.users as u on u.id = m.user_id
  where m.user_id = auth.uid()
    and not (
      m.plan = 'trial'
      and exists (
        select 1
        from private.cloud_trial_claims as c
        where c.user_id = m.user_id
          and c.cleanup_completed_at is not null
          and c.converted_to_paid_at is null
      )
    );
$$;

revoke all on function public.get_my_membership()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_membership()
  to authenticated, service_role;

create or replace function private.enforce_market_activation_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_active boolean := false;
  v_limit integer := 0;
  v_active_count integer := 0;
begin
  if new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'active'
     and old.user_id = new.user_id then
    return new;
  end if;

  select
    (
      m.plan = 'admin'
      or (m.paid_until is not null and m.paid_until > now())
      or (
        m.plan = 'trial'
        and m.status = 'trialing'
        and (
          (m.trial_ends_at is not null and m.trial_ends_at > now())
          or (
            m.trial_ends_at is null
            and coalesce(u.is_internal_test, false)
          )
        )
      )
    ),
    m.base_market_post_limit
  into v_membership_active, v_limit
  from public.user_memberships as m
  left join public.users as u on u.id = m.user_id
  where m.user_id = new.user_id
  for update of m;

  if not found or not coalesce(v_membership_active, false) then
    raise exception using
      errcode = 'P0001',
      message = 'membership_inactive';
  end if;

  select count(*)::integer
  into v_active_count
  from public.market_posts as mp
  where mp.user_id = new.user_id
    and mp.status = 'active'
    and mp.id is distinct from new.id;

  if v_active_count >= greatest(coalesce(v_limit, 0), 0) then
    raise exception using
      errcode = 'P0001',
      message = 'market_post_limit_reached';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_market_activation_limit()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Authenticated offer and atomic claim RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_cloud_trial_offer()
returns table (
  eligible boolean,
  claimed boolean,
  can_claim boolean,
  reason text,
  claimed_at timestamptz,
  trial_ends_at timestamptz,
  cleanup_due_at timestamptz,
  storage_limit_bytes bigint,
  duration_days integer,
  handling_period_days integer,
  lifecycle_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user public.users%rowtype;
  v_claim private.cloud_trial_claims%rowtype;
  v_settings private.cloud_trial_settings%rowtype;
  v_email_confirmed_at timestamptz;
  v_claimed boolean := false;
  v_has_paid_history boolean := false;
  v_can_claim boolean := false;
  v_reason text := 'unavailable';
  v_status text := 'unavailable';
  v_storage_bytes bigint := 0;
  v_unrealized_bytes bigint := 0;
begin
  select *
  into v_settings
  from private.cloud_trial_settings as s
  where s.singleton;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'cloud_trial_settings_missing';
  end if;

  if v_user_id is null then
    return query
    select
      false,
      false,
      false,
      'not_authenticated'::text,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      v_settings.storage_limit_bytes,
      v_settings.trial_duration_days,
      v_settings.handling_period_days,
      'unavailable'::text;
    return;
  end if;

  select *
  into v_user
  from public.users as u
  where u.id = v_user_id;

  select au.email_confirmed_at
  into v_email_confirmed_at
  from auth.users as au
  where au.id = v_user_id;

  select *
  into v_claim
  from private.cloud_trial_claims as c
  where c.user_id = v_user_id;
  v_claimed := found;

  select exists (
    select 1
    from public.membership_payments as mp
    where mp.user_id = v_user_id
      and mp.status = 'confirmed'
  )
  into v_has_paid_history;

  if v_user.id is null then
    v_reason := 'account_not_ready';
  elsif v_user.is_internal_test then
    v_reason := 'internal_test_account';
  elsif v_user.status is distinct from 'active' then
    v_reason := 'account_inactive';
  elsif v_claimed then
    if v_claim.converted_to_paid_at is not null or v_has_paid_history then
      v_reason := 'converted_to_paid';
      v_status := 'converted_to_paid';
    elsif v_claim.cleanup_completed_at is not null then
      v_reason := 'cleanup_completed';
      v_status := 'cleanup_completed';
    elsif v_claim.cleanup_started_at is not null then
      v_reason := 'cleanup_in_progress';
      v_status := 'cleanup_in_progress';
    elsif v_claim.trial_ends_at > now() then
      v_reason := 'already_claimed';
      v_status := 'active';
    elsif v_claim.cleanup_due_at > now() then
      v_reason := 'handling_period';
      v_status := 'handling_period';
    else
      v_reason := 'cleanup_due';
      v_status := 'cleanup_due';
    end if;
  elsif v_email_confirmed_at is null then
    v_reason := 'email_not_confirmed';
  elsif v_has_paid_history then
    v_reason := 'paid_membership_history';
  elsif public.is_user_membership_active(v_user_id) then
    v_reason := 'membership_active';
  elsif not v_settings.claims_enabled then
    v_reason := 'claims_disabled';
  else
    v_storage_bytes := private.platform_storage_usage_bytes();
    v_unrealized_bytes := private.cloud_trial_unrealized_allowance_bytes();

    if v_storage_bytes
       + v_unrealized_bytes
       + v_settings.storage_limit_bytes
       > v_settings.platform_storage_pause_bytes then
      v_reason := 'storage_safety_threshold';
    else
      v_can_claim := true;
      v_reason := 'available';
      v_status := 'available';
    end if;
  end if;

  return query
  select
    (
      v_user.id is not null
      and not coalesce(v_user.is_internal_test, true)
    ),
    v_claimed,
    v_can_claim,
    v_reason,
    case when v_claimed then v_claim.claimed_at else null end,
    case when v_claimed then v_claim.trial_ends_at else null end,
    case when v_claimed then v_claim.cleanup_due_at else null end,
    v_settings.storage_limit_bytes,
    v_settings.trial_duration_days,
    v_settings.handling_period_days,
    v_status;
end;
$$;

revoke all on function public.get_my_cloud_trial_offer()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_cloud_trial_offer()
  to authenticated, service_role;

comment on function public.get_my_cloud_trial_offer() is
  'Authenticated self-only view of cloud-trial eligibility and lifecycle dates. It returns no other account data.';

create or replace function public.claim_my_cloud_trial()
returns table (
  ok boolean,
  already_claimed boolean,
  reason text,
  claimed_at timestamptz,
  trial_ends_at timestamptz,
  cleanup_due_at timestamptz,
  storage_limit_bytes bigint,
  duration_days integer,
  handling_period_days integer,
  lifecycle_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user public.users%rowtype;
  v_claim private.cloud_trial_claims%rowtype;
  v_settings private.cloud_trial_settings%rowtype;
  v_email_confirmed_at timestamptz;
  v_claimed_at timestamptz := now();
  v_trial_ends_at timestamptz;
  v_cleanup_due_at timestamptz;
  v_storage_bytes bigint := 0;
  v_unrealized_bytes bigint := 0;
begin
  if v_user_id is null then
    return query
    select
      false,
      false,
      'not_authenticated'::text,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      30000000::bigint,
      90,
      90,
      'unavailable'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'membership-payment:' || v_user_id::text,
      0
    )
  );

  select *
  into v_settings
  from private.cloud_trial_settings as s
  where s.singleton
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'cloud_trial_settings_missing';
  end if;

  select *
  into v_claim
  from private.cloud_trial_claims as c
  where c.user_id = v_user_id
  for update;

  if found then
    return query
    select
      true,
      true,
      'already_claimed'::text,
      v_claim.claimed_at,
      v_claim.trial_ends_at,
      v_claim.cleanup_due_at,
      v_claim.storage_limit_bytes,
      v_settings.trial_duration_days,
      v_settings.handling_period_days,
      case
        when v_claim.converted_to_paid_at is not null then 'converted_to_paid'
        when v_claim.cleanup_completed_at is not null then 'cleanup_completed'
        when v_claim.cleanup_started_at is not null then 'cleanup_in_progress'
        when v_claim.trial_ends_at > now() then 'active'
        when v_claim.cleanup_due_at > now() then 'handling_period'
        else 'cleanup_due'
      end;
    return;
  end if;

  select *
  into v_user
  from public.users as u
  where u.id = v_user_id
  for update;

  if not found or v_user.is_internal_test then
    return query
    select
      false,
      false,
      case
        when v_user.id is null then 'account_not_ready'
        else 'internal_test_account'
      end,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      v_settings.storage_limit_bytes,
      v_settings.trial_duration_days,
      v_settings.handling_period_days,
      'unavailable'::text;
    return;
  end if;

  if v_user.status is distinct from 'active' then
    return query
    select
      false,
      false,
      'account_inactive'::text,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      v_settings.storage_limit_bytes,
      v_settings.trial_duration_days,
      v_settings.handling_period_days,
      'unavailable'::text;
    return;
  end if;

  select au.email_confirmed_at
  into v_email_confirmed_at
  from auth.users as au
  where au.id = v_user_id;

  if v_email_confirmed_at is null then
    return query
    select
      false,
      false,
      'email_not_confirmed'::text,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      v_settings.storage_limit_bytes,
      v_settings.trial_duration_days,
      v_settings.handling_period_days,
      'unavailable'::text;
    return;
  end if;

  if exists (
    select 1
    from public.membership_payments as mp
    where mp.user_id = v_user_id
      and mp.status = 'confirmed'
  ) then
    return query
    select
      false,
      false,
      'paid_membership_history'::text,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      v_settings.storage_limit_bytes,
      v_settings.trial_duration_days,
      v_settings.handling_period_days,
      'unavailable'::text;
    return;
  end if;

  if public.is_user_membership_active(v_user_id) then
    return query
    select
      false,
      false,
      'membership_active'::text,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      v_settings.storage_limit_bytes,
      v_settings.trial_duration_days,
      v_settings.handling_period_days,
      'unavailable'::text;
    return;
  end if;

  if not v_settings.claims_enabled then
    return query
    select
      false,
      false,
      'claims_disabled'::text,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      v_settings.storage_limit_bytes,
      v_settings.trial_duration_days,
      v_settings.handling_period_days,
      'unavailable'::text;
    return;
  end if;

  v_storage_bytes := private.platform_storage_usage_bytes();
  v_unrealized_bytes := private.cloud_trial_unrealized_allowance_bytes();

  if v_storage_bytes
     + v_unrealized_bytes
     + v_settings.storage_limit_bytes
     > v_settings.platform_storage_pause_bytes then
    return query
    select
      false,
      false,
      'storage_safety_threshold'::text,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz,
      v_settings.storage_limit_bytes,
      v_settings.trial_duration_days,
      v_settings.handling_period_days,
      'unavailable'::text;
    return;
  end if;

  v_trial_ends_at :=
    v_claimed_at + make_interval(days => v_settings.trial_duration_days);
  v_cleanup_due_at :=
    v_trial_ends_at + make_interval(days => v_settings.handling_period_days);

  insert into private.cloud_trial_claims (
    user_id,
    claimed_at,
    trial_ends_at,
    cleanup_due_at,
    storage_limit_bytes,
    market_post_limit
  )
  values (
    v_user_id,
    v_claimed_at,
    v_trial_ends_at,
    v_cleanup_due_at,
    v_settings.storage_limit_bytes,
    v_settings.market_post_limit
  )
  returning * into v_claim;

  insert into public.user_memberships (
    user_id,
    plan,
    status,
    trial_started_at,
    trial_ends_at,
    paid_until,
    storage_limit_bytes,
    base_market_post_limit
  )
  values (
    v_user_id,
    'trial',
    'trialing',
    v_claimed_at,
    v_trial_ends_at,
    null,
    v_settings.storage_limit_bytes,
    v_settings.market_post_limit
  )
  on conflict (user_id) do update
  set
    plan = 'trial',
    status = 'trialing',
    trial_started_at = excluded.trial_started_at,
    trial_ends_at = excluded.trial_ends_at,
    paid_until = null,
    storage_limit_bytes = excluded.storage_limit_bytes,
    base_market_post_limit = excluded.base_market_post_limit,
    updated_at = now();

  update public.users as u
  set cloud_enabled = true
  where u.id = v_user_id;

  return query
  select
    true,
    false,
    'claimed'::text,
    v_claimed_at,
    v_trial_ends_at,
    v_cleanup_due_at,
    v_settings.storage_limit_bytes,
    v_settings.trial_duration_days,
    v_settings.handling_period_days,
    'active'::text;
end;
$$;

revoke all on function public.claim_my_cloud_trial()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_my_cloud_trial()
  to authenticated, service_role;

comment on function public.claim_my_cloud_trial() is
  'Authenticated, self-only, atomic and idempotent one-time claim. It requires a confirmed email and serializes with membership payment updates.';

create or replace function public.admin_get_cloud_trial_status()
returns table (
  internal_test_account_count bigint,
  formal_account_count bigint,
  trial_claim_count bigint,
  active_trial_count bigint,
  handling_period_count bigint,
  cleanup_due_count bigint,
  trial_allowance_bytes bigint,
  trial_duration_days integer,
  handling_period_days integer,
  platform_storage_bytes bigint,
  unrealized_trial_allowance_bytes bigint,
  projected_storage_bytes bigint,
  platform_storage_pause_bytes bigint,
  trial_claims_enabled boolean,
  trial_claims_paused boolean,
  pause_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings private.cloud_trial_settings%rowtype;
  v_internal_count bigint := 0;
  v_formal_count bigint := 0;
  v_claim_count bigint := 0;
  v_active_count bigint := 0;
  v_handling_count bigint := 0;
  v_cleanup_due_count bigint := 0;
  v_storage_bytes bigint := 0;
  v_unrealized_bytes bigint := 0;
  v_projected_bytes bigint := 0;
  v_paused boolean := false;
  v_pause_reason text;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'permission_denied';
  end if;

  select *
  into v_settings
  from private.cloud_trial_settings as s
  where s.singleton;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'cloud_trial_settings_missing';
  end if;

  select
    count(*) filter (where u.is_internal_test),
    count(*) filter (where not u.is_internal_test)
  into v_internal_count, v_formal_count
  from public.users as u;

  select
    count(*),
    count(*) filter (
      where c.trial_ends_at > now()
        and c.converted_to_paid_at is null
        and c.cleanup_completed_at is null
    ),
    count(*) filter (
      where c.trial_ends_at <= now()
        and c.cleanup_due_at > now()
        and c.converted_to_paid_at is null
        and c.cleanup_completed_at is null
    ),
    count(*) filter (
      where c.cleanup_due_at <= now()
        and c.converted_to_paid_at is null
        and c.cleanup_completed_at is null
    )
  into
    v_claim_count,
    v_active_count,
    v_handling_count,
    v_cleanup_due_count
  from private.cloud_trial_claims as c;

  v_storage_bytes := private.platform_storage_usage_bytes();
  v_unrealized_bytes := private.cloud_trial_unrealized_allowance_bytes();
  v_projected_bytes := v_storage_bytes + v_unrealized_bytes;

  if not v_settings.claims_enabled then
    v_paused := true;
    v_pause_reason := 'disabled';
  elsif v_projected_bytes + v_settings.storage_limit_bytes
        > v_settings.platform_storage_pause_bytes then
    v_paused := true;
    v_pause_reason := 'storage_safety_threshold';
  end if;

  return query
  select
    v_internal_count,
    v_formal_count,
    v_claim_count,
    v_active_count,
    v_handling_count,
    v_cleanup_due_count,
    v_settings.storage_limit_bytes,
    v_settings.trial_duration_days,
    v_settings.handling_period_days,
    v_storage_bytes,
    v_unrealized_bytes,
    v_projected_bytes,
    v_settings.platform_storage_pause_bytes,
    v_settings.claims_enabled,
    v_paused,
    v_pause_reason;
end;
$$;

revoke all on function public.admin_get_cloud_trial_status()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_get_cloud_trial_status()
  to authenticated, service_role;

comment on function public.admin_get_cloud_trial_status() is
  'Admin-only aggregate cloud-trial counts, lifecycle totals, and the 700 MB safety budget. It returns no personal data.';

-- ---------------------------------------------------------------------------
-- 6. Daily reminders, expiry, and queue-backed cleanup after the handling
--    period. This RPC is callable only by the trusted server worker.
-- ---------------------------------------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'comment',
    'user_follow',
    'archive_follow',
    'flower',
    'followed_archive_record',
    'experience_comment',
    'experience_helpful',
    'market_comment',
    'market_reply',
    'cloud_trial'
  ));

create or replace function private.create_cloud_trial_notification(
  p_user_id uuid,
  p_event text,
  p_title text,
  p_body text,
  p_trial_ends_at timestamptz,
  p_cleanup_due_at timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    body,
    related_url,
    metadata
  )
  values (
    p_user_id,
    null,
    'cloud_trial',
    p_title,
    p_body,
    '/membership',
    jsonb_build_object(
      'event', p_event,
      'trial_ends_at', p_trial_ends_at,
      'cleanup_due_at', p_cleanup_due_at
    )
  );
$$;

revoke all on function private.create_cloud_trial_notification(
  uuid, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.process_cloud_trial_lifecycle(
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim private.cloud_trial_claims%rowtype;
  v_claim_user_id uuid;
  v_previous_claim_sub text;
  v_converted_at timestamptz;
  v_market_post record;
  v_archive record;
  v_delete_ok boolean;
  v_delete_error text;
  v_processed integer := 0;
  v_notices integer := 0;
  v_converted integer := 0;
  v_cleanup_started integer := 0;
  v_cleanup_completed integer := 0;
  v_cleanup_failed integer := 0;
  v_delete_errors integer;
  v_last_error text;
  v_has_business_rows boolean;
  v_has_unfinished_jobs boolean;
  v_was_cleanup_started boolean;
begin
  for v_claim in
    select c.*
    from private.cloud_trial_claims as c
    where c.converted_to_paid_at is null
      and c.cleanup_completed_at is null
      and c.trial_ends_at <= now() + interval '30 days'
    order by c.trial_ends_at, c.user_id
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  loop
    v_claim_user_id := v_claim.user_id;
    -- Payment confirmation, refund completion, claiming, and lifecycle work
    -- all take this account-scoped lock before any claim or membership row
    -- lock. Keeping one lock order avoids payment/lifecycle deadlocks.
    if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'membership-payment:' || v_claim_user_id::text,
        0
      )
    ) then
      continue;
    end if;

    select c.*
    into v_claim
    from private.cloud_trial_claims as c
    where c.user_id = v_claim_user_id
      and c.converted_to_paid_at is null
      and c.cleanup_completed_at is null
      and c.trial_ends_at <= now() + interval '30 days'
    for update;

    if not found then
      continue;
    end if;

    v_processed := v_processed + 1;

    -- Any real paid conversion permanently removes the account from the
    -- free-trial cleanup path. Refunding the first and only paid term clears
    -- this marker in the refund override below.
    select coalesce(
      (
        select min(coalesce(mp.paid_at, mp.created_at))
        from public.membership_payments as mp
        where mp.user_id = v_claim.user_id
          and mp.status = 'confirmed'
      ),
      (
        select coalesce(m.updated_at, now())
        from public.user_memberships as m
        where m.user_id = v_claim.user_id
          and (
            m.plan = 'admin'
            or (
              m.plan <> 'trial'
              and m.paid_until is not null
              and m.paid_until > now()
            )
          )
        limit 1
      )
    )
    into v_converted_at;

    if v_converted_at is not null then
      update private.cloud_trial_claims as c
      set
        converted_to_paid_at = v_converted_at,
        cleanup_last_error_code = null,
        updated_at = now()
      where c.user_id = v_claim.user_id;
      v_converted := v_converted + 1;
      continue;
    end if;

    if now() < v_claim.trial_ends_at then
      if v_claim.trial_seven_day_notice_sent_at is null
         and now() >= v_claim.trial_ends_at - interval '7 days' then
        perform private.create_cloud_trial_notification(
          v_claim.user_id,
          'trial_seven_days',
          '云端体验还剩7天 / 7 days left',
          '到期后将停止新增云端内容，并进入90天处理期。请开通会员、导出，或将数据转回本地。',
          v_claim.trial_ends_at,
          v_claim.cleanup_due_at
        );
        update private.cloud_trial_claims as c
        set
          trial_seven_day_notice_sent_at = now(),
          trial_thirty_day_notice_sent_at = coalesce(
            c.trial_thirty_day_notice_sent_at,
            now()
          ),
          updated_at = now()
        where c.user_id = v_claim.user_id;
        v_notices := v_notices + 1;
      elsif v_claim.trial_thirty_day_notice_sent_at is null
            and now() >= v_claim.trial_ends_at - interval '30 days' then
        perform private.create_cloud_trial_notification(
          v_claim.user_id,
          'trial_thirty_days',
          '云端体验还剩30天 / 30 days left',
          '体验到期后云端数据转为只读，并进入90天处理期。本地记录不受影响。',
          v_claim.trial_ends_at,
          v_claim.cleanup_due_at
        );
        update private.cloud_trial_claims as c
        set
          trial_thirty_day_notice_sent_at = now(),
          updated_at = now()
        where c.user_id = v_claim.user_id;
        v_notices := v_notices + 1;
      end if;

      continue;
    end if;

    update public.user_memberships as m
    set
      status = 'expired',
      updated_at = now()
    where m.user_id = v_claim.user_id
      and m.plan = 'trial'
      and m.trial_ends_at is not distinct from v_claim.trial_ends_at
      and (m.paid_until is null or m.paid_until <= now());

    if now() < v_claim.cleanup_due_at then
      if v_claim.expiry_notice_sent_at is null then
        perform private.create_cloud_trial_notification(
          v_claim.user_id,
          'trial_expired',
          '云端体验已到期 / Trial ended',
          '云端数据现为只读。你还有90天可以开通会员、导出，或转回本地；已保存在本机的内容会继续可用。',
          v_claim.trial_ends_at,
          v_claim.cleanup_due_at
        );
        update private.cloud_trial_claims as c
        set
          expiry_notice_sent_at = now(),
          updated_at = now()
        where c.user_id = v_claim.user_id;
        v_notices := v_notices + 1;
      end if;

      if v_claim.cleanup_seven_day_notice_sent_at is null
         and now() >= v_claim.cleanup_due_at - interval '7 days' then
        perform private.create_cloud_trial_notification(
          v_claim.user_id,
          'cleanup_seven_days',
          '还有7天完成本机保存 / 7 days to save locally',
          '请在处理期结束前开通会员、导出，或将尚未保存在本机的内容转回本地。账号和已保存在本机的内容会继续可用。',
          v_claim.trial_ends_at,
          v_claim.cleanup_due_at
        );
        update private.cloud_trial_claims as c
        set
          cleanup_seven_day_notice_sent_at = now(),
          cleanup_thirty_day_notice_sent_at = coalesce(
            c.cleanup_thirty_day_notice_sent_at,
            now()
          ),
          updated_at = now()
        where c.user_id = v_claim.user_id;
        v_notices := v_notices + 1;
      elsif v_claim.cleanup_thirty_day_notice_sent_at is null
            and now() >= v_claim.cleanup_due_at - interval '30 days' then
        perform private.create_cloud_trial_notification(
          v_claim.user_id,
          'cleanup_thirty_days',
          '还有30天完成本机保存 / 30 days to save locally',
          '请开通会员、导出，或将尚未保存在本机的内容转回本地。处理期结束后账号将回到本地使用。',
          v_claim.trial_ends_at,
          v_claim.cleanup_due_at
        );
        update private.cloud_trial_claims as c
        set
          cleanup_thirty_day_notice_sent_at = now(),
          updated_at = now()
        where c.user_id = v_claim.user_id;
        v_notices := v_notices + 1;
      end if;

      continue;
    end if;

    v_delete_errors := 0;
    v_last_error := null;
    v_was_cleanup_started := v_claim.cleanup_started_at is not null;
    v_previous_claim_sub := current_setting('request.jwt.claim.sub', true);
    perform set_config('request.jwt.claim.sub', v_claim.user_id::text, true);

    -- Bound each pass. Accounts with more rows continue on a later daily run.
    for v_market_post in
      select mp.id
      from public.market_posts as mp
      where mp.user_id = v_claim.user_id
      order by mp.created_at, mp.id
      limit 200
    loop
      begin
        select d.ok, d.error_code
        into v_delete_ok, v_delete_error
        from public.request_delete_market_post(v_market_post.id) as d;

        if not coalesce(v_delete_ok, false) then
          v_delete_errors := v_delete_errors + 1;
          v_last_error := coalesce(v_delete_error, 'market_post_delete_failed');
        end if;
      exception when others then
        v_delete_errors := v_delete_errors + 1;
        v_last_error := 'market_post_delete_failed';
      end;
    end loop;

    for v_archive in
      select a.id
      from public.archives as a
      where a.user_id = v_claim.user_id
      order by a.created_at, a.id
      limit 200
    loop
      begin
        select d.ok, d.error_code
        into v_delete_ok, v_delete_error
        from public.request_delete_archive(v_archive.id) as d;

        if not coalesce(v_delete_ok, false) then
          v_delete_errors := v_delete_errors + 1;
          v_last_error := coalesce(v_delete_error, 'archive_delete_failed');
        end if;
      exception when others then
        v_delete_errors := v_delete_errors + 1;
        v_last_error := 'archive_delete_failed';
      end;
    end loop;

    perform set_config(
      'request.jwt.claim.sub',
      coalesce(v_previous_claim_sub, ''),
      true
    );

    if not v_was_cleanup_started then
      perform private.create_cloud_trial_notification(
        v_claim.user_id,
        'cleanup_started',
        '处理期已结束，请继续本地使用 / Handling period ended',
        '账号、付款记录和已主动保存到本机的内容继续可用；尚未保存到本机的内容不会自动出现在本机。',
        v_claim.trial_ends_at,
        v_claim.cleanup_due_at
      );
      v_notices := v_notices + 1;
      v_cleanup_started := v_cleanup_started + 1;
    end if;

    update private.cloud_trial_claims as c
    set
      cleanup_started_at = coalesce(c.cleanup_started_at, now()),
      cleanup_last_attempt_at = now(),
      cleanup_attempt_count = c.cleanup_attempt_count + 1,
      cleanup_last_error_code = case
        when v_delete_errors > 0 then coalesce(v_last_error, 'delete_failed')
        else null
      end,
      updated_at = now()
    where c.user_id = v_claim.user_id;

    select exists (
      select 1 from public.archives as a
      where a.user_id = v_claim.user_id
      union all
      select 1 from public.market_posts as mp
      where mp.user_id = v_claim.user_id
    ) into v_has_business_rows;

    select exists (
      select 1
      from public.storage_deletion_jobs as j
      where j.owner_user_id = v_claim.user_id
        and j.source_type in ('archive', 'market_post')
        and j.status <> 'succeeded'
    ) into v_has_unfinished_jobs;

    if v_delete_errors = 0
       and not v_has_business_rows
       and not v_has_unfinished_jobs then
      update private.cloud_trial_claims as c
      set
        cleanup_completed_at = now(),
        cleanup_last_error_code = null,
        updated_at = now()
      where c.user_id = v_claim.user_id
        and c.cleanup_completed_at is null;

      perform private.create_cloud_trial_notification(
        v_claim.user_id,
        'cleanup_completed',
        '已切换为本地使用 / Local use continues',
        '账号和已主动保存到本机的内容继续可用，之后仍可开通云会员恢复云端保存与同步。',
        v_claim.trial_ends_at,
        v_claim.cleanup_due_at
      );
      v_notices := v_notices + 1;
      v_cleanup_completed := v_cleanup_completed + 1;
    elsif v_delete_errors > 0 then
      v_cleanup_failed := v_cleanup_failed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'processed', v_processed,
    'notifications_created', v_notices,
    'converted_to_paid', v_converted,
    'cleanup_started', v_cleanup_started,
    'cleanup_completed', v_cleanup_completed,
    'cleanup_failed', v_cleanup_failed
  );
end;
$$;

revoke all on function public.process_cloud_trial_lifecycle(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.process_cloud_trial_lifecycle(integer)
  to service_role;

comment on function public.process_cloud_trial_lifecycle(integer) is
  'Service-only daily lifecycle. Sends bounded reminders, expires formal trials, and routes never-paid trial content through existing safe deletion jobs after the 90-day handling period.';

-- ---------------------------------------------------------------------------
-- 7. Refund rollback restores only the unexpired remainder of the original
--    one-time claim. It never starts a new trial or turns it non-expiring.
-- ---------------------------------------------------------------------------

create or replace function public.admin_complete_membership_refund_json(
  p_request_id uuid,
  p_refund_reference text,
  p_confirmed_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_reference text := nullif(trim(coalesce(p_refund_reference, '')), '');
  v_request public.membership_refund_requests%rowtype;
  v_payment public.membership_payments%rowtype;
  v_membership public.user_memberships%rowtype;
  v_claim private.cloud_trial_claims%rowtype;
  v_benefits_end timestamptz := now();
  v_is_future_renewal boolean := false;
  v_has_prior_payment boolean := false;
  v_has_claim boolean := false;
begin
  if not public.is_app_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'error_message', 'permission_denied');
  end if;

  if v_reference is null then
    return jsonb_build_object('ok', false, 'error_message', 'refund_reference_required');
  end if;

  if char_length(v_reference) > 160 then
    return jsonb_build_object('ok', false, 'error_message', 'refund_reference_too_long');
  end if;

  select rr.*
  into v_request
  from public.membership_refund_requests as rr
  where rr.id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'refund_request_not_found');
  end if;

  if v_request.status = 'completed' then
    return jsonb_build_object(
      'ok', true,
      'already_completed', true,
      'request_id', v_request.id,
      'status', v_request.status,
      'refund_reference', v_request.refund_reference,
      'refunded_at', v_request.refunded_at
    );
  end if;

  if v_request.status <> 'approved_pending_refund' then
    return jsonb_build_object('ok', false, 'error_message', 'refund_not_approved');
  end if;

  if p_confirmed_amount is null
     or round(p_confirmed_amount, 2) <> v_request.refund_amount then
    return jsonb_build_object('ok', false, 'error_message', 'refund_amount_mismatch');
  end if;

  -- Match the claim/payment/lifecycle serialization key first, then retain the
  -- refund-specific lock used by the existing workflow.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'membership-payment:' || v_request.user_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'membership-refund:' || v_request.user_id::text,
      0
    )
  );

  select mp.*
  into v_payment
  from public.membership_payments as mp
  where mp.id = v_request.payment_id
    and mp.user_id = v_request.user_id
  for update;

  if not found or v_payment.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_confirmed');
  end if;

  select um.*
  into v_membership
  from public.user_memberships as um
  where um.user_id = v_request.user_id
  for update;

  if not found
     or v_payment.service_ends_at is null
     or v_membership.paid_until is distinct from v_payment.service_ends_at then
    return jsonb_build_object('ok', false, 'error_message', 'membership_term_changed');
  end if;

  v_is_future_renewal :=
    v_payment.service_started_at is not null
    and v_payment.service_started_at > now();

  select exists (
    select 1
    from public.membership_payments as earlier
    where earlier.user_id = v_request.user_id
      and earlier.id <> v_payment.id
      and earlier.status in ('confirmed', 'refunded')
      and coalesce(earlier.service_started_at, earlier.created_at)
        < coalesce(v_payment.service_started_at, v_payment.created_at)
  )
  into v_has_prior_payment;

  select c.*
  into v_claim
  from private.cloud_trial_claims as c
  where c.user_id = v_request.user_id
  for update;
  v_has_claim := found;

  if v_is_future_renewal then
    update public.user_memberships as um
    set
      status = case
        when v_payment.service_started_at > now() then 'active'
        else 'canceled'
      end,
      paid_until = v_payment.service_started_at,
      updated_at = now()
    where um.user_id = v_request.user_id;
    v_benefits_end := v_payment.service_started_at;
  elsif not v_has_prior_payment
        and v_has_claim
        and v_claim.trial_ends_at > now() then
    update private.cloud_trial_claims as c
    set
      converted_to_paid_at = null,
      updated_at = now()
    where c.user_id = v_request.user_id;

    update public.user_memberships as um
    set
      plan = 'trial',
      status = 'trialing',
      trial_started_at = v_claim.claimed_at,
      trial_ends_at = v_claim.trial_ends_at,
      paid_until = null,
      storage_limit_bytes = v_claim.storage_limit_bytes,
      base_market_post_limit = v_claim.market_post_limit,
      updated_at = now()
    where um.user_id = v_request.user_id;
    v_benefits_end := now();
  elsif not v_has_prior_payment then
    if v_has_claim then
      update private.cloud_trial_claims as c
      set
        converted_to_paid_at = null,
        updated_at = now()
      where c.user_id = v_request.user_id;
    end if;

    delete from public.user_memberships as um
    where um.user_id = v_request.user_id;
    v_benefits_end := now();
  else
    update public.user_memberships as um
    set
      status = 'canceled',
      paid_until = now(),
      updated_at = now()
    where um.user_id = v_request.user_id;
    v_benefits_end := now();
  end if;

  update public.membership_payments as mp
  set
    status = 'refunded',
    note = case
      when mp.note is null or trim(mp.note) = ''
        then 'refund_reference=' || v_reference
      else mp.note || E'\nrefund_reference=' || v_reference
    end,
    updated_at = now()
  where mp.id = v_payment.id;

  update public.membership_refund_requests as rr
  set
    status = 'completed',
    refund_reference = v_reference,
    refunded_at = now(),
    benefits_ended_at = v_benefits_end,
    updated_at = now()
  where rr.id = v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'ok', true,
    'already_completed', false,
    'request_id', v_request.id,
    'status', v_request.status,
    'refund_amount', v_request.refund_amount,
    'currency', v_request.currency,
    'refund_reference', v_request.refund_reference,
    'refunded_at', v_request.refunded_at,
    'benefits_ended_at', v_request.benefits_ended_at
  );
end;
$$;

revoke all on function public.admin_complete_membership_refund_json(
  uuid, text, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.admin_complete_membership_refund_json(
  uuid, text, numeric
) to authenticated, service_role;

comment on function public.admin_complete_membership_refund_json(
  uuid, text, numeric
) is
  'Admin-only refund completion. A first-payment refund restores only the remaining original claim; expired claims return to local-free and retain their scheduled cleanup.';

-- ---------------------------------------------------------------------------
-- 8. Expired cloud access is read-only. Ordinary writes require active cloud
--     access, while narrowly-scoped RPCs keep deletion and visibility
--     downgrades available after a paid term or trial ends.
-- ---------------------------------------------------------------------------

drop policy if exists archives_update_own on public.archives;
create policy archives_update_own
on public.archives for update
to authenticated
using (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
  and trashed_at is null
)
with check (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
  and trashed_at is null
  and trash_entry_id is null
);

drop policy if exists records_update_own_archive on public.records;
create policy records_update_own_archive
on public.records for update
to authenticated
using (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
  and trashed_at is null
  and exists (
    select 1
    from public.archives as a
    where a.id = records.archive_id
      and a.user_id = (select auth.uid())
      and a.trashed_at is null
  )
)
with check (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
  and trashed_at is null
  and trash_entry_id is null
  and exists (
    select 1
    from public.archives as a
    where a.id = records.archive_id
      and a.user_id = (select auth.uid())
      and a.trashed_at is null
  )
);

drop policy if exists media_update_own on public.media;
create policy media_update_own
on public.media for update
to authenticated
using (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
  and trashed_at is null
  and exists (
    select 1
    from public.records as r
    join public.archives as a on a.id = r.archive_id
    where r.id = media.record_id
      and r.user_id = (select auth.uid())
      and r.trashed_at is null
      and a.trashed_at is null
  )
)
with check (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
  and trashed_at is null
  and trash_entry_id is null
  and exists (
    select 1
    from public.records as r
    join public.archives as a on a.id = r.archive_id
    where r.id = media.record_id
      and r.user_id = (select auth.uid())
      and r.trashed_at is null
      and a.trashed_at is null
  )
);

drop policy if exists "archive cycles insert own archive"
  on public.archive_cycles;
create policy "archive cycles insert own archive"
on public.archive_cycles for insert
to authenticated
with check (
  public.is_user_membership_active((select auth.uid()))
  and archive_cycles.trashed_at is null
  and archive_cycles.trash_entry_id is null
  and exists (
    select 1
    from public.archives as a
    where a.id = archive_cycles.archive_id
      and a.user_id = (select auth.uid())
      and a.trashed_at is null
      and a.trash_entry_id is null
  )
);

drop policy if exists "archive cycles update own archive"
  on public.archive_cycles;
create policy "archive cycles update own archive"
on public.archive_cycles for update
to authenticated
using (
  public.is_user_membership_active((select auth.uid()))
  and archive_cycles.trashed_at is null
  and archive_cycles.trash_entry_id is null
  and exists (
    select 1
    from public.archives as a
    where a.id = archive_cycles.archive_id
      and a.user_id = (select auth.uid())
      and a.trashed_at is null
      and a.trash_entry_id is null
  )
)
with check (
  public.is_user_membership_active((select auth.uid()))
  and archive_cycles.trashed_at is null
  and archive_cycles.trash_entry_id is null
  and exists (
    select 1
    from public.archives as a
    where a.id = archive_cycles.archive_id
      and a.user_id = (select auth.uid())
      and a.trashed_at is null
      and a.trash_entry_id is null
  )
);

drop policy if exists record_tags_insert_own_record on public.record_tags;
create policy record_tags_insert_own_record
on public.record_tags for insert
to authenticated
with check (
  public.is_user_membership_active((select auth.uid()))
  and exists (
    select 1
    from public.records as r
    join public.archives as a on a.id = r.archive_id
    where r.id = record_tags.record_id
      and r.user_id = (select auth.uid())
      and r.trashed_at is null
      and a.trashed_at is null
  )
);

drop policy if exists record_tags_update_own_record on public.record_tags;
create policy record_tags_update_own_record
on public.record_tags for update
to authenticated
using (
  public.is_user_membership_active((select auth.uid()))
  and exists (
    select 1
    from public.records as r
    join public.archives as a on a.id = r.archive_id
    where r.id = record_tags.record_id
      and r.user_id = (select auth.uid())
      and r.trashed_at is null
      and a.trashed_at is null
  )
)
with check (
  public.is_user_membership_active((select auth.uid()))
  and exists (
    select 1
    from public.records as r
    join public.archives as a on a.id = r.archive_id
    where r.id = record_tags.record_id
      and r.user_id = (select auth.uid())
      and r.trashed_at is null
      and a.trashed_at is null
  )
);

drop policy if exists experience_card_comments_update_own
  on public.experience_card_comments;
create policy experience_card_comments_update_own
on public.experience_card_comments for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
  and public.is_experience_card_public(card_id)
);

drop policy if exists market_posts_update_own on public.market_posts;
create policy market_posts_update_own
on public.market_posts for update
to authenticated
using (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
);

drop policy if exists "archive category settings insert own"
  on public.archive_category_settings;
create policy "archive category settings insert own"
on public.archive_category_settings for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
);

drop policy if exists "archive category settings update own"
  on public.archive_category_settings;
create policy "archive category settings update own"
on public.archive_category_settings for update
to authenticated
using (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
);

create or replace function private.enforce_cloud_taxonomy_write_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_user_id uuid := nullif(to_jsonb(new)->>'user_id', '')::uuid;
begin
  -- Internal maintenance and account-deletion operations do not carry an end
  -- user JWT. Their existing service-role and function checks remain intact.
  if v_user_id is null then
    return new;
  end if;

  if v_owner_user_id is distinct from v_user_id then
    raise exception using
      errcode = '42501',
      message = 'cloud_taxonomy_not_owned';
  end if;

  if not public.is_user_membership_active(v_user_id) then
    raise exception using
      errcode = 'P0001',
      message = 'membership_inactive';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_cloud_taxonomy_write_access()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_sub_tags_require_active_cloud_access
  on public.sub_tags;
create trigger trg_sub_tags_require_active_cloud_access
before insert or update on public.sub_tags
for each row execute function private.enforce_cloud_taxonomy_write_access();

drop trigger if exists trg_group_tags_require_active_cloud_access
  on public.group_tags;
create trigger trg_group_tags_require_active_cloud_access
before insert or update on public.group_tags
for each row execute function private.enforce_cloud_taxonomy_write_access();

create or replace function public.make_my_archive_private(p_archive_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_archive_id is null then
    return false;
  end if;

  perform 1
  from public.archives as a
  where a.id = p_archive_id
    and a.user_id = v_user_id
    and a.trashed_at is null
    and a.trash_entry_id is null
  for update;

  if not found then
    return false;
  end if;

  update public.archives as a
  set is_public = false
  where a.id = p_archive_id
    and a.user_id = v_user_id
    and a.trashed_at is null;

  update public.records as r
  set visibility = 'private'
  where r.archive_id = p_archive_id
    and r.user_id = v_user_id
    and r.trashed_at is null;

  return true;
end;
$$;

revoke all on function public.make_my_archive_private(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.make_my_archive_private(uuid)
  to authenticated, service_role;

comment on function public.make_my_archive_private(uuid) is
  'Owner-only visibility downgrade. It remains available when cloud access is read-only and never makes content public.';

create or replace function public.make_my_record_private(p_record_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_record_id is null then
    return false;
  end if;

  update public.records as r
  set visibility = 'private'
  where r.id = p_record_id
    and r.user_id = v_user_id
    and r.trashed_at is null
    and exists (
      select 1
      from public.archives as a
      where a.id = r.archive_id
        and a.user_id = v_user_id
        and a.trashed_at is null
    );

  return found;
end;
$$;

revoke all on function public.make_my_record_private(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.make_my_record_private(uuid)
  to authenticated, service_role;

comment on function public.make_my_record_private(uuid) is
  'Owner-only record visibility downgrade available during read-only cloud access.';

create or replace function public.end_my_market_post(p_market_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_market_post_id is null then
    return false;
  end if;

  update public.market_posts as mp
  set status = 'ended'
  where mp.id = p_market_post_id
    and mp.user_id = v_user_id;

  return found;
end;
$$;

revoke all on function public.end_my_market_post(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.end_my_market_post(uuid)
  to authenticated, service_role;

comment on function public.end_my_market_post(uuid) is
  'Owner-only publication downgrade. Read-only accounts may end but never reactivate or edit a Market post.';

-- Existing SECURITY DEFINER archive-state helpers bypass RLS, so repeat the
-- active-access check inside each write function.
create or replace function public.mark_archive_ended(p_archive_id uuid)
returns public.archives
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  updated_archive public.archives;
begin
  if v_user_id is null or not public.is_user_membership_active(v_user_id) then
    raise exception using errcode = 'P0001', message = 'membership_inactive';
  end if;

  update public.archives
  set status = 'ended', ended_at = coalesce(ended_at, now())
  where id = p_archive_id
    and user_id = v_user_id
    and trashed_at is null
  returning * into updated_archive;

  return updated_archive;
end;
$$;

create or replace function public.restore_archive_active(p_archive_id uuid)
returns public.archives
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  updated_archive public.archives;
begin
  if v_user_id is null or not public.is_user_membership_active(v_user_id) then
    raise exception using errcode = 'P0001', message = 'membership_inactive';
  end if;

  update public.archives
  set status = 'active', ended_at = null
  where id = p_archive_id
    and user_id = v_user_id
    and trashed_at is null
  returning * into updated_archive;

  return updated_archive;
end;
$$;

create or replace function public.mark_archive_help_open(p_archive_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  next_status text;
begin
  if v_user_id is null or not public.is_user_membership_active(v_user_id) then
    raise exception using errcode = 'P0001', message = 'membership_inactive';
  end if;

  update public.archives
  set
    help_status = 'open',
    help_opened_at = coalesce(help_opened_at, now()),
    help_resolved_at = null,
    help_updated_at = now()
  where id = p_archive_id
    and user_id = v_user_id
    and trashed_at is null
  returning help_status into next_status;

  return coalesce(next_status, 'none');
end;
$$;

create or replace function public.mark_archive_help_resolved(p_archive_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  next_status text;
begin
  if v_user_id is null or not public.is_user_membership_active(v_user_id) then
    raise exception using errcode = 'P0001', message = 'membership_inactive';
  end if;

  update public.archives
  set
    help_status = 'resolved',
    help_resolved_at = now(),
    help_updated_at = now()
  where id = p_archive_id
    and user_id = v_user_id
    and trashed_at is null
  returning help_status into next_status;

  return coalesce(next_status, 'none');
end;
$$;

create or replace function public.clear_archive_help_status(p_archive_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  next_status text;
begin
  if v_user_id is null or not public.is_user_membership_active(v_user_id) then
    raise exception using errcode = 'P0001', message = 'membership_inactive';
  end if;

  update public.archives
  set
    help_status = 'none',
    help_opened_at = null,
    help_resolved_at = null,
    help_updated_at = now()
  where id = p_archive_id
    and user_id = v_user_id
    and trashed_at is null
  returning help_status into next_status;

  return coalesce(next_status, 'none');
end;
$$;

revoke all on function public.mark_archive_ended(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.restore_archive_active(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_archive_help_open(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_archive_help_resolved(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.clear_archive_help_status(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_archive_ended(uuid)
  to authenticated, service_role;
grant execute on function public.restore_archive_active(uuid)
  to authenticated, service_role;
grant execute on function public.mark_archive_help_open(uuid)
  to authenticated, service_role;
grant execute on function public.mark_archive_help_resolved(uuid)
  to authenticated, service_role;
grant execute on function public.clear_archive_help_status(uuid)
  to authenticated, service_role;

-- Wrap the existing cycle-creation function so its privileged insert cannot
-- bypass the read-only state.
alter function public.create_archive_cycle(uuid, timestamptz)
  set schema private;
alter function private.create_archive_cycle(uuid, timestamptz)
  rename to create_archive_cycle_unchecked;
revoke all on function private.create_archive_cycle_unchecked(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create function public.create_archive_cycle(
  p_archive_id uuid,
  p_started_at timestamptz
)
returns table (
  ok boolean,
  id uuid,
  cycle_no integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return query select false, null::uuid, null::integer, 'not_authenticated'::text;
    return;
  end if;

  if not public.is_user_membership_active(v_user_id) then
    return query select false, null::uuid, null::integer, 'membership_inactive'::text;
    return;
  end if;

  return query
  select result.ok, result.id, result.cycle_no, result.error_code
  from private.create_archive_cycle_unchecked(p_archive_id, p_started_at) as result;
end;
$$;

revoke all on function public.create_archive_cycle(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.create_archive_cycle(uuid, timestamptz)
  to authenticated, service_role;

-- Restore adds content back to the live cloud workspace, so it requires active
-- access. Moving content to trash and permanent deletion remain available.
alter function public.restore_archive_from_trash(uuid) set schema private;
alter function private.restore_archive_from_trash(uuid)
  rename to restore_archive_from_trash_unchecked;
alter function public.restore_record_from_trash(uuid) set schema private;
alter function private.restore_record_from_trash(uuid)
  rename to restore_record_from_trash_unchecked;
alter function public.restore_media_from_trash(uuid) set schema private;
alter function private.restore_media_from_trash(uuid)
  rename to restore_media_from_trash_unchecked;
alter function public.restore_archive_cycle_from_trash(uuid) set schema private;
alter function private.restore_archive_cycle_from_trash(uuid)
  rename to restore_archive_cycle_from_trash_unchecked;

revoke all on function private.restore_archive_from_trash_unchecked(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.restore_record_from_trash_unchecked(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.restore_media_from_trash_unchecked(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.restore_archive_cycle_from_trash_unchecked(uuid)
  from public, anon, authenticated, service_role;

create function public.restore_archive_from_trash(p_archive_id uuid)
returns table (
  ok boolean,
  already_restored boolean,
  target_type text,
  status text,
  restored_record_count integer,
  restored_media_count integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return query select false, false, 'archive'::text, null::text, 0, 0, 'not_authenticated'::text;
    return;
  end if;
  if not public.is_user_membership_active(v_user_id) then
    return query select false, false, 'archive'::text, null::text, 0, 0, 'membership_inactive'::text;
    return;
  end if;
  return query select * from private.restore_archive_from_trash_unchecked(p_archive_id);
end;
$$;

create function public.restore_record_from_trash(p_record_id uuid)
returns table (
  ok boolean,
  already_restored boolean,
  target_type text,
  status text,
  restored_record_count integer,
  restored_media_count integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return query select false, false, 'record'::text, null::text, 0, 0, 'not_authenticated'::text;
    return;
  end if;
  if not public.is_user_membership_active(v_user_id) then
    return query select false, false, 'record'::text, null::text, 0, 0, 'membership_inactive'::text;
    return;
  end if;
  return query select * from private.restore_record_from_trash_unchecked(p_record_id);
end;
$$;

create function public.restore_media_from_trash(p_media_id uuid)
returns table (
  ok boolean,
  already_restored boolean,
  target_type text,
  status text,
  restored_record_count integer,
  restored_media_count integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return query select false, false, 'media'::text, null::text, 0, 0, 'not_authenticated'::text;
    return;
  end if;
  if not public.is_user_membership_active(v_user_id) then
    return query select false, false, 'media'::text, null::text, 0, 0, 'membership_inactive'::text;
    return;
  end if;
  return query select * from private.restore_media_from_trash_unchecked(p_media_id);
end;
$$;

create function public.restore_archive_cycle_from_trash(p_cycle_id uuid)
returns table (
  ok boolean,
  already_restored boolean,
  target_type text,
  status text,
  restored_record_count integer,
  restored_media_count integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return query select false, false, 'cycle'::text, null::text, 0, 0, 'not_authenticated'::text;
    return;
  end if;
  if not public.is_user_membership_active(v_user_id) then
    return query select false, false, 'cycle'::text, null::text, 0, 0, 'membership_inactive'::text;
    return;
  end if;
  return query select * from private.restore_archive_cycle_from_trash_unchecked(p_cycle_id);
end;
$$;

revoke all on function public.restore_archive_from_trash(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.restore_record_from_trash(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.restore_media_from_trash(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.restore_archive_cycle_from_trash(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.restore_archive_from_trash(uuid)
  to authenticated, service_role;
grant execute on function public.restore_record_from_trash(uuid)
  to authenticated, service_role;
grant execute on function public.restore_media_from_trash(uuid)
  to authenticated, service_role;
grant execute on function public.restore_archive_cycle_from_trash(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
