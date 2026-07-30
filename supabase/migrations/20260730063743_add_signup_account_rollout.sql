-- Launch formal account numbering and a bounded first-registration cloud trial.
--
-- Confirmed rules:
--   * Existing accounts are internal test accounts. They receive no formal
--     number and do not consume a public registration rank or trial slot.
--   * New formal accounts use LSa-YYYY-NNNN. The final sequence is global,
--     continuous across years/classes, permanent, and never reused.
--   * The first 20 formal accounts may receive 30 MB of cloud capacity.
--   * The signup allowance has no fixed six-month expiry.
--   * Only formal registration ranks 1-20 are eligible for the allowance.
--   * Trial grants stop when that first-20 window closes or when actual Storage
--     plus unrealized signup allowances would exceed the 700 MB safety line.
--   * Registration itself always remains available. Accounts that do not
--     receive an allowance remain local-free.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Durable formal-account identity.
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists account_class text,
  add column if not exists registration_year integer,
  add column if not exists registration_sequence bigint,
  add column if not exists account_number text,
  add column if not exists is_internal_test boolean not null default true,
  add column if not exists signup_trial_slot integer,
  add column if not exists signup_trial_granted_at timestamptz;

alter table public.users
  drop constraint if exists users_account_identity_shape_check,
  add constraint users_account_identity_shape_check
  check (
    (
      is_internal_test
      and account_class is null
      and registration_year is null
      and registration_sequence is null
      and account_number is null
    )
    or
    (
      not is_internal_test
      and account_class ~ '^[a-z]$'
      and registration_year between 2000 and 9999
      and registration_sequence > 0
      and account_number = (
        'LS'
        || account_class
        || '-'
        || registration_year::text
        || '-'
        || lpad(
          registration_sequence::text,
          greatest(4, char_length(registration_sequence::text)),
          '0'
        )
      )
    )
  ),
  drop constraint if exists users_signup_trial_identity_check,
  add constraint users_signup_trial_identity_check
  check (
    (
      signup_trial_slot is null
      and signup_trial_granted_at is null
    )
    or
    (
      not is_internal_test
      and signup_trial_slot > 0
      and signup_trial_granted_at is not null
    )
  );

create unique index if not exists users_registration_sequence_unique
  on public.users (registration_sequence)
  where registration_sequence is not null;

create unique index if not exists users_account_number_unique
  on public.users (account_number)
  where account_number is not null;

create unique index if not exists users_signup_trial_slot_unique
  on public.users (signup_trial_slot)
  where signup_trial_slot is not null;

comment on column public.users.account_class is
  'Registration-time account class. Launch formal accounts use a; later membership upgrades do not change it.';
comment on column public.users.registration_year is
  'UTC calendar year in which the formal account was registered.';
comment on column public.users.registration_sequence is
  'Permanent global formal-registration order. It is continuous across years and account classes and is never reused.';
comment on column public.users.account_number is
  'Public formal account number, for example LSa-2026-0001.';
comment on column public.users.is_internal_test is
  'Internal test accounts do not receive a formal public rank and do not consume signup-trial slots.';
comment on column public.users.signup_trial_slot is
  'One-time first-registration trial slot. Slots are never reused after an account is deleted.';
comment on column public.users.signup_trial_granted_at is
  'Timestamp at which the bounded 30 MB signup allowance was granted.';

create or replace function private.enforce_account_identity_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_class is distinct from old.account_class
     or new.registration_year is distinct from old.registration_year
     or new.registration_sequence is distinct from old.registration_sequence
     or new.account_number is distinct from old.account_number
     or new.is_internal_test is distinct from old.is_internal_test
     or new.signup_trial_slot is distinct from old.signup_trial_slot
     or new.signup_trial_granted_at is distinct from old.signup_trial_granted_at then
    raise exception using
      errcode = 'P0001',
      message = 'account_identity_is_immutable';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_account_identity_immutable()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_account_identity_immutable
  on public.users;
create trigger trg_enforce_account_identity_immutable
before update of
  account_class,
  registration_year,
  registration_sequence,
  account_number,
  is_internal_test,
  signup_trial_slot,
  signup_trial_granted_at
on public.users
for each row
execute function private.enforce_account_identity_immutable();

-- ---------------------------------------------------------------------------
-- 2. One locked rollout row serializes global numbering and trial-slot grants.
-- ---------------------------------------------------------------------------

