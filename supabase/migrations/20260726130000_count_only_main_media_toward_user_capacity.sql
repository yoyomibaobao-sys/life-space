-- User-visible cloud capacity counts final main media objects only.
-- Thumbnails remain validated, stored, deleted, and physically measured, but
-- they no longer reserve, consume, or refund profiles.storage_used.

alter table public.storage_deletion_items
  add column capacity_kind text not null default 'unclassified',
  add column capacity_bytes bigint default 0;

alter table public.storage_deletion_items
  add constraint storage_deletion_items_capacity_kind_check
    check (capacity_kind in ('main', 'thumb', 'unclassified')),
  add constraint storage_deletion_items_capacity_bytes_check
    check (capacity_bytes is null or capacity_bytes >= 0),
  add constraint storage_deletion_items_non_main_capacity_check
    check (capacity_kind = 'main' or capacity_bytes is not distinct from 0);

comment on column public.storage_deletion_items.size_bytes is
  'Trusted physical Storage object bytes, including thumbnails, for deletion and platform cost accounting.';
comment on column public.storage_deletion_items.capacity_kind is
  'Billing role captured before business references disappear. Only main objects affect user-visible capacity.';
comment on column public.storage_deletion_items.capacity_bytes is
  'User-visible capacity to release after deletion. Main objects use trusted physical bytes; thumbnails and unclassified objects use zero.';

