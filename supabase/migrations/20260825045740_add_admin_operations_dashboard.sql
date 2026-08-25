-- Privacy-preserving traffic analytics and administrator operations dashboard.

begin;

-- Page views store normalized route templates only. The application never
-- includes query strings, record content, exact locations, or email here.
alter table public.analytics_events
  drop constraint if exists analytics_events_event_name_check;

alter table public.analytics_events
  add constraint analytics_events_event_name_check
  check (
    event_name in (
      'page_view',
      'apk_download',
      'app_first_open',
      'app_open',
      'register',
      'cloud_space_opened',
      'local_project_created',
      'local_record_created',
      'local_data_bound_to_account',
      'local_data_synced_to_cloud'
    )
  );

drop policy if exists "analytics events anonymous insert limited"
  on public.analytics_events;
create policy "analytics events anonymous insert limited"
on public.analytics_events
for insert
to anon
with check (
  user_id is null
  and event_name in ('page_view', 'apk_download', 'app_first_open', 'app_open')
);

drop policy if exists "analytics events authenticated insert own"
  on public.analytics_events;
create policy "analytics events authenticated insert own"
on public.analytics_events
for insert
to authenticated
with check (
  (user_id is null or user_id = auth.uid())
  and event_name in (
    'page_view',
    'apk_download',
    'app_first_open',
    'app_open',
    'register',
    'cloud_space_opened',
    'local_project_created',
    'local_record_created',
    'local_data_bound_to_account',
    'local_data_synced_to_cloud'
  )
);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events (event_name, created_at desc);
create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at desc);
create index if not exists analytics_events_page_visitor_idx
  on public.analytics_events (anonymous_id, created_at desc)
  where event_name = 'page_view';

comment on table public.analytics_events is
  'Privacy-preserving analytics. Page views contain normalized route templates only; sensitive content is prohibited.';

-- Account-deletion audits intentionally do not reference auth.users, because
-- the audit must survive removal of the target authentication record.
create table if not exists public.account_deletion_audits (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  target_account_number text,
  initiated_by text not null,
  requested_by uuid,
  status text not null default 'processing',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  deleted_storage_object_count integer not null default 0,
  error_code text,
  constraint account_deletion_audits_initiated_by_check
    check (initiated_by in ('self', 'admin')),
  constraint account_deletion_audits_status_check
    check (status in ('processing', 'completed', 'failed')),
  constraint account_deletion_audits_object_count_check
    check (deleted_storage_object_count >= 0)
);

alter table public.account_deletion_audits enable row level security;
revoke all on table public.account_deletion_audits
  from public, anon, authenticated;
grant all on table public.account_deletion_audits to service_role;

create index if not exists account_deletion_audits_requested_idx
  on public.account_deletion_audits (requested_at desc);
create index if not exists account_deletion_audits_status_idx
  on public.account_deletion_audits (status, requested_at desc);

comment on table public.account_deletion_audits is
  'Server-only account deletion audit without email, display name, free-form user content, or authentication secrets.';

-- Extend the existing membership search with registration information.
drop function if exists public.admin_search_memberships(text);

