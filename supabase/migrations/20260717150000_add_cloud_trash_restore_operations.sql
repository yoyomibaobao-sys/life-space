-- B3.5.2: owner-only cloud trash restore and state operations.
-- Restoring business rows never restores interactions or market publication state.

create or replace function public.restore_archive_from_trash(p_archive_id uuid)
returns table (
  ok boolean,
  already_restored boolean,
  target_type text,
  status text,
  restored_record_count integer,
  restored_media_count integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.trash_entries%rowtype;
  v_archive public.archives%rowtype;
  v_archive_cover_media_id uuid;
  v_record_primary_map jsonb := '{}'::jsonb;
  v_record_count integer := 0;
  v_media_count integer := 0;
begin
  if v_user_id is null or p_archive_id is null then
    return query select false, false, 'archive'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cloud-trash:archive:' || p_archive_id::text, 0)
  );

  select te.*
  into v_entry
  from public.trash_entries te
  where te.target_type = 'archive'
    and te.target_id = p_archive_id
    and te.owner_user_id = v_user_id
  order by te.created_at desc, te.id desc
  limit 1
  for update;

  if not found then
    select a.* into v_archive
    from public.archives a
    where a.id = p_archive_id
    for update;

    if not found or v_archive.user_id is distinct from v_user_id then
      return query select false, false, 'archive'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    else
      return query select false, false, 'archive'::text, null::text, 0, 0, 'not_trashed'::text;
    end if;
    return;
  end if;

  select a.* into v_archive
  from public.archives a
  where a.id = p_archive_id
  for update;

  if v_entry.status = 'restored' then
    if found
       and v_archive.user_id = v_user_id
       and v_archive.trashed_at is null
       and v_archive.trash_entry_id is null then
      return query select true, true, 'archive'::text, 'restored'::text, 0, 0, null::text;
    else
      return query select false, false, 'archive'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    end if;
    return;
  end if;

  if v_entry.status <> 'active' then
    return query select false, false, 'archive'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    return;
  end if;

  if v_archive.id is null
     or v_archive.user_id is distinct from v_user_id
     or v_archive.trash_entry_id is distinct from v_entry.id
     or v_archive.trashed_at is null then
    return query select false, false, 'archive'::text, v_entry.status, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  perform r.id
  from public.records r
  where r.archive_id = p_archive_id
  order by r.id
  for update;

  perform m.id
  from public.media m
  join public.records r on r.id = m.record_id
  where r.archive_id = p_archive_id
  order by m.id
  for update of m;

  perform mp.id
  from public.market_posts mp
  where mp.archive_id = p_archive_id
     or exists (
       select 1 from public.records r
       where r.id = mp.source_record_id
         and r.archive_id = p_archive_id
     )
  order by mp.id
  for update;

  v_record_primary_map := coalesce(
    v_entry.restore_snapshot -> 'record_primary_media_ids',
    '{}'::jsonb
  );

  if coalesce(v_entry.restore_snapshot ->> 'archive_cover_media_id', '')
     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_archive_cover_media_id := (v_entry.restore_snapshot ->> 'archive_cover_media_id')::uuid;
  end if;

  update public.trash_entries te
  set
    status = 'restoring',
    restoring_at = now(),
    restored_at = null,
    last_error_code = null,
    failed_at = null
  where te.id = v_entry.id
    and te.status = 'active';

  if not found then
    return query select false, false, 'archive'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    return;
  end if;

  update public.archives a
  set
    trashed_at = null,
    trash_entry_id = null
  where a.id = p_archive_id
    and a.trash_entry_id = v_entry.id;

  update public.records r
  set
    trashed_at = null,
    trash_entry_id = null
  where r.archive_id = p_archive_id
    and r.trash_entry_id = v_entry.id;
  get diagnostics v_record_count = row_count;

  update public.media m
  set
    trashed_at = null,
    trash_entry_id = null
  from public.records r
  where r.id = m.record_id
    and r.archive_id = p_archive_id
    and m.trash_entry_id = v_entry.id;
  get diagnostics v_media_count = row_count;

  perform public.private_refresh_record_media_after_trash(
    r.id,
    case
      when coalesce(v_record_primary_map ->> r.id::text, '')
           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (v_record_primary_map ->> r.id::text)::uuid
      else null
    end
  )
  from public.records r
  where r.archive_id = p_archive_id
    and r.trashed_at is null
  order by r.id;

  perform public.private_refresh_archive_after_trash(
    p_archive_id,
    v_archive_cover_media_id
  );

  update public.trash_entries te
  set
    status = 'restored',
    restored_at = now(),
    restoring_at = null,
    last_error_code = null,
    failed_at = null
  where te.id = v_entry.id
    and te.status = 'restoring';

  if not found then
    raise exception using errcode = '40001', message = 'trash_restore_state_changed';
  end if;

  return query select true, false, 'archive'::text, 'restored'::text, v_record_count, v_media_count, null::text;
