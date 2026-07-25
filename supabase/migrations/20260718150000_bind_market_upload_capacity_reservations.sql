-- Upload-capacity transition stage 3: bind every billed media-bucket upload to
-- its exact business target, include market assets, and route settled market
-- object removal through the existing service-role deletion worker.
--
-- This migration intentionally leaves accepting_new_reservations=false. A
-- separate post-deploy migration must reopen uploads only after reservation-
-- aware application code is live and verified.

do $$
begin
  if exists (select 1 from public.storage_upload_reservations) then
    raise exception using
      errcode = '55000',
      message = 'storage_upload_reservations_must_be_empty_during_target_binding';
  end if;
end;
$$;

drop trigger if exists trg_media_settle_upload_reservation on public.media;
drop function if exists public.settle_media_upload_reservation();
drop function if exists public.settle_storage_upload_reservation(uuid, uuid);
drop function if exists public.reserve_storage_upload(uuid, text, bigint, text, bigint);
drop function if exists public.private_settle_storage_upload_reservation(uuid, uuid, uuid, text, text);

drop index if exists public.storage_upload_reservations_media_uidx;
alter table public.storage_upload_reservations
  drop constraint if exists storage_upload_reservations_state_check;
alter table public.storage_upload_reservations
  drop column if exists media_id;
alter table public.storage_upload_reservations
  add column target_type text not null,
  add column target_id uuid not null,
  add column target_parent_id uuid;
alter table public.storage_upload_reservations
  add constraint storage_upload_reservations_target_type_check
    check (target_type in ('media', 'market_cover', 'market_media')),
  add constraint storage_upload_reservations_target_parent_check
    check (
      (target_type = 'media' and target_parent_id is not null)
      or (target_type = 'market_media' and target_parent_id is not null)
      or (target_type = 'market_cover' and target_parent_id is null)
    ),
  add constraint storage_upload_reservations_state_check
    check (
      (
        status = 'reserved'
        and actual_bytes is null
        and settled_at is null
        and cancelled_at is null
      )
      or (
        status = 'settled'
        and actual_bytes is not null
        and settled_at is not null
        and cancelled_at is null
      )
      or (
        status = 'cancelled'
        and actual_bytes is null
        and settled_at is null
        and cancelled_at is not null
      )
    );

create index storage_upload_reservations_target_idx
  on public.storage_upload_reservations (
    owner_user_id,
    target_type,
    target_id,
    created_at,
    id
  );

alter table public.storage_upload_reservation_paths
  add column actual_bytes bigint,
  add constraint storage_upload_reservation_paths_actual_bytes_check
    check (actual_bytes is null or (actual_bytes >= 0 and actual_bytes <= reserved_bytes));

alter table public.market_posts
  add column cover_upload_reservation_id uuid;
alter table public.market_posts
  add constraint market_posts_cover_upload_reservation_owner_fkey
  foreign key (cover_upload_reservation_id, user_id)
  references public.storage_upload_reservations(id, owner_user_id)
  on delete restrict;

alter table public.market_media
  add column upload_reservation_id uuid;
alter table public.market_media
  add constraint market_media_upload_reservation_owner_fkey
  foreign key (upload_reservation_id, user_id)
  references public.storage_upload_reservations(id, owner_user_id)
  on delete restrict;

create unique index market_media_upload_reservation_uidx
  on public.market_media (upload_reservation_id)
  where upload_reservation_id is not null;

alter table public.storage_deletion_jobs
  drop constraint storage_deletion_jobs_source_type_check;
alter table public.storage_deletion_jobs
  add constraint storage_deletion_jobs_source_type_check
  check (
    source_type in (
      'record',
      'archive',
      'account',
      'media',
      'market_post',
      'market_media',
      'market_cover'
    )
  );

