-- Reduce the anonymous API surface before public launch.
--
-- This migration deliberately keeps the public read helpers that are required
-- by RLS policies and signed-out pages. It removes direct anonymous access to
-- account, membership, mutation, maintenance, and trigger-only functions.

begin;

-- No API role needs table-owner capabilities. Anonymous writes are limited to
-- the intentionally write-only analytics endpoint; RLS remains the second
-- enforcement layer for every table.
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

-- Analytics is the sole signed-out write surface. It has no sequence-backed
-- identifier. Bound every caller-controlled field so this narrow exception
-- cannot be used to store arbitrary large payloads.
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

-- PUBLIC sequence privileges also flow to anon. Existing authenticated grants
-- are retained for identity-backed application tables.
revoke all on all sequences in schema public from public, anon;

-- SECURITY DEFINER functions run with their owner privileges. Start from a
-- deny-by-default anonymous surface, then explicitly restore the small set of
-- public-read helpers used by signed-out pages and RLS policies.
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
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %s from public, anon',
      function_record.oid::regprocedure
    );
  end loop;
end;
$$;

grant execute on function public.can_access_experience_card(uuid)
  to anon, authenticated;
grant execute on function public.can_access_market_post(uuid)
  to anon, authenticated;
grant execute on function public.can_access_record(uuid)
  to anon, authenticated;
grant execute on function public.can_read_public_market_media_object(text)
  to anon, authenticated;
grant execute on function public.can_read_public_record_media_object(text)
  to anon, authenticated;
grant execute on function public.get_experience_card_interaction_summaries(uuid[])
  to anon, authenticated;
grant execute on function public.get_public_profiles_safe()
  to anon, authenticated;
grant execute on function public.get_public_user_space_group_tags(uuid)
  to anon, authenticated;
grant execute on function public.is_archive_not_trashed(uuid)
  to anon, authenticated;
grant execute on function public.is_experience_card_public(uuid)
  to anon, authenticated;

-- These functions are internal maintenance primitives. Trigger owners and the
-- service role retain access, but browser sessions cannot call them directly.
revoke execute on function public.sync_archive_stats(uuid)
  from authenticated;
revoke execute on function public.sync_profile_flower_count(uuid)
  from authenticated;
revoke execute on function public.sync_record_media_stats(uuid)
  from authenticated;

-- Trigger functions never need direct API execution. Revoking EXECUTE from API
-- roles does not prevent PostgreSQL from firing the triggers.
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

-- Pin every previously mutable function search path. pg_catalog is first so
-- built-ins cannot be shadowed; public remains available for legacy unqualified
-- application relations referenced inside these functions.
alter function public.handle_comment_change()
  set search_path = pg_catalog, public;
alter function public.handle_media_change()
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

-- Objects created by future postgres-owned migrations must opt anonymous
-- callers into writes or SECURITY DEFINER execution explicitly.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables
  from public, anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

commit;
