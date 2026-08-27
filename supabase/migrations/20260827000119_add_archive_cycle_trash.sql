-- Treat one archive cycle and all of its records/media as a recoverable trash group.

alter table public.trash_entries
  drop constraint trash_entries_target_type_check,
  drop constraint trash_entries_root_type_check,
  drop constraint trash_entries_parent_shape_check;

alter table public.trash_entries
  add constraint trash_entries_target_type_check
    check (target_type in ('archive', 'cycle', 'record', 'media')),
  add constraint trash_entries_root_type_check
    check (root_type in ('archive', 'cycle', 'record', 'media')),
  add constraint trash_entries_parent_shape_check
    check (
      (target_type = 'archive' and parent_archive_id is null and parent_record_id is null)
      or (target_type = 'cycle' and parent_archive_id is not null and parent_record_id is null)
      or (target_type = 'record' and parent_archive_id is not null and parent_record_id is null)
      or (target_type = 'media' and parent_archive_id is not null and parent_record_id is not null)
    );

alter table public.archive_cycles
  add column trashed_at timestamptz,
  add column trash_entry_id uuid references public.trash_entries(id) on delete restrict;

alter table public.archive_cycles
  add constraint archive_cycles_trash_state_check
  check ((trashed_at is null) = (trash_entry_id is null));

create index archive_cycles_trash_entry_idx
  on public.archive_cycles (trash_entry_id)
  where trash_entry_id is not null;

