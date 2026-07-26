-- LOCAL SUPABASE ONLY. Transactional market upload/share/deletion tests.

begin;

create temporary table market_capacity_test_context (
  user_id uuid not null,
  other_user_id uuid not null,
  archive_id uuid not null,
  record_id uuid not null,
  source_media_id uuid not null,
  source_path text not null,
  post_id uuid not null,
  shared_market_media_id uuid not null,
  cover_reservation_id uuid,
  cover_main_path text,
  cover_thumb_path text,
  cover_delete_job_id uuid,
  own_market_media_id uuid,
  own_market_reservation_id uuid,
  own_market_path text,
  own_market_delete_job_id uuid,
  retained_delete_job_id uuid,
  shared_post_delete_job_id uuid
);

grant select, update on market_capacity_test_context to authenticated;

insert into market_capacity_test_context
select
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  '',
  gen_random_uuid(),
  gen_random_uuid(),
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null;

update market_capacity_test_context
set source_path = format('%s/%s/source-record.jpg', user_id, record_id);

insert into public.users (id, username, cloud_enabled)
select user_id, 'market-capacity-user', true from market_capacity_test_context
union all
select other_user_id, 'market-capacity-other', true from market_capacity_test_context;

insert into public.profiles (id, username, storage_used, storage_limit)
select user_id, 'market-capacity-user', 1000, 10000 from market_capacity_test_context
union all
select other_user_id, 'market-capacity-other', 0, 10000 from market_capacity_test_context;

insert into public.user_memberships (
  user_id, plan, status, trial_started_at, trial_ends_at, storage_limit_bytes
)
select user_id, 'trial', 'trialing', now(), now() + interval '1 day', 10000
from market_capacity_test_context
union all
select other_user_id, 'trial', 'trialing', now(), now() + interval '1 day', 10000
from market_capacity_test_context
on conflict (user_id) do update set
  status = excluded.status,
  trial_ends_at = excluded.trial_ends_at,
  storage_limit_bytes = excluded.storage_limit_bytes;

insert into public.archives (id, user_id, title, category, is_public)
select archive_id, user_id, 'market capacity archive', 'plant', false
from market_capacity_test_context;

insert into public.records (id, archive_id, user_id, note, visibility)
select record_id, archive_id, user_id, 'market capacity record', 'private'
from market_capacity_test_context;

insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'media', source_path, user_id::text, '{"size":50}'::jsonb
from market_capacity_test_context;

-- This represents an existing, already-billed record image. It intentionally
-- has no upload reservation because it predates this local test transaction.
insert into public.media (
  id, record_id, user_id, type, storage_path, size_bytes, storage_class
)
select source_media_id, record_id, user_id, 'image', source_path, 50, 'hot'
from market_capacity_test_context;

insert into public.market_posts (
  id, user_id, title, post_type, item_category, status
)
select post_id, user_id, 'market capacity post', 'offer', 'seed', 'active'
from market_capacity_test_context;

update public.storage_upload_control
set accepting_new_reservations = true
where singleton;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from market_capacity_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- A standalone cover settles trusted physical main+thumbnail bytes while
-- user-visible capacity counts only the main image. Repeating the cover RPC
-- after a lost response remains idempotent.
do $$
declare
  c market_capacity_test_context%rowtype;
  v_result record;
begin
  select * into c from market_capacity_test_context;
  c.cover_reservation_id := gen_random_uuid();
  c.cover_main_path := format('%s/market/%s/cover.jpg', c.user_id, c.post_id);
  c.cover_thumb_path := format('%s/market/%s/thumbs/cover.jpg', c.user_id, c.post_id);

  update market_capacity_test_context
  set
    cover_reservation_id = c.cover_reservation_id,
    cover_main_path = c.cover_main_path,
    cover_thumb_path = c.cover_thumb_path;

  select * into v_result from public.reserve_storage_upload(
    c.cover_reservation_id,
    'market_cover',
    c.post_id,
    null,
    c.cover_main_path,
    100,
    c.cover_thumb_path,
    20
  );
  if not v_result.ok or v_result.storage_used <> 1100 then
    raise exception 'market cover reservation failed';
  end if;

  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values
    ('media', c.cover_main_path, c.user_id::text, '{"size":80}'::jsonb),
    ('media', c.cover_thumb_path, c.user_id::text, '{"size":10}'::jsonb);

  select * into v_result from public.set_market_post_cover(
    c.post_id, c.cover_main_path, c.cover_thumb_path, c.cover_reservation_id
  );
  if not v_result.ok
     or (select storage_used from public.profiles where id = c.user_id) <> 1080
     or (select cover_upload_reservation_id from public.market_posts where id = c.post_id)
        is distinct from c.cover_reservation_id then
    raise exception 'market cover trusted settlement failed';
  end if;

  select * into v_result from public.set_market_post_cover(
    c.post_id, c.cover_main_path, c.cover_thumb_path, c.cover_reservation_id
  );
  if not v_result.ok
     or v_result.job_id is not null
     or (select storage_used from public.profiles where id = c.user_id) <> 1080 then
    raise exception 'repeated market cover response changed capacity';
  end if;
