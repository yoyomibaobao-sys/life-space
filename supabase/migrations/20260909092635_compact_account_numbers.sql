-- Add a compact presentation for NEW registrations without rewriting any
-- existing identity or resetting the permanent, locked global sequence.
begin;

create or replace function private.format_account_number(p_class text, p_year integer, p_sequence bigint)
returns text
language sql immutable strict security invoker set search_path = ''
as $$
  select case
    when p_class !~ '^[a-z]$' or p_year not between 2000 and 9999 or p_sequence not between 1 and 3375 then null
    when p_sequence <= 999 then 'LS' || p_class || p_year::text || lpad(p_sequence::text, 3, '0')
    else 'LS' || p_class || p_year::text
      || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', ((p_sequence - 1000) / 99)::integer + 1, 1)
      || lpad((((p_sequence - 1000) % 99) + 1)::text, 2, '0')
  end;
$$;
revoke all on function private.format_account_number(text, integer, bigint) from public, anon, authenticated, service_role;
grant execute on function private.format_account_number(text, integer, bigint) to authenticated, service_role;

alter table public.users drop constraint users_account_identity_shape_check;
alter table public.users add constraint users_account_identity_shape_check check (
  (is_internal_test and account_class is null and registration_year is null and registration_sequence is null and account_number is null)
  or
  (not is_internal_test and account_class is not null and registration_year is not null
    and registration_sequence is not null and account_number is not null
    and account_class ~ '^[a-z]$' and registration_year between 2000 and 9999 and registration_sequence > 0
    and (account_number = 'LS' || account_class || '-' || registration_year::text || '-'
      || lpad(registration_sequence::text, greatest(4, char_length(registration_sequence::text)), '0')
      or coalesce(account_number = private.format_account_number(account_class, registration_year, registration_sequence), false)))
);

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
  v_account_number := private.format_account_number(v_state.account_class, v_registration_year, v_registration_sequence);
  if v_account_number is null then
    raise exception using errcode = '22003', message = 'account_number_capacity_reached';
  end if;

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
revoke all on function private.initialize_new_account(uuid, text, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.admin_search_memberships_page(
  p_keyword text default '',
  p_limit integer default 11,
  p_offset integer default 0
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
  updated_at timestamptz,
  account_number text,
  is_internal_test boolean,
  registered_at timestamptz,
  last_sign_in_at timestamptz,
  archive_count bigint,
  record_count bigint,
  auth_missing boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidate_users as (
    select au.id as user_id
    from auth.users as au
    where au.deleted_at is null

    union

    select u.id
    from public.users as u

    union

    select p.id
    from public.profiles as p

    union

    select a.user_id
    from public.archives as a
    where a.user_id is not null

    union

    select r.user_id
    from public.records as r
    where r.user_id is not null

    union

    select m.user_id
    from public.media as m
    where m.user_id is not null

    union

    select um.user_id
    from public.user_memberships as um

    union

    select market.user_id
    from public.market_posts as market
    where market.user_id is not null

    union

    select c.user_id
    from public.comments as c
    where c.user_id is not null

    union

    select l.user_id
    from public.locations as l
    where l.user_id is not null

    union

    select g.user_id
    from public.group_tags as g
    where g.user_id is not null

    union

    select s.user_id
    from public.sub_tags as s
    where s.user_id is not null

    union

    select objects.owner_id::uuid
    from storage.objects as objects
    where objects.bucket_id in ('media', 'avatars', 'payment-proofs')
      and objects.owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )
  select
    candidates.user_id,
    au.email::text,
    p.username,
    m.plan,
    case
      when m.plan = 'admin' then 'active'
      when m.paid_until is not null and m.paid_until > now() then 'active'
      when m.plan = 'trial'
       and (
         (m.trial_ends_at is null and m.status = 'trialing')
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
    public.get_user_active_market_post_count(candidates.user_id),
    public.get_user_market_post_limit(candidates.user_id),
    m.created_at,
    m.updated_at,
    u.account_number,
    coalesce(u.is_internal_test, false),
    au.created_at,
    au.last_sign_in_at,
    coalesce(archive_totals.archive_count, 0),
    coalesce(record_totals.record_count, 0),
    (au.id is null or au.deleted_at is not null)
  from candidate_users as candidates
  left join auth.users as au on au.id = candidates.user_id
  left join public.profiles as p on p.id = candidates.user_id
  left join public.users as u on u.id = candidates.user_id
  left join public.user_memberships as m on m.user_id = candidates.user_id
  left join lateral (
    select
      count(*)::bigint as archive_count,
      min(a.created_at) as first_archive_at
    from public.archives as a
    where a.user_id = candidates.user_id
  ) as archive_totals on true
  left join lateral (
    select count(*)::bigint as record_count
    from public.records as r
    where r.user_id = candidates.user_id
      or exists (
        select 1
        from public.archives as owned_archive
        where owned_archive.id = r.archive_id
          and owned_archive.user_id = candidates.user_id
      )
  ) as record_totals on true
  where public.is_app_admin(auth.uid())
    and (
      coalesce(nullif(trim(p_keyword), ''), '') = ''
      or au.email ilike '%' || trim(p_keyword) || '%'
      or p.username ilike '%' || trim(p_keyword) || '%'
      or u.account_number ilike '%' || trim(p_keyword) || '%'
      or private.format_account_number(u.account_class, u.registration_year, u.registration_sequence) ilike '%' || trim(p_keyword) || '%'
      or candidates.user_id::text = trim(p_keyword)
    )
  order by coalesce(au.created_at, u.created_at, archive_totals.first_archive_at) desc nulls last, candidates.user_id
  limit least(greatest(coalesce(p_limit, 11), 1), 51)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.admin_search_memberships_page(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_search_memberships_page(text, integer, integer)
  to authenticated, service_role;

comment on function public.admin_search_memberships_page(text, integer, integer) is
  'Admin-only registration/member and residual-account search, including Storage-only owners, with usage and content totals.';

comment on column public.users.account_number is 'Permanent account identity. New compact format LSa2026001, then A01-A99 etc (skip I/O); legacy hyphenated values remain unchanged and valid.';
commit;