create or replace function public.create_archive_cycle(
  p_archive_id uuid,
  p_started_at timestamptz
)
returns table (
  ok boolean,
  id uuid,
  cycle_no integer,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_archive_id uuid;
  v_cycle_id uuid;
  v_cycle_no integer;
  v_attempt integer;
begin
  if v_user_id is null then
    return query select false, null::uuid, null::integer, 'not_authenticated'::text;
    return;
  end if;

  if p_archive_id is null or p_started_at is null then
    return query select false, null::uuid, null::integer, 'invalid_input'::text;
    return;
  end if;

  select a.id
  into v_archive_id
  from public.archives a
  where a.id = p_archive_id
    and a.user_id = v_user_id
    and a.trashed_at is null
    and a.trash_entry_id is null
    and a.cycle_enabled is true
  for update;

  if v_archive_id is null then
    return query select false, null::uuid, null::integer, 'archive_not_available'::text;
    return;
  end if;

  -- The archive row lock serializes current clients. The bounded retry also
  -- tolerates one older direct-insert client racing during rollout.
  for v_attempt in 1..3 loop
    select coalesce(max(ac.cycle_no), 0) + 1
    into v_cycle_no
    from public.archive_cycles ac
    where ac.archive_id = p_archive_id;

    begin
      insert into public.archive_cycles (
        archive_id,
        cycle_no,
        display_name,
        status,
        started_at,
        ended_at
      )
      values (
        p_archive_id,
        v_cycle_no,
        null,
        'active',
        p_started_at,
        null
      )
      returning archive_cycles.id into v_cycle_id;

      return query select true, v_cycle_id, v_cycle_no, null::text;
      return;
    exception
      when unique_violation then
        if v_attempt = 3 then
          return query select false, null::uuid, null::integer, 'cycle_number_conflict'::text;
          return;
        end if;
    end;
  end loop;
end;
$$;

create index archive_cycles_active_archive_started_idx
  on public.archive_cycles (archive_id, started_at desc, id desc)
  where trashed_at is null;

drop policy if exists "archive cycles select own or public archive" on public.archive_cycles;
create policy "archive cycles select own or public archive"
  on public.archive_cycles
  for select
  using (
    archive_cycles.trashed_at is null
    and archive_cycles.trash_entry_id is null
    and exists (
      select 1
      from public.archives a
      where a.id = archive_cycles.archive_id
        and a.trashed_at is null
        and a.trash_entry_id is null
        and (a.user_id = auth.uid() or a.is_public = true)
    )
  );

drop policy if exists "archive cycles insert own archive" on public.archive_cycles;
create policy "archive cycles insert own archive"
  on public.archive_cycles
  for insert
  with check (
    archive_cycles.trashed_at is null
    and archive_cycles.trash_entry_id is null
    and exists (
      select 1
      from public.archives a
      where a.id = archive_cycles.archive_id
        and a.user_id = auth.uid()
        and a.trashed_at is null
        and a.trash_entry_id is null
    )
  );

drop policy if exists "archive cycles update own archive" on public.archive_cycles;
create policy "archive cycles update own archive"
  on public.archive_cycles
  for update
  using (
    archive_cycles.trashed_at is null
    and archive_cycles.trash_entry_id is null
    and exists (
      select 1
      from public.archives a
      where a.id = archive_cycles.archive_id
        and a.user_id = auth.uid()
        and a.trashed_at is null
        and a.trash_entry_id is null
    )
  )
  with check (
    archive_cycles.trashed_at is null
    and archive_cycles.trash_entry_id is null
    and exists (
      select 1
      from public.archives a
      where a.id = archive_cycles.archive_id
        and a.user_id = auth.uid()
        and a.trashed_at is null
        and a.trash_entry_id is null
    )
  );

create or replace function public.move_archive_cycle_to_trash(p_cycle_id uuid)
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
  v_cycle public.archive_cycles%rowtype;
  v_archive_id uuid;
  v_entry public.trash_entries%rowtype;
  v_entry_id uuid;
  v_deleted_at timestamptz;
  v_record_count integer := 0;
  v_media_count integer := 0;
  v_cycle_primary_media_id uuid;
  v_archive_cover_media_id uuid;
  v_snapshot jsonb;
  v_record_id uuid;
begin
  if v_user_id is null or p_cycle_id is null then
    return query select false, false, 'cycle'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  select ac.archive_id
  into v_archive_id
  from public.archive_cycles ac
  where ac.id = p_cycle_id;

  if not found then
    return query select false, false, 'cycle'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cloud-trash:archive:' || v_archive_id::text, 0)
  );

  select a.* into v_archive
  from public.archives a
  where a.id = v_archive_id
  for update;

  select ac.* into v_cycle
  from public.archive_cycles ac
  where ac.id = p_cycle_id
    and ac.archive_id = v_archive.id
  for update;

  if v_archive.id is null
     or v_cycle.id is null
     or v_archive.user_id is distinct from v_user_id then
    return query select false, false, 'cycle'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  if v_cycle.trashed_at is not null or v_cycle.trash_entry_id is not null then
    if v_cycle.trashed_at is null or v_cycle.trash_entry_id is null then
      return query select false, false, 'cycle'::text, null::text, 0, 0, 'invalid_trash_state'::text;
      return;
    end if;

    select te.* into v_entry
    from public.trash_entries te
    where te.id = v_cycle.trash_entry_id
    for update;

    if found
       and v_entry.owner_user_id = v_user_id
       and v_entry.target_type = 'cycle'
       and v_entry.target_id = p_cycle_id
       and v_entry.status in ('active', 'restoring', 'purging') then
      return query select true, true, 'cycle'::text, v_entry.status, 0, 0, null::text;
      return;
    end if;

    return query select false, false, 'cycle'::text, null::text, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  if v_archive.trashed_at is not null or v_archive.trash_entry_id is not null then
    return query select false, false, 'cycle'::text, null::text, 0, 0, 'parent_trashed'::text;
    return;
  end if;

  perform r.id
  from public.records r
  where r.archive_id = v_archive.id
    and r.cycle_id = p_cycle_id
  order by r.id
  for update;

  perform m.id
  from public.media m
  join public.records r on r.id = m.record_id
  where r.archive_id = v_archive.id
    and r.cycle_id = p_cycle_id
  order by m.id
  for update of m;

  select m.id into v_cycle_primary_media_id
  from public.media m
  join public.records r on r.id = m.record_id
  where r.archive_id = v_archive.id
    and r.cycle_id = p_cycle_id
    and r.trashed_at is null
    and m.trashed_at is null
  order by r.record_time desc nulls last, r.created_at desc, m.sort_order, m.created_at, m.id
  limit 1;

  select m.id into v_archive_cover_media_id
  from public.media m
  join public.records r on r.id = m.record_id
  where r.archive_id = v_archive.id
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
    'cycle_no', v_cycle.cycle_no,
    'display_name', v_cycle.display_name,
    'cycle_status', v_cycle.status,
    'started_at', v_cycle.started_at,
    'ended_at', v_cycle.ended_at,
    'cycle_primary_media_id', v_cycle_primary_media_id,
    'archive_cover_media_id', v_archive_cover_media_id
  );

  insert into public.trash_entries (
    owner_user_id, target_type, target_id, root_type, root_id,
    parent_archive_id, status, deleted_at, restore_snapshot
  )
  values (
    v_user_id, 'cycle', p_cycle_id, 'cycle', p_cycle_id,
    v_archive.id, 'active', now(), v_snapshot
  )
  on conflict do nothing
  returning id, deleted_at into v_entry_id, v_deleted_at;

  if v_entry_id is null then
    select te.* into v_entry
    from public.trash_entries te
    where te.target_type = 'cycle'
      and te.target_id = p_cycle_id
      and te.status in ('active', 'restoring', 'purging')
    order by te.created_at desc, te.id desc
    limit 1
    for update;

    if found and v_entry.owner_user_id = v_user_id then
      return query select true, true, 'cycle'::text, v_entry.status, 0, 0, null::text;
      return;
    end if;

    return query select false, false, 'cycle'::text, null::text, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  for v_record_id in
    select r.id
    from public.records r
    where r.archive_id = v_archive.id
      and r.cycle_id = p_cycle_id
      and r.trashed_at is null
    order by r.id
  loop
    perform public.private_end_market_posts_for_trash('record', v_archive.id, v_record_id);
    perform public.private_cleanup_trash_interactions('record', v_archive.id, v_record_id);
  end loop;

  update public.media m
  set trashed_at = v_deleted_at, trash_entry_id = v_entry_id
  where m.record_id in (
    select r.id from public.records r
    where r.archive_id = v_archive.id and r.cycle_id = p_cycle_id
  )
    and m.trashed_at is null
    and m.trash_entry_id is null;
  get diagnostics v_media_count = row_count;

  update public.records r
  set trashed_at = v_deleted_at, trash_entry_id = v_entry_id
  where r.archive_id = v_archive.id
    and r.cycle_id = p_cycle_id
    and r.trashed_at is null
    and r.trash_entry_id is null;
  get diagnostics v_record_count = row_count;

  update public.archive_cycles ac
  set trashed_at = v_deleted_at, trash_entry_id = v_entry_id
  where ac.id = p_cycle_id
    and ac.archive_id = v_archive.id
    and ac.trashed_at is null
    and ac.trash_entry_id is null;

  perform public.private_refresh_archive_after_trash(v_archive.id, null);
  perform public.sync_archive_stats(v_archive.id);

  return query select true, false, 'cycle'::text, 'active'::text, v_record_count, v_media_count, null::text;