create table if not exists private.signup_rollout_state (
  singleton boolean primary key default true check (singleton),
  account_class text not null default 'a'
    check (account_class ~ '^[a-z]$'),
  last_registration_sequence bigint not null default 0
    check (last_registration_sequence >= 0),
  trial_slot_limit integer not null default 20
    check (trial_slot_limit >= 0),
  trial_slots_granted integer not null default 0
    check (
      trial_slots_granted >= 0
      and trial_slots_granted <= trial_slot_limit
    ),
  trial_allowance_bytes bigint not null default 30000000
    check (trial_allowance_bytes >= 0),
  platform_storage_pause_bytes bigint not null default 700000000
    check (platform_storage_pause_bytes >= 0),
  trial_grants_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.signup_rollout_state enable row level security;
revoke all on table private.signup_rollout_state
  from public, anon, authenticated, service_role;

insert into private.signup_rollout_state (
  singleton,
  account_class,
  last_registration_sequence,
  trial_slot_limit,
  trial_slots_granted,
  trial_allowance_bytes,
  platform_storage_pause_bytes,
  trial_grants_enabled
)
values (
  true,
  'a',
  0,
  20,
  0,
  30000000,
  700000000,
  true
)
on conflict (singleton) do nothing;

comment on table private.signup_rollout_state is
  'Private singleton lock for permanent formal-account ordering and the bounded first 20 signup allowances.';

create or replace function private.platform_storage_usage_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    sum(
      case
        when coalesce(so.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (so.metadata ->> 'size')::bigint
        else 0
      end
    ),
    0
  )::bigint
  from storage.objects as so;
$$;

revoke all on function private.platform_storage_usage_bytes()
  from public, anon, authenticated, service_role;

comment on function private.platform_storage_usage_bytes() is
  'Database-internal total of actual Storage object bytes across all buckets.';

create or replace function private.signup_trial_unrealized_allowance_bytes()
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
  active_signup_trials as (
    select
      u.id as user_id,
      s.trial_allowance_bytes,
      greatest(
        coalesce(p.storage_used, 0)
        - coalesce(ar.reserved_bytes, 0),
        0
      )::bigint as realized_main_bytes
    from private.signup_rollout_state as s
    join public.users as u
      on u.signup_trial_slot is not null
    join public.user_memberships as m
      on m.user_id = u.id
     and m.plan = 'trial'
     and m.status = 'trialing'
     and m.trial_ends_at is null
    left join public.profiles as p
      on p.id = u.id
    left join active_main_reservations as ar
      on ar.owner_user_id = u.id
    where s.singleton
  )
  select coalesce(
    sum(
      greatest(
        trial_allowance_bytes
        - least(realized_main_bytes, trial_allowance_bytes),
        0
      )
    ),
    0
  )::bigint
  from active_signup_trials;
$$;

revoke all on function private.signup_trial_unrealized_allowance_bytes()
  from public, anon, authenticated, service_role;

comment on function private.signup_trial_unrealized_allowance_bytes() is
  'Remaining committed capacity for active signup trials that is not already represented by physical Storage objects. Active main-upload reservations remain included in this commitment.';

-- Signup allowances no longer inherit the legacy six-month / 300 MB defaults.
-- Existing membership rows are not rewritten.
alter table public.user_memberships
  alter column trial_ends_at drop not null,
  alter column trial_ends_at set default null,
  alter column storage_limit_bytes set default 30000000;

comment on column public.user_memberships.trial_ends_at is
  'Legacy trials retain a fixed end date. A NULL end date identifies the bounded signup allowance, which has no fixed time expiry.';
comment on column public.user_memberships.storage_limit_bytes is
  'Cloud capacity in bytes. Signup allowance = 30 MB; launch paid cloud plan = 1 GB; legacy/internal rows retain their existing values.';

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
  v_trial_slot integer;
  v_platform_storage_bytes bigint := 0;
  v_unrealized_trial_allowance_bytes bigint := 0;
  v_projected_storage_bytes bigint := 0;
begin
  if p_user_id is null then
    raise exception using
      errcode = '23502',
      message = 'missing_user_id';
  end if;

  -- This singleton row is the shared lock for both the global rank and the
  -- trial counter. Concurrent signups cannot observe the same next values.
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

  -- Defensive idempotency: a retried trigger for the same auth user returns
  -- the already-created identity without consuming a second rank or slot.
  if exists (
    select 1
    from public.users as u
    where u.id = p_user_id
  ) then
    return query
    select
      u.account_number,
      u.signup_trial_slot
    from public.users as u
    where u.id = p_user_id;
    return;
  end if;

  v_registration_year := extract(year from v_created_at at time zone 'UTC')::integer;
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

  if v_state.trial_grants_enabled
     and v_registration_sequence <= v_state.trial_slot_limit then
    v_platform_storage_bytes := private.platform_storage_usage_bytes();
    v_unrealized_trial_allowance_bytes :=
      private.signup_trial_unrealized_allowance_bytes();
    v_projected_storage_bytes :=
      v_platform_storage_bytes
      + v_unrealized_trial_allowance_bytes
      + v_state.trial_allowance_bytes;

    if v_projected_storage_bytes <= v_state.platform_storage_pause_bytes then
      v_trial_slot := v_registration_sequence::integer;
    end if;
  end if;

  update private.signup_rollout_state
  set
    last_registration_sequence = v_registration_sequence,
    trial_slots_granted = trial_slots_granted
      + case when v_trial_slot is null then 0 else 1 end,
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
    v_trial_slot is not null,
    'user',
    'active',
    v_state.account_class,
    v_registration_year,
    v_registration_sequence,
    v_account_number,
    false,
    v_trial_slot,
    case when v_trial_slot is null then null else v_created_at end
  );

  if v_trial_slot is not null then
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
      p_user_id,
      'trial',
      'trialing',
      v_created_at,
      null,
      null,
      v_state.trial_allowance_bytes,
      3
    );
  end if;

  return query
  select v_account_number, v_trial_slot;
