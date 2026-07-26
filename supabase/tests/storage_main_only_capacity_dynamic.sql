-- LOCAL SUPABASE ONLY. Main-only capacity accounting and reconciliation.

begin;

create temporary table main_only_capacity_test_context (
  user_id uuid not null,
  archive_id uuid not null,
  record_id uuid not null,
  media_id uuid not null,
  main_path text not null,
  thumb_path text not null,
  unclassified_path text not null,
  active_reservation_id uuid not null,
  active_target_id uuid not null,
  active_main_path text not null,
  active_thumb_path text not null
);

grant select on main_only_capacity_test_context to authenticated;

insert into main_only_capacity_test_context
select
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  '',
  '',
  '',
  gen_random_uuid(),
  gen_random_uuid(),
  '',
  '';

update main_only_capacity_test_context
set
  main_path = format('%s/%s/history-main.jpg', user_id, record_id),
  thumb_path = format('%s/%s/thumbs/history-thumb.jpg', user_id, record_id),
  unclassified_path = format('%s/unclassified-physical-object.jpg', user_id),
  active_main_path = format('%s/%s/active-main.jpg', user_id, record_id),
  active_thumb_path = format('%s/%s/thumbs/active-thumb.jpg', user_id, record_id);

insert into public.users (id, username, cloud_enabled)
select user_id, 'main-only-capacity-user', true
from main_only_capacity_test_context;

insert into public.profiles (id, username, storage_used, storage_limit)
select user_id, 'main-only-capacity-user', 999, 10000
from main_only_capacity_test_context;

insert into public.user_memberships (
  user_id, plan, status, trial_started_at, trial_ends_at, storage_limit_bytes
)
select
  user_id,
  'trial',
  'trialing',
  now(),
  now() + interval '1 day',
  10000
from main_only_capacity_test_context
on conflict (user_id) do update set
  status = excluded.status,
  trial_ends_at = excluded.trial_ends_at,
  storage_limit_bytes = excluded.storage_limit_bytes;

insert into public.archives (id, user_id, title, category, is_public)
select archive_id, user_id, 'main-only archive', 'plant', false
from main_only_capacity_test_context;

insert into public.records (id, archive_id, user_id, note, visibility)
select record_id, archive_id, user_id, 'main-only record', 'private'
from main_only_capacity_test_context;

insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'media', main_path, user_id::text, '{"size":80}'::jsonb
from main_only_capacity_test_context
union all
select 'media', thumb_path, user_id::text, '{"size":20}'::jsonb
from main_only_capacity_test_context
union all
select 'media', unclassified_path, user_id::text, '{"size":30}'::jsonb
from main_only_capacity_test_context;

insert into public.media (
  id,
  record_id,
  user_id,
  type,
  storage_path,
  thumb_path,
  size_bytes,
  storage_class
)
select
  media_id,
  record_id,
  user_id,
  'image',
  main_path,
  thumb_path,
  100,
  'hot'
from main_only_capacity_test_context;

update public.storage_upload_control
set accepting_new_reservations = true
where singleton;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from main_only_capacity_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  c main_only_capacity_test_context%rowtype;
  v_result record;
begin
  select * into c from main_only_capacity_test_context;

  select * into v_result
  from public.reserve_storage_upload(
    c.active_reservation_id,
    'media',
    c.active_target_id,
    c.record_id,
    c.active_main_path,
    40,
    c.active_thumb_path,
    10
  );

  if not v_result.ok
     or v_result.reserved_bytes <> 50
     or v_result.storage_used <> 1039 then
    raise exception 'active reservation did not charge only its 40-byte main image';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

do $$
declare
  c main_only_capacity_test_context%rowtype;
  v_first_changed bigint;
  v_second_changed bigint;