create or replace function public.private_storage_user_capacity_kind(
  p_owner_user_id uuid,
  p_bucket_id text,
  p_object_path text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path text := nullif(btrim(p_object_path), '');
begin
  if p_owner_user_id is null
     or p_bucket_id <> 'media'
     or v_path is null then
    return 'unclassified';
  end if;

  if exists (
    select 1
    from public.media m
    where m.user_id = p_owner_user_id
      and (
        nullif(btrim(m.storage_path), '') = v_path
        or public.media_object_path_from_public_url(m.url) = v_path
      )
    union all
    select 1
    from public.records r
    where r.user_id = p_owner_user_id
      and (
        nullif(btrim(r.primary_image_path), '') = v_path
        or public.media_object_path_from_public_url(r.primary_image_url) = v_path
      )
    union all
    select 1
    from public.archives a
    where a.user_id = p_owner_user_id
      and (
        nullif(btrim(a.cover_image_path), '') = v_path
        or public.media_object_path_from_public_url(a.cover_image_url) = v_path
      )
    union all
    select 1
    from public.market_media mm
    where mm.user_id = p_owner_user_id
      and (
        nullif(btrim(mm.path), '') = v_path
        or public.media_object_path_from_public_url(mm.url) = v_path
      )
    union all
    select 1
    from public.market_posts mp
    where mp.user_id = p_owner_user_id
      and (
        nullif(btrim(mp.cover_image_path), '') = v_path
        or public.media_object_path_from_public_url(mp.cover_image_url) = v_path
      )
    union all
    select 1
    from public.storage_upload_reservation_paths rp
    join public.storage_upload_reservations r
      on r.id = rp.reservation_id
    where rp.owner_user_id = p_owner_user_id
      and r.owner_user_id = p_owner_user_id
      and r.status in ('reserved', 'settled')
      and rp.object_path = v_path
      and rp.path_kind = 'main'
    union all
    select 1
    from public.storage_deletion_items i
    join public.storage_deletion_jobs j on j.id = i.job_id
    where j.owner_user_id = p_owner_user_id
      and i.bucket_id = p_bucket_id
      and i.object_path = v_path
      and i.capacity_kind = 'main'
  ) then
    return 'main';
  end if;

  if exists (
    select 1
    from public.media m
    where m.user_id = p_owner_user_id
      and (
        nullif(btrim(m.thumb_path), '') = v_path
        or public.media_object_path_from_public_url(m.thumb_url) = v_path
      )
    union all
    select 1
    from public.records r
    where r.user_id = p_owner_user_id
      and nullif(btrim(r.primary_thumb_path), '') = v_path
    union all
    select 1
    from public.archives a
    where a.user_id = p_owner_user_id
      and nullif(btrim(a.cover_thumb_path), '') = v_path
    union all
    select 1
    from public.market_media mm
    where mm.user_id = p_owner_user_id
      and (
        nullif(btrim(mm.thumb_path), '') = v_path
        or public.media_object_path_from_public_url(mm.thumb_url) = v_path
      )
    union all
    select 1
    from public.market_posts mp
    where mp.user_id = p_owner_user_id
      and (
        nullif(btrim(mp.cover_thumb_path), '') = v_path
        or public.media_object_path_from_public_url(mp.cover_thumb_url) = v_path
      )
    union all
    select 1
    from public.storage_upload_reservation_paths rp
    join public.storage_upload_reservations r
      on r.id = rp.reservation_id
    where rp.owner_user_id = p_owner_user_id
      and r.owner_user_id = p_owner_user_id
      and r.status in ('reserved', 'settled')
      and rp.object_path = v_path
      and rp.path_kind = 'thumb'
    union all
    select 1
    from public.storage_deletion_items i
    join public.storage_deletion_jobs j on j.id = i.job_id
    where j.owner_user_id = p_owner_user_id
      and i.bucket_id = p_bucket_id
      and i.object_path = v_path
      and i.capacity_kind = 'thumb'
  ) then
    return 'thumb';
  end if;

  return 'unclassified';
end;
$$;

revoke all on function public.private_storage_user_capacity_kind(uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.private_prepare_storage_deletion_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_user_id uuid;
  v_detected_kind text;
begin
  select j.owner_user_id
  into v_owner_user_id
  from public.storage_deletion_jobs j
  where j.id = new.job_id;

  if not found then
    raise exception using errcode = '23503', message = 'storage_deletion_job_missing';
  end if;

  v_detected_kind := public.private_storage_user_capacity_kind(
    v_owner_user_id,
    new.bucket_id,
    new.object_path
  );

  if tg_op = 'INSERT' then
    new.capacity_kind := v_detected_kind;
  elsif old.capacity_kind = 'main' or v_detected_kind = 'main' then
    new.capacity_kind := 'main';
  elsif old.capacity_kind = 'thumb' or v_detected_kind = 'thumb' then
    new.capacity_kind := 'thumb';
  else
    new.capacity_kind := 'unclassified';
  end if;

  new.capacity_bytes := case
    when new.capacity_kind = 'main' then new.size_bytes
    else 0
  end;

  return new;
end;
$$;

revoke all on function public.private_prepare_storage_deletion_capacity()
  from public, anon, authenticated, service_role;

create trigger storage_deletion_items_prepare_capacity
before insert or update of job_id, bucket_id, object_path, size_bytes
on public.storage_deletion_items
for each row
execute function public.private_prepare_storage_deletion_capacity();

-- Capture the billing role for retryable or retained work before reconciliation.
update public.storage_deletion_items i
set
  capacity_kind = public.private_storage_user_capacity_kind(
    j.owner_user_id,
    i.bucket_id,
    i.object_path
  ),
  capacity_bytes = case
    when public.private_storage_user_capacity_kind(
      j.owner_user_id,
      i.bucket_id,
      i.object_path
    ) = 'main' then i.size_bytes
    else 0
  end
from public.storage_deletion_jobs j
where j.id = i.job_id
  and i.capacity_released_at is null
  and i.status in (
    'pending',
    'processing',
    'retry_wait',
    'retained_shared',
    'failed'
  );

create or replace function public.reserve_storage_upload(
  p_reservation_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_target_parent_id uuid,
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
  v_target_type text := nullif(btrim(p_target_type), '');
  v_storage_path text := nullif(btrim(p_storage_path), '');
  v_thumb_path text := nullif(btrim(p_thumb_path), '');
  v_storage_bytes bigint := coalesce(p_storage_bytes, 0);
  v_thumb_bytes bigint := coalesce(p_thumb_bytes, 0);
  v_reserved_bytes bigint := v_storage_bytes + v_thumb_bytes;
  v_user_capacity_reserved_bytes bigint := v_storage_bytes;
  v_reservation public.storage_upload_reservations%rowtype;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storage-upload-owner:' || v_user_id::text, 0)
  );

  select r.*
  into v_reservation
  from public.storage_upload_reservations r
  where r.id = p_reservation_id
  for update;

  select coalesce(p.storage_used, 0)
  into v_used
  from public.profiles p
  where p.id = v_user_id
  for update;

  if v_reservation.id is not null then
    if v_reservation.owner_user_id is distinct from v_user_id
       or v_reservation.target_type is distinct from v_target_type
       or v_reservation.target_id is distinct from p_target_id
       or v_reservation.target_parent_id is distinct from p_target_parent_id
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
           select 1 from public.storage_upload_reservation_paths rp
           where rp.reservation_id = v_reservation.id and rp.path_kind = 'thumb'
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
      return query select true, v_reservation.id, v_reservation.status,
        v_reservation.reserved_bytes, v_reservation.actual_bytes,
        coalesce(v_used, 0), v_limit,
        greatest(v_limit - coalesce(v_used, 0), 0), 'already_settled'::text;
    else
      return query select false, v_reservation.id, v_reservation.status,
        v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
        greatest(v_limit - coalesce(v_used, 0), 0), 'already_cancelled'::text;
    end if;
    return;
  end if;

  select c.accepting_new_reservations
  into v_accepting
  from public.storage_upload_control c
  where c.singleton;

  if not coalesce(v_accepting, false) then
    return query select false, null::uuid, null::text, v_reserved_bytes, null::bigint,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'upload_maintenance'::text;
    return;
  end if;

  if p_reservation_id is null
     or v_target_type not in ('media', 'market_cover', 'market_media')
     or p_target_id is null
     or v_storage_path is null
     or v_storage_bytes <= 0
     or v_reserved_bytes <= 0
     or left(v_storage_path, 1) = '/'
     or v_storage_path ~* '^https?://'
     or split_part(v_storage_path, '/', 1) <> v_user_id::text
     or not public.private_storage_upload_target_path_is_valid(
       v_user_id, v_target_type, p_target_id, p_target_parent_id, v_storage_path
     )
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
         or not public.private_storage_upload_target_path_is_valid(
           v_user_id, v_target_type, p_target_id, p_target_parent_id, v_thumb_path
         )
       )
     ) then
    return query select false, null::uuid, null::text, v_reserved_bytes, null::bigint,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'invalid_reservation'::text;
    return;
  end if;

  if not public.private_validate_storage_upload_target(
    v_user_id, v_target_type, p_target_id, p_target_parent_id
  ) then
    return query select false, null::uuid, null::text, v_reserved_bytes, null::bigint,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'target_not_found_or_forbidden'::text;
    return;
  end if;

  if not public.is_user_membership_active(v_user_id) then
    return query select false, null::uuid, null::text, v_reserved_bytes, null::bigint,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'membership_inactive'::text;
    return;
  end if;

  if v_used + v_user_capacity_reserved_bytes > v_limit then
    return query select false, null::uuid, null::text, v_reserved_bytes, null::bigint,
      v_used, v_limit, greatest(v_limit - v_used, 0), 'storage_limit_exceeded'::text;
    return;
  end if;

  if exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'media'
      and o.name = any(array_remove(array[v_storage_path, v_thumb_path], null::text))
  ) or exists (
    select 1
    from public.get_referenced_storage_paths(
      'media', array_remove(array[v_storage_path, v_thumb_path], null::text)
    )
  ) then
    return query select false, null::uuid, null::text, v_reserved_bytes, null::bigint,
      v_used, v_limit, greatest(v_limit - v_used, 0), 'storage_path_in_use'::text;
    return;
  end if;

  insert into public.storage_upload_reservations (
    id, owner_user_id, reserved_bytes, target_type, target_id, target_parent_id
  ) values (
    p_reservation_id, v_user_id, v_reserved_bytes,
    v_target_type, p_target_id, p_target_parent_id
  );

  insert into public.storage_upload_reservation_paths (
    reservation_id, owner_user_id, object_path, path_kind, reserved_bytes
  ) values (
    p_reservation_id, v_user_id, v_storage_path, 'main', v_storage_bytes
  );

  if v_thumb_path is not null then
    insert into public.storage_upload_reservation_paths (
      reservation_id, owner_user_id, object_path, path_kind, reserved_bytes
    ) values (
      p_reservation_id, v_user_id, v_thumb_path, 'thumb', v_thumb_bytes
    );
  end if;

  update public.profiles p
  set
    storage_used = v_used + v_user_capacity_reserved_bytes,
    storage_limit = v_limit,
    updated_at = now()
  where p.id = v_user_id
  returning p.storage_used into v_used;

  return query select true, p_reservation_id, 'reserved'::text,
    v_reserved_bytes, null::bigint, v_used, v_limit,
    greatest(v_limit - v_used, 0), 'reserved'::text;