end;
$$;

create or replace function public.restore_record_from_trash(p_record_id uuid)
returns table (
  ok boolean,
  already_restored boolean,
  target_type text,
  status text,
  restored_record_count integer,
  restored_media_count integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.trash_entries%rowtype;
  v_archive public.archives%rowtype;
  v_record public.records%rowtype;
  v_archive_id uuid;
  v_record_primary_media_id uuid;
  v_snapshot_archive_cover_media_id uuid;
  v_current_archive_cover_media_id uuid;
  v_preferred_archive_cover_media_id uuid;
  v_media_count integer := 0;
begin
  if v_user_id is null or p_record_id is null then
    return query select false, false, 'record'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  select te.*
  into v_entry
  from public.trash_entries te
  where te.target_type = 'record'
    and te.target_id = p_record_id
    and te.owner_user_id = v_user_id
  order by te.created_at desc, te.id desc
  limit 1;

  if not found then
    select r.* into v_record
    from public.records r
    where r.id = p_record_id;

    if not found or v_record.user_id is distinct from v_user_id then
      return query select false, false, 'record'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    else
      return query select false, false, 'record'::text, null::text, 0, 0, 'not_trashed'::text;
    end if;
    return;
  end if;

  v_archive_id := v_entry.parent_archive_id;
  if v_archive_id is null then
    return query select false, false, 'record'::text, v_entry.status, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cloud-trash:archive:' || v_archive_id::text, 0)
  );

  select te.*
  into v_entry
  from public.trash_entries te
  where te.id = v_entry.id
  for update;

  select a.* into v_archive
  from public.archives a
  where a.id = v_archive_id
  for update;

  select r.* into v_record
  from public.records r
  where r.id = p_record_id
    and r.archive_id = v_archive_id
  for update;

  if v_entry.status = 'restored' then
    if v_record.id is not null
       and v_record.user_id = v_user_id
       and v_record.trashed_at is null
       and v_record.trash_entry_id is null then
      return query select true, true, 'record'::text, 'restored'::text, 0, 0, null::text;
    else
      return query select false, false, 'record'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    end if;
    return;
  end if;

  if v_entry.status <> 'active' then
    return query select false, false, 'record'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    return;
  end if;

  if v_archive.id is null then
    return query select false, false, 'record'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    return;
  end if;

  if v_archive.user_id is distinct from v_user_id then
    return query select false, false, 'record'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  if v_archive.trashed_at is not null or v_archive.trash_entry_id is not null then
    return query select false, false, 'record'::text, v_entry.status, 0, 0, 'parent_trashed'::text;
    return;
  end if;

  if v_record.id is null
     or v_record.user_id is distinct from v_user_id
     or v_record.trash_entry_id is distinct from v_entry.id
     or v_record.trashed_at is null then
    return query select false, false, 'record'::text, v_entry.status, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  perform m.id
  from public.media m
  where m.record_id = p_record_id
  order by m.id
  for update;

  perform mp.id
  from public.market_posts mp
  where mp.source_record_id = p_record_id
  order by mp.id
  for update;

  select m.id
  into v_current_archive_cover_media_id
  from public.media m
  join public.records r on r.id = m.record_id
  where r.archive_id = v_archive_id
    and r.trashed_at is null
    and m.trashed_at is null
    and (
      (v_archive.cover_image_path is not null and m.storage_path = v_archive.cover_image_path)
      or (v_archive.cover_image_url is not null and m.url = v_archive.cover_image_url)
      or (v_archive.cover_thumb_path is not null and m.thumb_path = v_archive.cover_thumb_path)
    )
  order by m.id
  limit 1;

  if coalesce(v_entry.restore_snapshot ->> 'record_primary_media_id', '')
     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_record_primary_media_id := (v_entry.restore_snapshot ->> 'record_primary_media_id')::uuid;
  end if;

  if coalesce(v_entry.restore_snapshot ->> 'archive_cover_media_id', '')
     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_snapshot_archive_cover_media_id := (v_entry.restore_snapshot ->> 'archive_cover_media_id')::uuid;
  end if;

  v_preferred_archive_cover_media_id := coalesce(
    v_current_archive_cover_media_id,
    v_snapshot_archive_cover_media_id
  );

  update public.trash_entries te
  set
    status = 'restoring',
    restoring_at = now(),
    restored_at = null,
    last_error_code = null,
    failed_at = null
  where te.id = v_entry.id
    and te.status = 'active';

  if not found then
    return query select false, false, 'record'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    return;
  end if;

  update public.records r
  set
    trashed_at = null,
    trash_entry_id = null
  where r.id = p_record_id
    and r.trash_entry_id = v_entry.id;

  update public.media m
  set
    trashed_at = null,
    trash_entry_id = null
  where m.record_id = p_record_id
    and m.trash_entry_id = v_entry.id;
  get diagnostics v_media_count = row_count;

  perform public.private_refresh_record_media_after_trash(
    p_record_id,
    v_record_primary_media_id
  );
  perform public.private_refresh_archive_after_trash(
    v_archive_id,
    v_preferred_archive_cover_media_id
  );

  update public.trash_entries te
  set
    status = 'restored',
    restored_at = now(),
    restoring_at = null,
    last_error_code = null,
    failed_at = null
  where te.id = v_entry.id
    and te.status = 'restoring';

  if not found then
    raise exception using errcode = '40001', message = 'trash_restore_state_changed';
  end if;

  return query select true, false, 'record'::text, 'restored'::text, 1, v_media_count, null::text;