end;
$$;

create or replace function public.restore_archive_cycle_from_trash(p_cycle_id uuid)
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
  v_cycle public.archive_cycles%rowtype;
  v_record_count integer := 0;
  v_media_count integer := 0;
  v_archive_cover_media_id uuid;
  v_record_id uuid;
begin
  if v_user_id is null or p_cycle_id is null then
    return query select false, false, 'cycle'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  select te.* into v_entry
  from public.trash_entries te
  where te.target_type = 'cycle'
    and te.target_id = p_cycle_id
    and te.owner_user_id = v_user_id
  order by te.created_at desc, te.id desc
  limit 1;

  if not found then
    return query select false, false, 'cycle'::text, null::text, 0, 0, 'not_found_or_forbidden'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cloud-trash:archive:' || v_entry.parent_archive_id::text, 0)
  );

  select te.* into v_entry
  from public.trash_entries te
  where te.id = v_entry.id
  for update;

  select a.* into v_archive
  from public.archives a
  where a.id = v_entry.parent_archive_id
  for update;

  select ac.* into v_cycle
  from public.archive_cycles ac
  where ac.id = p_cycle_id
    and ac.archive_id = v_entry.parent_archive_id
  for update;

  if v_entry.status = 'restored' then
    if v_cycle.id is not null
       and v_cycle.trashed_at is null
       and v_cycle.trash_entry_id is null then
      return query select true, true, 'cycle'::text, 'restored'::text, 0, 0, null::text;
    end if;
    return query select false, false, 'cycle'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    return;
  end if;

  if v_entry.status <> 'active' then
    return query select false, false, 'cycle'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    return;
  end if;

  if v_archive.id is null
     or v_archive.user_id is distinct from v_user_id
     or v_archive.trashed_at is not null
     or v_archive.trash_entry_id is not null then
    return query select false, false, 'cycle'::text, v_entry.status, 0, 0, 'parent_trashed'::text;
    return;
  end if;

  if v_cycle.id is null
     or v_cycle.trashed_at is null
     or v_cycle.trash_entry_id is distinct from v_entry.id then
    return query select false, false, 'cycle'::text, v_entry.status, 0, 0, 'invalid_trash_state'::text;
    return;
  end if;

  if coalesce(v_entry.restore_snapshot ->> 'archive_cover_media_id', '')
     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_archive_cover_media_id := (v_entry.restore_snapshot ->> 'archive_cover_media_id')::uuid;
  end if;

  update public.trash_entries te
  set status = 'restoring', restoring_at = now(), restored_at = null,
      last_error_code = null, failed_at = null
  where te.id = v_entry.id and te.status = 'active';

  if not found then
    return query select false, false, 'cycle'::text, v_entry.status, 0, 0, 'restore_conflict'::text;
    return;
  end if;

  update public.archive_cycles ac
  set trashed_at = null, trash_entry_id = null
  where ac.id = p_cycle_id and ac.trash_entry_id = v_entry.id;

  update public.records r
  set trashed_at = null, trash_entry_id = null
  where r.archive_id = v_archive.id
    and r.cycle_id = p_cycle_id
    and r.trash_entry_id = v_entry.id;
  get diagnostics v_record_count = row_count;

  update public.media m
  set trashed_at = null, trash_entry_id = null
  where m.trash_entry_id = v_entry.id
    and exists (
      select 1 from public.records r
      where r.id = m.record_id
        and r.archive_id = v_archive.id
        and r.cycle_id = p_cycle_id
    );
  get diagnostics v_media_count = row_count;

  for v_record_id in
    select r.id
    from public.records r
    where r.archive_id = v_archive.id and r.cycle_id = p_cycle_id
    order by r.id
  loop
    perform public.private_refresh_record_media_after_trash(v_record_id, null);
  end loop;

  perform public.private_refresh_archive_after_trash(v_archive.id, v_archive_cover_media_id);
  perform public.sync_archive_stats(v_archive.id);

  update public.trash_entries te
  set status = 'restored', restored_at = now(), restoring_at = null,
      last_error_code = null, failed_at = null
  where te.id = v_entry.id and te.status = 'restoring';

  if not found then
    raise exception using errcode = '40001', message = 'trash_restore_state_changed';
  end if;

  return query select true, false, 'cycle'::text, 'restored'::text, v_record_count, v_media_count, null::text;
