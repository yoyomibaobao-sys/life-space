-- LOCAL SUPABASE ONLY. Run as supabase_admin so dblink can open concurrent
-- authenticated sessions. The fixture is committed for those sessions and
-- removed before this script exits.

\set ON_ERROR_STOP on

create extension if not exists dblink schema extensions;

drop table if exists public.storage_upload_capacity_concurrency_test_context;
create table public.storage_upload_capacity_concurrency_test_context (
  user_limit uuid not null,
  user_idempotent uuid not null,
  reservation_one uuid not null,
  reservation_two uuid not null,
  reservation_idempotent uuid not null,
  record_limit uuid not null,
  record_idempotent uuid not null,
  target_one uuid not null,
  target_two uuid not null,
  target_idempotent uuid not null,
  path_one text not null,
  path_two text not null,
  path_idempotent text not null
);

revoke all on public.storage_upload_capacity_concurrency_test_context
  from public, anon, authenticated;

insert into public.storage_upload_capacity_concurrency_test_context
select
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  '',
  '',
  '';

update public.storage_upload_capacity_concurrency_test_context c
set
  path_one = format('%s/%s/concurrent-one.jpg', c.user_limit, c.record_limit),
  path_two = format('%s/%s/concurrent-two.jpg', c.user_limit, c.record_limit),
  path_idempotent = format(
    '%s/%s/concurrent-idempotent.jpg',
    c.user_idempotent,
    c.record_idempotent
  );

insert into public.users (id, username, cloud_enabled)
select user_limit, 'capacity-concurrency-limit', true
from public.storage_upload_capacity_concurrency_test_context
union all
select user_idempotent, 'capacity-concurrency-idempotent', true
from public.storage_upload_capacity_concurrency_test_context;

insert into public.profiles (id, username, storage_used, storage_limit)
select user_limit, 'capacity-concurrency-limit', 0, 1000
from public.storage_upload_capacity_concurrency_test_context
union all
select user_idempotent, 'capacity-concurrency-idempotent', 0, 1000
from public.storage_upload_capacity_concurrency_test_context;

update public.profiles p
set storage_used = 0, storage_limit = 1000
from public.storage_upload_capacity_concurrency_test_context c
where p.id in (c.user_limit, c.user_idempotent);

insert into public.user_memberships (
  user_id,
  plan,
  status,
  trial_started_at,
  trial_ends_at,
  storage_limit_bytes,
  base_market_post_limit
)
select
  user_limit,
  'trial',
  'trialing',
  now(),
  now() + interval '1 day',
  1000,
  3
from public.storage_upload_capacity_concurrency_test_context
union all
select
  user_idempotent,
  'trial',
  'trialing',
  now(),
  now() + interval '1 day',
  1000,
  3
from public.storage_upload_capacity_concurrency_test_context;

insert into public.archives (id, user_id, title, category, is_public)
select gen_random_uuid(), user_limit, 'capacity-concurrency-limit', 'plant', false
from public.storage_upload_capacity_concurrency_test_context
union all
select gen_random_uuid(), user_idempotent, 'capacity-concurrency-idempotent', 'plant', false
from public.storage_upload_capacity_concurrency_test_context;

insert into public.records (id, archive_id, user_id, note, visibility)
select c.record_limit, a.id, c.user_limit, 'capacity concurrency limit', 'private'
from public.storage_upload_capacity_concurrency_test_context c
join public.archives a
  on a.user_id = c.user_limit
 and a.title = 'capacity-concurrency-limit'
union all
select c.record_idempotent, a.id, c.user_idempotent, 'capacity concurrency idempotent', 'private'
from public.storage_upload_capacity_concurrency_test_context c
join public.archives a
  on a.user_id = c.user_idempotent
 and a.title = 'capacity-concurrency-idempotent';

update public.storage_upload_control
set accepting_new_reservations = true
where singleton;

