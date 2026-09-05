-- LOCAL SUPABASE ONLY. Catalog assertions for recoverable archive-cycle groups.

do $$
declare
  v_definition text;
  v_wrapper_definition text;
begin
  if exists (
    select 1
    from unnest(array['trashed_at', 'trash_entry_id']) as required(column_name)
    where not exists (
      select 1
      from information_schema.columns as c
      where c.table_schema = 'public'
        and c.table_name = 'archive_cycles'
        and c.column_name = required.column_name
    )
  ) then
    raise exception 'archive cycle trash columns are incomplete';
  end if;

  if not exists (
    select 1
    from pg_constraint as c
    join pg_class as r on r.oid = c.conrelid
    join pg_namespace as n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'archive_cycles'
      and c.conname = 'archive_cycles_trash_state_check'
  ) then
    raise exception 'archive cycle trash state constraint is missing';
  end if;

  if has_function_privilege('anon', 'public.create_archive_cycle(uuid,timestamp with time zone)', 'execute')
     or has_function_privilege('anon', 'public.move_archive_cycle_to_trash(uuid)', 'execute')
     or has_function_privilege('anon', 'public.restore_archive_cycle_from_trash(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.create_archive_cycle(uuid,timestamp with time zone)', 'execute')
     or not has_function_privilege('authenticated', 'public.move_archive_cycle_to_trash(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.restore_archive_cycle_from_trash(uuid)', 'execute') then
    raise exception 'archive cycle function grants are invalid';
  end if;

  if has_function_privilege('authenticated', 'public.request_delete_archive_cycle(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.request_delete_archive_cycle(uuid)', 'execute') then
    raise exception 'permanent archive cycle deletion is not service-role only';
  end if;

  select lower(pg_get_functiondef(
    'public.create_archive_cycle(uuid,timestamp with time zone)'::regprocedure
  )) into v_wrapper_definition;

  if v_wrapper_definition not like '%security definer%'
     or v_wrapper_definition not like '%public.is_user_membership_active(v_user_id)%'
     or v_wrapper_definition not like '%private.create_archive_cycle_unchecked%'
     or has_function_privilege(
       'authenticated',
       'private.create_archive_cycle_unchecked(uuid,timestamp with time zone)',
       'execute'
     ) then
    raise exception 'archive cycle creation wrapper does not enforce active cloud access';
  end if;

  select lower(pg_get_functiondef(
    'private.create_archive_cycle_unchecked(uuid,timestamp with time zone)'::regprocedure
  )) into v_definition;

  if v_definition not like '%security definer%'
     or v_definition not like '%a.user_id = v_user_id%'
     or v_definition not like '%a.cycle_enabled is true%'
     or v_definition not like '%for update%'
     or v_definition not like '%max(ac.cycle_no)%'
     or v_definition not like '%where ac.archive_id = p_archive_id%' then
    raise exception 'archive cycle creation is not owner-bound and serialized';
  end if;

  select lower(pg_get_functiondef(
    'public.move_archive_cycle_to_trash(uuid)'::regprocedure
  )) into v_definition;

  if v_definition not like '%v_archive.user_id is distinct from v_user_id%'
     or v_definition not like '%update public.records%'
     or v_definition not like '%r.cycle_id = p_cycle_id%'
     or v_definition not like '%update public.media%'
     or v_definition not like '%target_type, target_id, root_type, root_id%'
     or v_definition not like '%''cycle'', p_cycle_id, ''cycle'', p_cycle_id%' then
    raise exception 'archive cycle trash does not move the complete owner-bound group';
  end if;

  select lower(pg_get_functiondef(
    'public.restore_archive_cycle_from_trash(uuid)'::regprocedure
  )) into v_wrapper_definition;

  if v_wrapper_definition not like '%security definer%'
     or v_wrapper_definition not like '%public.is_user_membership_active(v_user_id)%'
     or v_wrapper_definition not like '%private.restore_archive_cycle_from_trash_unchecked%'
     or has_function_privilege(
       'authenticated',
       'private.restore_archive_cycle_from_trash_unchecked(uuid)',
       'execute'
     ) then
    raise exception 'archive cycle restore wrapper does not enforce active cloud access';
  end if;

  select lower(pg_get_functiondef(
    'private.restore_archive_cycle_from_trash_unchecked(uuid)'::regprocedure
  )) into v_definition;

  -- Ownership is checked on the trash_entries row before it is read into v_entry.
  if v_definition not like '%te.owner_user_id = v_user_id%'
     or v_definition not like '%v_archive.user_id is distinct from v_user_id%'
     or v_definition not like '%set trashed_at = null, trash_entry_id = null%'
     or v_definition like '%display_name =%'
     or v_definition like '%cycle_enabled =%' then
    raise exception 'archive cycle restoration changes names/settings or misses the group';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'archive_cycles'
      and policyname = 'archive cycles select own or public archive'
      and qual like '%trashed_at IS NULL%'
  ) then
    raise exception 'trashed archive cycles remain visible through ordinary RLS';
  end if;
end;
$$;
