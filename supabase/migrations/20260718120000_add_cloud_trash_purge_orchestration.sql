-- B3.5.4 phase 1: server-only cloud trash purge orchestration.
-- This migration adds no automatic purge schedule and does not purge existing data.

alter table public.trash_entries
  add column deletion_job_id uuid
    references public.storage_deletion_jobs(id) on delete restrict,
  add column capacity_reconciliation_required boolean not null default false;

create index trash_entries_deletion_job_idx
  on public.trash_entries (deletion_job_id)
  where deletion_job_id is not null;

alter table public.storage_deletion_items
  add column capacity_reconciliation_required boolean not null default false;

alter table public.trash_entries
  add constraint trash_entries_capacity_reconciliation_state_check
  check (not capacity_reconciliation_required or status = 'failed');

alter table public.storage_deletion_items
  add constraint storage_deletion_items_capacity_reconciliation_state_check
  check (not capacity_reconciliation_required or capacity_released_at is null);

create table public.storage_deletion_job_items (
  job_id uuid not null
    references public.storage_deletion_jobs(id) on delete cascade,
  item_id uuid not null
    references public.storage_deletion_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, item_id)
);

create index storage_deletion_job_items_item_idx
  on public.storage_deletion_job_items (item_id, job_id);

alter table public.storage_deletion_job_items enable row level security;

revoke all on table public.storage_deletion_job_items
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.storage_deletion_job_items to service_role;

-- Existing items remain owned by their original job. This structural backfill
-- does not touch business rows or enqueue any work.
insert into public.storage_deletion_job_items (job_id, item_id)
select i.job_id, i.id
from public.storage_deletion_items i
on conflict do nothing;

comment on table public.storage_deletion_job_items is
  'Server-only many-to-many linkage for jobs waiting on one canonical physical Storage deletion item.';

comment on column public.trash_entries.deletion_job_id is
  'Internal purge job linkage. Not exposed by owner-facing trash listing RPCs.';

comment on column public.trash_entries.capacity_reconciliation_required is
  'Internal marker set when physical deletion completed without trustworthy billable bytes.';

comment on column public.storage_deletion_items.capacity_reconciliation_required is
  'True when an item reached deleted/not_found without trustworthy bytes or a profile settlement target.';

