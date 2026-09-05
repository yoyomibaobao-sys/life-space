-- Tighten the signed-out database surface before public launch without
-- removing authenticated RPC access required by the application and admin UI.
--
-- The policy is:
--   * anonymous sessions may read public content and submit bounded analytics;
--   * authenticated sessions keep the application RPCs they legitimately use;
--   * trigger/maintenance helpers cannot be invoked directly from browser roles.

begin;

-- Browser roles never need table-owner capabilities. Anonymous mutations are
-- denied globally, except for the intentionally narrow analytics insert below.
do $$
declare
  relation_record record;
begin
  for relation_record in
    select n.nspname as schema_name, c.relname as relation_name
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'revoke truncate, references, trigger on table %I.%I from public, anon, authenticated',
      relation_record.schema_name,
      relation_record.relation_name
    );

    execute format(
      'revoke insert, update, delete on table %I.%I from public, anon',
      relation_record.schema_name,
      relation_record.relation_name
    );
  end loop;
end;
$$;

-- Analytics is the sole signed-out write surface. Bound caller-controlled
-- values so this exception cannot be repurposed as arbitrary payload storage.
alter table public.analytics_events
  drop constraint if exists analytics_events_public_payload_bounds;
alter table public.analytics_events
  add constraint analytics_events_public_payload_bounds
  check (
    (anonymous_id is null or char_length(anonymous_id) between 1 and 128)
    and (platform is null or char_length(platform) between 1 and 32)
    and (app_version is null or char_length(app_version) between 1 and 64)
    and (user_agent is null or char_length(user_agent) <= 1024)
    and (referrer is null or char_length(referrer) <= 2048)
    and (
      metadata is null
      or (
        jsonb_typeof(metadata) = 'object'
        and octet_length(metadata::text) <= 4096
      )
    )
  ) not valid;

drop policy if exists "analytics events anonymous insert limited"
  on public.analytics_events;
create policy "analytics events anonymous insert limited"
on public.analytics_events
for insert
to anon
with check (
  user_id is null
  and event_name in ('page_view', 'apk_download', 'app_first_open', 'app_open')
  and created_at >= now() - interval '5 minutes'
  and created_at <= now() + interval '1 minute'
);

drop policy if exists "analytics events authenticated insert own"
  on public.analytics_events;
create policy "analytics events authenticated insert own"
on public.analytics_events
for insert
to authenticated
with check (
  (user_id is null or user_id = (select auth.uid()))
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
  and created_at >= now() - interval '5 minutes'
  and created_at <= now() + interval '1 minute'
);

grant insert on table public.analytics_events to anon, authenticated;

-- PUBLIC sequence privileges flow to anon as well. Browser-created application
-- rows use UUIDs or explicitly granted authenticated paths instead.
revoke all on all sequences in schema public from public, anon;

-- Public, signed-out read helpers. Remove inherited PUBLIC execution first so
-- their exposure is explicit and auditable.
revoke execute on function public.can_access_experience_card(uuid) from public;
grant execute on function public.can_access_experience_card(uuid) to anon, authenticated, service_role;
revoke execute on function public.can_access_market_post(uuid) from public;
grant execute on function public.can_access_market_post(uuid) to anon, authenticated, service_role;
revoke execute on function public.can_access_record(uuid) from public;
grant execute on function public.can_access_record(uuid) to anon, authenticated, service_role;
revoke execute on function public.can_read_public_market_media_object(text) from public;
grant execute on function public.can_read_public_market_media_object(text) to anon, authenticated, service_role;
revoke execute on function public.can_read_public_record_media_object(text) from public;
grant execute on function public.can_read_public_record_media_object(text) to anon, authenticated, service_role;
revoke execute on function public.get_experience_card_interaction_summaries(uuid[]) from public;
grant execute on function public.get_experience_card_interaction_summaries(uuid[]) to anon, authenticated, service_role;
revoke execute on function public.get_public_profiles_safe() from public;
grant execute on function public.get_public_profiles_safe() to anon, authenticated, service_role;
revoke execute on function public.get_public_user_space_group_tags(uuid) from public;
grant execute on function public.get_public_user_space_group_tags(uuid) to anon, authenticated, service_role;
revoke execute on function public.increment_archive_view_count(uuid) from public;
grant execute on function public.increment_archive_view_count(uuid) to anon, authenticated, service_role;
revoke execute on function public.is_archive_not_trashed(uuid) from public;
grant execute on function public.is_archive_not_trashed(uuid) to anon, authenticated, service_role;
revoke execute on function public.is_experience_card_public(uuid) from public;
grant execute on function public.is_experience_card_public(uuid) to anon, authenticated, service_role;