end;
$$;

create or replace function public.private_settle_storage_upload_reservation(
  p_reservation_id uuid,
  p_owner_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_target_parent_id uuid,
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
  v_effective_thumb_path text := nullif(btrim(p_thumb_path), '');
  v_main_bytes bigint;
  v_thumb_bytes bigint := 0;
  v_actual_bytes bigint;
  v_refund_bytes bigint;
begin
  select r.*
  into v_reservation
  from public.storage_upload_reservations r
  where r.id = p_reservation_id
    and r.owner_user_id = p_owner_user_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'reservation_not_found_or_forbidden';
  end if;

  if v_reservation.target_type is distinct from p_target_type
     or v_reservation.target_id is distinct from p_target_id
     or v_reservation.target_parent_id is distinct from p_target_parent_id then
    raise exception using errcode = '22023', message = 'reservation_target_mismatch';
  end if;

  if v_reservation.status = 'settled' then
    return v_reservation.actual_bytes;
  elsif v_reservation.status <> 'reserved' then
    raise exception using errcode = '55000', message = 'reservation_not_settleable';
  end if;

  select rp.* into v_main_path
  from public.storage_upload_reservation_paths rp
  where rp.reservation_id = p_reservation_id
    and rp.owner_user_id = p_owner_user_id
    and rp.path_kind = 'main'
    and rp.active;

  if not found or v_main_path.object_path is distinct from nullif(btrim(p_storage_path), '') then
    raise exception using errcode = '22023', message = 'reservation_main_path_mismatch';
  end if;

  select rp.* into v_thumb_path
  from public.storage_upload_reservation_paths rp
  where rp.reservation_id = p_reservation_id
    and rp.owner_user_id = p_owner_user_id
    and rp.path_kind = 'thumb'
    and rp.active;

  if v_effective_thumb_path is not null then
    if not found or v_thumb_path.object_path is distinct from v_effective_thumb_path then
      raise exception using errcode = '22023', message = 'reservation_thumb_path_mismatch';
    end if;
  elsif found and exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'media'
      and o.name = v_thumb_path.object_path
      and o.owner_id::text = p_owner_user_id::text
  ) then
    v_effective_thumb_path := v_thumb_path.object_path;
  end if;

  v_main_bytes := public.private_owned_media_object_size(
    p_owner_user_id, v_main_path.object_path
  );

  if v_effective_thumb_path is not null then
    v_thumb_bytes := public.private_owned_media_object_size(
      p_owner_user_id, v_effective_thumb_path
    );
  end if;

  if v_main_bytes > v_main_path.reserved_bytes
     or (v_effective_thumb_path is not null and v_thumb_bytes > v_thumb_path.reserved_bytes) then
    raise exception using errcode = '22003', message = 'object_exceeds_reservation';
  end if;

  v_actual_bytes := v_main_bytes + v_thumb_bytes;
  v_refund_bytes := v_main_path.reserved_bytes - v_main_bytes;

  if v_refund_bytes < 0 then
    raise exception using errcode = '22003', message = 'main_object_exceeds_reservation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storage-upload-owner:' || p_owner_user_id::text, 0)
  );

  update public.profiles p
  set
    storage_used = greatest(coalesce(p.storage_used, 0) - v_refund_bytes, 0),
    updated_at = now()
  where p.id = p_owner_user_id;

  if not found then
    raise exception using errcode = '23503', message = 'reservation_profile_missing';
  end if;

  update public.storage_upload_reservations r
  set
    status = 'settled',
    actual_bytes = v_actual_bytes,
    settled_at = now(),
    updated_at = now()
  where r.id = p_reservation_id
    and r.status = 'reserved';

  if not found then
    raise exception using errcode = '40001', message = 'reservation_settlement_conflict';
  end if;

  update public.storage_upload_reservation_paths rp
  set
    actual_bytes = case
      when rp.path_kind = 'main' then v_main_bytes
      when v_effective_thumb_path is not null then v_thumb_bytes
      else 0
    end,
    active = false,
    deactivated_at = now()
  where rp.reservation_id = p_reservation_id
    and rp.active;

  return v_actual_bytes;
