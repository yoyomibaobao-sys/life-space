-- Upload-capacity transition stage 2.
--
-- Production runbook requirement: apply this migration only after stage 1 has
-- blocked new reservations, operators have confirmed no upload/local-to-cloud
-- task is running, and the legacy drain window has lasted at least 30 minutes.
-- This migration is atomic: on failure, maintenance remains enabled and the
-- legacy release RPC remains available to requests that started before stage 1.

alter table public.storage_upload_control
  add column if not exists transition_completed_at timestamptz;

create table public.storage_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  reserved_bytes bigint not null,
  actual_bytes bigint,
  status text not null default 'reserved',
  media_id uuid,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint storage_upload_reservations_reserved_bytes_check
    check (reserved_bytes > 0),
  constraint storage_upload_reservations_actual_bytes_check
    check (actual_bytes is null or actual_bytes >= 0),
  constraint storage_upload_reservations_status_check
    check (status in ('reserved', 'settled', 'cancelled')),
  constraint storage_upload_reservations_owner_key
    unique (id, owner_user_id),
  constraint storage_upload_reservations_state_check
    check (
      (
        status = 'reserved'
        and actual_bytes is null
        and media_id is null
        and settled_at is null
        and cancelled_at is null
      )
      or (
        status = 'settled'
        and actual_bytes is not null
        and media_id is not null
        and settled_at is not null
        and cancelled_at is null
      )
      or (
        status = 'cancelled'
        and actual_bytes is null
        and media_id is null
        and settled_at is null
        and cancelled_at is not null
      )
    )
);

create unique index storage_upload_reservations_media_uidx
  on public.storage_upload_reservations (media_id)
  where media_id is not null;

create index storage_upload_reservations_owner_status_idx
  on public.storage_upload_reservations (owner_user_id, status, created_at, id);

create table public.storage_upload_reservation_paths (
  reservation_id uuid not null,
  owner_user_id uuid not null,
  object_path text not null,
  path_kind text not null,
  reserved_bytes bigint not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,
  primary key (reservation_id, path_kind),
  constraint storage_upload_reservation_paths_owner_fkey
    foreign key (reservation_id, owner_user_id)
    references public.storage_upload_reservations(id, owner_user_id)
    on delete cascade,
  constraint storage_upload_reservation_paths_kind_check
    check (path_kind in ('main', 'thumb')),
  constraint storage_upload_reservation_paths_bytes_check
    check (reserved_bytes > 0),
  constraint storage_upload_reservation_paths_path_check
    check (
      object_path = btrim(object_path)
      and object_path <> ''
      and left(object_path, 1) <> '/'
      and object_path !~* '^https?://'
    ),
  constraint storage_upload_reservation_paths_state_check
    check ((active and deactivated_at is null) or (not active and deactivated_at is not null))
);

create unique index storage_upload_reservation_paths_active_owner_path_uidx
  on public.storage_upload_reservation_paths (owner_user_id, object_path)
  where active;

alter table public.storage_upload_reservations enable row level security;
alter table public.storage_upload_reservation_paths enable row level security;

revoke all on table public.storage_upload_reservations from public, anon, authenticated;
revoke all on table public.storage_upload_reservation_paths from public, anon, authenticated;
grant all on table public.storage_upload_reservations to service_role;
grant all on table public.storage_upload_reservation_paths to service_role;

alter table public.media
  add column upload_reservation_id uuid;

alter table public.media
  add constraint media_upload_reservation_owner_fkey
  foreign key (upload_reservation_id, user_id)
  references public.storage_upload_reservations(id, owner_user_id)
  on delete restrict;

create unique index media_upload_reservation_uidx
  on public.media (upload_reservation_id)
  where upload_reservation_id is not null;