create function public.admin_search_memberships(
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
    public.get_user_active_market_post_count(au.id),
    public.get_user_market_post_limit(au.id),
    m.created_at,
    m.updated_at,
    u.account_number,
    coalesce(u.is_internal_test, false),
    au.created_at,
    au.last_sign_in_at,
    coalesce(archive_totals.archive_count, 0),
    coalesce(record_totals.record_count, 0)
  from auth.users as au
  left join public.profiles as p on p.id = au.id
  left join public.users as u on u.id = au.id
  left join public.user_memberships as m on m.user_id = au.id
  left join lateral (
    select count(*)::bigint as archive_count
    from public.archives as a
    where a.user_id = au.id
  ) as archive_totals on true
  left join lateral (
    select count(*)::bigint as record_count
    from public.records as r
    where r.user_id = au.id
  ) as record_totals on true
  where public.is_app_admin(auth.uid())
    and au.deleted_at is null
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

comment on function public.admin_search_memberships(text) is
  'Admin-only registration/member search with registration, login, usage, and content totals.';

-- Aggregate operations data in one admin-only RPC.
create or replace function public.admin_get_operations_dashboard(
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 90);
  v_platform_storage_bytes bigint := 0;
  v_platform_storage_pause_bytes bigint := 0;
  v_metrics jsonb;
  v_daily_traffic jsonb;
  v_top_pages jsonb;
  v_storage_leaders jsonb;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;

  v_platform_storage_bytes := private.platform_storage_usage_bytes();
  select coalesce(s.platform_storage_pause_bytes, 0)
  into v_platform_storage_pause_bytes
  from private.signup_rollout_state as s
  where s.singleton;

  select jsonb_build_object(
    'page_views_today', (
      select count(*) from public.analytics_events as ae
      where ae.event_name = 'page_view'
        and ae.created_at >= date_trunc('day', now())
    ),
    'page_views_period', (
      select count(*) from public.analytics_events as ae
      where ae.event_name = 'page_view'
        and ae.created_at >= now() - make_interval(days => v_days)
    ),
    'visitors_7d', (
      select count(distinct coalesce(ae.user_id::text, nullif(ae.anonymous_id, '')))
      from public.analytics_events as ae
      where ae.event_name = 'page_view'
        and ae.created_at >= now() - interval '7 days'
    ),
    'registered_total', (
      select count(*) from auth.users as au where au.deleted_at is null
    ),
    'registered_7d', (
      select count(*) from auth.users as au
      where au.deleted_at is null
        and au.created_at >= now() - interval '7 days'
    ),
    'cloud_members', (
      select count(*)
      from public.user_memberships as m
      join auth.users as au on au.id = m.user_id
      where au.deleted_at is null
        and m.plan in ('basic', 'large', 'seller')
        and m.paid_until is not null
        and m.paid_until > now()
        and coalesce(m.status, '') <> 'canceled'
    ),
    'payments_awaiting_confirmation', (
      select count(*) from public.membership_payments as mp
      where mp.status = 'submitted'
    ),
    'apk_download_total', (
      select count(*) from public.analytics_events as ae
      where ae.event_name = 'apk_download'
    ),
    'apk_download_30d', (
      select count(*) from public.analytics_events as ae
      where ae.event_name = 'apk_download'
        and ae.created_at >= now() - interval '30 days'
    ),
    'platform_storage_bytes', v_platform_storage_bytes,
    'platform_storage_pause_bytes', v_platform_storage_pause_bytes,
    'account_deletions_30d', (
      select count(*) from public.account_deletion_audits as ada
      where ada.status = 'completed'
        and ada.requested_at >= now() - interval '30 days'
    ),
    'account_deletion_failures', (
      select count(*) from public.account_deletion_audits as ada
      where ada.status = 'failed'
    ),
    'tracking_started_at', (
      select min(ae.created_at) from public.analytics_events as ae
      where ae.event_name = 'page_view'
    )
  ) into v_metrics;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', traffic.day,
        'page_views', traffic.page_views,
        'visitors', traffic.visitors
      ) order by traffic.day
    ),
    '[]'::jsonb
  )
  into v_daily_traffic
  from (
    select
      series.day::date as day,
      count(ae.id)::bigint as page_views,
      count(distinct coalesce(ae.user_id::text, nullif(ae.anonymous_id, '')))::bigint as visitors
    from generate_series(
      current_date - 13,
      current_date,
      interval '1 day'
    ) as series(day)
    left join public.analytics_events as ae
      on ae.event_name = 'page_view'
     and ae.created_at >= series.day
     and ae.created_at < series.day + interval '1 day'
    group by series.day
  ) as traffic;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'path', pages.path,
        'page_views', pages.page_views,
        'visitors', pages.visitors
      ) order by pages.page_views desc, pages.path
    ),
    '[]'::jsonb
  )
  into v_top_pages
  from (
    select
      ae.metadata ->> 'path' as path,
      count(*)::bigint as page_views,
      count(distinct coalesce(ae.user_id::text, nullif(ae.anonymous_id, '')))::bigint as visitors
    from public.analytics_events as ae
    where ae.event_name = 'page_view'
      and ae.created_at >= now() - make_interval(days => v_days)
      and nullif(ae.metadata ->> 'path', '') is not null
    group by ae.metadata ->> 'path'
    order by page_views desc, path
    limit 10
  ) as pages;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', leaders.user_id,
        'account_number', leaders.account_number,
        'username', leaders.username,
        'storage_used', leaders.storage_used,
        'storage_limit_bytes', leaders.storage_limit_bytes
      ) order by leaders.storage_used desc, leaders.user_id
    ),
    '[]'::jsonb
  )
  into v_storage_leaders
  from (
    select
      p.id as user_id,
      u.account_number,
      p.username,
      coalesce(p.storage_used, 0)::bigint as storage_used,
      coalesce(m.storage_limit_bytes, 0)::bigint as storage_limit_bytes
    from public.profiles as p
    left join public.users as u on u.id = p.id
    left join public.user_memberships as m on m.user_id = p.id
    order by coalesce(p.storage_used, 0) desc, p.id
    limit 10
  ) as leaders;

  return jsonb_build_object(
    'generated_at', now(),
    'period_days', v_days,
    'metrics', v_metrics,
    'daily_traffic', v_daily_traffic,
    'top_pages', v_top_pages,
    'storage_leaders', v_storage_leaders
  );
end;
$$;

revoke all on function public.admin_get_operations_dashboard(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_get_operations_dashboard(integer)
  to authenticated, service_role;

comment on function public.admin_get_operations_dashboard(integer) is
  'Admin-only aggregate operations dashboard; no page or user content is returned.';

create or replace function public.admin_list_account_deletions(
  p_limit integer default 30
)
returns table (
  id uuid,
  target_user_id uuid,
  target_account_number text,
  initiated_by text,
  status text,
  requested_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  deleted_storage_object_count integer,
  error_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ada.id,
    ada.target_user_id,
    ada.target_account_number,
    ada.initiated_by,
    ada.status,
    ada.requested_at,
    ada.completed_at,
    ada.failed_at,
    ada.deleted_storage_object_count,
    ada.error_code
  from public.account_deletion_audits as ada
  where public.is_app_admin(auth.uid())
  order by ada.requested_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.admin_list_account_deletions(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_list_account_deletions(integer)
  to authenticated, service_role;

comment on function public.admin_list_account_deletions(integer) is
  'Admin-only safe account-deletion history without email or deleted user content.';

notify pgrst, 'reload schema';

commit;