-- These helpers participate in authenticated write policies or user-specific
-- calculations. They are not signed-out RPC endpoints.
revoke execute on function public.can_comment_market_post(uuid) from public, anon;
grant execute on function public.can_comment_market_post(uuid) to authenticated, service_role;
revoke execute on function public.can_user_create_market_post(uuid) from public, anon;
grant execute on function public.can_user_create_market_post(uuid) to authenticated, service_role;
revoke execute on function public.get_user_active_market_post_count(uuid) from public, anon;
grant execute on function public.get_user_active_market_post_count(uuid) to authenticated, service_role;
revoke execute on function public.get_user_market_post_limit(uuid) from public, anon;
grant execute on function public.get_user_market_post_limit(uuid) to authenticated, service_role;
revoke execute on function public.get_user_storage_limit_bytes(uuid) from public, anon;
grant execute on function public.get_user_storage_limit_bytes(uuid) to authenticated, service_role;
revoke execute on function public.is_market_post_owner(uuid) from public, anon;
grant execute on function public.is_market_post_owner(uuid) to authenticated, service_role;
revoke execute on function public.is_record_owner(uuid, uuid) from public, anon;
grant execute on function public.is_record_owner(uuid, uuid) to authenticated, service_role;
revoke execute on function public.is_user_membership_active(uuid) from public, anon;
grant execute on function public.is_user_membership_active(uuid) to authenticated, service_role;

-- Statistics helpers are internal maintenance primitives. Legitimate callers
-- are trigger/security-definer functions or service-side workers, not browsers.
revoke execute on function public.sync_archive_stats(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_archive_stats(uuid) to service_role;
revoke execute on function public.sync_profile_flower_count(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_profile_flower_count(uuid) to service_role;
revoke execute on function public.sync_record_media_stats(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_record_media_stats(uuid) to service_role;

-- handle_media_change currently runs as the invoking user but calls the
-- locked-down media-statistics helper. Run this trigger as its owner instead.
alter function public.handle_media_change()
  security definer;
alter function public.handle_media_change()
  set search_path = pg_catalog, public;

-- Trigger functions are invoked by PostgreSQL and never need direct API RPC
-- access. Revoking browser EXECUTE does not stop the triggers from firing.
do $$
declare
  function_record record;
begin
  for function_record in
    select p.oid
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'pg_catalog.trigger'::regtype
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      function_record.oid::regprocedure
    );
  end loop;
end;
$$;

-- Pin legacy mutable search paths. pg_catalog comes first so built-ins cannot
-- be shadowed; public remains available for legacy unqualified relations.
alter function public.handle_comment_change()
  set search_path = pg_catalog, public;
alter function public.handle_record_insert()
  set search_path = pg_catalog, public;
alter function public.set_market_posts_updated_at()
  set search_path = pg_catalog, public;
alter function public.set_updated_at()
  set search_path = pg_catalog, public;
alter function public.set_user_memberships_updated_at()
  set search_path = pg_catalog, public;
alter function public.sync_record_status_tag_to_record_tags()
  set search_path = pg_catalog, public;
alter function public.sync_record_tags_from_record()
  set search_path = pg_catalog, public;

-- Future postgres-owned objects start closed to anonymous mutation/execution.
-- Authenticated RPC grants remain an explicit decision in the creating migration.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables
  from public, anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

commit;
