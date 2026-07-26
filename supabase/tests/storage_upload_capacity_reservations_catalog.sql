-- LOCAL SUPABASE ONLY. Catalog assertions after upload-capacity hardening.

do $$
declare
  v_definition text;
begin
  if to_regclass('public.storage_upload_reservations') is null
     or to_regclass('public.storage_upload_reservation_paths') is null then
    raise exception 'upload reservation tables are missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'media'
      and column_name = 'upload_reservation_id'
  ) then
    raise exception 'media.upload_reservation_id is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'market_posts'
      and column_name = 'cover_upload_reservation_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'market_media'
      and column_name = 'upload_reservation_id'
  ) then
    raise exception 'market upload reservation links are missing';
  end if;

  if has_table_privilege('anon', 'public.storage_upload_reservations', 'select')
     or has_table_privilege('authenticated', 'public.storage_upload_reservations', 'select')
     or has_table_privilege('authenticated', 'public.storage_upload_reservations', 'insert')
     or has_table_privilege('authenticated', 'public.storage_upload_reservations', 'update')
     or has_table_privilege('authenticated', 'public.storage_upload_reservations', 'delete')
     or has_table_privilege('authenticated', 'public.storage_upload_reservation_paths', 'select') then
    raise exception 'an API role can access an internal upload reservation table';
  end if;

  if has_function_privilege('anon', 'public.reserve_storage_upload(uuid,text,uuid,uuid,text,bigint,text,bigint)', 'execute')
     or not has_function_privilege('authenticated', 'public.reserve_storage_upload(uuid,text,uuid,uuid,text,bigint,text,bigint)', 'execute')
     or has_function_privilege('anon', 'public.cancel_storage_upload_reservation(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.cancel_storage_upload_reservation(uuid)', 'execute')
     or has_function_privilege('anon', 'public.settle_storage_upload_reservation(uuid,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.settle_storage_upload_reservation(uuid,text,uuid)', 'execute') then
    raise exception 'safe upload RPC grants are invalid';
  end if;

  if has_function_privilege('authenticated', 'public.reserve_storage_bytes(bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.release_storage_bytes(bigint)', 'execute')
     or has_function_privilege('service_role', 'public.release_storage_bytes(bigint)', 'execute') then
    raise exception 'a legacy byte-only capacity RPC remains executable';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'reserve_storage_upload',
        'cancel_storage_upload_reservation',
        'settle_storage_upload_reservation'
      )
      and p.prosecdef
      and p.proconfig @> array['search_path=""']::text[]
    group by n.nspname
    having count(*) = 3
  ) then
    raise exception 'safe upload RPCs lack security definer or fixed search_path';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.media'::regclass
      and c.conname = 'media_upload_reservation_owner_fkey'
      and c.contype = 'f'
  ) then
    raise exception 'media reservation owner foreign key is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.media'::regclass
      and t.tgname = 'trg_media_settle_upload_reservation'
      and not t.tgisinternal
  ) then
    raise exception 'media reservation settlement trigger is missing';
  end if;

  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.market_media'::regclass
      and t.tgname = 'trg_market_media_settle_upload_reservation'
      and not t.tgisinternal
  ) or not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.market_posts'::regclass
      and t.tgname = 'trg_market_cover_settle_upload_reservation'
      and not t.tgisinternal
  ) then
    raise exception 'market settlement triggers are missing';
  end if;

  select pg_get_functiondef('public.can_upload_reserved_media_object(text,jsonb)'::regprocedure)
  into v_definition;

  if v_definition not like '%auth.uid()%'
     or v_definition not like '%p_metadata->>''contentLength''%'
     or v_definition not like '%p_metadata->>''size''%'
     or v_definition not like '%r.status = ''reserved''%' then
    raise exception 'reserved Storage object policy helper is incomplete';
  end if;

  select pg_get_functiondef('public.cancel_storage_upload_reservation(uuid)'::regprocedure)
  into v_definition;

  if v_definition not like '%storage.objects%'
     or v_definition not like '%storage_cleanup_required%'
     or v_definition not like '%owner_user_id = v_user_id%' then
    raise exception 'reservation cancellation is not owner/object bound';
  end if;

  if not exists (
    select 1
    from public.storage_upload_control c
    where c.singleton
      and c.transition_completed_at is not null
  ) then
    raise exception 'upload reservation transition is incomplete';
  end if;

  if has_table_privilege('authenticated', 'public.market_posts', 'delete')
     or has_table_privilege('authenticated', 'public.market_media', 'delete')
     or has_function_privilege('anon', 'public.request_delete_market_post(uuid)', 'execute')
     or has_function_privilege('anon', 'public.request_delete_market_media(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.request_delete_market_post(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.request_delete_market_media(uuid)', 'execute') then
    raise exception 'market deletion permissions are invalid';
  end if;
end;
$$;