select extensions.dblink_connect(
  'capacity_limit_one',
  'dbname=postgres user=postgres'
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_exec(
  'capacity_limit_one',
  format('set "request.jwt.claim.sub" = %L', c.user_limit::text)
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_connect(
  'capacity_limit_two',
  'dbname=postgres user=postgres'
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_exec(
  'capacity_limit_two',
  format('set "request.jwt.claim.sub" = %L', c.user_limit::text)
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_send_query(
  'capacity_limit_one',
  format(
    'select * from public.reserve_storage_upload(%L::uuid, %L, %L::uuid, %L::uuid, %L, 600, null, 0)',
    c.reservation_one,
    'media',
    c.target_one,
    c.record_limit,
    c.path_one
  )
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_send_query(
  'capacity_limit_two',
  format(
    'select * from public.reserve_storage_upload(%L::uuid, %L, %L::uuid, %L::uuid, %L, 600, null, 0)',
    c.reservation_two,
    'media',
    c.target_two,
    c.record_limit,
    c.path_two
  )
)
from public.storage_upload_capacity_concurrency_test_context c;

create temporary table capacity_limit_results (
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
);

insert into capacity_limit_results
select *
from extensions.dblink_get_result('capacity_limit_one') as r(
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
);

insert into capacity_limit_results
select *
from extensions.dblink_get_result('capacity_limit_two') as r(
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
);

do $$
declare
  v_user_id uuid := (
    select user_limit from public.storage_upload_capacity_concurrency_test_context
  );
begin
  if (select count(*) from capacity_limit_results where ok) <> 1
     or (select count(*) from capacity_limit_results where message = 'storage_limit_exceeded') <> 1
     or (select storage_used from public.profiles where id = v_user_id) <> 600
     or (select count(*) from public.storage_upload_reservations where owner_user_id = v_user_id) <> 1 then
    raise exception 'concurrent limit enforcement failed';
  end if;
end;
$$;

select extensions.dblink_disconnect('capacity_limit_one');
select extensions.dblink_disconnect('capacity_limit_two');

select extensions.dblink_connect(
  'capacity_idempotent_one',
  'dbname=postgres user=postgres'
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_exec(
  'capacity_idempotent_one',
  format('set "request.jwt.claim.sub" = %L', c.user_idempotent::text)
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_connect(
  'capacity_idempotent_two',
  'dbname=postgres user=postgres'
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_exec(
  'capacity_idempotent_two',
  format('set "request.jwt.claim.sub" = %L', c.user_idempotent::text)
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_send_query(
  'capacity_idempotent_one',
  format(
    'select * from public.reserve_storage_upload(%L::uuid, %L, %L::uuid, %L::uuid, %L, 100, null, 0)',
    c.reservation_idempotent,
    'media',
    c.target_idempotent,
    c.record_idempotent,
    c.path_idempotent
  )
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_send_query(
  'capacity_idempotent_two',
  format(
    'select * from public.reserve_storage_upload(%L::uuid, %L, %L::uuid, %L::uuid, %L, 100, null, 0)',
    c.reservation_idempotent,
    'media',
    c.target_idempotent,
    c.record_idempotent,
    c.path_idempotent
  )
)
from public.storage_upload_capacity_concurrency_test_context c;

create temporary table capacity_idempotent_results (
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
);

insert into capacity_idempotent_results
select *
from extensions.dblink_get_result('capacity_idempotent_one') as r(
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
);

insert into capacity_idempotent_results
select *
from extensions.dblink_get_result('capacity_idempotent_two') as r(
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
);

do $$
declare
  v_user_id uuid := (
    select user_idempotent from public.storage_upload_capacity_concurrency_test_context
  );
begin
  if (select count(*) from capacity_idempotent_results where ok) <> 2
     or (select count(*) from capacity_idempotent_results where message in ('reserved', 'already_reserved')) <> 2
     or (select storage_used from public.profiles where id = v_user_id) <> 100
     or (select count(*) from public.storage_upload_reservations where owner_user_id = v_user_id) <> 1 then
    raise exception 'concurrent idempotent reservation failed';
  end if;
end;
$$;

select extensions.dblink_disconnect('capacity_idempotent_one');
select extensions.dblink_disconnect('capacity_idempotent_two');

select extensions.dblink_connect(
  'capacity_idempotent_one',
  'dbname=postgres user=postgres'
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_exec(
  'capacity_idempotent_one',
  format('set "request.jwt.claim.sub" = %L', c.user_idempotent::text)
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_connect(
  'capacity_idempotent_two',
  'dbname=postgres user=postgres'
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_exec(
  'capacity_idempotent_two',
  format('set "request.jwt.claim.sub" = %L', c.user_idempotent::text)
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_send_query(
  'capacity_idempotent_one',
  format(
    'select * from public.cancel_storage_upload_reservation(%L::uuid)',
    c.reservation_idempotent
  )
)
from public.storage_upload_capacity_concurrency_test_context c;

select extensions.dblink_send_query(
  'capacity_idempotent_two',
  format(
    'select * from public.cancel_storage_upload_reservation(%L::uuid)',
    c.reservation_idempotent
  )
)
from public.storage_upload_capacity_concurrency_test_context c;

create temporary table capacity_cancel_results (
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
);

insert into capacity_cancel_results
select *
from extensions.dblink_get_result('capacity_idempotent_one') as r(
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
);

insert into capacity_cancel_results
select *
from extensions.dblink_get_result('capacity_idempotent_two') as r(
  ok boolean,
  reservation_id uuid,
  status text,
  reserved_bytes bigint,
  actual_bytes bigint,
  storage_used bigint,
  storage_limit_bytes bigint,
  remaining_bytes bigint,
  message text
);

do $$
declare
  v_user_id uuid := (
    select user_idempotent from public.storage_upload_capacity_concurrency_test_context
  );
begin
  if (select count(*) from capacity_cancel_results where ok) <> 2
     or (select count(*) from capacity_cancel_results where message in ('cancelled', 'already_cancelled')) <> 2
     or (select storage_used from public.profiles where id = v_user_id) <> 0
     or (
       select count(*)
       from public.storage_upload_reservations
       where owner_user_id = v_user_id and status = 'cancelled'
     ) <> 1 then
    raise exception 'concurrent idempotent cancellation failed';
  end if;
end;
$$;

select extensions.dblink_disconnect('capacity_idempotent_one');
select extensions.dblink_disconnect('capacity_idempotent_two');

delete from public.users
where id in (
  select user_limit from public.storage_upload_capacity_concurrency_test_context
  union all
  select user_idempotent from public.storage_upload_capacity_concurrency_test_context
);

drop table public.storage_upload_capacity_concurrency_test_context;