create or replace function public.private_storage_object_size_bytes(
  p_bucket_id text,
  p_object_path text
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.metadata ->> 'size' ~ '^[0-9]+$'
      then (o.metadata ->> 'size')::bigint
    else null::bigint
  end
  from storage.objects o
  where o.bucket_id = p_bucket_id
    and o.name = p_object_path
  limit 1;
$$;

revoke all on function public.private_storage_object_size_bytes(text, text)
  from public, anon, authenticated, service_role;

comment on function public.private_storage_object_size_bytes(text, text) is
  'Database-internal lookup of exact Storage object metadata bytes. Returns NULL rather than estimating.';

create or replace function public.private_refresh_trash_purge_for_job(
  p_job_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_status text;
  v_job_error text;
  v_requires_reconciliation boolean := false;
begin
  if p_job_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.trash_entries te
    where te.deletion_job_id = p_job_id
      and te.status = 'purging'
  ) then
    return;
  end if;

  select j.status, j.last_error_code
  into v_job_status, v_job_error
  from public.storage_deletion_jobs j
  where j.id = p_job_id;

  if not found then
    update public.trash_entries te
    set
      status = 'failed',
      failed_at = now(),
      last_error_code = 'purge_job_missing'
    where te.deletion_job_id = p_job_id
      and te.status = 'purging';
    return;
  end if;

  if v_job_status in ('pending', 'processing', 'retry_wait') then
    return;
  end if;

  if v_job_status = 'failed' then
    update public.trash_entries te
    set
      status = 'failed',
      failed_at = now(),
      last_error_code = coalesce(v_job_error, 'storage_deletion_failed')
    where te.deletion_job_id = p_job_id
      and te.status = 'purging';
    return;
  end if;

  if v_job_status <> 'succeeded' then
    return;
  end if;

  select exists (
    select 1
    from public.storage_deletion_job_items ji
    join public.storage_deletion_items i on i.id = ji.item_id
    where ji.job_id = p_job_id
      and i.result_code in ('deleted', 'not_found')
      and (
        i.capacity_reconciliation_required
        or i.size_bytes is null
        or i.capacity_released_at is null
      )
  )
  into v_requires_reconciliation;

  if v_requires_reconciliation then
    update public.trash_entries te
    set
      status = 'failed',
      failed_at = now(),
      last_error_code = 'capacity_reconciliation_required',
      capacity_reconciliation_required = true
    where te.deletion_job_id = p_job_id
      and te.status = 'purging';
    return;
  end if;

  update public.trash_entries te
  set
    status = 'purged',
    purged_at = now(),
    failed_at = null,
    last_error_code = null,
    capacity_reconciliation_required = false
  where te.deletion_job_id = p_job_id
    and te.status = 'purging';
end;
$$;

revoke all on function public.private_refresh_trash_purge_for_job(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.refresh_storage_deletion_job_status(
  p_job_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_last_error_code text;
begin
  if p_job_id is null then
    return;
  end if;

  with linked_items as (
    select ji.item_id
    from public.storage_deletion_job_items ji
    where ji.job_id = p_job_id
    union
    select i.id
    from public.storage_deletion_items i
    where i.job_id = p_job_id
  )
  select
    case
      when count(*) filter (where i.status = 'processing') > 0 then 'processing'
      when count(*) filter (where i.status = 'pending') > 0 then 'pending'
      when count(*) filter (where i.status = 'retry_wait') > 0 then 'retry_wait'
      when count(*) filter (where i.status = 'failed') > 0 then 'failed'
      else 'succeeded'
    end,
    max(i.last_error_code) filter (where i.last_error_code is not null)
  into v_status, v_last_error_code
  from linked_items li
  join public.storage_deletion_items i on i.id = li.item_id;

  update public.storage_deletion_jobs j
  set
    status = v_status,
    last_error_code = case
      when v_status in ('retry_wait', 'failed') then v_last_error_code
      else null
    end,
    processed_at = case
      when v_status in ('succeeded', 'failed') then coalesce(j.processed_at, now())
      else null
    end
  where j.id = p_job_id;

  perform public.private_refresh_trash_purge_for_job(p_job_id);
end;
$$;

revoke all on function public.refresh_storage_deletion_job_status(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_storage_deletion_job_status(uuid)
  to service_role;

create or replace function public.refresh_cloud_trash_purges_for_item(
  p_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if p_item_id is null then
    return;
  end if;

  for v_job_id in
    select ji.job_id
    from public.storage_deletion_job_items ji
    where ji.item_id = p_item_id
    union
    select i.job_id
    from public.storage_deletion_items i
    where i.id = p_item_id
  loop
    perform public.refresh_storage_deletion_job_status(v_job_id);
  end loop;
end;
$$;

revoke all on function public.refresh_cloud_trash_purges_for_item(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_cloud_trash_purges_for_item(uuid)
  to service_role;

create or replace function public.private_storage_deletion_item_refresh_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_cloud_trash_purges_for_item(new.id);
  return null;
end;
$$;

revoke all on function public.private_storage_deletion_item_refresh_trigger()
  from public, anon, authenticated, service_role;

create trigger storage_deletion_items_refresh_dependents
after update of status, result_code, last_error_code,
  capacity_released_at, capacity_reconciliation_required
on public.storage_deletion_items
for each row
when (
  old.status is distinct from new.status
  or old.result_code is distinct from new.result_code
  or old.last_error_code is distinct from new.last_error_code
  or old.capacity_released_at is distinct from new.capacity_released_at
  or old.capacity_reconciliation_required is distinct from new.capacity_reconciliation_required
)
execute function public.private_storage_deletion_item_refresh_trigger();

create or replace function public.private_link_or_enqueue_storage_deletion_path(
  p_job_id uuid,
  p_bucket_id text,
  p_object_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := btrim(coalesce(p_object_path, ''));
  v_item_id uuid;
  v_size_bytes bigint;
begin
  if p_job_id is null
     or p_bucket_id <> 'media'
     or v_path = ''
     or left(v_path, 1) = '/'
     or v_path ~* '^https?://'
     or v_path ~ '(^|/)\.\.?(?:/|$)'
     or position(chr(92) in v_path) > 0 then
    raise exception using errcode = '22023', message = 'invalid_storage_deletion_path';
  end if;

  v_size_bytes := public.private_storage_object_size_bytes(p_bucket_id, v_path);

  select i.id
  into v_item_id
  from public.storage_deletion_items i
  where i.job_id = p_job_id
    and i.bucket_id = p_bucket_id
    and i.object_path = v_path
  order by i.created_at, i.id
  limit 1
  for update;

  if not found then
    select i.id
    into v_item_id
    from public.storage_deletion_items i
    where i.bucket_id = p_bucket_id
      and i.object_path = v_path
      and i.status in ('pending', 'processing', 'retry_wait')
    order by i.created_at, i.id
    limit 1
    for update;
  end if;

  if not found then
    select i.id
    into v_item_id
    from public.storage_deletion_items i
    where i.bucket_id = p_bucket_id
      and i.object_path = v_path
      and i.status = 'failed'
      and not i.capacity_reconciliation_required
    order by i.processed_at desc, i.id desc
    limit 1
    for update;

    if found then
      update public.storage_deletion_items i
      set
        status = 'pending',
        result_code = null,
        attempts = 0,
        next_attempt_at = now(),
        claimed_by = null,
        claimed_at = null,
        lease_expires_at = null,
        last_error_code = null,
        processed_at = null
      where i.id = v_item_id;
    end if;
  end if;

  if not found then
    select i.id
    into v_item_id
    from public.storage_deletion_items i
    where i.bucket_id = p_bucket_id
      and i.object_path = v_path
      and i.status = 'succeeded'
      and i.result_code in ('deleted', 'not_found')
      and v_size_bytes is null
    order by i.processed_at desc, i.id desc
    limit 1
    for update;
  end if;

  if v_item_id is null then
    begin
      insert into public.storage_deletion_items (
        job_id,
        bucket_id,
        object_path,
        size_bytes,
        status
      ) values (
        p_job_id,
        p_bucket_id,
        v_path,
        v_size_bytes,
        'pending'
      )
      returning id into v_item_id;
    exception when unique_violation then
      select i.id
      into v_item_id
      from public.storage_deletion_items i
      where i.bucket_id = p_bucket_id
        and i.object_path = v_path
        and i.status in ('pending', 'processing', 'retry_wait')
      order by i.created_at, i.id
      limit 1
      for update;

      if v_item_id is null then
        raise;
      end if;
    end;
  end if;

  update public.storage_deletion_items i
  set size_bytes = coalesce(i.size_bytes, v_size_bytes)
  where i.id = v_item_id
    and i.status in ('pending', 'processing', 'retry_wait');

  insert into public.storage_deletion_job_items (job_id, item_id)
  values (p_job_id, v_item_id)
  on conflict do nothing;

  perform public.refresh_storage_deletion_job_status(p_job_id);
  return v_item_id;
end;
$$;

revoke all on function public.private_link_or_enqueue_storage_deletion_path(uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.complete_storage_deletion_item(
  p_item_id uuid,
  p_worker_id uuid,
  p_result_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.storage_deletion_items%rowtype;
  v_owner_user_id uuid;
  v_target_status text;
  v_capacity_released_at timestamptz;
  v_requires_reconciliation boolean := false;
  v_profile_updated boolean := false;
begin
  if p_item_id is null or p_worker_id is null then
    raise exception using errcode = '22023', message = 'item_and_worker_required';
  end if;

  if p_result_code is null
     or p_result_code not in ('deleted', 'not_found', 'retained_shared') then
    raise exception using errcode = '22023', message = 'invalid_deletion_result';
  end if;

  select i.*
  into v_item
  from public.storage_deletion_items i
  where i.id = p_item_id
  for update;

  if not found then
    return false;
  end if;

  if v_item.status in ('succeeded', 'retained_shared')
     and v_item.result_code = p_result_code then
    return true;
  end if;

  if v_item.status <> 'processing' or v_item.claimed_by is distinct from p_worker_id then
    return false;
  end if;

  v_target_status := case
    when p_result_code = 'retained_shared' then 'retained_shared'
    else 'succeeded'
  end;

  v_capacity_released_at := v_item.capacity_released_at;

  if p_result_code in ('deleted', 'not_found')
     and v_capacity_released_at is null then
    if v_item.size_bytes is null then
      v_requires_reconciliation := true;
    elsif v_item.size_bytes = 0 then
      v_capacity_released_at := now();
    else
      select j.owner_user_id
      into v_owner_user_id
      from public.storage_deletion_jobs j
      where j.id = v_item.job_id;

      if v_owner_user_id is not null then
        update public.profiles p
        set storage_used = greatest(coalesce(p.storage_used, 0) - v_item.size_bytes, 0)
        where p.id = v_owner_user_id;
        v_profile_updated := found;
      end if;

      if v_profile_updated then
        v_capacity_released_at := now();
      else
        v_requires_reconciliation := true;
      end if;
    end if;
  end if;

  update public.storage_deletion_items i
  set
    status = v_target_status,
    result_code = p_result_code,
    claimed_by = null,
    claimed_at = null,
    lease_expires_at = null,
    last_error_code = null,
    processed_at = now(),
    capacity_released_at = case
      when p_result_code = 'retained_shared' then i.capacity_released_at
      else v_capacity_released_at
    end,
    capacity_reconciliation_required = case
      when p_result_code = 'retained_shared' then false
      else v_requires_reconciliation
    end
  where i.id = p_item_id
    and i.status = 'processing'
    and i.claimed_by = p_worker_id;

  if not found then
    return false;
  end if;

  perform public.refresh_cloud_trash_purges_for_item(p_item_id);
  return true;
end;
$$;

revoke all on function public.complete_storage_deletion_item(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_storage_deletion_item(uuid, uuid, text)
  to service_role;

comment on function public.complete_storage_deletion_item(uuid, uuid, text) is
  'Service-role atomic item completion and idempotent owner capacity settlement. Unknown bytes are flagged, never guessed.';

create or replace function public.fail_storage_deletion_item(
  p_item_id uuid,
  p_worker_id uuid,
  p_error_code text,
  p_retryable boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_item_id is null or p_worker_id is null then
    raise exception using errcode = '22023', message = 'item_and_worker_required';
  end if;

  if p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception using errcode = '22023', message = 'invalid_deletion_error';
  end if;

  update public.storage_deletion_items i
  set
    status = case
      when coalesce(p_retryable, false) and i.attempts < 10 then 'retry_wait'
      else 'failed'
    end,
    result_code = null,
    next_attempt_at = case
      when coalesce(p_retryable, false) and i.attempts < 10 then
        now() + make_interval(
          secs => least(3600, (30 * power(2, greatest(i.attempts - 1, 0)))::integer)
        )
      else i.next_attempt_at
    end,
    claimed_by = null,
    claimed_at = null,
    lease_expires_at = null,
    last_error_code = p_error_code,
    processed_at = case
      when coalesce(p_retryable, false) and i.attempts < 10 then null
      else now()
    end
  where i.id = p_item_id
    and i.status = 'processing'
    and i.claimed_by = p_worker_id;

  if not found then
    return false;
  end if;

  perform public.refresh_cloud_trash_purges_for_item(p_item_id);
  return true;
end;
$$;

revoke all on function public.fail_storage_deletion_item(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_storage_deletion_item(uuid, uuid, text, boolean)
  to service_role;

create or replace function public.private_retry_storage_deletion_job(
  p_job_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_job_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.storage_deletion_job_items ji
    join public.storage_deletion_items i on i.id = ji.item_id
    where ji.job_id = p_job_id
      and i.capacity_reconciliation_required
  ) then
    return false;
  end if;

  update public.storage_deletion_items i
  set
    status = 'pending',
    result_code = null,
    attempts = 0,
    next_attempt_at = now(),
    claimed_by = null,
    claimed_at = null,
    lease_expires_at = null,
    last_error_code = null,
    processed_at = null
  where i.id in (
    select ji.item_id
    from public.storage_deletion_job_items ji
    where ji.job_id = p_job_id
  )
    and i.status = 'failed';

  update public.storage_deletion_jobs j
  set
    status = 'pending',
    last_error_code = null,
    processed_at = null
  where j.id = p_job_id;

  return found;
end;
$$;

revoke all on function public.private_retry_storage_deletion_job(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.request_purge_trash_entry(
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
  v_archive_id uuid;
  v_paths text[] := array[]::text[];
  v_path text;
  v_delete_ok boolean;
  v_job_id uuid;
  v_job_status text;
  v_delete_error text;
  v_trash_error text;
  v_previous_claim_sub text;
  v_related_entry_ids uuid[] := array[]::uuid[];
begin
  if p_owner_user_id is null
     or p_target_id is null
     or p_target_type not in ('archive', 'record', 'media') then
    return query select false, null::text, false, null::text, 'not_found_or_forbidden'::text;
    return;
  end if;

  select te.parent_archive_id
  into v_archive_id
  from public.trash_entries te
  where te.owner_user_id = p_owner_user_id
    and te.target_type = p_target_type
    and te.target_id = p_target_id
    and te.root_type = p_target_type
    and te.root_id = p_target_id
  order by te.created_at desc, te.id desc
  limit 1;

  if p_target_type = 'archive' then
    v_archive_id := p_target_id;
  end if;

  if v_archive_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('cloud-trash:archive:' || v_archive_id::text, 0)
    );
  end if;

  select te.*
  into v_entry
  from public.trash_entries te
  where te.owner_user_id = p_owner_user_id
    and te.target_type = p_target_type
    and te.target_id = p_target_id
    and te.root_type = p_target_type
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

    select te.status, te.last_error_code, j.status
    into v_entry.status, v_trash_error, v_job_status
    from public.trash_entries te
    join public.storage_deletion_jobs j on j.id = te.deletion_job_id
    where te.id = v_entry.id;

    if v_entry.status = 'purged' then
      return query select true, 'purged'::text, true, v_job_status, null::text;
      return;
    end if;

    if v_entry.status = 'failed' then
      return query select false, 'failed'::text, true, v_job_status, v_trash_error;
      return;
    end if;

    select j.status into v_job_status
    from public.storage_deletion_jobs j
    where j.id = v_entry.deletion_job_id;

    return query select true, 'purging'::text, true, v_job_status, null::text;
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
    set
      status = 'purging',
      purging_at = now(),
      failed_at = null,
      last_error_code = null
    where te.deletion_job_id = v_entry.deletion_job_id
      and te.status = 'failed';

    perform public.refresh_storage_deletion_job_status(v_entry.deletion_job_id);

    select te.status, j.status
    into v_entry.status, v_job_status
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

  if exists (
    select 1
    from public.storage_deletion_jobs j
    where j.source_type = p_target_type
      and j.source_id = p_target_id
  ) then
    return query select false, 'active'::text, false, null::text, 'purge_job_conflict'::text;
    return;
  end if;

  if p_target_type = 'archive' then
    if not exists (
      select 1 from public.archives a
      where a.id = p_target_id
        and a.user_id = p_owner_user_id
        and a.trash_entry_id = v_entry.id
        and a.trashed_at is not null
    ) then
      return query select false, 'active'::text, false, null::text, 'invalid_trash_state'::text;
      return;
    end if;

    select coalesce(array_agg(p.object_path order by p.object_path), array[]::text[])
    into v_paths
    from public.collect_archive_media_deletion_paths(p_target_id) p;

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
              and r.archive_id = p_target_id
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
              and r.archive_id = p_target_id
              and m.trash_entry_id = te.id
          )
        )
      );
  elsif p_target_type = 'record' then
    if not exists (
      select 1
      from public.records r
      join public.archives a on a.id = r.archive_id
      where r.id = p_target_id
        and r.user_id = p_owner_user_id
        and r.trash_entry_id = v_entry.id
        and r.trashed_at is not null
        and a.user_id = p_owner_user_id
        and a.trashed_at is null
        and a.trash_entry_id is null
    ) then
      return query select false, 'active'::text, false, null::text, 'invalid_trash_state'::text;
      return;
    end if;

    select coalesce(array_agg(p.object_path order by p.object_path), array[]::text[])
    into v_paths
    from public.collect_record_media_deletion_paths(p_target_id, null) p;

    select array_append(
      coalesce(array_agg(te.id order by te.id), array[]::uuid[]),
      v_entry.id
    )
    into v_related_entry_ids
    from public.trash_entries te
    where te.owner_user_id = p_owner_user_id
      and te.status = 'active'
      and te.id <> v_entry.id
      and te.target_type = 'media'
      and exists (
        select 1
        from public.media m
        where m.id = te.target_id
          and m.record_id = p_target_id
          and m.trash_entry_id = te.id
      );
  else
    if not exists (
      select 1
      from public.media m
      join public.records r on r.id = m.record_id
      join public.archives a on a.id = r.archive_id
      where m.id = p_target_id
        and m.user_id = p_owner_user_id
        and m.trash_entry_id = v_entry.id
        and m.trashed_at is not null
        and r.user_id = p_owner_user_id
        and r.trashed_at is null
        and r.trash_entry_id is null
        and a.user_id = p_owner_user_id
        and a.trashed_at is null
        and a.trash_entry_id is null
    ) then
      return query select false, 'active'::text, false, null::text, 'invalid_trash_state'::text;
      return;
    end if;

    select coalesce(array_agg(p.object_path order by p.object_path), array[]::text[])
    into v_paths
    from public.collect_record_media_deletion_paths(v_entry.parent_record_id, p_target_id) p;


    v_related_entry_ids := array[v_entry.id];
  end if;

  perform te.id
  from public.trash_entries te
  where te.id = any(v_related_entry_ids)
  order by te.id
  for update;

  update public.trash_entries te
  set
    status = 'purging',
    purging_at = now(),
    purged_at = null,
    failed_at = null,
    last_error_code = null,
    capacity_reconciliation_required = false
  where te.id = any(v_related_entry_ids)
    and te.status = 'active';

  if not exists (
    select 1
    from public.trash_entries te
    where te.id = v_entry.id
      and te.status = 'purging'
  ) then
    return query select false, 'active'::text, false, null::text, 'purge_conflict'::text;
    return;
  end if;

  v_previous_claim_sub := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', p_owner_user_id::text, true);

  if p_target_type = 'archive' then
    select d.ok, d.job_id, d.job_status, d.error_code
    into v_delete_ok, v_job_id, v_job_status, v_delete_error
    from public.request_delete_archive(p_target_id) d;
  elsif p_target_type = 'record' then
    select d.ok, d.job_id, d.job_status, d.error_code
    into v_delete_ok, v_job_id, v_job_status, v_delete_error
    from public.request_delete_record(p_target_id) d;
  else
    select d.ok, d.job_id, d.job_status, d.error_code
    into v_delete_ok, v_job_id, v_job_status, v_delete_error
    from public.request_delete_media(p_target_id) d;
  end if;

  perform set_config('request.jwt.claim.sub', coalesce(v_previous_claim_sub, ''), true);

  if not coalesce(v_delete_ok, false) or v_job_id is null then
    raise exception using errcode = 'P0001', message = coalesce(v_delete_error, 'purge_delete_request_failed');
  end if;

  foreach v_path in array v_paths loop
    perform public.private_link_or_enqueue_storage_deletion_path(v_job_id, 'media', v_path);
  end loop;

  update public.trash_entries te
  set deletion_job_id = v_job_id
  where te.id = any(v_related_entry_ids)
    and te.status = 'purging'
    and te.deletion_job_id is null;

  if exists (
    select 1
    from public.trash_entries te
    where te.id = any(v_related_entry_ids)
      and (te.status <> 'purging' or te.deletion_job_id is distinct from v_job_id)
  ) then
    raise exception using errcode = '40001', message = 'purge_job_link_conflict';
  end if;

  perform public.refresh_storage_deletion_job_status(v_job_id);

  select te.status, j.status
  into v_entry.status, v_job_status
  from public.trash_entries te
  join public.storage_deletion_jobs j on j.id = te.deletion_job_id
  where te.id = v_entry.id;

  return query select true, v_entry.status, false, v_job_status, null::text;
end;
$$;

revoke all on function public.request_purge_trash_entry(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.request_purge_trash_entry(uuid, text, uuid)
  to service_role;

comment on function public.request_purge_trash_entry(uuid, text, uuid) is
  'Service-role purge orchestration for one verified active root trash entry. Atomically transitions state, deletes business rows, links physical deletion work, and retains a tombstone.';

-- The legacy request functions remain database-internal compatibility helpers
-- for the orchestrator. No API role can call them directly to bypass trash.
revoke all on function public.request_delete_archive(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.request_delete_record(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.request_delete_media(uuid)
  from public, anon, authenticated, service_role;

-- Arbitrary caller-supplied byte release is superseded by item-bound settlement.
revoke all on function public.release_storage_bytes(bigint)
  from public, anon, authenticated, service_role;
