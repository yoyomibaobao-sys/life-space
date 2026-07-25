-- LOCAL SUPABASE ONLY. Transactional target-bound upload reservation tests.

begin;

create temporary table upload_capacity_test_context (
  user_one uuid not null,
  user_two uuid not null,
  record_one uuid not null,
  record_two uuid not null
);

grant select on upload_capacity_test_context to authenticated, anon;

insert into upload_capacity_test_context
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

insert into public.users (id, username, cloud_enabled)
select user_one, 'capacity-test-one', true from upload_capacity_test_context
union all
select user_two, 'capacity-test-two', true from upload_capacity_test_context;

insert into public.profiles (id, username, storage_used, storage_limit)
select user_one, 'capacity-test-one', 500, 10000 from upload_capacity_test_context
union all
select user_two, 'capacity-test-two', 700, 10000 from upload_capacity_test_context;

insert into public.user_memberships (
  user_id, plan, status, trial_started_at, trial_ends_at, storage_limit_bytes
)
select user_one, 'trial', 'trialing', now(), now() + interval '1 day', 10000
from upload_capacity_test_context
union all
select user_two, 'trial', 'trialing', now(), now() + interval '1 day', 10000
from upload_capacity_test_context
on conflict (user_id) do update set
  status = excluded.status,
  trial_ends_at = excluded.trial_ends_at,
  storage_limit_bytes = excluded.storage_limit_bytes;

insert into public.archives (id, user_id, title, category, is_public)
select gen_random_uuid(), user_one, 'capacity-test-archive-one', 'plant', false
from upload_capacity_test_context
union all
select gen_random_uuid(), user_two, 'capacity-test-archive-two', 'plant', false
from upload_capacity_test_context;

insert into public.records (id, archive_id, user_id, note, visibility)
select c.record_one, a.id, c.user_one, 'capacity test one', 'private'
from upload_capacity_test_context c
join public.archives a on a.user_id = c.user_one
union all
select c.record_two, a.id, c.user_two, 'capacity test two', 'private'
from upload_capacity_test_context c
join public.archives a on a.user_id = c.user_two;

-- The final migration intentionally leaves uploads in maintenance until the
-- reservation-aware application is deployed. Local functional tests open it
-- inside this rollback-only transaction.
update public.storage_upload_control
set accepting_new_reservations = true
where singleton;

