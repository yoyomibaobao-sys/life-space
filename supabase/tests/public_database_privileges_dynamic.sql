-- LOCAL / ISOLATED SUPABASE ONLY.
-- Guard the public-launch privilege boundary so future RPCs do not silently
-- reopen anonymous writes or direct maintenance execution.

begin;

do $$
begin
  if has_table_privilege('anon', 'public.archives', 'INSERT')
     or has_table_privilege('anon', 'public.archives', 'UPDATE')
     or has_table_privilege('anon', 'public.archives', 'DELETE') then
    raise exception 'anonymous business-table mutation privilege is still open';
  end if;

  if not has_table_privilege('anon', 'public.analytics_events', 'INSERT') then
    raise exception 'anonymous bounded analytics insert was removed';
  end if;

  if not has_function_privilege('anon', 'public.can_access_record(uuid)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.get_public_profiles_safe()', 'EXECUTE') then
    raise exception 'anonymous public-read helper access was removed';
  end if;

  if has_function_privilege('anon', 'public.can_comment_market_post(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_user_storage_limit_bytes(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.is_user_membership_active(uuid)', 'EXECUTE') then
    raise exception 'anonymous user-specific helper execution is still open';
  end if;

  if not has_function_privilege('authenticated', 'public.can_comment_market_post(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_user_storage_limit_bytes(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.is_user_membership_active(uuid)', 'EXECUTE') then
    raise exception 'authenticated user helper access was removed';
  end if;

  if has_function_privilege('anon', 'public.sync_archive_stats(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sync_archive_stats(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.sync_record_media_stats(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sync_record_media_stats(uuid)', 'EXECUTE') then
    raise exception 'internal statistics helpers are directly callable by browser roles';
  end if;

  if has_function_privilege('anon', 'public.claim_my_cloud_trial()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.claim_my_cloud_trial()', 'EXECUTE') then
    raise exception 'cloud trial RPC privilege boundary is wrong';
  end if;

  if has_function_privilege('anon', 'public.admin_get_operations_dashboard(integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_get_operations_dashboard(integer)', 'EXECUTE') then
    raise exception 'admin dashboard RPC privilege boundary is wrong';
  end if;

  if has_function_privilege('anon', 'public.process_cloud_trial_lifecycle(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.process_cloud_trial_lifecycle(integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.process_cloud_trial_lifecycle(integer)', 'EXECUTE') then
    raise exception 'cloud lifecycle worker is not service-role only';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ) then
    raise exception 'a public trigger function is directly executable by a browser role';
  end if;
end;
$$;

-- Exercise the one intentional anonymous write path under the actual database
-- role, not merely by inspecting ACL metadata. The whole fixture rolls back.
set local role anon;
insert into public.analytics_events (
  event_name,
  anonymous_id,
  platform,
  metadata
)
values (
  'page_view',
  'public-privilege-regression',
  'web',
  '{"source":"isolated-test"}'::jsonb
);

-- Public read helper remains executable by signed-out visitors.
select public.can_access_record(gen_random_uuid());
reset role;

rollback;