end;
$$;

revoke all on function public.private_settle_storage_upload_reservation(
  uuid, uuid, text, uuid, uuid, text, text
) from public, anon, authenticated, service_role;

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
  v_main_reserved_bytes bigint;
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

  select r.* into v_reservation
  from public.storage_upload_reservations r
  where r.id = p_reservation_id and r.owner_user_id = v_user_id
  for update;

  select coalesce(p.storage_used, 0) into v_used
  from public.profiles p where p.id = v_user_id for update;

  if v_reservation.id is null then
    return query select false, null::uuid, null::text, 0::bigint, null::bigint,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'not_found_or_forbidden'::text;
    return;
  elsif v_reservation.status = 'cancelled' then
    return query select true, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
      greatest(v_limit - coalesce(v_used, 0), 0), 'already_cancelled'::text;
    return;
  elsif v_reservation.status = 'settled' then
    return query select false, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, v_reservation.actual_bytes, coalesce(v_used, 0), v_limit,
      greatest(v_limit - coalesce(v_used, 0), 0), 'already_settled'::text;
    return;
  end if;

  if exists (
    select 1
    from public.media m
    where m.upload_reservation_id = v_reservation.id
    union all
    select 1
    from public.market_media mm
    where mm.upload_reservation_id = v_reservation.id
    union all
    select 1
    from public.market_posts mp
    where mp.cover_upload_reservation_id = v_reservation.id
  ) then
    return query select false, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
      greatest(v_limit - coalesce(v_used, 0), 0), 'reservation_has_business_reference'::text;
    return;
  end if;

  if exists (
    select 1
    from public.storage_upload_reservation_paths rp
    join storage.objects o
      on o.bucket_id = 'media' and o.name = rp.object_path
    where rp.reservation_id = v_reservation.id and rp.active
  ) then
    return query select false, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
      greatest(v_limit - coalesce(v_used, 0), 0), 'storage_cleanup_required'::text;
    return;
  end if;

  select rp.reserved_bytes
  into v_main_reserved_bytes
  from public.storage_upload_reservation_paths rp
  where rp.reservation_id = v_reservation.id
    and rp.owner_user_id = v_user_id
    and rp.path_kind = 'main'
    and rp.active
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'reservation_main_path_missing';
  end if;

  update public.storage_upload_reservations r
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where r.id = v_reservation.id and r.status = 'reserved';

  update public.storage_upload_reservation_paths rp
  set active = false, deactivated_at = now()
  where rp.reservation_id = v_reservation.id and rp.active;

  update public.profiles p
  set storage_used = greatest(coalesce(p.storage_used, 0) - v_main_reserved_bytes, 0),
      updated_at = now()
  where p.id = v_user_id
  returning p.storage_used into v_used;

  return query select true, v_reservation.id, 'cancelled'::text,
    v_reservation.reserved_bytes, null::bigint, coalesce(v_used, 0), v_limit,
    greatest(v_limit - coalesce(v_used, 0), 0), 'cancelled'::text;
