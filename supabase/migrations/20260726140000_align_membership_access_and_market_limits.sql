-- Align the launch membership model with the approved product rules.
--
-- Public states:
--   visitor      -> public browsing + plant directory only
--   local free   -> visitor access + registered-only basic plant overview
--   cloud member -> 1 GB, full cloud/interaction/guide access, 30 active market posts
--
-- Existing trial rows are intentionally preserved with their original expiry,
-- storage limit, and market quota. New registrations no longer receive a trial.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Stop creating trial memberships for new registrations.
-- ---------------------------------------------------------------------------

drop trigger if exists trg_ensure_user_membership on public.users;

revoke all on function public.ensure_user_membership()
  from public, anon, authenticated, service_role;
drop function if exists public.ensure_user_membership();

alter table public.profiles
  alter column storage_limit set default 0;

update public.profiles as p
set
  storage_limit = coalesce((
    select m.storage_limit_bytes
    from public.user_memberships as m
    where m.user_id = p.id
  ), 0),
  updated_at = now()
where p.storage_limit is distinct from coalesce((
  select m.storage_limit_bytes
  from public.user_memberships as m
  where m.user_id = p.id
), 0);

create or replace function private.enforce_profile_storage_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.storage_limit := coalesce((
    select m.storage_limit_bytes
    from public.user_memberships as m
    where m.user_id = new.id
  ), 0);

  return new;
end;
$$;

revoke all on function private.enforce_profile_storage_limit()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_profile_storage_limit on public.profiles;
create trigger trg_enforce_profile_storage_limit
before insert or update of storage_limit
on public.profiles
for each row
execute function private.enforce_profile_storage_limit();

comment on function private.enforce_profile_storage_limit() is
  'Keeps the denormalized profile capacity aligned with the membership row, or zero for local-free accounts.';

-- ---------------------------------------------------------------------------
-- 2. Enforce the single public cloud plan: 1 GB and 30 active market posts.
--    Legacy trial/large/seller/admin rows remain compatible and unchanged.
-- ---------------------------------------------------------------------------

create or replace function private.enforce_basic_cloud_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.plan = 'basic' then
    new.storage_limit_bytes := 1000000000;
    new.base_market_post_limit := 30;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_basic_cloud_plan()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_basic_cloud_plan on public.user_memberships;
create trigger trg_enforce_basic_cloud_plan
before insert or update of plan, storage_limit_bytes, base_market_post_limit
on public.user_memberships
for each row
execute function private.enforce_basic_cloud_plan();

create or replace function private.sync_membership_profile_storage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  else
    v_user_id := new.user_id;
  end if;

  update public.profiles as p
  set
    storage_limit = coalesce((
      select m.storage_limit_bytes
      from public.user_memberships as m
      where m.user_id = v_user_id
    ), 0),
    updated_at = now()
  where p.id = v_user_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_membership_profile_storage()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_sync_membership_profile_storage
  on public.user_memberships;
create trigger trg_sync_membership_profile_storage
after insert or update or delete
on public.user_memberships
for each row
execute function private.sync_membership_profile_storage();

update public.user_memberships
set
  storage_limit_bytes = 1000000000,
  base_market_post_limit = 30,
  updated_at = now()
where plan = 'basic'
  and (
    storage_limit_bytes is distinct from 1000000000
    or base_market_post_limit is distinct from 30
  );

update public.profiles as p
set
  storage_limit = m.storage_limit_bytes,
  updated_at = now()
from public.user_memberships as m
where m.user_id = p.id
  and p.storage_limit is distinct from m.storage_limit_bytes;

comment on column public.user_memberships.base_market_post_limit is
  'Base count of simultaneously active market posts. Launch cloud plan = 30; legacy trial rows retain their original quota.';

comment on column public.user_memberships.storage_limit_bytes is
  'Cloud capacity in bytes. Launch cloud plan = 1 GB; legacy trial and hidden internal plans retain compatible rows.';