end;
$$;

create or replace function public.restore_media_from_trash(p_media_id uuid)
returns table (
  ok boolean,
  already_restored boolean,
  target_type text,
  status text,
  restored_record_count integer,
  restored_media_count integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.trash_entries%rowtype;
  v_archive public.archives%rowtype;
  v_record public.records%rowtype;
  v_media public.media%rowtype;
  v_archive_id uuid;
  v_record_id uuid;
  v_original_sort_order integer;
  v_restore_sort_order integer;
  v_was_record_primary boolean := false;
  v_was_archive_cover boolean := false;
  v_current_record_primary_media_id uuid;
  v_current_archive_cover_media_id uuid;
  v_preferred_record_media_id uuid;
  v_preferred_archive_media_id uuid;
begin
  if v_user_id is null or p_media_id is null then
    return query select false, false, 'media'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  select te.*
  into v_entry
  from public.trash_entries te
  where te.target_type = 'media'
    and te.target_id = p_media_id
    and te.owner_user_id = v_user_id
  order by te.created_at desc, te.id desc
  limit 1;

  if not found then
    select m.* into v_media
    from public.media m
    where m.id = p_media_id;

    if not found or v_media.user_id is distinct from v_user_id then
      return query select false, false, 'media'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    else
      return query select false, false, 'media'::text, null::text, 0, 0, 'not_trashed'::text;
    end if;
    return;
  end if;

  v_archive_id := v_entry.parent_archive_id;
  v_record_id := v_entry.parent_record_id;
  if v_archive_id is null or v_record_id is null then
    return query select false, false, 'media'::text, v_entry.status, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cloud-trash:archive:' || v_archive_id::text, 0)
  );

  select te.* into v_entry
  from public.trash_entries te
  where te.id = v_entry.id
  for update;

  select a.* into v_archive
  from public.archives a
  where a.id = v_archive_id
  for update;

  select r.* into v_record
  from public.records r
  where r.id = v_record_id
    and r.archive_id = v_archive_id
  for update;

  select m.* into v_media
  from public.media m
  where m.id = p_media_id
    and m.record_id = v_record_id
  for update;

  if v_entry.status = 'restored' then
    if v_media.id is not null
       and v_media.user_id = v_user_id
       and v_media.trashed_at is null
       and v_media.trash_entry_id is null then
      return query select true, true, 'media'::text, 'restored'::text, 0, 0, null::text;
    else
      return query select false, false, 'media'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    end if;
    return;
  end if;

  if v_entry.status <> 'active' then
    return query select false, false, 'media'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    return;
  end if;

  if v_archive.id is null or v_record.id is null then
    return query select false, false, 'media'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    return;
  end if;

  if v_archive.user_id is distinct from v_user_id
     or v_record.user_id is distinct from v_user_id then
    return query select false, false, 'media'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  if v_archive.trashed_at is not null
     or v_archive.trash_entry_id is not null
     or v_record.trashed_at is not null
     or v_record.trash_entry_id is not null then
    return query select false, false, 'media'::text, v_entry.status, 0, 0, 'parent_trashed'::text;
    return;
  end if;

  if v_media.id is null
     or v_media.user_id is distinct from v_user_id
     or v_media.trash_entry_id is distinct from v_entry.id
     or v_media.trashed_at is null then
    return query select false, false, 'media'::text, v_entry.status, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  perform sibling.id
  from public.media sibling
  where sibling.record_id = v_record_id
  order by sibling.id
  for update;

  select m.id
  into v_current_record_primary_media_id
  from public.media m
  where m.record_id = v_record_id
    and m.trashed_at is null
    and (
      (v_record.primary_image_path is not null and m.storage_path = v_record.primary_image_path)
      or (v_record.primary_image_url is not null and m.url = v_record.primary_image_url)
      or (v_record.primary_thumb_path is not null and m.thumb_path = v_record.primary_thumb_path)
    )
  order by m.id
  limit 1;

  select m.id
  into v_current_archive_cover_media_id
  from public.media m
  join public.records r on r.id = m.record_id
  where r.archive_id = v_archive_id
    and r.trashed_at is null
    and m.trashed_at is null
    and (
      (v_archive.cover_image_path is not null and m.storage_path = v_archive.cover_image_path)
      or (v_archive.cover_image_url is not null and m.url = v_archive.cover_image_url)
      or (v_archive.cover_thumb_path is not null and m.thumb_path = v_archive.cover_thumb_path)
    )
  order by m.id
  limit 1;

  if coalesce(v_entry.restore_snapshot ->> 'sort_order', '') ~ '^-?[0-9]+$' then
    v_original_sort_order := (v_entry.restore_snapshot ->> 'sort_order')::integer;
  end if;

  v_was_record_primary := coalesce(
    (v_entry.restore_snapshot ->> 'was_record_primary')::boolean,
    false
  );
  v_was_archive_cover := coalesce(
    (v_entry.restore_snapshot ->> 'was_archive_cover')::boolean,
    false
  );

  v_restore_sort_order := v_original_sort_order;
  if v_restore_sort_order is not null and exists (
    select 1
    from public.media m
    where m.record_id = v_record_id
      and m.trashed_at is null
      and m.sort_order = v_restore_sort_order
  ) then
    select coalesce(max(m.sort_order), -1) + 1
    into v_restore_sort_order
    from public.media m
    where m.record_id = v_record_id
      and m.trashed_at is null;
  end if;

  v_preferred_record_media_id := coalesce(
    v_current_record_primary_media_id,
    case when v_was_record_primary then p_media_id else null end
  );
  v_preferred_archive_media_id := coalesce(
    v_current_archive_cover_media_id,
    case when v_was_archive_cover then p_media_id else null end
  );

  update public.trash_entries te
  set
    status = 'restoring',
    restoring_at = now(),
    restored_at = null,
    last_error_code = null,
    failed_at = null
  where te.id = v_entry.id
    and te.status = 'active';

  if not found then
    return query select false, false, 'media'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    return;
  end if;

  update public.media m
  set
    sort_order = v_restore_sort_order,
    trashed_at = null,
    trash_entry_id = null
  where m.id = p_media_id
    and m.trash_entry_id = v_entry.id;

  perform public.private_refresh_record_media_after_trash(
    v_record_id,
    v_preferred_record_media_id
  );
  perform public.private_refresh_archive_after_trash(
    v_archive_id,
    v_preferred_archive_media_id
  );

  update public.trash_entries te
  set
    status = 'restored',
    restored_at = now(),
    restoring_at = null,
    last_error_code = null,
    failed_at = null
  where te.id = v_entry.id
    and te.status = 'restoring';

  if not found then
    raise exception using errcode = '40001', message = 'trash_restore_state_changed';
  end if;

  return query select true, false, 'media'::text, 'restored'::text, 0, 1, null::text;
