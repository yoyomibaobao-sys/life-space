-- Post-deployment upload recovery.
--
-- Apply this migration only after:
-- 1. the maintenance drain has completed;
-- 2. the reservation hardening and market binding migrations have succeeded;
-- 3. the reservation-aware application build is serving Production.
--
-- The database can prove the first two schema conditions, but operators must
-- still confirm the deployed application version before applying this file.

do $$
declare
  v_control_count integer := 0;
  v_updated_count integer := 0;
begin
  if to_regclass('public.storage_upload_reservations') is null
     or to_regclass('public.storage_upload_reservation_paths') is null then
    raise exception using
      errcode = '55000',
      message = 'storage_upload_reservation_schema_missing';
  end if;

  if to_regprocedure(
    'public.reserve_storage_upload(uuid,text,uuid,uuid,text,bigint,text,bigint)'
  ) is null
     or to_regprocedure(
       'public.cancel_storage_upload_reservation(uuid)'
     ) is null
     or to_regprocedure(
       'public.settle_storage_upload_reservation(uuid,text,uuid)'
     ) is null
     or to_regprocedure(
       'public.set_market_post_cover(uuid,text,text,uuid)'
     ) is null
     or to_regprocedure(
       'public.request_delete_market_media(uuid)'
     ) is null
     or to_regprocedure(
       'public.request_delete_market_post(uuid)'
     ) is null then
    raise exception using
      errcode = '55000',
      message = 'storage_upload_reservation_rpc_missing';
  end if;

  if not exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.media'::regclass
      and a.attname = 'upload_reservation_id'
      and not a.attisdropped
  )
     or not exists (
       select 1
       from pg_attribute a
       where a.attrelid = 'public.market_posts'::regclass
         and a.attname = 'cover_upload_reservation_id'
         and not a.attisdropped
     )
     or not exists (
       select 1
       from pg_attribute a
       where a.attrelid = 'public.market_media'::regclass
         and a.attname = 'upload_reservation_id'
         and not a.attisdropped
     ) then
    raise exception using
      errcode = '55000',
      message = 'storage_upload_reservation_binding_missing';
  end if;

  if not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname = 'media_insert_own_path'
      and coalesce(p.with_check, '') like '%can_upload_reserved_media_object%'
  )
     or not exists (
       select 1
       from pg_policies p
       where p.schemaname = 'storage'
         and p.tablename = 'objects'
         and p.policyname = 'media_update_own_path'
         and coalesce(p.with_check, '') like '%can_upload_reserved_media_object%'
     ) then
    raise exception using
      errcode = '55000',
      message = 'storage_upload_reservation_policy_missing';
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
    raise exception using
      errcode = '55000',
      message = 'legacy_storage_capacity_rpc_still_exposed';
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
    raise exception using
      errcode = '55000',
      message = 'storage_upload_reservation_rpc_not_available';
  end if;

  select count(*)::integer
  into v_control_count
  from public.storage_upload_control c
  where c.singleton
    and not c.accepting_new_reservations
    and c.maintenance_started_at is not null
    and c.transition_completed_at is not null;

  if v_control_count <> 1 then
    raise exception using
      errcode = '55000',
      message = 'storage_upload_transition_not_ready';
  end if;

  update public.storage_upload_control
  set
    accepting_new_reservations = true,
    maintenance_started_at = null,
    updated_at = now()
  where singleton
    and not accepting_new_reservations;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception using
      errcode = '55000',
      message = 'storage_upload_recovery_not_applied';
  end if;
end;
$$;

comment on table public.storage_upload_control is
  'Server-only upload transition control. accepting_new_reservations is enabled only after reservation-aware code is deployed.';
