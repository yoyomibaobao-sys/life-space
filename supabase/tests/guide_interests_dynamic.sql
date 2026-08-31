-- LOCAL / ISOLATED SUPABASE ONLY. Run through run-isolated-database-tests.sh.
-- No production data is touched; every fixture and assertion is rolled back.
begin;

create temporary table guide_interests_test_context (
  owner_a uuid, owner_b uuid, free_user uuid, expired_user uuid,
  active_guide uuid, approved_guide uuid, inactive_guide uuid, cascade_guide uuid
);
grant select on guide_interests_test_context to anon, authenticated;
insert into guide_interests_test_context
select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid();

-- Match the repository's signup-fixture order so the real signup trigger can
-- take its idempotent path, without disabling triggers or foreign keys.
insert into public.users (id, username, cloud_enabled)
select fixture.user_id, 'guide-' || fixture.user_id::text, fixture.user_id <> c.free_user
from guide_interests_test_context c
cross join lateral unnest(array[c.owner_a, c.owner_b, c.free_user, c.expired_user]) as fixture(user_id);

insert into public.profiles (id, username)
select fixture.user_id, 'guide-' || fixture.user_id::text
from guide_interests_test_context c
cross join lateral unnest(array[c.owner_a, c.owner_b, c.free_user, c.expired_user]) as fixture(user_id);

insert into auth.users (id, aud, role, email, created_at, updated_at)
select fixture.user_id, 'authenticated', 'authenticated',
       fixture.user_id::text || '@guide-fixture.example.test', now(), now()
from guide_interests_test_context c
cross join lateral unnest(array[c.owner_a, c.owner_b, c.free_user, c.expired_user]) as fixture(user_id);

insert into public.user_memberships (
  user_id, plan, status, trial_started_at, trial_ends_at,
  paid_until, storage_limit_bytes, base_market_post_limit
)
select fixture.user_id, 'basic', 'active', now(), now() + interval '6 months',
       now() + interval '1 year', 123, 7
from guide_interests_test_context c
cross join lateral unnest(array[c.owner_a, c.owner_b, c.expired_user]) as fixture(user_id);

insert into public.guide_entries (id, category, name, normalized_name, source, is_active, created_by)
select c.active_guide, 'system', 'fixture-' || c.active_guide::text, c.active_guide::text, 'preset', true, c.owner_b
from guide_interests_test_context c
union all
select c.approved_guide, 'insect_fish', 'fixture-' || c.approved_guide::text, c.approved_guide::text, 'approved', true, c.owner_b
from guide_interests_test_context c
union all
select c.inactive_guide, 'other', 'fixture-' || c.inactive_guide::text, c.inactive_guide::text, 'preset', false, c.owner_b
from guide_interests_test_context c
union all
select c.cascade_guide, 'other', 'fixture-' || c.cascade_guide::text, c.cascade_guide::text, 'preset', true, c.owner_b
from guide_interests_test_context c;

insert into public.user_guide_interests (user_id, guide_id)
select expired_user, active_guide from guide_interests_test_context;
update public.user_memberships
set status = 'expired', paid_until = now() - interval '1 day'
where user_id = (select expired_user from guide_interests_test_context);

-- A member can save active preset and approved guides, with idempotent inserts.
select set_config('request.jwt.claim.sub', (select owner_a::text from guide_interests_test_context), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $$
declare c guide_interests_test_context%rowtype;
begin
  select * into c from guide_interests_test_context;
  insert into public.user_guide_interests (user_id, guide_id)
  values (c.owner_a, c.active_guide), (c.owner_a, c.approved_guide);
  insert into public.user_guide_interests (user_id, guide_id)
  values (c.owner_a, c.active_guide)
  on conflict (user_id, guide_id) do nothing;
  if (select count(*) from public.user_guide_interests) <> 2 then
    raise exception 'owner read leaked other saves or duplicate save was created';
  end if;
  begin
    insert into public.user_guide_interests (user_id, guide_id) values (c.owner_b, c.approved_guide);
    raise exception 'member saved on behalf of another user';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_guide_interests (user_id, guide_id) values (c.owner_a, c.inactive_guide);
    raise exception 'member saved an inactive guide';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.user_guide_interests set created_at = now() where user_id = c.owner_a;
    raise exception 'authenticated user obtained unnecessary UPDATE permission';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- B also authored the guide: authorship never exposes the list of savers.
select set_config('request.jwt.claim.sub', (select owner_b::text from guide_interests_test_context), true);
set local role authenticated;
do $$
declare c guide_interests_test_context%rowtype; affected integer;
begin
  select * into c from guide_interests_test_context;
  if exists (select 1 from public.user_guide_interests) then
    raise exception 'guide author could read another user''s saved guides';
  end if;
  delete from public.user_guide_interests where user_id = c.owner_a;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner delete succeeded'; end if;
  insert into public.user_guide_interests (user_id, guide_id)
  values (c.owner_b, c.active_guide), (c.owner_b, c.cascade_guide);
  if (select count(*) from public.user_guide_interests) <> 2 then
    raise exception 'second owner did not see exactly their own saves';
  end if;
end;
$$;
reset role;

-- Registered non-members cannot add saves, even by directly calling PostgREST.
select set_config('request.jwt.claim.sub', (select free_user::text from guide_interests_test_context), true);
set local role authenticated;
do $$
declare c guide_interests_test_context%rowtype;
begin
  select * into c from guide_interests_test_context;
  begin
    insert into public.user_guide_interests (user_id, guide_id) values (c.free_user, c.active_guide);
    raise exception 'non-member bypassed cloud-access requirement';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Expiry blocks adding, not access to or removal of previously saved items.
select set_config('request.jwt.claim.sub', (select expired_user::text from guide_interests_test_context), true);
set local role authenticated;
do $$
declare c guide_interests_test_context%rowtype;
begin
  select * into c from guide_interests_test_context;
  if (select count(*) from public.user_guide_interests) <> 1 then
    raise exception 'expired member lost their existing saved list';
  end if;
  begin
    insert into public.user_guide_interests (user_id, guide_id) values (c.expired_user, c.approved_guide);
    raise exception 'expired member added a new saved guide';
  exception when insufficient_privilege then null;
  end;
  delete from public.user_guide_interests where user_id = c.expired_user and guide_id = c.active_guide;
  if exists (select 1 from public.user_guide_interests) then
    raise exception 'expired member could not remove their save';
  end if;
end;
$$;
reset role;

-- Anonymous access is rejected at the table grant boundary.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;
do $$
begin
  begin
    perform * from public.user_guide_interests;
    raise exception 'anonymous caller could read saved guides';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_guide_interests (user_id, guide_id)
    select owner_a, cascade_guide from guide_interests_test_context;
    raise exception 'anonymous caller could add a saved guide';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select set_config('request.jwt.claim.role', '', true);

-- Restore the fixture owner check after all hostile attempts; deleting a guide
-- removes only references to that guide, not any other saved guide or project.
do $$
declare c guide_interests_test_context%rowtype;
begin
  select * into c from guide_interests_test_context;
  if (select count(*) from public.user_guide_interests where user_id = c.owner_a) <> 2 then
    raise exception 'another actor changed owner A''s saves';
  end if;
  delete from public.guide_entries where id = c.cascade_guide;
  if exists (select 1 from public.user_guide_interests where guide_id = c.cascade_guide) then
    raise exception 'guide delete left an orphaned save';
  end if;
  if (select count(*) from public.user_guide_interests where user_id = c.owner_b) <> 1 then
    raise exception 'cascade affected unrelated saved guides';
  end if;
end;
$$;

rollback;