-- The add-on table remains only for backwards-compatible schema shape. It is
-- not part of launch entitlements and no longer contributes to the quota.
create or replace function public.get_user_market_post_limit(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.is_user_membership_active(p_user_id) then 0
    else coalesce((
      select m.base_market_post_limit
      from public.user_memberships as m
      where m.user_id = p_user_id
    ), 0)
  end;
$$;

comment on function public.get_user_market_post_limit(uuid) is
  'Returns the active membership base market quota. Reserved add-on rows are intentionally ignored at launch.';

comment on table public.market_post_quota_addons is
  'Reserved compatibility structure for a possible future market quota add-on. Not sold, displayed, or counted at launch.';

revoke all on table public.market_post_quota_addons from anon, authenticated;

-- Current-actor helper used by RLS. It intentionally accepts no user id so a
-- caller cannot use it to probe another account's membership.
create or replace function public.has_active_cloud_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid() is not null
    and public.is_user_membership_active(auth.uid());
$$;

revoke all on function public.has_active_cloud_access()
  from public, anon, authenticated, service_role;
grant execute on function public.has_active_cloud_access()
  to authenticated;

comment on function public.has_active_cloud_access() is
  'Returns whether the authenticated current actor has a valid trial, paid cloud plan, or internal admin entitlement.';

-- ---------------------------------------------------------------------------
-- 3. Plant guide read tiers.
-- ---------------------------------------------------------------------------

-- Visitors and registered users share only directory columns. Descriptions are
-- deliberately omitted; registered users receive the basic overview through a
-- narrow RPC below.
alter table public.plant_species enable row level security;
drop policy if exists plant_species_directory_read on public.plant_species;
create policy plant_species_directory_read
on public.plant_species
for select
to anon, authenticated
using (is_active = true);

revoke all on table public.plant_species from anon, authenticated;
grant select (
  id,
  scientific_name,
  common_name,
  family,
  slug,
  category,
  sub_category,
  growth_type,
  entry_type,
  is_active,
  sort_order
) on public.plant_species to anon, authenticated;

alter table public.plant_species_i18n enable row level security;
drop policy if exists plant_species_i18n_directory_read
  on public.plant_species_i18n;
create policy plant_species_i18n_directory_read
on public.plant_species_i18n
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.plant_species as ps
    where ps.id = plant_species_i18n.plant_id
      and ps.is_active = true
  )
);

revoke all on table public.plant_species_i18n from anon, authenticated;
grant select (
  id,
  plant_id,
  language_code,
  common_name,
  family
) on public.plant_species_i18n to anon, authenticated;

alter table public.plant_species_aliases enable row level security;
drop policy if exists plant_species_aliases_public_read
  on public.plant_species_aliases;
drop policy if exists plant_species_aliases_directory_read
  on public.plant_species_aliases;
create policy plant_species_aliases_directory_read
on public.plant_species_aliases
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.plant_species as ps
    where ps.id = plant_species_aliases.species_id
      and ps.is_active = true
  )
);

revoke all on table public.plant_species_aliases from anon, authenticated;
grant select (
  id,
  species_id,
  language_code,
  alias_name,
  normalized_name,
  alias_type,
  relation_type
) on public.plant_species_aliases to anon, authenticated;

