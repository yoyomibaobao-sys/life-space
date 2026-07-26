-- LOCAL SUPABASE ONLY. Run after the post-deployment upload recovery migration.

begin;

do $$
declare
  v_accepting boolean;
  v_maintenance_started_at timestamptz;
  v_transition_completed_at timestamptz;
begin
  select
    c.accepting_new_reservations,
    c.maintenance_started_at,
    c.transition_completed_at
  into
    v_accepting,
    v_maintenance_started_at,
    v_transition_completed_at
  from public.storage_upload_control c
  where c.singleton;

  if not found
     or not v_accepting
     or v_maintenance_started_at is not null
     or v_transition_completed_at is null then
    raise exception 'upload recovery control state is invalid';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.reserve_storage_bytes(bigint)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.release_storage_bytes(bigint)',
       'execute'
     ) then
    raise exception 'legacy byte-only capacity RPC is still exposed';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.reserve_storage_upload(uuid,text,uuid,uuid,text,bigint,text,bigint)',
       'execute'
     )
     or not has_function_privilege(
       'authenticated',
       'public.cancel_storage_upload_reservation(uuid)',
       'execute'
     )
     or not has_function_privilege(
       'authenticated',
       'public.settle_storage_upload_reservation(uuid,text,uuid)',
       'execute'
     ) then
    raise exception 'reservation RPC permissions are incomplete';
  end if;

  if not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname = 'media_insert_own_path'
      and coalesce(p.with_check, '') like '%can_upload_reserved_media_object%'
  ) then
    raise exception 'reserved Storage insert policy is not active';
  end if;
end;
$$;

rollback;