begin
  select * into c from main_only_capacity_test_context;

  v_first_changed := public.private_reconcile_main_only_storage_used();
  if v_first_changed < 1
     or (select storage_used from public.profiles where id = c.user_id) <> 120 then
    raise exception 'historical reconciliation did not use main 80 + active main 40';
  end if;

  v_second_changed := public.private_reconcile_main_only_storage_used();
  if v_second_changed <> 0
     or (select storage_used from public.profiles where id = c.user_id) <> 120 then
    raise exception 'main-only reconciliation was not idempotent';
  end if;

  if (
    select sum((metadata->>'size')::bigint)
    from storage.objects
    where bucket_id = 'media'
      and owner_id::text = c.user_id::text
  ) <> 130 then
    raise exception 'test fixture physical bytes changed unexpectedly';
  end if;
end;
$$;

set local storage.allow_delete_query = 'true';

do $$
declare
  c main_only_capacity_test_context%rowtype;
  v_thumb_job uuid;
  v_thumb_item uuid;
  v_main_job uuid;
  v_main_item uuid;
  v_worker uuid := gen_random_uuid();
  v_completed boolean;
  v_profile_used bigint;
begin
  select * into c from main_only_capacity_test_context;

  insert into public.storage_deletion_jobs (
    owner_user_id, source_type, source_id, status
  ) values (
    c.user_id, 'media', gen_random_uuid(), 'pending'
  )
  returning id into v_thumb_job;

  v_thumb_item := public.private_link_or_enqueue_storage_deletion_path(
    v_thumb_job, 'media', c.thumb_path
  );

  if not exists (
    select 1
    from public.storage_deletion_items i
    where i.id = v_thumb_item
      and i.size_bytes = 20
      and i.capacity_kind = 'thumb'
      and i.capacity_bytes = 0
  ) then
    raise exception 'thumbnail deletion lost physical bytes or gained user capacity';
  end if;

  update public.media
  set thumb_path = null, thumb_url = null
  where id = c.media_id;

  delete from storage.objects
  where bucket_id = 'media' and name = c.thumb_path;

  update public.storage_deletion_items
  set
    status = 'processing',
    claimed_by = v_worker,
    claimed_at = now(),
    lease_expires_at = now() + interval '1 minute'
  where id = v_thumb_item;

  if not public.complete_storage_deletion_item(v_thumb_item, v_worker, 'deleted')
     or (select storage_used from public.profiles where id = c.user_id) <> 120 then
    raise exception 'thumbnail deletion changed user-visible capacity';
  end if;

  insert into public.storage_deletion_jobs (
    owner_user_id, source_type, source_id, status
  ) values (
    c.user_id, 'media', gen_random_uuid(), 'pending'
  )
  returning id into v_main_job;

  v_main_item := public.private_link_or_enqueue_storage_deletion_path(
    v_main_job, 'media', c.main_path
  );

  if not exists (
    select 1
    from public.storage_deletion_items i
    where i.id = v_main_item
      and i.size_bytes = 80
      and i.capacity_kind = 'main'
      and i.capacity_bytes = 80
  ) then
    raise exception 'main deletion did not capture trusted user-capacity bytes';
  end if;

  update public.media
  set storage_path = null, url = null
  where id = c.media_id;

  delete from storage.objects
  where bucket_id = 'media' and name = c.main_path;

  update public.storage_deletion_items
  set
    status = 'processing',
    claimed_by = v_worker,
    claimed_at = now(),
    lease_expires_at = now() + interval '1 minute'
  where id = v_main_item;

  v_completed := public.complete_storage_deletion_item(
    v_main_item,
    v_worker,
    'deleted'
  );
  select storage_used
  into v_profile_used
  from public.profiles
  where id = c.user_id;

  if not v_completed or v_profile_used <> 40 then
    raise exception
      'main deletion did not release exactly its trusted 80 bytes (completed=%, storage_used=%)',
      v_completed,
      v_profile_used;
  end if;

  if not public.complete_storage_deletion_item(v_main_item, v_worker, 'deleted')
     or (select storage_used from public.profiles where id = c.user_id) <> 40 then
    raise exception 'main deletion completion was not idempotent';
  end if;

  if public.private_reconcile_main_only_storage_used() <> 0
     or (select storage_used from public.profiles where id = c.user_id) <> 40 then
    raise exception 'post-deletion main-only reconciliation changed a settled account';
  end if;
end;
$$;

rollback;