end;
$$;

-- Ending a market post is presentation state only.
update public.market_posts
set status = 'ended', ended_at = now()
where id = (select post_id from market_capacity_test_context);

do $$
declare
  c market_capacity_test_context%rowtype;
begin
  select * into c from market_capacity_test_context;
  if (select storage_used from public.profiles where id = c.user_id) <> 1080
     or not exists (
       select 1 from storage.objects
       where bucket_id = 'media' and name = c.cover_main_path
     ) then
    raise exception 'ending a market post removed media or capacity';
  end if;
end;
$$;

update public.market_posts
set status = 'active', ended_at = null
where id = (select post_id from market_capacity_test_context);

-- Sharing an existing record image creates no reservation and no new charge.
insert into public.market_media (
  id, market_post_id, user_id, url, path, thumb_url, thumb_path,
  source_media_id, source_record_id, sort_order
)
select
  shared_market_media_id,
  post_id,
  user_id,
  null,
  source_path,
  null,
  null,
  source_media_id,
  record_id,
  0
from market_capacity_test_context;

do $$
declare
  c market_capacity_test_context%rowtype;
begin
  select * into c from market_capacity_test_context;
  if (select storage_used from public.profiles where id = c.user_id) <> 1080
     or (select upload_reservation_id from public.market_media
         where id = c.shared_market_media_id) is not null
     or (select count(*) from storage.objects
         where bucket_id = 'media' and name = c.source_path) <> 1 then
    raise exception 'shared record image was duplicated or billed';
  end if;
end;
$$;

-- Switching to the shared image queues the old standalone cover. Both objects
-- are physically measured and deleted, but only the trusted 80-byte main image
-- is released from user-visible capacity.
do $$
declare
  c market_capacity_test_context%rowtype;
  v_result record;
begin
  select * into c from market_capacity_test_context;
  select * into v_result from public.set_market_post_cover(
    c.post_id, c.source_path, null, null
  );
  if not v_result.ok or v_result.job_id is null then
    raise exception 'standalone cover replacement did not create cleanup job';
  end if;
  update market_capacity_test_context set cover_delete_job_id = v_result.job_id;
end;
$$;

reset role;

do $$
declare
  c market_capacity_test_context%rowtype;
  v_item record;
  v_worker uuid := gen_random_uuid();
begin
  select * into c from market_capacity_test_context;
  set local storage.allow_delete_query = 'true';

  if not exists (
       select 1
       from public.storage_deletion_items i
       join public.storage_deletion_job_items ji on ji.item_id = i.id
       where ji.job_id = c.cover_delete_job_id
         and i.object_path = c.cover_main_path
         and i.size_bytes = 80
         and i.capacity_kind = 'main'
         and i.capacity_bytes = 80
     )
     or not exists (
       select 1
       from public.storage_deletion_items i
       join public.storage_deletion_job_items ji on ji.item_id = i.id
       where ji.job_id = c.cover_delete_job_id
         and i.object_path = c.cover_thumb_path
         and i.size_bytes = 10
         and i.capacity_kind = 'thumb'
         and i.capacity_bytes = 0
     ) then
    raise exception 'cover deletion did not separate physical and user-capacity bytes';
  end if;

  delete from storage.objects
  where bucket_id = 'media'
    and name in (c.cover_main_path, c.cover_thumb_path);

  for v_item in
    select i.id
    from public.storage_deletion_items i
    join public.storage_deletion_job_items ji on ji.item_id = i.id
    where ji.job_id = c.cover_delete_job_id
    order by i.id
  loop
    update public.storage_deletion_items
    set status = 'processing', claimed_by = v_worker, claimed_at = now(),
        lease_expires_at = now() + interval '1 minute'
    where id = v_item.id;
    if not public.complete_storage_deletion_item(v_item.id, v_worker, 'deleted') then
      raise exception 'cover deletion item did not complete';
    end if;
    if not public.complete_storage_deletion_item(v_item.id, v_worker, 'deleted') then
      raise exception 'cover deletion completion was not idempotent';
    end if;
  end loop;
  perform public.refresh_storage_deletion_job_status(c.cover_delete_job_id);

  if (select storage_used from public.profiles where id = c.user_id) <> 1000 then
    raise exception 'standalone cover capacity was not released exactly once';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'media' and name = c.source_path
  ) then
    raise exception 'shared record object was deleted with old cover';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from market_capacity_test_context),
  true
);
set local role authenticated;

