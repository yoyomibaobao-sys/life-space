-- Early test data can outlive its Auth identity when an old account was
-- removed before the current account-deletion workflow existed. Include those
-- residual owners in the administrator search so the audited server deletion
-- route can finish cleaning them up.

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
  updated_at timestamptz,
  account_number text,
  is_internal_test boolean,
  registered_at timestamptz,
  last_sign_in_at timestamptz,
  archive_count bigint,
  record_count bigint
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
    coalesce(record_totals.record_count, 0)
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
      or candidates.user_id::text = trim(p_keyword)
    )
  order by coalesce(au.created_at, u.created_at, archive_totals.first_archive_at) desc nulls last
  limit 50;
$$;

revoke all on function public.admin_search_memberships(text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_search_memberships(text)
  to authenticated, service_role;

comment on function public.admin_search_memberships(text) is
  'Admin-only registration/member and residual-account search with usage and content totals.';