end;
$$;

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
    if v_item.capacity_bytes is null then
      v_requires_reconciliation := true;
    elsif v_item.capacity_bytes = 0 then
      v_capacity_released_at := now();
    else
      select j.owner_user_id
      into v_owner_user_id
      from public.storage_deletion_jobs j
      where j.id = v_item.job_id;

      if v_owner_user_id is not null then
        update public.profiles p
        set storage_used = greatest(coalesce(p.storage_used, 0) - v_item.capacity_bytes, 0)
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
  'Service-role atomic deletion completion. Physical bytes remain measured, while only captured main-image capacity is released from the owner profile.';

create or replace function public.private_link_market_storage_path(
  p_job_id uuid,
  p_object_path text,
  p_upload_reservation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_user_id uuid;
  v_item_id uuid;
  v_expected_bytes bigint;
  v_expected_kind text;
  v_item public.storage_deletion_items%rowtype;
begin
  select j.owner_user_id into v_owner_user_id
  from public.storage_deletion_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'market_deletion_job_not_found';
  end if;

  if p_upload_reservation_id is not null then
    select rp.actual_bytes, rp.path_kind
    into v_expected_bytes, v_expected_kind
    from public.storage_upload_reservation_paths rp
    join public.storage_upload_reservations r on r.id = rp.reservation_id
    where rp.reservation_id = p_upload_reservation_id
      and rp.owner_user_id = v_owner_user_id
      and rp.object_path = p_object_path
      and r.owner_user_id = v_owner_user_id
      and r.status = 'settled';

    if not found or v_expected_bytes is null then
      raise exception using errcode = '42501', message = 'market_upload_reservation_path_mismatch';
    end if;
  end if;

  v_item_id := public.private_link_or_enqueue_storage_deletion_path(
    p_job_id, 'media', p_object_path
  );

  select i.* into v_item
  from public.storage_deletion_items i
  where i.id = v_item_id
  for update;

  if v_expected_bytes is not null
     and v_item.size_bytes is distinct from v_expected_bytes then
    raise exception using errcode = '22003', message = 'market_storage_size_mismatch';
  end if;

  if v_expected_kind is not null
     and v_item.capacity_kind is distinct from v_expected_kind then
    raise exception using errcode = '23514', message = 'market_storage_capacity_kind_mismatch';
  end if;

  return v_item_id;
end;
$$;

revoke all on function public.private_link_market_storage_path(uuid, text, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.set_market_post_cover(
  p_market_post_id uuid,
  p_cover_path text,
  p_cover_thumb_path text,
  p_upload_reservation_id uuid
)
returns table (ok boolean, job_id uuid, error_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_post public.market_posts%rowtype;
  v_old_path text;
  v_old_thumb_path text;
  v_old_reservation_id uuid;
  v_job_id uuid;
  v_source_id uuid;
begin
  if v_user_id is null then
    return query select false, null::uuid, 'not_authenticated'::text;
    return;
  end if;

  select mp.* into v_post
  from public.market_posts mp
  where mp.id = p_market_post_id
  for update;

  if not found or v_post.user_id is distinct from v_user_id then
    return query select false, null::uuid, 'not_found_or_forbidden'::text;
    return;
  end if;

  if p_cover_path is null then
    if p_cover_thumb_path is not null or p_upload_reservation_id is not null then
      return query select false, null::uuid, 'invalid_cover'::text;
      return;
    end if;
  elsif p_upload_reservation_id is not null then
    if not exists (
      select 1
      from public.storage_upload_reservations r
      join public.storage_upload_reservation_paths rp
        on rp.reservation_id = r.id and rp.path_kind = 'main'
      where r.id = p_upload_reservation_id
        and r.owner_user_id = v_user_id
        and r.target_type = 'market_cover'
        and r.target_id = p_market_post_id
        and r.target_parent_id is null
        and r.status in ('reserved', 'settled')
        and rp.object_path = p_cover_path
    ) then
      return query select false, null::uuid, 'reservation_not_found_or_forbidden'::text;
      return;
    end if;
  elsif not exists (
    select 1
    from public.market_media mm
    where mm.market_post_id = p_market_post_id
      and mm.user_id = v_user_id
      and mm.path = p_cover_path
      and coalesce(mm.thumb_path, '') = coalesce(p_cover_thumb_path, '')
  ) then
    return query select false, null::uuid, 'cover_source_not_allowed'::text;
    return;
  end if;

  v_old_path := v_post.cover_image_path;
  v_old_thumb_path := v_post.cover_thumb_path;
  v_old_reservation_id := v_post.cover_upload_reservation_id;

  -- Link the old paths while their main/thumbnail roles are still present in
  -- market_posts. The queue trigger persists that role before the row changes.
  if v_old_path is not null
     and v_old_path is distinct from p_cover_path
     and not exists (
       select 1 from public.market_media mm
       where mm.path = v_old_path
     )
     and (
       v_old_reservation_id is not null
       or v_old_path like v_user_id::text || '/market/%'
     ) then
    v_source_id := coalesce(v_old_reservation_id, gen_random_uuid());
    insert into public.storage_deletion_jobs (
      owner_user_id, source_type, source_id, status
    ) values (
      v_user_id, 'market_cover', v_source_id, 'pending'
    )
    on conflict (source_type, source_id) do update
      set updated_at = now()
    returning id into v_job_id;

    perform public.private_link_market_storage_path(
      v_job_id, v_old_path, v_old_reservation_id
    );
    if v_old_thumb_path is not null then
      perform public.private_link_market_storage_path(
        v_job_id, v_old_thumb_path, v_old_reservation_id
      );
    end if;
  end if;

  perform set_config('app.market_cover_rpc', 'allowed', true);
  update public.market_posts mp
  set
    cover_image_url = null,
    cover_image_path = p_cover_path,
    cover_thumb_url = null,
    cover_thumb_path = p_cover_thumb_path,
    cover_upload_reservation_id = p_upload_reservation_id
  where mp.id = p_market_post_id;

  if v_job_id is not null then
    perform public.refresh_storage_deletion_job_status(v_job_id);
  end if;

  return query select true, v_job_id, null::text;
end;
$$;

create or replace function public.private_desired_main_storage_bytes(
  p_owner_user_id uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invalid_size_count bigint;
  v_owner_mismatch_count bigint;
  v_settled_main_bytes bigint;
  v_active_main_bytes bigint;
begin
  if p_owner_user_id is null then
    return 0;
  end if;

  with main_paths as (
    select nullif(btrim(m.storage_path), '') as object_path
    from public.media m
    where m.user_id = p_owner_user_id
    union
    select public.media_object_path_from_public_url(m.url)
    from public.media m
    where m.user_id = p_owner_user_id
    union
    select nullif(btrim(r.primary_image_path), '')
    from public.records r
    where r.user_id = p_owner_user_id
    union
    select public.media_object_path_from_public_url(r.primary_image_url)
    from public.records r
    where r.user_id = p_owner_user_id
    union
    select nullif(btrim(a.cover_image_path), '')
    from public.archives a
    where a.user_id = p_owner_user_id
    union
    select public.media_object_path_from_public_url(a.cover_image_url)
    from public.archives a
    where a.user_id = p_owner_user_id
    union
    select nullif(btrim(mm.path), '')
    from public.market_media mm
    where mm.user_id = p_owner_user_id
    union
    select public.media_object_path_from_public_url(mm.url)
    from public.market_media mm
    where mm.user_id = p_owner_user_id
    union
    select nullif(btrim(mp.cover_image_path), '')
    from public.market_posts mp
    where mp.user_id = p_owner_user_id
    union
    select public.media_object_path_from_public_url(mp.cover_image_url)
    from public.market_posts mp
    where mp.user_id = p_owner_user_id
    union
    select rp.object_path
    from public.storage_upload_reservation_paths rp
    join public.storage_upload_reservations r on r.id = rp.reservation_id
    where rp.owner_user_id = p_owner_user_id
      and r.owner_user_id = p_owner_user_id
      and r.status in ('reserved', 'settled')
      and rp.path_kind = 'main'
    union
    select i.object_path
    from public.storage_deletion_items i
    join public.storage_deletion_jobs j on j.id = i.job_id
    where j.owner_user_id = p_owner_user_id
      and i.bucket_id = 'media'
      and i.capacity_kind = 'main'
      and i.capacity_released_at is null
      and i.status in (
        'pending',
        'processing',
        'retry_wait',
        'retained_shared',
        'failed'
      )
  ),
  clean_main_paths as (
    select mp.object_path
    from main_paths mp
    where mp.object_path is not null
  ),
  active_main_paths as (
    select
      rp.object_path,
      rp.reserved_bytes
    from public.storage_upload_reservation_paths rp
    join public.storage_upload_reservations r on r.id = rp.reservation_id
    where rp.owner_user_id = p_owner_user_id
      and r.owner_user_id = p_owner_user_id
      and r.status = 'reserved'
      and rp.active
      and rp.path_kind = 'main'
  ),
  physical_main as (
    select
      o.name as object_path,
      o.owner_id::text as storage_owner_id,
      case
        when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
        then (o.metadata->>'size')::bigint
        else null
      end as size_bytes,
      amp.object_path is not null as has_active_reservation
    from clean_main_paths mp
    join storage.objects o
      on o.bucket_id = 'media'
     and o.name = mp.object_path
    left join active_main_paths amp on amp.object_path = mp.object_path
  )
  select
    count(*) filter (
      where not pm.has_active_reservation
        and pm.storage_owner_id = p_owner_user_id::text
        and pm.size_bytes is null
    ),
    count(*) filter (
      where not pm.has_active_reservation
        and pm.storage_owner_id is distinct from p_owner_user_id::text
    ),
    coalesce(sum(pm.size_bytes) filter (
      where not pm.has_active_reservation
        and pm.storage_owner_id = p_owner_user_id::text
    ), 0)::bigint,
    coalesce((
      select sum(amp.reserved_bytes)::bigint
      from active_main_paths amp
    ), 0)::bigint
  into
    v_invalid_size_count,
    v_owner_mismatch_count,
    v_settled_main_bytes,
    v_active_main_bytes
  from physical_main pm;

  if v_invalid_size_count > 0 then
    raise exception using
      errcode = '22003',
      message = 'main_storage_object_size_invalid';
  end if;

  if v_owner_mismatch_count > 0 then
    raise exception using
      errcode = '42501',
      message = 'main_storage_object_owner_mismatch';
  end if;

  return coalesce(v_settled_main_bytes, 0) + coalesce(v_active_main_bytes, 0);
end;
$$;

revoke all on function public.private_desired_main_storage_bytes(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.private_reconcile_main_only_storage_used()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_desired_bytes bigint;
  v_changed bigint := 0;
begin
  for v_profile in
    select p.id
    from public.profiles p
    order by p.id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'storage-upload-owner:' || v_profile.id::text,
        0
      )
    );

    perform 1
    from public.profiles p
    where p.id = v_profile.id
    for update;

    v_desired_bytes := public.private_desired_main_storage_bytes(v_profile.id);

    update public.profiles p
    set
      storage_used = v_desired_bytes,
      updated_at = case
        when coalesce(p.storage_used, 0) is distinct from v_desired_bytes
        then now()
        else p.updated_at
      end
    where p.id = v_profile.id
      and coalesce(p.storage_used, 0) is distinct from v_desired_bytes;

    if found then
      v_changed := v_changed + 1;
    end if;
  end loop;

  return v_changed;
end;
$$;

revoke all on function public.private_reconcile_main_only_storage_used()
  from public, anon, authenticated, service_role;

comment on function public.private_reconcile_main_only_storage_used() is
  'Owner-locking, idempotent reconciliation of profiles.storage_used from trusted current main objects and active main reservations. Thumbnails and unclassified objects are excluded.';

select public.private_reconcile_main_only_storage_used();

revoke all on function public.reserve_storage_upload(
  uuid, text, uuid, uuid, text, bigint, text, bigint
) from public, anon, service_role;
grant execute on function public.reserve_storage_upload(
  uuid, text, uuid, uuid, text, bigint, text, bigint
) to authenticated;

revoke all on function public.cancel_storage_upload_reservation(uuid)
  from public, anon, service_role;
grant execute on function public.cancel_storage_upload_reservation(uuid)
  to authenticated;

revoke all on function public.set_market_post_cover(uuid, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.set_market_post_cover(uuid, text, text, uuid)
  to authenticated;