end;
$$;

revoke all on function private.initialize_new_account(uuid, text, timestamptz)
  from public, anon, authenticated, service_role;

comment on function private.initialize_new_account(uuid, text, timestamptz) is
  'Trigger-only atomic formal account creation. Registration always receives a rank; only eligible early accounts receive a 30 MB trial slot.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform *
  from private.initialize_new_account(
    new.id,
    new.email,
    new.created_at
  );

  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

comment on function public.handle_new_user() is
  'Auth trigger wrapper for atomic formal account numbering and the bounded signup allowance.';

-- ---------------------------------------------------------------------------
-- 3. Membership readers accept non-expiring signup allowances while preserving
--    all fixed-date legacy trial rows.
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
          and (
            (
              m.trial_ends_at is null
              and m.status = 'trialing'
            )
            or m.trial_ends_at > now()
          )
        )
      )
  );
$$;

comment on function public.is_user_membership_active(uuid) is
  'True for internal admin, unexpired paid/legacy trial, or an active non-expiring 30 MB signup allowance.';

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
       and (
         (
           m.trial_ends_at is null
           and m.status = 'trialing'
         )
         or m.trial_ends_at > now()
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
  where m.user_id = auth.uid();
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

  if tg_op = 'UPDATE' then
    if old.status = 'active' and old.user_id = new.user_id then
      return new;
    end if;
  end if;

  select
    (
      m.plan = 'admin'
      or (m.paid_until is not null and m.paid_until > now())
      or (
        m.plan = 'trial'
        and (
          (
            m.trial_ends_at is null
            and m.status = 'trialing'
          )
          or m.trial_ends_at > now()
        )
      )
    ),
    m.base_market_post_limit
  into
    v_membership_active,
    v_limit
  from public.user_memberships as m
  where m.user_id = new.user_id
  for update;

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
-- 4. Public account identity and admin-only rollout totals.
-- ---------------------------------------------------------------------------

create or replace view public.public_profiles
with (security_barrier = true)
as
select
  p.id,
  p.username,
  p.avatar_url,
  p.level,
  p.flower_count,
  p.view_count,
  p.country_code,
  p.country_name,
  p.region_name,
  p.city_name,
  p.created_at,
  u.account_number,
  u.registration_year,
  u.registration_sequence
from public.profiles as p
left join public.users as u
  on u.id = p.id;

comment on view public.public_profiles is
  'Public author profile with display metadata, approximate region, and formal account number/rank. It excludes email, exact location, capacity, internal-test status, and membership data.';

revoke all on table public.public_profiles
  from anon, authenticated;
grant select on table public.public_profiles
  to anon, authenticated, service_role;

create or replace function public.admin_search_memberships(
  p_keyword text default ''
)
returns table (
  user_id uuid,
  email text,
  username text,
  plan text,
  status text,
  trial_ends_at timestamptz,
  paid_until timestamptz,
  storage_used bigint,
  storage_limit_bytes bigint,
  base_market_post_limit integer,
  active_market_post_count integer,
  market_post_limit integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    au.id,
    au.email::text,
    p.username,
    m.plan,
    case
      when m.plan = 'admin' then 'active'
      when m.paid_until is not null and m.paid_until > now() then 'active'
      when m.plan = 'trial'
       and (
         (
           m.trial_ends_at is null
           and m.status = 'trialing'
         )
         or m.trial_ends_at > now()
       ) then 'trialing'
      when m.status in ('past_due', 'canceled') then m.status
      else 'expired'
    end,
    m.trial_ends_at,
    m.paid_until,
    coalesce(p.storage_used, 0)::bigint,
    m.storage_limit_bytes,
    m.base_market_post_limit,
    public.get_user_active_market_post_count(au.id),
    public.get_user_market_post_limit(au.id),
    m.created_at,
    m.updated_at
  from auth.users as au
  left join public.profiles as p
    on p.id = au.id
  left join public.users as u
    on u.id = au.id
  left join public.user_memberships as m
    on m.user_id = au.id
  where public.is_app_admin(auth.uid())
    and (
      coalesce(nullif(trim(p_keyword), ''), '') = ''
      or au.email ilike '%' || trim(p_keyword) || '%'
      or p.username ilike '%' || trim(p_keyword) || '%'
      or u.account_number ilike '%' || trim(p_keyword) || '%'
      or au.id::text = trim(p_keyword)
    )
  order by au.created_at desc
  limit 50;
$$;

revoke all on function public.admin_search_memberships(text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_search_memberships(text)
  to authenticated, service_role;

create or replace function public.admin_get_signup_rollout_status()
returns table (
  internal_test_account_count bigint,
  formal_account_count bigint,
  trial_slot_limit integer,
  trial_slots_granted integer,
  trial_slots_remaining integer,
  trial_allowance_bytes bigint,
  platform_storage_bytes bigint,
  unrealized_trial_allowance_bytes bigint,
  projected_storage_bytes bigint,
  platform_storage_pause_bytes bigint,
  trial_grants_enabled boolean,
  trial_grants_paused boolean,
  pause_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state private.signup_rollout_state%rowtype;
  v_internal_count bigint := 0;
  v_formal_count bigint := 0;
  v_storage_bytes bigint := 0;
  v_unrealized_trial_allowance_bytes bigint := 0;
  v_projected_storage_bytes bigint := 0;
  v_next_projected_storage_bytes bigint := 0;
  v_paused boolean := false;
  v_pause_reason text;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'permission_denied';
  end if;

  select *
  into v_state
  from private.signup_rollout_state as s
  where s.singleton;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'signup_rollout_state_missing';
  end if;

  select
    count(*) filter (where u.is_internal_test),
    count(*) filter (where not u.is_internal_test)
  into
    v_internal_count,
    v_formal_count
  from public.users as u;

  v_storage_bytes := private.platform_storage_usage_bytes();
  v_unrealized_trial_allowance_bytes :=
    private.signup_trial_unrealized_allowance_bytes();
  v_projected_storage_bytes :=
    v_storage_bytes + v_unrealized_trial_allowance_bytes;
  v_next_projected_storage_bytes :=
    v_projected_storage_bytes + v_state.trial_allowance_bytes;

  if not v_state.trial_grants_enabled then
    v_paused := true;
    v_pause_reason := 'disabled';
  elsif v_state.last_registration_sequence >= v_state.trial_slot_limit then
    v_paused := true;
    v_pause_reason := 'first_twenty_registered';
  elsif v_next_projected_storage_bytes > v_state.platform_storage_pause_bytes then
    v_paused := true;
    v_pause_reason := 'storage_safety_threshold';
  end if;

  return query
  select
    v_internal_count,
    v_formal_count,
    v_state.trial_slot_limit,
    v_state.trial_slots_granted,
    greatest(
      v_state.trial_slot_limit
      - least(
        v_state.last_registration_sequence,
        v_state.trial_slot_limit::bigint
      )::integer,
      0
    ),
    v_state.trial_allowance_bytes,
    v_storage_bytes,
    v_unrealized_trial_allowance_bytes,
    v_projected_storage_bytes,
    v_state.platform_storage_pause_bytes,
    v_state.trial_grants_enabled,
    v_paused,
    v_pause_reason;
end;
$$;

revoke all on function public.admin_get_signup_rollout_status()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_get_signup_rollout_status()
  to authenticated, service_role;

comment on function public.admin_get_signup_rollout_status() is
  'Admin-only aggregate totals for internal/formal accounts, first-20 trial consumption, and the 700 MB storage safety line. It returns no personal data.';

notify pgrst, 'reload schema';

commit;