-- A market-owned gallery image is separately reserved and settled.
do $$
declare
  c market_capacity_test_context%rowtype;
  v_result record;
begin
  select * into c from market_capacity_test_context;
  c.own_market_media_id := gen_random_uuid();
  c.own_market_reservation_id := gen_random_uuid();
  c.own_market_path := format(
    '%s/market/%s/gallery.jpg', c.user_id, c.post_id
  );
  update market_capacity_test_context set
    own_market_media_id = c.own_market_media_id,
    own_market_reservation_id = c.own_market_reservation_id,
    own_market_path = c.own_market_path;

  select * into v_result from public.reserve_storage_upload(
    c.own_market_reservation_id,
    'market_media',
    c.own_market_media_id,
    c.post_id,
    c.own_market_path,
    70,
    null,
    0
  );
  if not v_result.ok then raise exception 'market media reserve failed'; end if;

  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('media', c.own_market_path, c.user_id::text, '{"size":55}'::jsonb);

  insert into public.market_media (
    id, market_post_id, user_id, path, source_media_id, source_record_id,
    sort_order, upload_reservation_id
  ) values (
    c.own_market_media_id, c.post_id, c.user_id, c.own_market_path,
    null, null, 1, c.own_market_reservation_id
  );

  if (select storage_used from public.profiles where id = c.user_id) <> 1055 then
    raise exception 'market media trusted settlement was incorrect';
  end if;

  select * into v_result from public.settle_storage_upload_reservation(
    c.own_market_reservation_id, 'market_media', c.own_market_media_id
  );
  if not v_result.ok or v_result.actual_bytes <> 55 then
    raise exception 'market media settlement confirmation failed';
  end if;
end;
$$;

-- A different authenticated user cannot reuse the reservation or post.
select set_config(
  'request.jwt.claim.sub',
  (select other_user_id::text from market_capacity_test_context),
  true
);

do $$
declare
  c market_capacity_test_context%rowtype;
  v_result record;
begin
  select * into c from market_capacity_test_context;
  select * into v_result from public.settle_storage_upload_reservation(
    c.own_market_reservation_id, 'market_media', c.own_market_media_id
  );
  if v_result.ok then raise exception 'other user settled reservation'; end if;

  select * into v_result from public.set_market_post_cover(
    c.post_id, c.own_market_path, null, c.own_market_reservation_id
  );
  if v_result.ok then raise exception 'other user changed market cover'; end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from market_capacity_test_context),
  true
);

-- Deleting one owned market image queues it, remains idempotent after the row
-- is gone, and releases its capacity only after Worker completion.
do $$
declare
  c market_capacity_test_context%rowtype;
  v_result record;
  v_first_job uuid;
begin
  select * into c from market_capacity_test_context;
  select * into v_result
  from public.request_delete_market_media(c.own_market_media_id);
  if not v_result.ok or v_result.job_id is null then
    raise exception 'market media deletion was not queued';
  end if;
  v_first_job := v_result.job_id;
  update market_capacity_test_context set own_market_delete_job_id = v_first_job;

  select * into v_result
  from public.request_delete_market_media(c.own_market_media_id);
  if not v_result.ok or v_result.job_id is distinct from v_first_job then
    raise exception 'market media deletion retry was not idempotent';
  end if;
  if exists (select 1 from public.market_media where id = c.own_market_media_id) then
    raise exception 'market media business row was not deleted';
  end if;
end;
$$;

reset role;

do $$
declare
  c market_capacity_test_context%rowtype;
  v_item_id uuid;
  v_worker uuid := gen_random_uuid();
begin
  select * into c from market_capacity_test_context;
  set local storage.allow_delete_query = 'true';
  delete from storage.objects
  where bucket_id = 'media' and name = c.own_market_path;

  select i.id into v_item_id
  from public.storage_deletion_items i
  join public.storage_deletion_job_items ji on ji.item_id = i.id
  where ji.job_id = c.own_market_delete_job_id;

  update public.storage_deletion_items
  set status = 'processing', claimed_by = v_worker, claimed_at = now(),
      lease_expires_at = now() + interval '1 minute'
  where id = v_item_id;
  if not public.complete_storage_deletion_item(v_item_id, v_worker, 'deleted') then
    raise exception 'market media deletion item did not complete';
  end if;
  perform public.refresh_storage_deletion_job_status(c.own_market_delete_job_id);
  if (select storage_used from public.profiles where id = c.user_id) <> 1000 then
    raise exception 'market media deletion did not release exactly once';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from market_capacity_test_context),
  true
);

-- Purging the source media while market still references it is retained_shared
-- and never releases capacity.
do $$
declare
  c market_capacity_test_context%rowtype;
  v_result record;