create or replace function public.can_upload_reserved_media_object(
  p_object_name text,
  p_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.storage_upload_reservation_paths rp
    join public.storage_upload_reservations r on r.id = rp.reservation_id
    where rp.owner_user_id = auth.uid()
      and r.owner_user_id = auth.uid()
      and r.status = 'reserved'
      and rp.active
      and rp.object_path = p_object_name
      and coalesce(p_metadata->>'size', '') ~ '^[0-9]+$'
      and (p_metadata->>'size')::bigint <= rp.reserved_bytes
  );
$$;

revoke all on function public.can_upload_reserved_media_object(text, jsonb) from public, anon;
grant execute on function public.can_upload_reserved_media_object(text, jsonb) to authenticated;

drop policy if exists media_insert_own_path on storage.objects;
create policy media_insert_own_path
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_upload_reserved_media_object(name, metadata)
);

drop policy if exists media_update_own_path on storage.objects;
create policy media_update_own_path
on storage.objects for update
to authenticated
using (
  bucket_id = 'media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_access_active_owned_media_object(name)
)
with check (
  bucket_id = 'media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_upload_reserved_media_object(name, metadata)
);

create or replace function public.private_owned_media_object_size(
  p_owner_user_id uuid,
  p_object_path text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_size bigint;
begin
  if p_owner_user_id is null
     or p_object_path is null
     or p_object_path <> btrim(p_object_path)
     or p_object_path = ''
     or left(p_object_path, 1) = '/'
     or p_object_path ~* '^https?://'
     or split_part(p_object_path, '/', 1) <> p_owner_user_id::text then
    raise exception using errcode = '22023', message = 'invalid_storage_object_path';
  end if;

  select (o.metadata->>'size')::bigint
  into v_size
  from storage.objects o
  where o.bucket_id = 'media'
    and o.name = p_object_path
    and o.owner_id::text = p_owner_user_id::text
    and coalesce(o.metadata->>'size', '') ~ '^[0-9]+$';

  if v_size is null or v_size < 0 then
    raise exception using errcode = 'P0001', message = 'storage_object_metadata_unavailable';
  end if;

  return v_size;
end;
$$;

revoke all on function public.private_owned_media_object_size(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.private_settle_storage_upload_reservation(
  p_reservation_id uuid,
  p_owner_user_id uuid,
  p_media_id uuid,
  p_storage_path text,
  p_thumb_path text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.storage_upload_reservations%rowtype;
  v_main_path public.storage_upload_reservation_paths%rowtype;
  v_thumb_path public.storage_upload_reservation_paths%rowtype;
  v_main_bytes bigint;
  v_thumb_bytes bigint := 0;
  v_actual_bytes bigint;
  v_refund_bytes bigint;
begin
  if p_reservation_id is null or p_owner_user_id is null or p_media_id is null then
    raise exception using errcode = '22023', message = 'reservation_owner_and_media_required';
  end if;

  select r.*
  into v_reservation
  from public.storage_upload_reservations r
  where r.id = p_reservation_id
    and r.owner_user_id = p_owner_user_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'reservation_not_found_or_forbidden';
  end if;

  if v_reservation.status = 'settled' then
    if v_reservation.media_id is distinct from p_media_id then
      raise exception using errcode = '23505', message = 'reservation_already_settled';
    end if;
    return v_reservation.actual_bytes;
  end if;

  if v_reservation.status <> 'reserved' then
    raise exception using errcode = '55000', message = 'reservation_not_settleable';
  end if;

  select rp.*
  into v_main_path
  from public.storage_upload_reservation_paths rp
  where rp.reservation_id = p_reservation_id
    and rp.owner_user_id = p_owner_user_id
    and rp.path_kind = 'main'
    and rp.active;

  if not found or v_main_path.object_path is distinct from nullif(btrim(p_storage_path), '') then
    raise exception using errcode = '22023', message = 'reservation_main_path_mismatch';
  end if;

  select rp.*
  into v_thumb_path
  from public.storage_upload_reservation_paths rp
  where rp.reservation_id = p_reservation_id
    and rp.owner_user_id = p_owner_user_id
    and rp.path_kind = 'thumb'
    and rp.active;

  if p_thumb_path is not null then
    if not found or v_thumb_path.object_path is distinct from nullif(btrim(p_thumb_path), '') then
      raise exception using errcode = '22023', message = 'reservation_thumb_path_mismatch';
    end if;
  elsif found and v_thumb_path.path_kind is distinct from 'thumb' then
    raise exception using errcode = '22023', message = 'reservation_thumb_state_invalid';
  end if;

  v_main_bytes := public.private_owned_media_object_size(
    p_owner_user_id,
    v_main_path.object_path
  );

  if v_main_bytes > v_main_path.reserved_bytes then
    raise exception using errcode = '22003', message = 'main_object_exceeds_reservation';
  end if;

  if p_thumb_path is not null then
    v_thumb_bytes := public.private_owned_media_object_size(
      p_owner_user_id,
      v_thumb_path.object_path
    );
    if v_thumb_bytes > v_thumb_path.reserved_bytes then
      raise exception using errcode = '22003', message = 'thumb_object_exceeds_reservation';
    end if;
  end if;

  v_actual_bytes := v_main_bytes + v_thumb_bytes;
  if v_actual_bytes > v_reservation.reserved_bytes then
    raise exception using errcode = '22003', message = 'objects_exceed_reservation';
  end if;

  perform 1
  from public.profiles p
  where p.id = p_owner_user_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'reservation_profile_missing';
  end if;

  v_refund_bytes := v_reservation.reserved_bytes - v_actual_bytes;

  update public.profiles p
  set
    storage_used = greatest(coalesce(p.storage_used, 0) - v_refund_bytes, 0),
    updated_at = now()
  where p.id = p_owner_user_id;

  update public.storage_upload_reservations r
  set
    status = 'settled',
    actual_bytes = v_actual_bytes,
    media_id = p_media_id,
    settled_at = now(),
    updated_at = now()
  where r.id = p_reservation_id
    and r.status = 'reserved';

  if not found then
    raise exception using errcode = '40001', message = 'reservation_settlement_conflict';
  end if;

  update public.storage_upload_reservation_paths rp
  set active = false, deactivated_at = now()
  where rp.reservation_id = p_reservation_id
    and rp.active;

  return v_actual_bytes;
end;
$$;

revoke all on function public.private_settle_storage_upload_reservation(uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.settle_media_upload_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual_bytes bigint;
  v_reserved_thumb_path text;
begin
  if new.upload_reservation_id is null then
    if auth.uid() is not null then
      raise exception using errcode = '42501', message = 'upload_reservation_required';
    end if;
    return new;
  end if;

  if new.user_id is null then
    raise exception using errcode = '22023', message = 'media_owner_required';
  end if;

  if auth.uid() is not null and auth.uid() is distinct from new.user_id then
    raise exception using errcode = '42501', message = 'media_owner_mismatch';
  end if;

  if not exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = new.record_id
      and r.user_id = new.user_id
      and r.trashed_at is null
      and a.user_id = new.user_id
      and a.trashed_at is null
  ) then
    raise exception using errcode = '42501', message = 'active_owned_record_required';
  end if;

  if new.thumb_path is null then
    select rp.object_path
    into v_reserved_thumb_path
    from public.storage_upload_reservation_paths rp
    join storage.objects o
      on o.bucket_id = 'media'
     and o.name = rp.object_path
     and o.owner_id::text = new.user_id::text
    where rp.reservation_id = new.upload_reservation_id
      and rp.owner_user_id = new.user_id
      and rp.path_kind = 'thumb'
      and rp.active;

    if found then
      new.thumb_path := v_reserved_thumb_path;
    end if;
  end if;

  v_actual_bytes := public.private_settle_storage_upload_reservation(
    new.upload_reservation_id,
    new.user_id,
    new.id,
    new.storage_path,
    new.thumb_path
  );

  new.size_bytes := v_actual_bytes;
  new.size_mb := v_actual_bytes::numeric / (1024 * 1024);
  return new;
end;
$$;

revoke all on function public.settle_media_upload_reservation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_media_settle_upload_reservation on public.media;
create trigger trg_media_settle_upload_reservation
before insert on public.media
for each row execute function public.settle_media_upload_reservation();

create or replace function public.prevent_media_upload_reservation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.upload_reservation_id is distinct from old.upload_reservation_id then
    raise exception using errcode = '42501', message = 'upload_reservation_is_immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_media_upload_reservation_change()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_media_upload_reservation_immutable on public.media;
create trigger trg_media_upload_reservation_immutable
before update of upload_reservation_id on public.media
for each row execute function public.prevent_media_upload_reservation_change();

drop policy if exists media_insert_own_active_record on public.media;
create policy media_insert_own_active_record
on public.media for insert
to authenticated
with check (
  auth.uid() = user_id
  and upload_reservation_id is not null
  and public.is_user_membership_active(auth.uid())
  and trashed_at is null
  and trash_entry_id is null
  and exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = media.record_id
      and r.user_id = auth.uid()
      and r.trashed_at is null
      and a.user_id = auth.uid()
      and a.trashed_at is null
  )
);

create or replace function public.reserve_storage_upload(
  p_reservation_id uuid,
  p_storage_path text,
  p_storage_bytes bigint,
  p_thumb_path text default null,
  p_thumb_bytes bigint default 0
)
returns table (
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation public.storage_upload_reservations%rowtype;
  v_storage_path text := nullif(btrim(p_storage_path), '');
  v_thumb_path text := nullif(btrim(p_thumb_path), '');
  v_storage_bytes bigint := coalesce(p_storage_bytes, 0);
  v_thumb_bytes bigint := coalesce(p_thumb_bytes, 0);
  v_reserved_bytes bigint;
  v_used bigint := 0;
  v_limit bigint := 0;
  v_accepting boolean := false;
begin
  if v_user_id is null then
    return query select false, null::uuid, null::text, 0::bigint, null::bigint,
      0::bigint, 0::bigint, 0::bigint, 'not_authenticated'::text;
    return;
  end if;

  v_limit := coalesce(public.get_user_storage_limit_bytes(v_user_id), 0);

  select c.accepting_new_reservations
  into v_accepting
  from public.storage_upload_control c
  where c.singleton;

  select coalesce(p.storage_used, 0)
  into v_used
  from public.profiles p
  where p.id = v_user_id;

  if not coalesce(v_accepting, false) then
    return query select false, null::uuid, null::text, 0::bigint, null::bigint,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'upload_maintenance'::text;
    return;
  end if;

  if p_reservation_id is null
     or v_storage_path is null
     or v_storage_bytes <= 0
     or left(v_storage_path, 1) = '/'
     or v_storage_path ~* '^https?://'
     or split_part(v_storage_path, '/', 1) <> v_user_id::text
     or (
       (v_thumb_path is null and v_thumb_bytes <> 0)
       or (v_thumb_path is not null and v_thumb_bytes <= 0)
     )
     or (
       v_thumb_path is not null
       and (
         left(v_thumb_path, 1) = '/'
         or v_thumb_path ~* '^https?://'
         or split_part(v_thumb_path, '/', 1) <> v_user_id::text
         or v_thumb_path = v_storage_path
       )
     ) then
    return query select false, null::uuid, null::text, 0::bigint, null::bigint,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'invalid_reservation'::text;
    return;
  end if;

  v_reserved_bytes := v_storage_bytes + v_thumb_bytes;

  if not public.is_user_membership_active(v_user_id) then
    return query select false, null::uuid, null::text, v_reserved_bytes, null::bigint,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'membership_inactive'::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storage-upload-owner:' || v_user_id::text, 0)
  );

  select r.*
  into v_reservation
  from public.storage_upload_reservations r
  where r.id = p_reservation_id
  for update;

  if found then
    select coalesce(p.storage_used, 0)
    into v_used
    from public.profiles p
    where p.id = v_user_id
    for update;

    if v_reservation.owner_user_id is distinct from v_user_id
       or v_reservation.reserved_bytes is distinct from v_reserved_bytes
       or not exists (
         select 1
         from public.storage_upload_reservation_paths rp
         where rp.reservation_id = v_reservation.id
           and rp.owner_user_id = v_user_id
           and rp.path_kind = 'main'
           and rp.object_path = v_storage_path
           and rp.reserved_bytes = v_storage_bytes
       )
       or (
         v_thumb_path is null
         and exists (
           select 1
           from public.storage_upload_reservation_paths rp
           where rp.reservation_id = v_reservation.id
             and rp.path_kind = 'thumb'
         )
       )
       or (
         v_thumb_path is not null
         and not exists (
           select 1
           from public.storage_upload_reservation_paths rp
           where rp.reservation_id = v_reservation.id
             and rp.owner_user_id = v_user_id
             and rp.path_kind = 'thumb'
             and rp.object_path = v_thumb_path
             and rp.reserved_bytes = v_thumb_bytes
         )
       ) then
      return query select false, null::uuid, null::text, v_reserved_bytes, null::bigint,
        coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
        'reservation_conflict'::text;
      return;
    end if;

    if v_reservation.status = 'reserved' then
      return query select true, v_reservation.id, v_reservation.status,
        v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
        greatest(v_limit - coalesce(v_used, 0), 0), 'already_reserved'::text;
    elsif v_reservation.status = 'settled' then
      return query select false, v_reservation.id, v_reservation.status,
        v_reservation.reserved_bytes, v_reservation.actual_bytes, coalesce(v_used, 0), v_limit,
        greatest(v_limit - coalesce(v_used, 0), 0), 'already_settled'::text;
    else
      return query select false, v_reservation.id, v_reservation.status,
        v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
        greatest(v_limit - coalesce(v_used, 0), 0), 'already_cancelled'::text;
    end if;
    return;
  end if;

  select coalesce(p.storage_used, 0)
  into v_used
  from public.profiles p
  where p.id = v_user_id
  for update;

  if not found then
    return query select false, null::uuid, null::text, v_reserved_bytes, null::bigint,
      0::bigint, v_limit, v_limit, 'profile_missing'::text;
    return;
  end if;

  if v_used + v_reserved_bytes > v_limit then
    return query select false, null::uuid, null::text, v_reserved_bytes, null::bigint,
      v_used, v_limit, greatest(v_limit - v_used, 0), 'storage_limit_exceeded'::text;
    return;
  end if;

  if exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'media'
      and o.name = any(
        array_remove(array[v_storage_path, v_thumb_path], null::text)
      )
  ) or exists (
    select 1
    from public.get_referenced_storage_paths(
      'media',
      array_remove(array[v_storage_path, v_thumb_path], null::text)
    )
  ) then
    return query select false, null::uuid, null::text, v_reserved_bytes, null::bigint,
      v_used, v_limit, greatest(v_limit - v_used, 0), 'storage_path_in_use'::text;
    return;
  end if;

  insert into public.storage_upload_reservations (
    id,
    owner_user_id,
    reserved_bytes
  ) values (
    p_reservation_id,
    v_user_id,
    v_reserved_bytes
  );

  insert into public.storage_upload_reservation_paths (
    reservation_id,
    owner_user_id,
    object_path,
    path_kind,
    reserved_bytes
  ) values (
    p_reservation_id,
    v_user_id,
    v_storage_path,
    'main',
    v_storage_bytes
  );

  if v_thumb_path is not null then
    insert into public.storage_upload_reservation_paths (
      reservation_id,
      owner_user_id,
      object_path,
      path_kind,
      reserved_bytes
    ) values (
      p_reservation_id,
      v_user_id,
      v_thumb_path,
      'thumb',
      v_thumb_bytes
    );
  end if;

  update public.profiles p
  set
    storage_used = v_used + v_reserved_bytes,
    storage_limit = v_limit,
    updated_at = now()
  where p.id = v_user_id
  returning p.storage_used into v_used;

  return query select true, p_reservation_id, 'reserved'::text, v_reserved_bytes, null::bigint,
    v_used, v_limit, greatest(v_limit - v_used, 0), 'reserved'::text;
end;
$$;

create or replace function public.cancel_storage_upload_reservation(
  p_reservation_id uuid
)
returns table (
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation public.storage_upload_reservations%rowtype;
  v_used bigint := 0;
  v_limit bigint := 0;
begin
  if v_user_id is null then
    return query select false, null::uuid, null::text, 0::bigint, null::bigint,
      0::bigint, 0::bigint, 0::bigint, 'not_authenticated'::text;
    return;
  end if;

  v_limit := coalesce(public.get_user_storage_limit_bytes(v_user_id), 0);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storage-upload-owner:' || v_user_id::text, 0)
  );

  select r.*
  into v_reservation
  from public.storage_upload_reservations r
  where r.id = p_reservation_id
    and r.owner_user_id = v_user_id
  for update;

  select coalesce(p.storage_used, 0)
  into v_used
  from public.profiles p
  where p.id = v_user_id
  for update;

  if v_reservation.id is null then
    return query select false, null::uuid, null::text, 0::bigint, null::bigint,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'not_found_or_forbidden'::text;
    return;
  end if;

  if v_reservation.status = 'cancelled' then
    return query select true, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
      greatest(v_limit - coalesce(v_used, 0), 0), 'already_cancelled'::text;
    return;
  end if;

  if v_reservation.status = 'settled' then
    return query select false, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, v_reservation.actual_bytes, coalesce(v_used, 0), v_limit,
      greatest(v_limit - coalesce(v_used, 0), 0), 'already_settled'::text;
    return;
  end if;

  if exists (
    select 1
    from public.media m
    where m.upload_reservation_id = v_reservation.id
  ) then
    return query select false, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
      greatest(v_limit - coalesce(v_used, 0), 0), 'reservation_has_media'::text;
    return;
  end if;

  if exists (
    select 1
    from public.storage_upload_reservation_paths rp
    join storage.objects o
      on o.bucket_id = 'media'
     and o.name = rp.object_path
    where rp.reservation_id = v_reservation.id
      and rp.active
  ) then
    return query select false, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
      greatest(v_limit - coalesce(v_used, 0), 0), 'storage_cleanup_required'::text;
    return;
  end if;

  update public.storage_upload_reservations r
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where r.id = v_reservation.id
    and r.status = 'reserved';

  if not found then
    raise exception using errcode = '40001', message = 'reservation_cancellation_conflict';
  end if;

  update public.storage_upload_reservation_paths rp
  set active = false, deactivated_at = now()
  where rp.reservation_id = v_reservation.id
    and rp.active;

  update public.profiles p
  set
    storage_used = greatest(coalesce(p.storage_used, 0) - v_reservation.reserved_bytes, 0),
    updated_at = now()
  where p.id = v_user_id
  returning p.storage_used into v_used;

  return query select true, v_reservation.id, 'cancelled'::text,
    v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
    greatest(v_limit - coalesce(v_used, 0), 0), 'cancelled'::text;
end;
$$;

create or replace function public.settle_storage_upload_reservation(
  p_reservation_id uuid,
  p_media_id uuid
)
returns table (
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation public.storage_upload_reservations%rowtype;
  v_media public.media%rowtype;
  v_actual_bytes bigint;
  v_used bigint := 0;
  v_limit bigint := 0;
begin
  if v_user_id is null then
    return query select false, null::uuid, null::text, 0::bigint, null::bigint,
      0::bigint, 0::bigint, 0::bigint, 'not_authenticated'::text;
    return;
  end if;

  v_limit := coalesce(public.get_user_storage_limit_bytes(v_user_id), 0);

  select r.*
  into v_reservation
  from public.storage_upload_reservations r
  where r.id = p_reservation_id
    and r.owner_user_id = v_user_id;

  select coalesce(p.storage_used, 0)
  into v_used
  from public.profiles p
  where p.id = v_user_id;

  if v_reservation.id is null then
    return query select false, null::uuid, null::text, 0::bigint, null::bigint,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'not_found_or_forbidden'::text;
    return;
  end if;

  if v_reservation.status = 'cancelled' then
    return query select false, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
      greatest(v_limit - coalesce(v_used, 0), 0), 'already_cancelled'::text;
    return;
  end if;

  if v_reservation.status = 'reserved' then
    select m.*
    into v_media
    from public.media m
    where m.id = p_media_id
      and m.user_id = v_user_id
      and m.upload_reservation_id = v_reservation.id;

    if not found then
      return query select false, v_reservation.id, v_reservation.status,
        v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
        greatest(v_limit - coalesce(v_used, 0), 0), 'media_not_found_or_forbidden'::text;
      return;
    end if;

    v_actual_bytes := public.private_settle_storage_upload_reservation(
      v_reservation.id,
      v_user_id,
      v_media.id,
      v_media.storage_path,
      v_media.thumb_path
    );

    update public.media m
    set
      size_bytes = v_actual_bytes,
      size_mb = v_actual_bytes::numeric / (1024 * 1024)
    where m.id = v_media.id;

    select r.* into v_reservation
    from public.storage_upload_reservations r
    where r.id = p_reservation_id;

    select coalesce(p.storage_used, 0) into v_used
    from public.profiles p where p.id = v_user_id;
  elsif v_reservation.media_id is distinct from p_media_id then
    return query select false, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, v_reservation.actual_bytes, coalesce(v_used, 0), v_limit,
      greatest(v_limit - coalesce(v_used, 0), 0), 'reservation_media_mismatch'::text;
    return;
  end if;

  return query select true, v_reservation.id, v_reservation.status,
    v_reservation.reserved_bytes, v_reservation.actual_bytes, coalesce(v_used, 0), v_limit,
    greatest(v_limit - coalesce(v_used, 0), 0), 'settled'::text;
end;
$$;

revoke all on function public.reserve_storage_upload(uuid, text, bigint, text, bigint)
  from public, anon, service_role;
grant execute on function public.reserve_storage_upload(uuid, text, bigint, text, bigint)
  to authenticated;

revoke all on function public.cancel_storage_upload_reservation(uuid)
  from public, anon, service_role;
grant execute on function public.cancel_storage_upload_reservation(uuid)
  to authenticated;

revoke all on function public.settle_storage_upload_reservation(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.settle_storage_upload_reservation(uuid, uuid)
  to authenticated;

-- Legacy byte-only APIs are retired only after the secure replacement exists.
revoke all on function public.reserve_storage_bytes(bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.release_storage_bytes(bigint)
  from public, anon, authenticated, service_role;

update public.storage_upload_control
set
  accepting_new_reservations = false,
  transition_completed_at = now(),
  updated_at = now()
where singleton;

comment on table public.storage_upload_reservations is
  'Server-only upload-capacity reservations. Each reservation is owned, single-use, and settled by trusted Storage metadata.';
comment on table public.storage_upload_reservation_paths is
  'Server-only per-object reservation limits used by Storage RLS and settlement.';
comment on function public.reserve_storage_upload(uuid, text, bigint, text, bigint) is
  'Authenticated upload reservation bound to current auth.uid(), exact object paths, and per-path byte ceilings.';
comment on function public.cancel_storage_upload_reservation(uuid) is
  'Idempotently cancels the current user reserved upload only after all reserved Storage paths are absent.';
comment on function public.settle_storage_upload_reservation(uuid, uuid) is
  'Idempotently confirms media-bound settlement; trusted bytes are finalized atomically by the media insert trigger.';