end;
$$;

alter function public.list_my_trash_entries()
  rename to list_my_trash_entries_core;

create function public.list_my_trash_entries()
returns table (
  trash_entry_id uuid,
  target_type text,
  target_id uuid,
  deleted_at timestamptz,
  status text,
  display_title text,
  parent_title text,
  child_record_count integer,
  child_media_count integer,
  can_retry boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.*
  from (
    select * from public.list_my_trash_entries_core()
    union all
    select
      te.id,
      te.target_type,
      te.target_id,
      te.deleted_at,
      te.status,
      coalesce(nullif(btrim(ac.display_name), ''), '第' || ac.cycle_no::text || '茬/轮'),
      coalesce(nullif(btrim(a.title), ''), '未命名项目'),
      (
        select count(*)::integer from public.records r
        where r.trash_entry_id = te.id and r.trashed_at is not null
      ),
      (
        select count(*)::integer from public.media m
        where m.trash_entry_id = te.id and m.trashed_at is not null
      ),
      (
        te.status = 'failed'
        and te.deletion_job_id is not null
        and not te.capacity_reconciliation_required
      )
    from public.trash_entries te
    join public.archive_cycles ac
      on ac.id = te.target_id
     and ac.trash_entry_id = te.id
     and ac.trashed_at is not null
    join public.archives a
      on a.id = te.parent_archive_id
     and a.user_id = auth.uid()
    where te.owner_user_id = auth.uid()
      and te.target_type = 'cycle'
      and te.root_type = 'cycle'
      and te.root_id = te.target_id
      and te.status in ('active', 'purging', 'failed')
  ) q
  order by q.deleted_at desc, q.trash_entry_id desc;
$$;

alter table public.storage_deletion_jobs
  drop constraint storage_deletion_jobs_source_type_check;
alter table public.storage_deletion_jobs
  add constraint storage_deletion_jobs_source_type_check
  check (
    source_type in (
      'record', 'archive', 'cycle', 'account', 'media',
      'market_post', 'market_media', 'market_cover'
    )
  );

create or replace function public.request_delete_archive_cycle(p_cycle_id uuid)
returns table (
  ok boolean,
  job_id uuid,
  already_requested boolean,
  queued_item_count integer,
  job_status text,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_archive_id uuid;
  v_owner_user_id uuid;
  v_job_id uuid;
  v_job_owner_user_id uuid;
  v_job_status text;
  v_path_count integer := 0;
  v_paths text[] := array[]::text[];
begin
  if v_user_id is null or p_cycle_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select j.id, j.owner_user_id, j.status
  into v_job_id, v_job_owner_user_id, v_job_status
  from public.storage_deletion_jobs j
  where j.source_type = 'cycle' and j.source_id = p_cycle_id;

  if found then
    if v_job_owner_user_id is distinct from v_user_id then
      return query select false, null::uuid, false, 0, null::text, 'not_found_or_forbidden'::text;
      return;
    end if;
    select count(*)::integer into v_path_count
    from public.storage_deletion_items i where i.job_id = v_job_id;
    return query select true, v_job_id, true, v_path_count, v_job_status, null::text;
    return;
  end if;

  select ac.archive_id, a.user_id
  into v_archive_id, v_owner_user_id
  from public.archive_cycles ac
  join public.archives a on a.id = ac.archive_id
  where ac.id = p_cycle_id
    and ac.trashed_at is not null
    and ac.trash_entry_id is not null
    and a.user_id = v_user_id
  for update of ac;

  if not found then
    return query select false, null::uuid, false, 0, null::text, 'not_found_or_forbidden'::text;
    return;
  end if;

  if exists (
    select 1
    from public.records r
    where r.archive_id = v_archive_id
      and r.cycle_id = p_cycle_id
      and (
        (nullif(btrim(r.primary_image_path), '') is not null and (left(btrim(r.primary_image_path), 1) = '/' or btrim(r.primary_image_path) ~* '^https?://'))
        or (nullif(btrim(r.primary_thumb_path), '') is not null and (left(btrim(r.primary_thumb_path), 1) = '/' or btrim(r.primary_thumb_path) ~* '^https?://'))
        or (nullif(btrim(r.primary_image_url), '') is not null and nullif(btrim(r.primary_image_path), '') is null and public.media_object_path_from_public_url(r.primary_image_url) is null)
      )
  ) or exists (
    select 1
    from public.media m
    join public.records r on r.id = m.record_id
    where r.archive_id = v_archive_id
      and r.cycle_id = p_cycle_id
      and (
        (nullif(btrim(m.storage_path), '') is not null and (left(btrim(m.storage_path), 1) = '/' or btrim(m.storage_path) ~* '^https?://'))
        or (nullif(btrim(m.thumb_path), '') is not null and (left(btrim(m.thumb_path), 1) = '/' or btrim(m.thumb_path) ~* '^https?://'))
        or (nullif(btrim(m.url), '') is not null and nullif(btrim(m.storage_path), '') is null and public.media_object_path_from_public_url(m.url) is null)
        or (nullif(btrim(m.thumb_url), '') is not null and nullif(btrim(m.thumb_path), '') is null and public.media_object_path_from_public_url(m.thumb_url) is null)
      )
  ) then
    return query select false, null::uuid, false, 0, null::text, 'unsafe_media_path'::text;
    return;
  end if;

  select coalesce(array_agg(distinct p.object_path order by p.object_path), array[]::text[])
  into v_paths
  from public.records r
  cross join lateral public.collect_record_media_deletion_paths(r.id, null) p
  where r.archive_id = v_archive_id and r.cycle_id = p_cycle_id;

  insert into public.storage_deletion_jobs (owner_user_id, source_type, source_id, status)
  values (v_owner_user_id, 'cycle', p_cycle_id, 'pending')
  on conflict (source_type, source_id) do nothing
  returning id, status into v_job_id, v_job_status;

  if v_job_id is null then
    select j.id, j.owner_user_id, j.status
    into v_job_id, v_job_owner_user_id, v_job_status
    from public.storage_deletion_jobs j
    where j.source_type = 'cycle' and j.source_id = p_cycle_id;
    if v_job_id is null or v_job_owner_user_id is distinct from v_user_id then
      return query select false, null::uuid, false, 0, null::text, 'not_found_or_forbidden'::text;
      return;
    end if;
    select count(*)::integer into v_path_count
    from public.storage_deletion_items i where i.job_id = v_job_id;
    return query select true, v_job_id, true, v_path_count, v_job_status, null::text;
    return;
  end if;

  v_path_count := public.enqueue_media_deletion_items(v_job_id, v_paths);

  delete from public.records r
  where r.archive_id = v_archive_id and r.cycle_id = p_cycle_id;
  delete from public.archive_cycles ac
  where ac.id = p_cycle_id and ac.archive_id = v_archive_id;
  perform public.sync_archive_stats(v_archive_id);

  if v_path_count = 0 then
    update public.storage_deletion_jobs j
    set status = 'succeeded', last_error_code = null, processed_at = now()
    where j.id = v_job_id;
    v_job_status := 'succeeded';
  else
    v_job_status := 'pending';
  end if;

  return query select true, v_job_id, false, v_path_count, v_job_status, null::text;
end;
$$;

alter function public.request_purge_trash_entry(uuid, text, uuid)
  rename to request_purge_trash_entry_core;

create function public.request_purge_trash_entry(
  p_owner_user_id uuid,
  p_target_type text,
  p_target_id uuid
)
returns table (
  ok boolean,
  status text,
  already_requested boolean,
  job_status text,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.trash_entries%rowtype;
  v_delete_ok boolean;
  v_job_id uuid;
  v_job_status text;
  v_delete_error text;
  v_previous_claim_sub text;
  v_related_entry_ids uuid[] := array[]::uuid[];
  v_paths text[] := array[]::text[];
  v_path text;
begin
  if p_target_type <> 'cycle' then
    return query
    select * from public.request_purge_trash_entry_core(
      p_owner_user_id, p_target_type, p_target_id
    );
    return;
  end if;

  if p_owner_user_id is null or p_target_id is null then
    return query select false, null::text, false, null::text, 'not_found_or_forbidden'::text;
    return;
  end if;

  select te.* into v_entry
  from public.trash_entries te
  where te.owner_user_id = p_owner_user_id
    and te.target_type = 'cycle'
    and te.target_id = p_target_id
    and te.root_type = 'cycle'
    and te.root_id = p_target_id
  order by te.created_at desc, te.id desc
  limit 1
  for update;

  if not found then
    return query select false, null::text, false, null::text, 'not_found_or_forbidden'::text;
    return;
  end if;

  if v_entry.status = 'purged' then
    return query select true, 'purged'::text, true, 'succeeded'::text, null::text;
    return;
  end if;

  if v_entry.status = 'purging' then
    if v_entry.deletion_job_id is null then
      return query select false, 'purging'::text, true, null::text, 'purge_job_missing'::text;
      return;
    end if;
    perform public.refresh_storage_deletion_job_status(v_entry.deletion_job_id);
    select te.status, j.status
    into v_entry.status, v_job_status
    from public.trash_entries te
    join public.storage_deletion_jobs j on j.id = te.deletion_job_id
    where te.id = v_entry.id;
    return query select v_entry.status <> 'failed', v_entry.status, true, v_job_status,
      case when v_entry.status = 'failed' then 'storage_delete_failed'::text else null::text end;
    return;
  end if;

  if v_entry.status = 'failed' then
    if v_entry.deletion_job_id is null then
      return query select false, 'failed'::text, false, null::text, 'purge_job_missing'::text;
      return;
    end if;
    if v_entry.capacity_reconciliation_required
       or not public.private_retry_storage_deletion_job(v_entry.deletion_job_id) then
      return query select false, 'failed'::text, false, 'failed'::text, 'capacity_reconciliation_required'::text;
      return;
    end if;
    update public.trash_entries te
    set status = 'purging', purging_at = now(), failed_at = null, last_error_code = null
    where te.id = v_entry.id and te.status = 'failed';
    perform public.refresh_storage_deletion_job_status(v_entry.deletion_job_id);
    select te.status, j.status into v_entry.status, v_job_status
    from public.trash_entries te
    join public.storage_deletion_jobs j on j.id = te.deletion_job_id
    where te.id = v_entry.id;
    return query select true, v_entry.status, true, v_job_status, null::text;
    return;
  end if;

  if v_entry.status <> 'active' then
    return query select false, v_entry.status, false, null::text, 'purge_conflict'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.archive_cycles ac
    join public.archives a on a.id = ac.archive_id
    where ac.id = p_target_id
      and ac.trash_entry_id = v_entry.id
      and ac.trashed_at is not null
      and a.id = v_entry.parent_archive_id
      and a.user_id = p_owner_user_id
      and a.trashed_at is null
      and a.trash_entry_id is null
  ) then
    return query select false, 'active'::text, false, null::text, 'invalid_trash_state'::text;
    return;
  end if;

  if exists (
    select 1 from public.storage_deletion_jobs j
    where j.source_type = 'cycle' and j.source_id = p_target_id
  ) then
    return query select false, 'active'::text, false, null::text, 'purge_job_conflict'::text;
    return;
  end if;

  select coalesce(array_agg(distinct p.object_path order by p.object_path), array[]::text[])
  into v_paths
  from public.records r
  cross join lateral public.collect_record_media_deletion_paths(r.id, null) p
  where r.archive_id = v_entry.parent_archive_id
    and r.cycle_id = p_target_id;

  select array_append(
    coalesce(array_agg(te.id order by te.id), array[]::uuid[]),
    v_entry.id
  )
  into v_related_entry_ids
  from public.trash_entries te
  where te.owner_user_id = p_owner_user_id
    and te.status = 'active'
    and te.id <> v_entry.id
    and (
      (
        te.target_type = 'record'
        and exists (
          select 1
          from public.records r
          where r.id = te.target_id
            and r.archive_id = v_entry.parent_archive_id
            and r.cycle_id = p_target_id
            and r.trash_entry_id = te.id
        )
      )
      or (
        te.target_type = 'media'
        and exists (
          select 1
          from public.media m
          join public.records r on r.id = m.record_id
          where m.id = te.target_id
            and r.archive_id = v_entry.parent_archive_id
            and r.cycle_id = p_target_id
            and m.trash_entry_id = te.id
        )
      )
    );

  perform te.id
  from public.trash_entries te
  where te.id = any(v_related_entry_ids)
  order by te.id
  for update;

  update public.trash_entries te
  set status = 'purging', purging_at = now(), purged_at = null,
      failed_at = null, last_error_code = null,
      capacity_reconciliation_required = false
  where te.id = any(v_related_entry_ids)
    and te.status = 'active';

  if not exists (
    select 1 from public.trash_entries te
    where te.id = v_entry.id and te.status = 'purging'
  ) then
    return query select false, 'active'::text, false, null::text, 'purge_conflict'::text;
    return;
  end if;

  v_previous_claim_sub := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', p_owner_user_id::text, true);
  select d.ok, d.job_id, d.job_status, d.error_code
  into v_delete_ok, v_job_id, v_job_status, v_delete_error
  from public.request_delete_archive_cycle(p_target_id) d;
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_claim_sub, ''), true);

  if not coalesce(v_delete_ok, false) or v_job_id is null then
    raise exception using errcode = 'P0001', message = coalesce(v_delete_error, 'purge_delete_request_failed');
  end if;

  foreach v_path in array v_paths loop
    perform public.private_link_or_enqueue_storage_deletion_path(
      v_job_id, 'media', v_path
    );
  end loop;

  update public.trash_entries te
  set deletion_job_id = v_job_id
  where te.id = any(v_related_entry_ids)
    and te.status = 'purging'
    and te.deletion_job_id is null;

  if exists (
    select 1 from public.trash_entries te
    where te.id = any(v_related_entry_ids)
      and (
        te.status <> 'purging'
        or te.deletion_job_id is distinct from v_job_id
      )
  ) then
    raise exception using errcode = '40001', message = 'purge_job_link_conflict';
  end if;

  perform public.refresh_storage_deletion_job_status(v_job_id);

  select te.status, j.status into v_entry.status, v_job_status
  from public.trash_entries te
  join public.storage_deletion_jobs j on j.id = te.deletion_job_id
  where te.id = v_entry.id;

  return query select true, v_entry.status, false, v_job_status, null::text;
