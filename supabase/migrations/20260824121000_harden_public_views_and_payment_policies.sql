-- Resolve exposed-view advisor findings without granting public access to the
-- private profiles/users tables. The function returns only the established
-- public-profile contract and has no user-controlled SQL or filter input.

create or replace function public.get_public_profiles_safe()
returns table (
  id uuid,
  username text,
  avatar_url text,
  level integer,
  flower_count integer,
  view_count integer,
  country_code text,
  country_name text,
  region_name text,
  city_name text,
  created_at timestamp without time zone,
  account_number text,
  registration_year integer,
  registration_sequence bigint
)
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.get_public_profiles_safe()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_profiles_safe()
  to anon, authenticated, service_role;

create or replace view public.public_profiles
with (security_invoker = true, security_barrier = true)
as
select *
from public.get_public_profiles_safe();

comment on view public.public_profiles is
  'Public author profile with display metadata, approximate region, and formal account number/rank. Private profile, email, exact location, capacity, internal-test, and membership fields are excluded by a fixed security-definer function contract.';

revoke all on table public.public_profiles
  from public, anon, authenticated, service_role;
grant select on table public.public_profiles
  to anon, authenticated, service_role;

-- These feeds already limit rows to public, active project content. Joining
-- the public profile contract lets the outer views run as the caller so RLS on
-- archives and records remains effective.

create or replace view public.discovery_feed_view
with (security_invoker = true, security_barrier = true)
as
select
  r.id as record_id,
  r.archive_id,
  r.user_id,
  r.note,
  r.record_time,
  r.status_tag,
  r.primary_image_url,
  r.comment_count,
  r.media_count,
  a.title as archive_title,
  a.category as archive_category,
  a.species_id,
  a.species_name_snapshot,
  p.username,
  p.avatar_url,
  a.system_name,
  a.record_count as archive_record_count,
  a.view_count as archive_view_count,
  a.status as archive_status,
  a.ended_at as archive_ended_at,
  a.help_status as archive_help_status,
  a.help_opened_at as archive_help_opened_at,
  a.help_resolved_at as archive_help_resolved_at
from public.records as r
join public.archives as a
  on a.id = r.archive_id
left join public.public_profiles as p
  on p.id = r.user_id
where r.visibility = 'public'
  and r.trashed_at is null
  and a.is_public is true
  and a.trashed_at is null
order by r.record_time desc;

create or replace view public.discovery_view
with (security_invoker = true, security_barrier = true)
as
select
  id,
  archive_id,
  note,
  record_time,
  user_id,
  archive_title,
  username,
  image_url,
  rn_archive,
  rn_user
from (
  select
    r.id,
    r.archive_id,
    r.note,
    r.record_time,
    r.user_id,
    a.title as archive_title,
    p.username,
    r.primary_image_url as image_url,
    row_number() over (
      partition by r.archive_id
      order by r.record_time desc
    ) as rn_archive,
    row_number() over (
      partition by r.user_id
      order by r.record_time desc
    ) as rn_user
  from public.records as r
  join public.archives as a
    on a.id = r.archive_id
  left join public.public_profiles as p
    on p.id = r.user_id
  where r.visibility = 'public'
    and r.trashed_at is null
    and a.is_public is true
    and a.trashed_at is null
) as ranked
where rn_archive = 1
  and rn_user <= 4;

create or replace view public.user_flower_stats
with (security_invoker = true, security_barrier = true)
as
select
  receiver_user_id as user_id,
  count(*) filter (where revoked_at is null) as flower_count,
  count(*) filter (where revoked_at is null) as helpful_comment_count,
  max(created_at) filter (where revoked_at is null) as last_received_at
from public.comment_flowers
group by receiver_user_id;

revoke all on table public.discovery_feed_view
  from public, anon, authenticated, service_role;
revoke all on table public.discovery_view
  from public, anon, authenticated, service_role;
revoke all on table public.user_flower_stats
  from public, anon, authenticated, service_role;
grant select on table public.discovery_feed_view
  to anon, authenticated, service_role;
grant select on table public.discovery_view
  to anon, authenticated, service_role;
grant select on table public.user_flower_stats
  to anon, authenticated, service_role;

-- Payment orders are created/submitted through fixed security-definer RPCs.
-- Keep direct table access read-only for the owner and full only for an admin,
-- while evaluating auth identity once per statement rather than once per row.

drop policy if exists membership_payments_select_own
  on public.membership_payments;
drop policy if exists membership_payments_admin_select
  on public.membership_payments;
drop policy if exists membership_payments_admin_insert
  on public.membership_payments;
drop policy if exists membership_payments_admin_update
  on public.membership_payments;
drop policy if exists membership_payments_admin_delete
  on public.membership_payments;

create policy membership_payments_select_own_or_admin
on public.membership_payments
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_app_admin((select auth.uid())))
);

create policy membership_payments_admin_insert
on public.membership_payments
for insert
to authenticated
with check ((select public.is_app_admin((select auth.uid()))));

create policy membership_payments_admin_update
on public.membership_payments
for update
to authenticated
using ((select public.is_app_admin((select auth.uid()))))
with check ((select public.is_app_admin((select auth.uid()))));

create policy membership_payments_admin_delete
on public.membership_payments
for delete
to authenticated
using ((select public.is_app_admin((select auth.uid()))));

create index if not exists membership_payments_reviewed_by_idx
  on public.membership_payments (reviewed_by)
  where reviewed_by is not null;