select set_config('request.jwt.claim.sub', (select user_one::text from upload_capacity_test_context), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Reserve/cancel is owner-bound and response-loss idempotent.
do $$
declare
  c upload_capacity_test_context%rowtype;
  v_reservation uuid := gen_random_uuid();
  v_target uuid := gen_random_uuid();
  v_path text;
  v_result record;
begin
  select * into c from upload_capacity_test_context;
  v_path := format('%s/%s/cancel-main.jpg', c.user_one, c.record_one);

  select * into v_result from public.reserve_storage_upload(
    v_reservation, 'media', v_target, c.record_one, v_path, 100, null, 0
  );
  if not v_result.ok or v_result.storage_used <> 600 then
    raise exception 'target-bound reserve failed';
  end if;

  select * into v_result from public.reserve_storage_upload(
    v_reservation, 'media', v_target, c.record_one, v_path, 100, null, 0
  );
  if not v_result.ok or v_result.message <> 'already_reserved' or v_result.storage_used <> 600 then
    raise exception 'repeated reserve was not idempotent';
  end if;

  select * into v_result from public.reserve_storage_upload(
    v_reservation, 'media', v_target, c.record_one, v_path, 101, null, 0
  );
  if v_result.ok or v_result.message <> 'reservation_conflict' then
    raise exception 'reservation accepted different bytes';
  end if;

  select * into v_result from public.cancel_storage_upload_reservation(v_reservation);
  if not v_result.ok or v_result.storage_used <> 500 then
    raise exception 'cancel did not restore capacity';
  end if;
  select * into v_result from public.cancel_storage_upload_reservation(v_reservation);
  if not v_result.ok or v_result.message <> 'already_cancelled' or v_result.storage_used <> 500 then
    raise exception 'repeated cancel was not idempotent';
  end if;
end;
$$;

-- Wrong parent and unreserved Storage paths are rejected.
do $$
declare
  c upload_capacity_test_context%rowtype;
  v_result record;
begin
  select * into c from upload_capacity_test_context;
  select * into v_result from public.reserve_storage_upload(
    gen_random_uuid(), 'media', gen_random_uuid(), c.record_two,
    format('%s/%s/wrong-parent.jpg', c.user_one, c.record_two), 10, null, 0
  );
  if v_result.ok or v_result.message <> 'target_not_found_or_forbidden' then
    raise exception 'foreign record target was accepted';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('media', c.user_one::text || '/unreserved.jpg', c.user_one::text, '{"size":1}');
    raise exception 'unreserved Storage path was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Trusted Storage metadata settles the main object and refunds unused bytes.
do $$
declare
  c upload_capacity_test_context%rowtype;
  v_reservation uuid := gen_random_uuid();
  v_media uuid := gen_random_uuid();
  v_path text;
  v_result record;
begin
  select * into c from upload_capacity_test_context;
  v_path := format('%s/%s/settled-main.jpg', c.user_one, c.record_one);
  perform * from public.reserve_storage_upload(
    v_reservation, 'media', v_media, c.record_one, v_path, 100, null, 0
  );
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('media', v_path, c.user_one::text, '{"size":80}');
  insert into public.media (
    id, record_id, user_id, type, storage_path, size_bytes,
    storage_class, upload_reservation_id
  ) values (
    v_media, c.record_one, c.user_one, 'image', v_path, 1,
    'hot', v_reservation
  );

  if (select storage_used from public.profiles where id = c.user_one) <> 580
     or (select size_bytes from public.media where id = v_media) <> 80 then
    raise exception 'trusted main settlement was incorrect';
  end if;

  select * into v_result from public.settle_storage_upload_reservation(
    v_reservation, 'media', v_media
  );
  if not v_result.ok or v_result.actual_bytes <> 80 or v_result.storage_used <> 580 then
    raise exception 'settlement confirmation was not idempotent';
  end if;

  select * into v_result from public.cancel_storage_upload_reservation(v_reservation);
  if v_result.ok or v_result.message <> 'already_settled' then
    raise exception 'settled reservation was cancelled';
  end if;

  select * into v_result from public.reserve_storage_upload(
    gen_random_uuid(), 'media', gen_random_uuid(), c.record_one, v_path, 100, null, 0
  );
  if v_result.ok or v_result.message <> 'storage_path_in_use' then
    raise exception 'referenced path was reservable';
  end if;
end;
$$;

-- A missing thumbnail refunds only that path; a committed thumbnail whose
-- response was lost is recovered and settled from Storage metadata.
do $$
declare
  c upload_capacity_test_context%rowtype;
  v_reservation uuid := gen_random_uuid();
  v_media uuid := gen_random_uuid();
  v_main text;
  v_thumb text;
begin
  select * into c from upload_capacity_test_context;
  v_main := format('%s/%s/main-no-thumb.jpg', c.user_one, c.record_one);
  v_thumb := format('%s/%s/thumbs/missing.jpg', c.user_one, c.record_one);
  perform * from public.reserve_storage_upload(
    v_reservation, 'media', v_media, c.record_one, v_main, 80, v_thumb, 20
  );
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('media', v_main, c.user_one::text, '{"size":80}');
  insert into public.media (
    id, record_id, user_id, type, storage_path, thumb_path,
    size_bytes, storage_class, upload_reservation_id
  ) values (
    v_media, c.record_one, c.user_one, 'image', v_main, null,
    1, 'hot', v_reservation
  );
  if (select storage_used from public.profiles where id = c.user_one) <> 660 then
    raise exception 'missing thumbnail refund was incorrect';
  end if;

  v_reservation := gen_random_uuid();
  v_media := gen_random_uuid();
  v_main := format('%s/%s/main-recovered-thumb.jpg', c.user_one, c.record_one);
  v_thumb := format('%s/%s/thumbs/recovered.jpg', c.user_one, c.record_one);
  perform * from public.reserve_storage_upload(
    v_reservation, 'media', v_media, c.record_one, v_main, 80, v_thumb, 20
  );
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values
    ('media', v_main, c.user_one::text, '{"size":80}'),
    ('media', v_thumb, c.user_one::text, '{"size":20}');
  insert into public.media (
    id, record_id, user_id, type, storage_path, thumb_path,
    size_bytes, storage_class, upload_reservation_id
  ) values (
    v_media, c.record_one, c.user_one, 'image', v_main, null,
    1, 'hot', v_reservation
  );
  if (select storage_used from public.profiles where id = c.user_one) <> 760
     or (select thumb_path from public.media where id = v_media) <> v_thumb
     or (select size_bytes from public.media where id = v_media) <> 100 then
    raise exception 'lost thumbnail response was not recovered';
  end if;
end;
$$;

-- Cancellation is impossible until the unreferenced Storage object is gone.
do $$
declare
  c upload_capacity_test_context%rowtype;
  v_reservation uuid := gen_random_uuid();
  v_target uuid := gen_random_uuid();
  v_path text;
  v_result record;
begin
  select * into c from upload_capacity_test_context;
  v_path := format('%s/%s/cleanup-required.jpg', c.user_one, c.record_one);
  perform * from public.reserve_storage_upload(
    v_reservation, 'media', v_target, c.record_one, v_path, 100, null, 0
  );
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('media', v_path, c.user_one::text, '{"size":60}');
  select * into v_result from public.cancel_storage_upload_reservation(v_reservation);
  if v_result.ok or v_result.message <> 'storage_cleanup_required' then
    raise exception 'existing object was refunded';
  end if;

  set local storage.allow_delete_query = 'true';
  delete from storage.objects where bucket_id = 'media' and name = v_path;
  select * into v_result from public.cancel_storage_upload_reservation(v_reservation);
  if not v_result.ok or v_result.storage_used <> 760 then
    raise exception 'cleaned reservation did not refund exactly once';
  end if;
end;
$$;

-- A different user cannot cancel or settle the first user's reservation.
do $$
declare
  c upload_capacity_test_context%rowtype;
  v_reservation uuid := gen_random_uuid();
  v_target uuid := gen_random_uuid();
  v_path text;
begin
  select * into c from upload_capacity_test_context;
  v_path := format('%s/%s/cross-owner.jpg', c.user_one, c.record_one);
  perform * from public.reserve_storage_upload(
    v_reservation, 'media', v_target, c.record_one, v_path, 100, null, 0
  );
  perform set_config('request.jwt.claim.sub', c.user_two::text, true);
  if (select ok from public.cancel_storage_upload_reservation(v_reservation)) then
    raise exception 'cross-owner cancellation succeeded';
  end if;
  if (select ok from public.settle_storage_upload_reservation(v_reservation, 'media', v_target)) then
    raise exception 'cross-owner settlement succeeded';
  end if;
  perform set_config('request.jwt.claim.sub', c.user_one::text, true);
  perform * from public.cancel_storage_upload_reservation(v_reservation);
end;
$$;

-- API roles cannot read the ledger, and anon cannot invoke mutation RPCs.
do $$
begin
  begin
    perform count(*) from public.storage_upload_reservations;
    raise exception 'authenticated read internal reservations';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;

do $$
begin
  begin
    perform * from public.reserve_storage_upload(
      gen_random_uuid(), 'media', gen_random_uuid(), gen_random_uuid(),
      'invalid/path.jpg', 1, null, 0
    );
    raise exception 'anon reserved upload capacity';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.cancel_storage_upload_reservation(gen_random_uuid());
    raise exception 'anon cancelled upload capacity';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;