begin
  select * into c from market_capacity_test_context;
  select * into v_result from public.request_delete_media(c.source_media_id);
  if not v_result.ok or v_result.job_id is null then
    raise exception 'source media deletion did not create a job';
  end if;
  update market_capacity_test_context set retained_delete_job_id = v_result.job_id;
end;
$$;

reset role;

do $$
declare
  c market_capacity_test_context%rowtype;
  v_item_id uuid;
  v_worker uuid := gen_random_uuid();
begin
  select * into c from market_capacity_test_context;
  select i.id into v_item_id
  from public.storage_deletion_items i
  where i.job_id = c.retained_delete_job_id
     or exists (
       select 1
       from public.storage_deletion_job_items ji
       where ji.item_id = i.id
         and ji.job_id = c.retained_delete_job_id
     )
  order by i.id
  limit 1;

  update public.storage_deletion_items
  set status = 'processing', claimed_by = v_worker, claimed_at = now(),
      lease_expires_at = now() + interval '1 minute'
  where id = v_item_id;
  if not public.complete_storage_deletion_item(
    v_item_id, v_worker, 'retained_shared'
  ) then
    raise exception 'shared source was not retained';
  end if;
  perform public.refresh_storage_deletion_job_status(c.retained_delete_job_id);

  if (select storage_used from public.profiles where id = c.user_id) <> 1000
     or not exists (
       select 1 from storage.objects
       where bucket_id = 'media' and name = c.source_path
     )
     or not exists (
       select 1 from public.market_media
       where id = c.shared_market_media_id
         and path = c.source_path
         and source_media_id is null
     ) then
    raise exception 'retained_shared changed capacity, object, or market path';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from market_capacity_test_context),
  true
);
set local role authenticated;

-- Deleting the final market post removes the last shared reference. The prior
-- retained path is then billable exactly once, while the post deletion itself
-- stays response-loss idempotent.
do $$
declare
  c market_capacity_test_context%rowtype;
  v_result record;
  v_first_job uuid;
begin
  select * into c from market_capacity_test_context;
  select * into v_result from public.request_delete_market_post(c.post_id);
  if not v_result.ok or v_result.job_id is null then
    raise exception 'market post deletion was not queued';
  end if;
  v_first_job := v_result.job_id;
  update market_capacity_test_context set shared_post_delete_job_id = v_first_job;

  select * into v_result from public.request_delete_market_post(c.post_id);
  if not v_result.ok or v_result.job_id is distinct from v_first_job then
    raise exception 'market post deletion retry was not idempotent';
  end if;
end;
$$;

reset role;

do $$
declare
  c market_capacity_test_context%rowtype;
  v_item_id uuid;
  v_worker uuid := gen_random_uuid();
begin
  select * into c from market_capacity_test_context;
  set local storage.allow_delete_query = 'true';
  delete from storage.objects
  where bucket_id = 'media' and name = c.source_path;

  select i.id into v_item_id
  from public.storage_deletion_items i
  join public.storage_deletion_job_items ji on ji.item_id = i.id
  where ji.job_id = c.shared_post_delete_job_id
    and i.object_path = c.source_path;

  update public.storage_deletion_items
  set status = 'processing', claimed_by = v_worker, claimed_at = now(),
      lease_expires_at = now() + interval '1 minute'
  where id = v_item_id;
  if not public.complete_storage_deletion_item(v_item_id, v_worker, 'deleted') then
    raise exception 'final shared path deletion did not complete';
  end if;
  perform public.refresh_storage_deletion_job_status(c.shared_post_delete_job_id);

  if (select storage_used from public.profiles where id = c.user_id) <> 950 then
    raise exception 'last shared reference did not release historical capacity once';
  end if;
end;
$$;

-- Maintenance rejects both market target types before any reservation exists.
update public.storage_upload_control
set accepting_new_reservations = false
where singleton;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from market_capacity_test_context),
  true
);
set local role authenticated;

do $$
declare
  c market_capacity_test_context%rowtype;
  v_result record;
begin
  select * into c from market_capacity_test_context;
  select * into v_result from public.reserve_storage_upload(
    gen_random_uuid(), 'market_cover', gen_random_uuid(), null,
    format('%s/market/%s/maintenance-cover.jpg', c.user_id, gen_random_uuid()),
    10, null, 0
  );
  if v_result.ok or v_result.message <> 'upload_maintenance' then
    raise exception 'maintenance allowed market cover reservation';
  end if;

  select * into v_result from public.reserve_storage_upload(
    gen_random_uuid(), 'market_media', gen_random_uuid(), gen_random_uuid(),
    format('%s/market/%s/maintenance-media.jpg', c.user_id, gen_random_uuid()),
    10, null, 0
  );
  if v_result.ok or v_result.message <> 'upload_maintenance' then
    raise exception 'maintenance allowed market media reservation';
  end if;
end;
$$;

reset role;
rollback;
