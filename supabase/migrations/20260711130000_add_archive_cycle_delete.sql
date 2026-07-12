create or replace function public.delete_archive_cycle(p_cycle_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_archive_id uuid;
  v_owner_id uuid;
  v_moved_record_count integer := 0;
begin
  select ac.archive_id, a.user_id
    into v_archive_id, v_owner_id
  from public.archive_cycles ac
  join public.archives a on a.id = ac.archive_id
  where ac.id = p_cycle_id
  for update of ac;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'archive_cycle_not_found';
  end if;

  if auth.uid() is null or v_owner_id is distinct from auth.uid() then
    raise exception using
      errcode = '42501',
      message = 'archive_cycle_delete_forbidden';
  end if;

  update public.records
  set cycle_id = null
  where cycle_id = p_cycle_id
    and archive_id = v_archive_id;

  get diagnostics v_moved_record_count = row_count;

  delete from public.archive_cycles
  where id = p_cycle_id
    and archive_id = v_archive_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'archive_cycle_not_found';
  end if;

  return v_moved_record_count;
end;
$$;

revoke all on function public.delete_archive_cycle(uuid) from public;
revoke all on function public.delete_archive_cycle(uuid) from anon;
revoke all on function public.delete_archive_cycle(uuid) from authenticated;
grant execute on function public.delete_archive_cycle(uuid) to authenticated;
