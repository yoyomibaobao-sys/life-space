-- LOCAL SUPABASE ONLY. Read-only catalog assertions after applying migrations.
-- This file intentionally creates no fixtures and performs no purge.

do $$
declare
  v_definition text;
begin
  if to_regprocedure('public.request_purge_trash_entry(uuid,text,uuid)') is null then
    raise exception 'missing request_purge_trash_entry';
  end if;

  if exists (
       select 1
       from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       where p.oid = 'public.request_purge_trash_entry(uuid,text,uuid)'::regprocedure
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', 'public.request_purge_trash_entry(uuid,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.request_purge_trash_entry(uuid,text,uuid)', 'execute') then
    raise exception 'purge orchestration is exposed to an API role';
  end if;

  if not has_function_privilege('service_role', 'public.request_purge_trash_entry(uuid,text,uuid)', 'execute') then
    raise exception 'service_role cannot execute purge orchestration';
  end if;

  if has_function_privilege('service_role', 'public.request_delete_archive(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.request_delete_record(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.request_delete_media(uuid)', 'execute') then
    raise exception 'legacy permanent delete RPC remains directly executable';
  end if;

  if has_function_privilege('authenticated', 'public.release_storage_bytes(bigint)', 'execute')
     or has_function_privilege('service_role', 'public.release_storage_bytes(bigint)', 'execute') then
    raise exception 'arbitrary byte release remains directly executable';
  end if;

  if to_regclass('public.storage_deletion_job_items') is null then
    raise exception 'missing storage_deletion_job_items';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'trash_entries'
      and column_name = 'deletion_job_id'
  ) then
    raise exception 'missing trash_entries.deletion_job_id';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'storage_deletion_items'
      and column_name = 'capacity_reconciliation_required'
  ) then
    raise exception 'missing item capacity reconciliation marker';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'storage_deletion_items'
      and column_name = 'capacity_kind'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'storage_deletion_items'
      and column_name = 'capacity_bytes'
  ) then
    raise exception 'missing main-only deletion capacity metadata';
  end if;

  select pg_get_functiondef(
    'public.complete_storage_deletion_item(uuid,uuid,text)'::regprocedure
  )
  into v_definition;

  if v_definition not like '%v_item.capacity_bytes%'
     or v_definition like '%- v_item.size_bytes%' then
    raise exception 'deletion completion still refunds physical thumbnail bytes';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'request_purge_trash_entry'
      and p.prosecdef
      and p.proconfig @> array['search_path=""']::text[]
  ) then
    raise exception 'purge orchestration lacks a fixed empty search_path';
  end if;
end;
$$;