-- Registered local-free users may retrieve only this one overview string. The
-- privileged reader lives in an unexposed schema; the public RPC is invoker
-- security and exposes only the narrow result.
create or replace function private.get_plant_basic_overviews(
  p_species_id uuid default null,
  p_language_code text default 'zh'
)
returns table (
  species_id uuid,
  summary text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ps.id as species_id,
    coalesce(
      nullif(trim(pcg.summary), ''),
      nullif(trim(psi.description), ''),
      nullif(trim(ps.description), '')
    ) as summary
  from public.plant_species as ps
  left join public.plant_species_i18n as psi
    on psi.plant_id = ps.id
   and psi.language_code = coalesce(nullif(trim(p_language_code), ''), 'zh')
  left join public.plant_care_guides as pcg
    on pcg.plant_id = ps.id
   and pcg.language_code = coalesce(nullif(trim(p_language_code), ''), 'zh')
  where auth.uid() is not null
    and ps.is_active = true
    and (p_species_id is null or ps.id = p_species_id)
  order by ps.sort_order asc nulls last, ps.common_name asc;
$$;

revoke all on function private.get_plant_basic_overviews(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.get_plant_basic_overviews(uuid, text)
  to authenticated;

create or replace function public.get_plant_basic_overviews(
  p_species_id uuid default null,
  p_language_code text default 'zh'
)
returns table (
  species_id uuid,
  summary text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.get_plant_basic_overviews(p_species_id, p_language_code);
$$;

revoke all on function public.get_plant_basic_overviews(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_plant_basic_overviews(uuid, text)
  to authenticated;

comment on function public.get_plant_basic_overviews(uuid, text) is
  'Registered-only basic plant overview. It never returns parameters, full care guidance, growth cycles, or related records.';

-- Full guide, parameter, and growth-cycle tables are cloud-member only.
alter table public.plant_care_guides enable row level security;
drop policy if exists plant_care_guides_select_all on public.plant_care_guides;
drop policy if exists plant_care_guides_select_cloud_member
  on public.plant_care_guides;
create policy plant_care_guides_select_cloud_member
on public.plant_care_guides
for select
to authenticated
using (
  public.has_active_cloud_access()
  and exists (
    select 1
    from public.plant_species as ps
    where ps.id = plant_care_guides.plant_id
      and ps.is_active = true
  )
);

alter table public.plant_parameters enable row level security;
drop policy if exists plant_parameters_select_cloud_member
  on public.plant_parameters;
create policy plant_parameters_select_cloud_member
on public.plant_parameters
for select
to authenticated
using (
  public.has_active_cloud_access()
  and exists (
    select 1
    from public.plant_species as ps
    where ps.id = plant_parameters.species_id
      and ps.is_active = true
  )
);

alter table public.plant_growth_cycle enable row level security;
drop policy if exists plant_growth_cycle_select_cloud_member
  on public.plant_growth_cycle;
create policy plant_growth_cycle_select_cloud_member
on public.plant_growth_cycle
for select
to authenticated
using (
  public.has_active_cloud_access()
  and exists (
    select 1
    from public.plant_species as ps
    where ps.id = plant_growth_cycle.species_id
      and ps.is_active = true
  )
);

alter table public.plant_light_cycle enable row level security;
drop policy if exists plant_light_cycle_select_cloud_member
  on public.plant_light_cycle;
create policy plant_light_cycle_select_cloud_member
on public.plant_light_cycle
for select
to authenticated
using (
  public.has_active_cloud_access()
  and exists (
    select 1
    from public.plant_species as ps
    where ps.id = plant_light_cycle.species_id
      and ps.is_active = true
  )
);

alter table public.plant_temperature_ranges enable row level security;
drop policy if exists plant_temperature_ranges_select_cloud_member
  on public.plant_temperature_ranges;
create policy plant_temperature_ranges_select_cloud_member
on public.plant_temperature_ranges
for select
to authenticated
using (
  public.has_active_cloud_access()
  and exists (
    select 1
    from public.plant_species as ps
    where ps.id = plant_temperature_ranges.species_id
      and ps.is_active = true
  )
);

alter table public.plant_parameter_score_guides enable row level security;
drop policy if exists plant_parameter_score_guides_select_all
  on public.plant_parameter_score_guides;
drop policy if exists plant_parameter_score_guides_select_cloud_member
  on public.plant_parameter_score_guides;
create policy plant_parameter_score_guides_select_cloud_member
on public.plant_parameter_score_guides
for select
to authenticated
using (public.has_active_cloud_access());

revoke all on table
  public.plant_care_guides,
  public.plant_parameters,
  public.plant_growth_cycle,
  public.plant_light_cycle,
  public.plant_temperature_ranges,
  public.plant_parameter_score_guides
from anon, authenticated;

grant select on table
  public.plant_care_guides,
  public.plant_parameters,
  public.plant_growth_cycle,
  public.plant_light_cycle,
  public.plant_temperature_ranges,
  public.plant_parameter_score_guides
to authenticated;

-- This view is specifically the plant-guide aggregation of public projects.
-- Public records remain browsable in Discover and their own public pages.
revoke select on table public.plant_related_archives_view
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cloud-member-only writes for interactions and cloud plant preferences.
--    Existing interactions may still be removed after expiry.
-- ---------------------------------------------------------------------------

drop policy if exists "allow insert own follow" on public.follows;
create policy "allow insert own follow"
on public.follows
for insert
to authenticated
with check (
  (select auth.uid()) = follower_id
  and public.has_active_cloud_access()
);

drop policy if exists "archive follows allow insert own"
  on public.archive_follows;
create policy "archive follows allow insert own"
on public.archive_follows
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.has_active_cloud_access()
);

drop policy if exists record_likes_insert_own on public.record_likes;
create policy record_likes_insert_own
on public.record_likes
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.has_active_cloud_access()
  and public.can_access_record(record_id)
);

drop policy if exists comment_likes_insert_own on public.comment_likes;
create policy comment_likes_insert_own
on public.comment_likes
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.has_active_cloud_access()
  and exists (
    select 1
    from public.comments as c
    where c.id = comment_likes.comment_id
      and public.can_access_record(c.record_id)
  )
);

drop policy if exists comment_flowers_insert_help_owner
  on public.comment_flowers;
create policy comment_flowers_insert_help_owner
on public.comment_flowers
for insert
to authenticated
with check (
  (select auth.uid()) = sender_user_id
  and public.has_active_cloud_access()
  and sender_user_id <> receiver_user_id
  and exists (
    select 1
    from public.records as r
    join public.comments as c
      on c.id = comment_flowers.comment_id
     and c.record_id = r.id
    where r.id = comment_flowers.record_id
      and r.user_id = (select auth.uid())
      and c.user_id = comment_flowers.receiver_user_id
      and r.status_tag in ('help', 'resolved')
  )
);

drop policy if exists comments_insert_own_active_visible_record
  on public.comments;
create policy comments_insert_own_active_visible_record
on public.comments
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.has_active_cloud_access()
  and public.can_access_record(record_id)
);

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
on public.comments
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and public.has_active_cloud_access()
);

