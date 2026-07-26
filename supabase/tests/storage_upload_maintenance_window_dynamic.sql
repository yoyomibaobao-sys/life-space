-- LOCAL SUPABASE ONLY. Run after stage 1 and before the final reservation
-- hardening migration. The transaction rolls back its fixture.

begin;

create temporary table upload_maintenance_test_context (
  user_id uuid not null
);

grant select on upload_maintenance_test_context to authenticated;

insert into upload_maintenance_test_context values (gen_random_uuid());

insert into public.users (id, username, cloud_enabled)
select user_id, 'capacity-maintenance-test', true
from upload_maintenance_test_context;

insert into public.profiles (id, username, storage_used, storage_limit)
select user_id, 'capacity-maintenance-test', 500, 1000
from upload_maintenance_test_context;

update public.user_memberships m
set
  plan = 'trial',
  status = 'trialing',
  trial_started_at = now(),
  trial_ends_at = now() + interval '1 day',
  storage_limit_bytes = 1000
from upload_maintenance_test_context c
where m.user_id = c.user_id;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from upload_maintenance_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  v_result record;
begin
  select * into v_result from public.reserve_storage_bytes(100);
  if v_result.ok
     or v_result.message <> 'upload_maintenance'
     or v_result.storage_used <> 500 then
    raise exception 'maintenance did not block a new legacy reservation';
  end if;

  select * into v_result from public.release_storage_bytes(100);
  if v_result.storage_used <> 400 then
    raise exception 'maintenance blocked an in-flight legacy refund';
  end if;

  if to_regprocedure('public.reserve_storage_upload(uuid,text,bigint,text,bigint)') is not null then
    raise exception 'final reservation RPC exists during stage-one test';
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from public.storage_upload_control c
    where c.singleton
      and not c.accepting_new_reservations
      and c.maintenance_started_at is not null
  ) then
    raise exception 'maintenance control state is not active';
  end if;
end;
$$;

rollback;
