-- LOCAL SUPABASE ONLY. Read-only catalog assertions for B3.5.4 phase 2.

do $$
declare
  v_result_type text;
  v_definition text;
begin
  if to_regprocedure('public.list_my_trash_entries()') is null then
    raise exception 'missing list_my_trash_entries';
  end if;

  select pg_catalog.pg_get_function_result('public.list_my_trash_entries()'::regprocedure)
  into v_result_type;

  if v_result_type not like '%trash_entry_id uuid%'
     or v_result_type not like '%status text%'
     or v_result_type not like '%can_retry boolean%' then
    raise exception 'trash listing result signature is incomplete: %', v_result_type;
  end if;

  if v_result_type like '%deletion_job_id%'
     or v_result_type like '%object_path%'
     or v_result_type like '%owner_user_id%' then
    raise exception 'trash listing result exposes an internal field';
  end if;

  if exists (
       select 1
       from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       where p.oid = 'public.list_my_trash_entries()'::regprocedure
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', 'public.list_my_trash_entries()', 'execute')
     or not has_function_privilege('authenticated', 'public.list_my_trash_entries()', 'execute') then
    raise exception 'trash listing function grants are invalid';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'list_my_trash_entries'
      and p.prosecdef
      and p.proconfig @> array['search_path=""']::text[]
  ) then
    raise exception 'trash listing lacks security definer or fixed search_path';
  end if;

  if has_table_privilege('authenticated', 'public.trash_entries', 'select') then
    raise exception 'authenticated can directly select trash_entries';
  end if;

  select pg_catalog.pg_get_functiondef('public.list_my_trash_entries()'::regprocedure)
  into v_definition;

  if v_definition not like '%status = ANY (ARRAY[''active''::text, ''purging''::text, ''failed''::text])%'
     and v_definition not like '%status in (''active'', ''purging'', ''failed'')%' then
    raise exception 'trash listing does not include the required processing states';
  end if;
end;
$$;