drop policy if exists market_comments_insert_own_active_post
  on public.market_comments;
create policy market_comments_insert_own_active_post
on public.market_comments
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.has_active_cloud_access()
  and public.can_comment_market_post(market_post_id)
);

drop policy if exists market_comments_update_own on public.market_comments;
create policy market_comments_update_own
on public.market_comments
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and public.has_active_cloud_access()
);

drop policy if exists user_plant_interests_insert_own
  on public.user_plant_interests;
create policy user_plant_interests_insert_own
on public.user_plant_interests
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.has_active_cloud_access()
);

drop policy if exists user_plant_interests_update_own
  on public.user_plant_interests;
create policy user_plant_interests_update_own
on public.user_plant_interests
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and public.has_active_cloud_access()
);

drop policy if exists user_plant_plans_insert_own
  on public.user_plant_plans;
create policy user_plant_plans_insert_own
on public.user_plant_plans
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.has_active_cloud_access()
);

drop policy if exists user_plant_plans_update_own
  on public.user_plant_plans;
create policy user_plant_plans_update_own
on public.user_plant_plans
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and public.has_active_cloud_access()
);

drop policy if exists market_posts_update_own on public.market_posts;
create policy market_posts_update_own
on public.market_posts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    status = 'ended'
    or public.has_active_cloud_access()
  )
);

-- ---------------------------------------------------------------------------
-- 5. Serialize market activation so concurrent inserts and reactivations
--    cannot exceed the member's active-post limit.
-- ---------------------------------------------------------------------------

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

  -- The membership row is the per-user serialization point. A concurrent
  -- activation for the same user must wait here before it counts active rows.
  select
    (
      m.plan = 'admin'
      or (m.paid_until is not null and m.paid_until > now())
      or (m.plan = 'trial' and m.trial_ends_at > now())
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

drop trigger if exists trg_enforce_market_activation_limit
  on public.market_posts;
create trigger trg_enforce_market_activation_limit
before insert or update of status, user_id
on public.market_posts
for each row
execute function private.enforce_market_activation_limit();

comment on function private.enforce_market_activation_limit() is
  'Serializes each user market activation on the membership row and enforces the active-post quota for inserts and ended-to-active updates.';