end;
$$;

revoke all on function public.move_archive_cycle_to_trash(uuid)
  from public, anon, authenticated;
grant execute on function public.move_archive_cycle_to_trash(uuid)
  to authenticated;

revoke all on function public.create_archive_cycle(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_archive_cycle(uuid, timestamptz)
  to authenticated;

revoke all on function public.restore_archive_cycle_from_trash(uuid)
  from public, anon, authenticated;
grant execute on function public.restore_archive_cycle_from_trash(uuid)
  to authenticated;

revoke all on function public.delete_archive_cycle(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.request_delete_archive_cycle(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.request_delete_archive_cycle(uuid)
  to service_role;

revoke all on function public.list_my_trash_entries_core()
  from public, anon, authenticated;
revoke all on function public.list_my_trash_entries()
  from public, anon, authenticated;
grant execute on function public.list_my_trash_entries()
  to authenticated;

revoke all on function public.request_purge_trash_entry_core(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.request_purge_trash_entry_core(uuid, text, uuid)
  to service_role;
revoke all on function public.request_purge_trash_entry(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.request_purge_trash_entry(uuid, text, uuid)
  to service_role;

comment on function public.move_archive_cycle_to_trash(uuid) is
  'Owner-only move of one cycle and all linked records/media to a single recoverable trash group.';
comment on function public.create_archive_cycle(uuid, timestamptz) is
  'Owner-only atomic cycle creation. Internal numbers include trashed cycles and allow multiple active cycles.';
comment on function public.restore_archive_cycle_from_trash(uuid) is
  'Owner-only restoration of one cycle trash group. Duplicate display names are allowed and the archive cycle setting is unchanged.';
