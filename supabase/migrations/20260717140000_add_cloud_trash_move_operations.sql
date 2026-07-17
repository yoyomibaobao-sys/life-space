-- B3.5.2: owner-only cloud move-to-trash operations.
-- Storage objects, capacity accounting, and permanent deletion jobs are untouched.

create or replace function public.private_refresh_record_media_after_trash(
  p_record_id uuid,
  p_preferred_media_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archive_id uuid;
  v_current_image_url text;
  v_current_image_path text;
  v_current_thumb_path text;
  v_image_url text;
  v_image_path text;
  v_thumb_path text;
  v_media_count integer;
begin
  select
    r.archive_id,
    r.primary_image_url,
    r.primary_image_path,
    r.primary_thumb_path
  into
    v_archive_id,
    v_current_image_url,
    v_current_image_path,
    v_current_thumb_path
  from public.records r
  where r.id = p_record_id;

  if not found then
    return;
  end if;

  select count(*)::integer
  into v_media_count
  from public.media m
  where m.record_id = p_record_id
    and m.trashed_at is null;

  select m.url, m.storage_path, m.thumb_path
  into v_image_url, v_image_path, v_thumb_path
  from public.media m
  where m.record_id = p_record_id
    and m.trashed_at is null
  order by
    case
      when p_preferred_media_id is not null and m.id = p_preferred_media_id then 0
      when (
        (v_current_image_path is not null and m.storage_path = v_current_image_path)
        or (v_current_image_url is not null and m.url = v_current_image_url)
        or (v_current_thumb_path is not null and m.thumb_path = v_current_thumb_path)
      ) then 1
      else 2
    end,
    m.sort_order asc nulls last,
    m.created_at asc nulls last,
    m.id asc
  limit 1;

  update public.records r
  set
    primary_image_url = v_image_url,
    primary_image_path = v_image_path,
    primary_thumb_path = v_thumb_path,
    media_count = v_media_count
  where r.id = p_record_id;
end;
$$;

create or replace function public.private_refresh_archive_after_trash(
  p_archive_id uuid,
  p_preferred_media_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_image_url text;
  v_current_image_path text;
  v_current_thumb_path text;
  v_image_url text;
  v_image_path text;
  v_thumb_path text;
  v_record_count integer;
  v_last_record_time timestamptz;
begin
  select
    a.cover_image_url,
    a.cover_image_path,
    a.cover_thumb_path
  into
    v_current_image_url,
    v_current_image_path,
    v_current_thumb_path
  from public.archives a
  where a.id = p_archive_id;

  if not found then
    return;
  end if;

  select count(*)::integer, max(r.record_time)
  into v_record_count, v_last_record_time
  from public.records r
  where r.archive_id = p_archive_id
    and r.trashed_at is null;

  select m.url, m.storage_path, m.thumb_path
  into v_image_url, v_image_path, v_thumb_path
  from public.media m
  join public.records r on r.id = m.record_id
  where r.archive_id = p_archive_id
    and r.trashed_at is null
    and m.trashed_at is null
  order by
    case
      when p_preferred_media_id is not null and m.id = p_preferred_media_id then 0
      when (
        (v_current_image_path is not null and m.storage_path = v_current_image_path)
        or (v_current_image_url is not null and m.url = v_current_image_url)
        or (v_current_thumb_path is not null and m.thumb_path = v_current_thumb_path)
      ) then 1
      else 2
    end,
    r.record_time desc nulls last,
    r.created_at desc nulls last,
    r.id desc,
    m.sort_order asc nulls last,
    m.created_at asc nulls last,
    m.id asc
  limit 1;

  update public.archives a
  set
    record_count = v_record_count,
    last_record_time = v_last_record_time,
    cover_image_url = v_image_url,
    cover_image_path = v_image_path,
    cover_thumb_path = v_thumb_path
  where a.id = p_archive_id;
end;
$$;

create or replace function public.private_cleanup_trash_interactions(
  p_target_type text,
  p_archive_id uuid,
  p_record_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record_ids uuid[] := array[]::uuid[];
  v_comment_ids uuid[] := array[]::uuid[];
begin
  select coalesce(array_agg(r.id order by r.id), array[]::uuid[])
  into v_record_ids
  from public.records r
  where (
    (p_target_type = 'archive' and r.archive_id = p_archive_id)
    or (p_target_type = 'record' and r.id = p_record_id and r.archive_id = p_archive_id)
  );

  select coalesce(array_agg(c.id order by c.id), array[]::uuid[])
  into v_comment_ids
  from public.comments c
  where c.record_id = any(v_record_ids);

  perform n.id
  from public.notifications n
  where (p_target_type = 'archive' and n.archive_id = p_archive_id)
     or n.record_id = any(v_record_ids)
     or n.comment_id = any(v_comment_ids)
  order by n.id
  for update;

  perform cl.id
  from public.comment_likes cl
  where cl.comment_id = any(v_comment_ids)
  order by cl.id
  for update;

  perform cf.id
  from public.comment_flowers cf
  where cf.comment_id = any(v_comment_ids)
     or cf.record_id = any(v_record_ids)
  order by cf.id
  for update;

  perform c.id
  from public.comments c
  where c.id = any(v_comment_ids)
  order by c.id
  for update;

  perform rl.id
  from public.record_likes rl
  where rl.record_id = any(v_record_ids)
  order by rl.id
  for update;

  if p_target_type = 'archive' then
    perform af.id
    from public.archive_follows af
    where af.archive_id = p_archive_id
    order by af.id
    for update;
  end if;

  delete from public.notifications n
  where (p_target_type = 'archive' and n.archive_id = p_archive_id)
     or n.record_id = any(v_record_ids)
     or n.comment_id = any(v_comment_ids);

  delete from public.comment_likes cl
  where cl.comment_id = any(v_comment_ids);

  delete from public.comment_flowers cf
  where cf.comment_id = any(v_comment_ids)
     or cf.record_id = any(v_record_ids);

  delete from public.comments c
  where c.id = any(v_comment_ids);

  delete from public.record_likes rl
  where rl.record_id = any(v_record_ids);

  if p_target_type = 'archive' then
    delete from public.archive_follows af
    where af.archive_id = p_archive_id;
  end if;
end;
$$;

create or replace function public.private_end_market_posts_for_trash(
  p_target_type text,
  p_archive_id uuid,
  p_record_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform mp.id
  from public.market_posts mp
  where (
    (p_target_type = 'archive' and (
      mp.archive_id = p_archive_id
      or exists (
        select 1
        from public.records r
        where r.id = mp.source_record_id
          and r.archive_id = p_archive_id
      )
    ))
    or (p_target_type = 'record' and mp.source_record_id = p_record_id)
  )
  order by mp.id
  for update;

  update public.market_posts mp
  set status = 'ended'
  where mp.status = 'active'
    and (
      (p_target_type = 'archive' and (
        mp.archive_id = p_archive_id
        or exists (
          select 1
          from public.records r
          where r.id = mp.source_record_id
            and r.archive_id = p_archive_id
        )
      ))
      or (p_target_type = 'record' and mp.source_record_id = p_record_id)
    );
end;
$$;

create or replace function public.move_archive_to_trash(p_archive_id uuid)
returns table (
  ok boolean,
  already_trashed boolean,
  target_type text,
  status text,
  affected_record_count integer,
  affected_media_count integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_archive public.archives%rowtype;
  v_entry public.trash_entries%rowtype;
  v_entry_id uuid;
  v_deleted_at timestamptz;
  v_archive_cover_media_id uuid;
  v_record_primary_map jsonb := '{}'::jsonb;
  v_snapshot jsonb;
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

  select a.*
  into v_archive
  from public.archives a
  where a.id = p_archive_id
  for update;

  if not found or v_archive.user_id is distinct from v_user_id then
    return query select false, false, 'archive'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  if v_archive.trashed_at is not null or v_archive.trash_entry_id is not null then
    if v_archive.trashed_at is null or v_archive.trash_entry_id is null then
      return query select false, false, 'archive'::text, null::text, 0, 0, 'invalid_trash_state'::text;
      return;
    end if;

    select te.*
    into v_entry
    from public.trash_entries te
    where te.id = v_archive.trash_entry_id
    for update;

    if found
       and v_entry.owner_user_id = v_user_id
       and v_entry.target_type = 'archive'
       and v_entry.target_id = p_archive_id
       and v_entry.status in ('active', 'restoring', 'purging') then
      return query select true, true, 'archive'::text, v_entry.status, 0, 0, null::text;
      return;
    end if;

    return query select false, false, 'archive'::text, null::text, 0, 0, 'invalid_trash_state'::text;
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

  select m.id
  into v_archive_cover_media_id
  from public.media m
  join public.records r on r.id = m.record_id
  where r.archive_id = p_archive_id
    and r.trashed_at is null
    and m.trashed_at is null
    and (
      (v_archive.cover_image_path is not null and m.storage_path = v_archive.cover_image_path)
      or (v_archive.cover_image_url is not null and m.url = v_archive.cover_image_url)
      or (v_archive.cover_thumb_path is not null and m.thumb_path = v_archive.cover_thumb_path)
    )
  order by m.id
  limit 1;

  select coalesce(jsonb_object_agg(x.record_id::text, x.media_id::text), '{}'::jsonb)
  into v_record_primary_map
  from (
    select
      r.id as record_id,
      (
        select m.id
        from public.media m
        where m.record_id = r.id
          and m.trashed_at is null
          and (
            (r.primary_image_path is not null and m.storage_path = r.primary_image_path)
            or (r.primary_image_url is not null and m.url = r.primary_image_url)
            or (r.primary_thumb_path is not null and m.thumb_path = r.primary_thumb_path)
          )
        order by m.id
        limit 1
      ) as media_id
    from public.records r
    where r.archive_id = p_archive_id
      and r.trashed_at is null
  ) x
  where x.media_id is not null;

  v_snapshot := jsonb_build_object(
    'version', 1,
    'archive_cover_media_id', v_archive_cover_media_id,
    'record_primary_media_ids', v_record_primary_map
  );

  insert into public.trash_entries (
    owner_user_id,
    target_type,
    target_id,
    root_type,
    root_id,
    status,
    deleted_at,
    restore_snapshot
  )
  values (
    v_user_id,
    'archive',
    p_archive_id,
    'archive',
    p_archive_id,
    'active',
    now(),
    v_snapshot
  )
  on conflict do nothing
  returning id, deleted_at into v_entry_id, v_deleted_at;

  if v_entry_id is null then
    select te.*
    into v_entry
    from public.trash_entries te
    where te.target_type = 'archive'
      and te.target_id = p_archive_id
      and te.status in ('active', 'restoring', 'purging')
    order by te.created_at desc, te.id desc
    limit 1
    for update;

    if found and v_entry.owner_user_id = v_user_id then
      return query select true, true, 'archive'::text, v_entry.status, 0, 0, null::text;
      return;
    end if;

    return query select false, false, 'archive'::text, null::text, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  perform public.private_end_market_posts_for_trash('archive', p_archive_id, null);
  perform public.private_cleanup_trash_interactions('archive', p_archive_id, null);

  update public.media m
  set
    trashed_at = v_deleted_at,
    trash_entry_id = v_entry_id
  from public.records r
  where r.id = m.record_id
    and r.archive_id = p_archive_id
    and r.trashed_at is null
    and r.trash_entry_id is null
    and m.trashed_at is null
    and m.trash_entry_id is null;
  get diagnostics v_media_count = row_count;

  update public.records r
  set
    trashed_at = v_deleted_at,
    trash_entry_id = v_entry_id
  where r.archive_id = p_archive_id
    and r.trashed_at is null
    and r.trash_entry_id is null;
  get diagnostics v_record_count = row_count;

  update public.archives a
  set
    trashed_at = v_deleted_at,
    trash_entry_id = v_entry_id
  where a.id = p_archive_id
    and a.trashed_at is null
    and a.trash_entry_id is null;

  perform public.private_refresh_record_media_after_trash(r.id, null)
  from public.records r
  where r.trash_entry_id = v_entry_id
  order by r.id;

  perform public.private_refresh_archive_after_trash(p_archive_id, null);

  return query select true, false, 'archive'::text, 'active'::text, v_record_count, v_media_count, null::text;
end;
$$;

create or replace function public.move_record_to_trash(p_record_id uuid)
returns table (
  ok boolean,
  already_trashed boolean,
  target_type text,
  status text,
  affected_record_count integer,
  affected_media_count integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_archive public.archives%rowtype;
  v_record public.records%rowtype;
  v_entry public.trash_entries%rowtype;
  v_archive_id uuid;
  v_entry_id uuid;
  v_deleted_at timestamptz;
  v_record_primary_media_id uuid;
  v_archive_cover_media_id uuid;
  v_snapshot jsonb;
  v_media_count integer := 0;
begin
  if v_user_id is null or p_record_id is null then
    return query select false, false, 'record'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  select r.archive_id
  into v_archive_id
  from public.records r
  where r.id = p_record_id;

  if not found then
    return query select false, false, 'record'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cloud-trash:archive:' || v_archive_id::text, 0)
  );

  select a.*
  into v_archive
  from public.archives a
  where a.id = v_archive_id
  for update;

  select r.*
  into v_record
  from public.records r
  where r.id = p_record_id
    and r.archive_id = v_archive_id
  for update;

  if v_archive.id is null
     or v_record.id is null
     or v_archive.user_id is distinct from v_user_id
     or v_record.user_id is distinct from v_user_id then
    return query select false, false, 'record'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  if v_record.trashed_at is not null or v_record.trash_entry_id is not null then
    if v_record.trashed_at is null or v_record.trash_entry_id is null then
      return query select false, false, 'record'::text, null::text, 0, 0, 'invalid_trash_state'::text;
      return;
    end if;

    select te.*
    into v_entry
    from public.trash_entries te
    where te.id = v_record.trash_entry_id
    for update;

    if found
       and v_entry.owner_user_id = v_user_id
       and v_entry.target_type = 'record'
       and v_entry.target_id = p_record_id
       and v_entry.status in ('active', 'restoring', 'purging') then
      return query select true, true, 'record'::text, v_entry.status, 0, 0, null::text;
      return;
    end if;

    if found
       and v_entry.owner_user_id = v_user_id
       and v_entry.target_type = 'archive'
       and v_entry.status in ('active', 'restoring', 'purging') then
      return query select false, false, 'record'::text, v_entry.status, 0, 0, 'parent_trashed'::text;
      return;
    end if;

    return query select false, false, 'record'::text, null::text, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  if v_archive.trashed_at is not null or v_archive.trash_entry_id is not null then
    return query select false, false, 'record'::text, null::text, 0, 0, 'parent_trashed'::text;
    return;
  end if;

  perform m.id
  from public.media m
  where m.record_id = p_record_id
  order by m.id
  for update;

  select m.id
  into v_record_primary_media_id
  from public.media m
  where m.record_id = p_record_id
    and m.trashed_at is null
    and (
      (v_record.primary_image_path is not null and m.storage_path = v_record.primary_image_path)
      or (v_record.primary_image_url is not null and m.url = v_record.primary_image_url)
      or (v_record.primary_thumb_path is not null and m.thumb_path = v_record.primary_thumb_path)
    )
  order by m.id
  limit 1;

  select m.id
  into v_archive_cover_media_id
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

  v_snapshot := jsonb_build_object(
    'version', 1,
    'record_primary_media_id', v_record_primary_media_id,
    'archive_cover_media_id', v_archive_cover_media_id
  );

  insert into public.trash_entries (
    owner_user_id,
    target_type,
    target_id,
    root_type,
    root_id,
    parent_archive_id,
    status,
    deleted_at,
    restore_snapshot
  )
  values (
    v_user_id,
    'record',
    p_record_id,
    'record',
    p_record_id,
    v_archive_id,
    'active',
    now(),
    v_snapshot
  )
  on conflict do nothing
  returning id, deleted_at into v_entry_id, v_deleted_at;

  if v_entry_id is null then
    select te.*
    into v_entry
    from public.trash_entries te
    where te.target_type = 'record'
      and te.target_id = p_record_id
      and te.status in ('active', 'restoring', 'purging')
    order by te.created_at desc, te.id desc
    limit 1
    for update;

    if found and v_entry.owner_user_id = v_user_id then
      return query select true, true, 'record'::text, v_entry.status, 0, 0, null::text;
      return;
    end if;

    return query select false, false, 'record'::text, null::text, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  perform public.private_end_market_posts_for_trash('record', v_archive_id, p_record_id);
  perform public.private_cleanup_trash_interactions('record', v_archive_id, p_record_id);

  update public.media m
  set
    trashed_at = v_deleted_at,
    trash_entry_id = v_entry_id
  where m.record_id = p_record_id
    and m.trashed_at is null
    and m.trash_entry_id is null;
  get diagnostics v_media_count = row_count;

  update public.records r
  set
    trashed_at = v_deleted_at,
    trash_entry_id = v_entry_id
  where r.id = p_record_id
    and r.trashed_at is null
    and r.trash_entry_id is null;

  perform public.private_refresh_record_media_after_trash(p_record_id, null);
  perform public.private_refresh_archive_after_trash(v_archive_id, null);

  return query select true, false, 'record'::text, 'active'::text, 1, v_media_count, null::text;
end;
$$;

create or replace function public.move_media_to_trash(p_media_id uuid)
returns table (
  ok boolean,
  already_trashed boolean,
  target_type text,
  status text,
  affected_record_count integer,
  affected_media_count integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_archive public.archives%rowtype;
  v_record public.records%rowtype;
  v_media public.media%rowtype;
  v_entry public.trash_entries%rowtype;
  v_archive_id uuid;
  v_record_id uuid;
  v_entry_id uuid;
  v_deleted_at timestamptz;
  v_was_record_primary boolean := false;
  v_was_archive_cover boolean := false;
  v_snapshot jsonb;
begin
  if v_user_id is null or p_media_id is null then
    return query select false, false, 'media'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  select m.record_id, r.archive_id
  into v_record_id, v_archive_id
  from public.media m
  join public.records r on r.id = m.record_id
  where m.id = p_media_id;

  if not found then
    return query select false, false, 'media'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cloud-trash:archive:' || v_archive_id::text, 0)
  );

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

  if v_archive.id is null
     or v_record.id is null
     or v_media.id is null
     or v_archive.user_id is distinct from v_user_id
     or v_record.user_id is distinct from v_user_id
     or v_media.user_id is distinct from v_user_id then
    return query select false, false, 'media'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  if v_media.trashed_at is not null or v_media.trash_entry_id is not null then
    if v_media.trashed_at is null or v_media.trash_entry_id is null then
      return query select false, false, 'media'::text, null::text, 0, 0, 'invalid_trash_state'::text;
      return;
    end if;

    select te.*
    into v_entry
    from public.trash_entries te
    where te.id = v_media.trash_entry_id
    for update;

    if found
       and v_entry.owner_user_id = v_user_id
       and v_entry.target_type = 'media'
       and v_entry.target_id = p_media_id
       and v_entry.status in ('active', 'restoring', 'purging') then
      return query select true, true, 'media'::text, v_entry.status, 0, 0, null::text;
      return;
    end if;

    if found
       and v_entry.owner_user_id = v_user_id
       and v_entry.target_type in ('archive', 'record')
       and v_entry.status in ('active', 'restoring', 'purging') then
      return query select false, false, 'media'::text, v_entry.status, 0, 0, 'parent_trashed'::text;
      return;
    end if;

    return query select false, false, 'media'::text, null::text, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  if v_archive.trashed_at is not null
     or v_archive.trash_entry_id is not null
     or v_record.trashed_at is not null
     or v_record.trash_entry_id is not null then
    return query select false, false, 'media'::text, null::text, 0, 0, 'parent_trashed'::text;
    return;
  end if;

  v_was_record_primary := coalesce((
    (v_record.primary_image_path is not null and v_media.storage_path = v_record.primary_image_path)
    or (v_record.primary_image_url is not null and v_media.url = v_record.primary_image_url)
    or (v_record.primary_thumb_path is not null and v_media.thumb_path = v_record.primary_thumb_path)
  ), false);

  v_was_archive_cover := coalesce((
    (v_archive.cover_image_path is not null and v_media.storage_path = v_archive.cover_image_path)
    or (v_archive.cover_image_url is not null and v_media.url = v_archive.cover_image_url)
    or (v_archive.cover_thumb_path is not null and v_media.thumb_path = v_archive.cover_thumb_path)
  ), false);

  v_snapshot := jsonb_build_object(
    'version', 1,
    'sort_order', v_media.sort_order,
    'was_record_primary', v_was_record_primary,
    'was_archive_cover', v_was_archive_cover
  );

  insert into public.trash_entries (
    owner_user_id,
    target_type,
    target_id,
    root_type,
    root_id,
    parent_archive_id,
    parent_record_id,
    status,
    deleted_at,
    restore_snapshot
  )
  values (
    v_user_id,
    'media',
    p_media_id,
    'media',
    p_media_id,
    v_archive_id,
    v_record_id,
    'active',
    now(),
    v_snapshot
  )
  on conflict do nothing
  returning id, deleted_at into v_entry_id, v_deleted_at;

  if v_entry_id is null then
    select te.*
    into v_entry
    from public.trash_entries te
    where te.target_type = 'media'
      and te.target_id = p_media_id
      and te.status in ('active', 'restoring', 'purging')
    order by te.created_at desc, te.id desc
    limit 1
    for update;

    if found and v_entry.owner_user_id = v_user_id then
      return query select true, true, 'media'::text, v_entry.status, 0, 0, null::text;
      return;
    end if;

    return query select false, false, 'media'::text, null::text, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  update public.media m
  set
    trashed_at = v_deleted_at,
    trash_entry_id = v_entry_id
  where m.id = p_media_id
    and m.trashed_at is null
    and m.trash_entry_id is null;

  perform public.private_refresh_record_media_after_trash(v_record_id, null);
  perform public.private_refresh_archive_after_trash(v_archive_id, null);

  return query select true, false, 'media'::text, 'active'::text, 0, 1, null::text;
end;
$$;

revoke all on function public.private_refresh_record_media_after_trash(uuid, uuid) from public, anon, authenticated;
revoke all on function public.private_refresh_archive_after_trash(uuid, uuid) from public, anon, authenticated;
revoke all on function public.private_cleanup_trash_interactions(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.private_end_market_posts_for_trash(text, uuid, uuid) from public, anon, authenticated;

grant execute on function public.private_refresh_record_media_after_trash(uuid, uuid) to service_role;
grant execute on function public.private_refresh_archive_after_trash(uuid, uuid) to service_role;
grant execute on function public.private_cleanup_trash_interactions(text, uuid, uuid) to service_role;
grant execute on function public.private_end_market_posts_for_trash(text, uuid, uuid) to service_role;

revoke all on function public.move_archive_to_trash(uuid) from public, anon, authenticated;
revoke all on function public.move_record_to_trash(uuid) from public, anon, authenticated;
revoke all on function public.move_media_to_trash(uuid) from public, anon, authenticated;

grant execute on function public.move_archive_to_trash(uuid) to authenticated;
grant execute on function public.move_record_to_trash(uuid) to authenticated;
grant execute on function public.move_media_to_trash(uuid) to authenticated;

comment on function public.move_archive_to_trash(uuid) is
  'Owner-only cloud trash move for one archive. Descendants share one root entry; interactions are removed and active market posts are ended atomically.';

comment on function public.move_record_to_trash(uuid) is
  'Owner-only cloud trash move for one record and its active media. Record interactions are removed and active source market posts are ended atomically.';

comment on function public.move_media_to_trash(uuid) is
  'Owner-only cloud trash move for one media row. Storage and market references are preserved.';
