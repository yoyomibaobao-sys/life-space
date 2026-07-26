-- LOCAL SUPABASE ONLY. Run as supabase_admin so dblink can hold two concurrent
-- market activations against one disposable membership row.

\set ON_ERROR_STOP on

create extension if not exists dblink schema extensions;

drop table if exists public.market_post_limit_concurrency_test_context;
create table public.market_post_limit_concurrency_test_context (
  user_id uuid not null
);

revoke all on public.market_post_limit_concurrency_test_context
  from public, anon, authenticated;

insert into public.market_post_limit_concurrency_test_context
values (gen_random_uuid());

insert into public.users (id, username, cloud_enabled)
select user_id, 'market-limit-concurrency', true
from public.market_post_limit_concurrency_test_context;

insert into public.profiles (id, username)
select user_id, 'market-limit-concurrency'
from public.market_post_limit_concurrency_test_context;

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
  user_id,
  'trial',
  'trialing',
  now(),
  now() + interval '1 day',
  300000000,
  1
from public.market_post_limit_concurrency_test_context;

create or replace function public.market_post_limit_concurrency_attempt(
  p_user_id uuid,
  p_title text,
  p_hold_seconds double precision
)
returns text
language plpgsql
set search_path = ''
as $$
begin
  insert into public.market_posts (
    user_id,
    title,
    post_type,
    item_category,
    status
  )
  values (
    p_user_id,
    p_title,
    'offer',
    'seed',
    'active'
  );

  perform pg_catalog.pg_sleep(greatest(coalesce(p_hold_seconds, 0), 0));
  return 'ok';
exception
  when raise_exception then
    return sqlerrm;
  when others then
    return format('unexpected:%s:%s', sqlstate, sqlerrm);
end;
$$;

select extensions.dblink_connect(
  'market_limit_one',
  'dbname=postgres user=postgres'
);
select extensions.dblink_connect(
  'market_limit_two',
  'dbname=postgres user=postgres'
);

select extensions.dblink_send_query(
  'market_limit_one',
  format(
    'select public.market_post_limit_concurrency_attempt(%L::uuid, %L, 2)',
    c.user_id,
    'market-concurrent-one'
  )
)
from public.market_post_limit_concurrency_test_context c;

select extensions.dblink_send_query(
  'market_limit_two',
  format(
    'select public.market_post_limit_concurrency_attempt(%L::uuid, %L, 0)',
    c.user_id,
    'market-concurrent-two'
  )
)
from public.market_post_limit_concurrency_test_context c;

create temporary table market_limit_concurrency_results (
  result text not null
);

insert into market_limit_concurrency_results
select *
from extensions.dblink_get_result('market_limit_one') as r(result text);

insert into market_limit_concurrency_results
select *
from extensions.dblink_get_result('market_limit_two') as r(result text);

do $$
declare
  v_user_id uuid := (
    select user_id
    from public.market_post_limit_concurrency_test_context
  );
begin
  if (select count(*) from market_limit_concurrency_results where result = 'ok') <> 1
     or (
       select count(*)
       from market_limit_concurrency_results
       where result = 'market_post_limit_reached'
     ) <> 1
     or (
       select count(*)
       from public.market_posts
       where user_id = v_user_id
         and status = 'active'
     ) <> 1 then
    raise exception
      'concurrent market limit failed: results=%, active=%',
      (
        select string_agg(result, ',' order by result)
        from market_limit_concurrency_results
      ),
      (
        select count(*)
        from public.market_posts
        where user_id = v_user_id
          and status = 'active'
      );
  end if;
end;
$$;

select extensions.dblink_disconnect('market_limit_one');
select extensions.dblink_disconnect('market_limit_two');

drop function public.market_post_limit_concurrency_attempt(
  uuid,
  text,
  double precision
);

delete from public.profiles
where id = (
  select user_id
  from public.market_post_limit_concurrency_test_context
);

delete from public.users
where id = (
  select user_id
  from public.market_post_limit_concurrency_test_context
);

drop table public.market_post_limit_concurrency_test_context;