create or replace function public.private_validate_storage_upload_target(
  p_owner_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_target_parent_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_owner_user_id is null or p_target_id is null then
    return false;
  end if;

  if p_target_type = 'media' then
    return p_target_parent_id is not null
      and not exists (select 1 from public.media m where m.id = p_target_id)
      and exists (
        select 1
        from public.records r
        join public.archives a on a.id = r.archive_id
        where r.id = p_target_parent_id
          and r.user_id = p_owner_user_id
          and r.trashed_at is null
          and a.user_id = p_owner_user_id
          and a.trashed_at is null
      );
  elsif p_target_type = 'market_cover' then
    return p_target_parent_id is null
      and exists (
        select 1
        from public.market_posts mp
        where mp.id = p_target_id
          and mp.user_id = p_owner_user_id
      );
  elsif p_target_type = 'market_media' then
    return p_target_parent_id is not null
      and not exists (select 1 from public.market_media mm where mm.id = p_target_id)
      and exists (
        select 1
        from public.market_posts mp
        where mp.id = p_target_parent_id
          and mp.user_id = p_owner_user_id
      );
  end if;

  return false;
end;
$$;

revoke all on function public.private_validate_storage_upload_target(uuid, text, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.private_storage_upload_target_path_is_valid(
  p_owner_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_target_parent_id uuid,
  p_object_path text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_target_type = 'media' then
      p_target_parent_id is not null
      and p_object_path like p_owner_user_id::text || '/' || p_target_parent_id::text || '/%'
    when p_target_type = 'market_cover' then
      p_object_path like p_owner_user_id::text || '/market/' || p_target_id::text || '/%'
    when p_target_type = 'market_media' then
      p_target_parent_id is not null
      and p_object_path like p_owner_user_id::text || '/market/' || p_target_parent_id::text || '/%'
    else false
  end;
$$;

revoke all on function public.private_storage_upload_target_path_is_valid(uuid, text, uuid, uuid, text)
  from public, anon, authenticated, service_role;

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

  if v_used + v_reserved_bytes > v_limit then
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
    storage_used = v_used + v_reserved_bytes,
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
  v_refund_bytes := v_reservation.reserved_bytes - v_actual_bytes;

  if v_refund_bytes < 0 then
    raise exception using errcode = '22003', message = 'objects_exceed_reservation';
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

  if auth.uid() is not null and auth.uid() is distinct from new.user_id then
    raise exception using errcode = '42501', message = 'media_owner_mismatch';
  end if;

  if new.thumb_path is null then
    select rp.object_path into v_reserved_thumb_path
    from public.storage_upload_reservation_paths rp
    join storage.objects o
      on o.bucket_id = 'media'
     and o.name = rp.object_path
     and o.owner_id::text = new.user_id::text
    where rp.reservation_id = new.upload_reservation_id
      and rp.owner_user_id = new.user_id
      and rp.path_kind = 'thumb'
      and rp.active;
    if found then new.thumb_path := v_reserved_thumb_path; end if;
  end if;

  v_actual_bytes := public.private_settle_storage_upload_reservation(
    new.upload_reservation_id,
    new.user_id,
    'media',
    new.id,
    new.record_id,
    new.storage_path,
    new.thumb_path
  );

  new.size_bytes := v_actual_bytes;
  new.size_mb := v_actual_bytes::numeric / (1024 * 1024);
  return new;
end;
$$;

create trigger trg_media_settle_upload_reservation
before insert on public.media
for each row execute function public.settle_media_upload_reservation();

create or replace function public.settle_market_media_upload_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved_thumb_path text;
begin
  if new.source_media_id is not null then
    if new.upload_reservation_id is not null then
      raise exception using errcode = '22023', message = 'shared_media_must_not_use_reservation';
    end if;
    return new;
  end if;

  if new.upload_reservation_id is null then
    if auth.uid() is not null then
      raise exception using errcode = '42501', message = 'upload_reservation_required';
    end if;
    return new;
  end if;

  if auth.uid() is not null and auth.uid() is distinct from new.user_id then
    raise exception using errcode = '42501', message = 'market_media_owner_mismatch';
  end if;

  if new.thumb_path is null then
    select rp.object_path into v_reserved_thumb_path
    from public.storage_upload_reservation_paths rp
    join storage.objects o
      on o.bucket_id = 'media'
     and o.name = rp.object_path
     and o.owner_id::text = new.user_id::text
    where rp.reservation_id = new.upload_reservation_id
      and rp.owner_user_id = new.user_id
      and rp.path_kind = 'thumb'
      and rp.active;
    if found then new.thumb_path := v_reserved_thumb_path; end if;
  end if;

  perform public.private_settle_storage_upload_reservation(
    new.upload_reservation_id,
    new.user_id,
    'market_media',
    new.id,
    new.market_post_id,
    new.path,
    new.thumb_path
  );
  return new;
end;
$$;

revoke all on function public.settle_market_media_upload_reservation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_market_media_settle_upload_reservation on public.market_media;
create trigger trg_market_media_settle_upload_reservation
before insert on public.market_media
for each row execute function public.settle_market_media_upload_reservation();

create or replace function public.prevent_market_media_upload_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.upload_reservation_id is distinct from old.upload_reservation_id
     or new.path is distinct from old.path
     or new.thumb_path is distinct from old.thumb_path then
    raise exception using errcode = '42501', message = 'market_media_upload_identity_is_immutable';
  end if;

  if new.source_media_id is distinct from old.source_media_id
     and not (
       old.source_media_id is not null
       and new.source_media_id is null
       and pg_catalog.pg_trigger_depth() > 1
     ) then
    raise exception using errcode = '42501', message = 'market_media_upload_identity_is_immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_market_media_upload_identity_change()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_market_media_upload_identity_immutable on public.market_media;
create trigger trg_market_media_upload_identity_immutable
before update of upload_reservation_id, path, thumb_path, source_media_id
on public.market_media
for each row execute function public.prevent_market_media_upload_identity_change();

create or replace function public.settle_market_cover_upload_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved_thumb_path text;
  v_cover_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.cover_image_path is null
       and new.cover_thumb_path is null
       and new.cover_upload_reservation_id is null then
      return new;
    end if;
    v_cover_changed := true;
  else
    v_cover_changed := new.cover_image_path is distinct from old.cover_image_path
      or new.cover_thumb_path is distinct from old.cover_thumb_path
      or new.cover_upload_reservation_id is distinct from old.cover_upload_reservation_id;
  end if;

  if not v_cover_changed then return new; end if;

  if auth.uid() is not null
     and coalesce(current_setting('app.market_cover_rpc', true), '') <> 'allowed' then
    raise exception using errcode = '42501', message = 'market_cover_rpc_required';
  end if;

  if new.cover_image_path is null then
    if new.cover_thumb_path is not null or new.cover_upload_reservation_id is not null then
      raise exception using errcode = '22023', message = 'invalid_empty_market_cover';
    end if;
    return new;
  end if;

  if new.cover_upload_reservation_id is not null then
    if new.cover_thumb_path is null then
      select rp.object_path into v_reserved_thumb_path
      from public.storage_upload_reservation_paths rp
      join storage.objects o
        on o.bucket_id = 'media'
       and o.name = rp.object_path
       and o.owner_id::text = new.user_id::text
      where rp.reservation_id = new.cover_upload_reservation_id
        and rp.owner_user_id = new.user_id
        and rp.path_kind = 'thumb'
        and rp.active;
      if found then new.cover_thumb_path := v_reserved_thumb_path; end if;
    end if;

    perform public.private_settle_storage_upload_reservation(
      new.cover_upload_reservation_id,
      new.user_id,
      'market_cover',
      new.id,
      null,
      new.cover_image_path,
      new.cover_thumb_path
    );
  elsif not exists (
    select 1
    from public.market_media mm
    where mm.market_post_id = new.id
      and mm.user_id = new.user_id
      and mm.path = new.cover_image_path
      and coalesce(mm.thumb_path, '') = coalesce(new.cover_thumb_path, '')
  ) then
    raise exception using errcode = '42501', message = 'market_cover_source_not_allowed';
  end if;

  return new;
end;
$$;

revoke all on function public.settle_market_cover_upload_reservation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_market_cover_settle_upload_reservation on public.market_posts;
create trigger trg_market_cover_settle_upload_reservation
before insert or update of cover_image_path, cover_thumb_path, cover_upload_reservation_id
on public.market_posts
for each row execute function public.settle_market_cover_upload_reservation();

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

  update public.storage_upload_reservations r
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where r.id = v_reservation.id and r.status = 'reserved';

  update public.storage_upload_reservation_paths rp
  set active = false, deactivated_at = now()
  where rp.reservation_id = v_reservation.id and rp.active;

  update public.profiles p
  set storage_used = greatest(coalesce(p.storage_used, 0) - v_reservation.reserved_bytes, 0),
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
  p_target_type text,
  p_target_id uuid
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
  select r.* into v_reservation
  from public.storage_upload_reservations r
  where r.id = p_reservation_id and r.owner_user_id = v_user_id;
  select coalesce(p.storage_used, 0) into v_used
  from public.profiles p where p.id = v_user_id;

  if v_reservation.id is null then
    return query select false, null::uuid, null::text, 0::bigint, null::bigint,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'not_found_or_forbidden'::text;
    return;
  elsif v_reservation.target_type is distinct from nullif(btrim(p_target_type), '')
     or v_reservation.target_id is distinct from p_target_id then
    return query select false, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, v_reservation.actual_bytes,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'reservation_target_mismatch'::text;
    return;
  elsif v_reservation.status <> 'settled' then
    return query select false, v_reservation.id, v_reservation.status,
      v_reservation.reserved_bytes, v_reservation.actual_bytes,
      coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
      'reservation_not_settled'::text;
    return;
  end if;

  return query select true, v_reservation.id, v_reservation.status,
    v_reservation.reserved_bytes, v_reservation.actual_bytes,
    coalesce(v_used, 0), v_limit, greatest(v_limit - coalesce(v_used, 0), 0),
    'settled'::text;
end;
$$;

create or replace function public.can_delete_reserved_media_object(p_object_name text)
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
  ) and not exists (
    select 1
    from public.get_referenced_storage_paths('media', array[p_object_name])
  );
$$;

revoke all on function public.can_delete_reserved_media_object(text) from public, anon;
grant execute on function public.can_delete_reserved_media_object(text) to authenticated;

drop policy if exists media_delete_own_path on storage.objects;
create policy media_delete_own_path
on storage.objects for delete
to authenticated
using (
  bucket_id = 'media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_delete_reserved_media_object(name)
);

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
  v_billable boolean := false;
  v_expected_bytes bigint;
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
    select rp.actual_bytes
    into v_expected_bytes
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
    v_billable := true;
  elsif exists (
    select 1
    from public.storage_deletion_items i
    join public.storage_deletion_jobs j on j.id = i.job_id
    where i.bucket_id = 'media'
      and i.object_path = p_object_path
      and i.status = 'retained_shared'
      and i.size_bytes is not null
      and j.owner_user_id = v_owner_user_id
  ) then
    v_billable := true;
  end if;

  v_item_id := public.private_link_or_enqueue_storage_deletion_path(
    p_job_id, 'media', p_object_path
  );

  select i.* into v_item
  from public.storage_deletion_items i
  where i.id = v_item_id
  for update;

  if v_billable and v_expected_bytes is not null
     and v_item.size_bytes is distinct from v_expected_bytes then
    raise exception using errcode = '22003', message = 'market_storage_size_mismatch';
  elsif not v_billable
     and v_item.job_id = p_job_id
     and v_item.status in ('pending', 'processing', 'retry_wait') then
    update public.storage_deletion_items i
    set size_bytes = 0
    where i.id = v_item_id;
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

  perform set_config('app.market_cover_rpc', 'allowed', true);
  update public.market_posts mp
  set
    cover_image_url = null,
    cover_image_path = p_cover_path,
    cover_thumb_url = null,
    cover_thumb_path = p_cover_thumb_path,
    cover_upload_reservation_id = p_upload_reservation_id
  where mp.id = p_market_post_id;

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
    perform public.refresh_storage_deletion_job_status(v_job_id);
  end if;

  return query select true, v_job_id, null::text;
end;
$$;

create or replace function public.request_delete_market_media(p_market_media_id uuid)
returns table (ok boolean, job_id uuid, error_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_media public.market_media%rowtype;
  v_post public.market_posts%rowtype;
  v_next_media public.market_media%rowtype;
  v_job_id uuid;
begin
  if v_user_id is null then
    return query select false, null::uuid, 'not_authenticated'::text;
    return;
  end if;

  select j.id into v_job_id
  from public.storage_deletion_jobs j
  where j.owner_user_id = v_user_id
    and j.source_type = 'market_media'
    and j.source_id = p_market_media_id;

  if found then
    return query select true, v_job_id, null::text;
    return;
  end if;

  select mm.* into v_media
  from public.market_media mm
  where mm.id = p_market_media_id
  for update;

  if not found or v_media.user_id is distinct from v_user_id then
    return query select false, null::uuid, 'not_found_or_forbidden'::text;
    return;
  end if;

  select mp.* into v_post
  from public.market_posts mp
  where mp.id = v_media.market_post_id
  for update;

  if not found or v_post.user_id is distinct from v_user_id then
    return query select false, null::uuid, 'not_found_or_forbidden'::text;
    return;
  end if;

  if v_post.cover_image_path is not distinct from v_media.path then
    select mm.* into v_next_media
    from public.market_media mm
    where mm.market_post_id = v_media.market_post_id
      and mm.id <> v_media.id
    order by mm.sort_order, mm.created_at, mm.id
    limit 1;

    perform set_config('app.market_cover_rpc', 'allowed', true);
    update public.market_posts mp
    set
      cover_image_url = null,
      cover_image_path = v_next_media.path,
      cover_thumb_url = null,
      cover_thumb_path = v_next_media.thumb_path,
      cover_upload_reservation_id = null
    where mp.id = v_post.id;
  end if;

  insert into public.storage_deletion_jobs (
    owner_user_id, source_type, source_id, status
  ) values (
    v_user_id, 'market_media', v_media.id, 'pending'
  )
  on conflict (source_type, source_id) do update
    set updated_at = now()
  returning id into v_job_id;

  if v_media.source_media_id is null and v_media.path is not null then
    perform public.private_link_market_storage_path(
      v_job_id, v_media.path, v_media.upload_reservation_id
    );
    if v_media.thumb_path is not null then
      perform public.private_link_market_storage_path(
        v_job_id, v_media.thumb_path, v_media.upload_reservation_id
      );
    end if;
  end if;

  delete from public.market_media mm where mm.id = v_media.id;
  perform public.refresh_storage_deletion_job_status(v_job_id);

  return query select true, v_job_id, null::text;
end;
$$;

create or replace function public.request_delete_market_post(p_market_post_id uuid)
returns table (ok boolean, job_id uuid, error_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_post public.market_posts%rowtype;
  v_media public.market_media%rowtype;
  v_job_id uuid;
  v_cover_is_media boolean := false;
begin
  if v_user_id is null then
    return query select false, null::uuid, 'not_authenticated'::text;
    return;
  end if;

  select j.id into v_job_id
  from public.storage_deletion_jobs j
  where j.owner_user_id = v_user_id
    and j.source_type = 'market_post'
    and j.source_id = p_market_post_id;

  if found then
    return query select true, v_job_id, null::text;
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

  insert into public.storage_deletion_jobs (
    owner_user_id, source_type, source_id, status
  ) values (
    v_user_id, 'market_post', v_post.id, 'pending'
  )
  on conflict (source_type, source_id) do update
    set updated_at = now()
  returning id into v_job_id;

  for v_media in
    select mm.*
    from public.market_media mm
    where mm.market_post_id = v_post.id
    order by mm.id
    for update
  loop
    if v_media.path is not null
       and v_media.path is not distinct from v_post.cover_image_path then
      v_cover_is_media := true;
    end if;

    if v_media.source_media_id is null and v_media.path is not null then
      perform public.private_link_market_storage_path(
        v_job_id, v_media.path, v_media.upload_reservation_id
      );
      if v_media.thumb_path is not null then
        perform public.private_link_market_storage_path(
          v_job_id, v_media.thumb_path, v_media.upload_reservation_id
        );
      end if;
    end if;
  end loop;

  if not v_cover_is_media
     and v_post.cover_image_path is not null
     and (
       v_post.cover_upload_reservation_id is not null
       or v_post.cover_image_path like v_user_id::text || '/market/%'
     ) then
    perform public.private_link_market_storage_path(
      v_job_id, v_post.cover_image_path, v_post.cover_upload_reservation_id
    );
    if v_post.cover_thumb_path is not null then
      perform public.private_link_market_storage_path(
        v_job_id, v_post.cover_thumb_path, v_post.cover_upload_reservation_id
      );
    end if;
  end if;

  delete from public.market_posts mp where mp.id = v_post.id;
  perform public.refresh_storage_deletion_job_status(v_job_id);
  return query select true, v_job_id, null::text;
end;
$$;

drop policy if exists market_media_delete_own_post on public.market_media;
drop policy if exists market_posts_delete_own on public.market_posts;
revoke delete on table public.market_media from anon, authenticated;
revoke delete on table public.market_posts from anon, authenticated;

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

revoke all on function public.settle_storage_upload_reservation(uuid, text, uuid)
  from public, anon, service_role;
grant execute on function public.settle_storage_upload_reservation(uuid, text, uuid)
  to authenticated;

revoke all on function public.set_market_post_cover(uuid, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.set_market_post_cover(uuid, text, text, uuid)
  to authenticated;

revoke all on function public.request_delete_market_media(uuid)
  from public, anon, service_role;
grant execute on function public.request_delete_market_media(uuid)
  to authenticated;

revoke all on function public.request_delete_market_post(uuid)
  from public, anon, service_role;
grant execute on function public.request_delete_market_post(uuid)
  to authenticated;

comment on column public.market_posts.cover_upload_reservation_id is
  'Settled reservation for a standalone market cover. NULL when the cover reuses market_media or record media.';
comment on column public.market_media.upload_reservation_id is
  'Settled reservation for a market-owned upload. NULL for shared record media and pre-ledger legacy rows.';
comment on function public.set_market_post_cover(uuid, text, text, uuid) is
  'Owner-only transactional cover switch. Settles a new cover and safely queues an unreferenced old standalone cover.';
comment on function public.request_delete_market_media(uuid) is
  'Owner-only market image deletion request using trusted row paths and the service-role Storage queue.';
comment on function public.request_delete_market_post(uuid) is
  'Owner-only market post deletion request using trusted row paths and the service-role Storage queue.';

update public.storage_upload_control
set
  accepting_new_reservations = false,
  updated_at = now()
where singleton;