end;
$$;

create or replace function public.get_trash_entry_state(
  p_target_type text,
  p_target_id uuid
)
returns table (
  target_type text,
  status text,
  deleted_at timestamptz,
  can_restore boolean,
  parent_state text,
  error_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.trash_entries%rowtype;
  v_target_exists boolean := false;
  v_target_active boolean := false;
  v_parent_state text := null;
begin
  if v_user_id is null
     or p_target_id is null
     or p_target_type not in ('archive', 'record', 'media') then
    return query select p_target_type, null::text, null::timestamptz, false, null::text, 'not_found_or_forbidden'::text;
    return;
  end if;

  select te.*
  into v_entry
  from public.trash_entries te
  where te.target_type = p_target_type
    and te.target_id = p_target_id
    and te.owner_user_id = v_user_id
  order by te.created_at desc, te.id desc
  limit 1;

  if p_target_type = 'archive' then
    select true, (a.trashed_at is null and a.trash_entry_id is null)
    into v_target_exists, v_target_active
    from public.archives a
    where a.id = p_target_id
      and a.user_id = v_user_id;
    v_parent_state := null;
  elsif p_target_type = 'record' then
    select
      true,
      (r.trashed_at is null and r.trash_entry_id is null),
      case
        when a.id is null then 'missing'
        when a.trashed_at is not null or a.trash_entry_id is not null then 'trashed'
        else 'active'
      end
    into v_target_exists, v_target_active, v_parent_state
    from public.records r
    left join public.archives a on a.id = r.archive_id
    where r.id = p_target_id
      and r.user_id = v_user_id;
  else
    select
      true,
      (m.trashed_at is null and m.trash_entry_id is null),
      case
        when r.id is null or a.id is null then 'missing'
        when r.trashed_at is not null or r.trash_entry_id is not null
          or a.trashed_at is not null or a.trash_entry_id is not null then 'trashed'
        else 'active'
      end
    into v_target_exists, v_target_active, v_parent_state
    from public.media m
    left join public.records r on r.id = m.record_id
    left join public.archives a on a.id = r.archive_id
    where m.id = p_target_id
      and m.user_id = v_user_id;
  end if;

  if v_entry.id is null then
    if not coalesce(v_target_exists, false) then
      return query select p_target_type, null::text, null::timestamptz, false, null::text, 'not_found_or_forbidden'::text;
    else
      return query select p_target_type, null::text, null::timestamptz, false, v_parent_state, 'not_trashed'::text;
    end if;
    return;
  end if;

  return query
  select
    p_target_type,
    v_entry.status,
    v_entry.deleted_at,
    (
      v_entry.status = 'active'
      and coalesce(v_target_exists, false)
      and not v_target_active
      and (p_target_type = 'archive' or v_parent_state = 'active')
    ),
    v_parent_state,
    case
      when not coalesce(v_target_exists, false) then 'restore_conflict'
      when p_target_type <> 'archive' and v_parent_state = 'missing' then 'restore_conflict'
      when p_target_type <> 'archive' and v_parent_state = 'trashed' then 'parent_trashed'
      else null
    end;
end;
$$;

revoke all on function public.restore_archive_from_trash(uuid) from public, anon, authenticated;
revoke all on function public.restore_record_from_trash(uuid) from public, anon, authenticated;
revoke all on function public.restore_media_from_trash(uuid) from public, anon, authenticated;
revoke all on function public.get_trash_entry_state(text, uuid) from public, anon, authenticated;

grant execute on function public.restore_archive_from_trash(uuid) to authenticated;
grant execute on function public.restore_record_from_trash(uuid) to authenticated;
grant execute on function public.restore_media_from_trash(uuid) to authenticated;
grant execute on function public.get_trash_entry_state(text, uuid) to authenticated;

comment on function public.restore_archive_from_trash(uuid) is
  'Owner-only restore of one archive root and only descendants sharing that root trash entry. Interactions and market publication state are not restored.';

comment on function public.restore_record_from_trash(uuid) is
  'Owner-only restore of one record root and only media sharing that root trash entry. Interactions and market publication state are not restored.';

comment on function public.restore_media_from_trash(uuid) is
  'Owner-only restore of one media root with deterministic sort fallback and non-destructive primary image restoration.';

comment on function public.get_trash_entry_state(text, uuid) is
  'Owner-only minimal trash state lookup. Does not expose entry ids, owner ids, snapshots, paths, or URLs.';
