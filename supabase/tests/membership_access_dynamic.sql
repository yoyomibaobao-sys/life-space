-- LOCAL SUPABASE ONLY. Membership tiers, guide visibility, interaction gates,
-- legacy-trial compatibility, and market activation behavior.

begin;

create temporary table membership_access_test_context (
  local_user uuid not null,
  cloud_user uuid not null,
  trial_user uuid not null,
  expired_user uuid not null,
  other_user uuid not null,
  plant_id uuid not null,
  archive_id uuid not null,
  record_id uuid not null,
  consultation_market_id uuid not null,
  trial_ended_market_id uuid not null,
  expired_active_market_id uuid not null,
  expired_ended_market_id uuid not null
);

grant select on membership_access_test_context to anon, authenticated;

insert into membership_access_test_context
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
  gen_random_uuid(),
  gen_random_uuid();

insert into public.users (id, username, cloud_enabled)
select local_user, 'membership-local-free', false
from membership_access_test_context
union all
select cloud_user, 'membership-cloud', true
from membership_access_test_context
union all
select trial_user, 'membership-trial', true
from membership_access_test_context
union all
select expired_user, 'membership-expired', true
from membership_access_test_context
union all
select other_user, 'membership-other', true
from membership_access_test_context;

do $$
begin
  if exists (
    select 1
    from public.user_memberships m
    where m.user_id in (
      select local_user from membership_access_test_context
      union all
      select cloud_user from membership_access_test_context
      union all
      select trial_user from membership_access_test_context
      union all
      select expired_user from membership_access_test_context
      union all
      select other_user from membership_access_test_context
    )
  ) then
    raise exception 'new public.users rows still received automatic trial memberships';
  end if;
end;
$$;

insert into public.profiles (id, username)
select local_user, 'membership-local-free'
from membership_access_test_context
union all
select cloud_user, 'membership-cloud'
from membership_access_test_context
union all
select trial_user, 'membership-trial'
from membership_access_test_context
union all
select expired_user, 'membership-expired'
from membership_access_test_context
union all
select other_user, 'membership-other'
from membership_access_test_context;

-- Guide candidate authors/usages reference auth.users. Seed matching identities
-- after the public fixtures so any signup trigger takes its idempotent path;
-- keep the real guide-usage trigger and foreign keys enabled for this test.
insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  fixture.user_id,
  'authenticated',
  'authenticated',
  fixture.user_id::text || '@membership-fixture.example.test',
  jsonb_build_object(
    'legal_terms_accepted', true,
    'legal_terms_version', '2026-09-01',
    'privacy_notice_accepted', true,
    'privacy_notice_version', '2026-09-01',
    'cross_border_consent', true,
    'cross_border_consent_version', '2026-09-01'
  ),
  now(),
  now()
from membership_access_test_context c
cross join lateral unnest(array[
  c.local_user, c.cloud_user, c.trial_user, c.expired_user, c.other_user
]) as fixture(user_id);

do $$
declare
  v_local_user uuid := (
    select local_user from membership_access_test_context
  );
begin
  if (select storage_limit from public.profiles where id = v_local_user) <> 0 then
    raise exception 'local-free profile did not start with zero cloud capacity';
  end if;
end;
$$;

insert into public.user_memberships (
  user_id,
  plan,
  status,
  trial_started_at,
  trial_ends_at,
  paid_until,
  storage_limit_bytes,
  base_market_post_limit
)
select
  cloud_user,
  'basic',
  'active',
  now(),
  now() + interval '6 months',
  now() + interval '1 year',
  123,
  7
from membership_access_test_context
union all
select
  trial_user,
  'trial',
  'trialing',
  now(),
  now() + interval '1 year',
  null,
  300000000,
  3
from membership_access_test_context
union all
select
  expired_user,
  'basic',
  'active',
  now(),
  now() + interval '6 months',
  now() + interval '1 day',
  456,
  9
from membership_access_test_context
union all
select
  other_user,
  'basic',
  'active',
  now(),
  now() + interval '6 months',
  now() + interval '1 year',
  789,
  11
from membership_access_test_context;

insert into public.market_post_quota_addons (
  user_id,
  extra_post_limit,
  starts_at,
  ends_at,
  note
)
select
  trial_user,
  10,
  now() - interval '1 hour',
  now() + interval '30 days',
  'ignored launch compatibility fixture'
from membership_access_test_context;

do $$
declare
  c membership_access_test_context%rowtype;
begin
  select * into c from membership_access_test_context;

  if not exists (
    select 1
    from public.user_memberships m
    where m.user_id = c.cloud_user
      and m.storage_limit_bytes = 1000000000
      and m.base_market_post_limit = 30
  ) then
    raise exception 'basic cloud plan was not normalized to 1 GB and 30 posts';
  end if;

  if not exists (
    select 1
    from public.user_memberships m
    where m.user_id = c.trial_user
      and m.storage_limit_bytes = 300000000
      and m.base_market_post_limit = 3
  ) then
    raise exception 'legacy trial limits were not preserved';
  end if;

  if (select storage_limit from public.profiles where id = c.cloud_user)
       <> 1000000000
     or (select storage_limit from public.profiles where id = c.trial_user)
       <> 300000000 then
    raise exception 'profile capacity did not synchronize from memberships';
  end if;

  if public.get_user_market_post_limit(c.trial_user) <> 3 then
    raise exception 'reserved market add-on changed the launch quota';
  end if;
end;
$$;

insert into public.plant_species (
  id,
  scientific_name,
  common_name,
  family,
  description,
  slug,
  category,
  sub_category,
  growth_type,
  entry_type,
  is_active,
  sort_order
)
select
  plant_id,
  'Testus membershipii',
  '会员权限测试植物',
  'Testaceae',
  '游客不应读取的物种描述',
  'membership-access-test-plant',
  'vegetable',
  'leafy',
  'annual',
  'species',
  true,
  99999
from membership_access_test_context;

insert into public.plant_species_i18n (
  plant_id,
  language_code,
  common_name,
  family,
  description
)
select
  plant_id,
  'zh',
  '会员权限测试植物',
  '测试科',
  '游客不应读取的本地化描述'
from membership_access_test_context;

insert into public.plant_species_aliases (
  species_id,
  language_code,
  alias_name,
  normalized_name,
  alias_type,
  relation_type
)
select
  plant_id,
  'zh',
  '权限测试别名',
  '权限测试别名',
  'alias',
  'exact'
from membership_access_test_context;

insert into public.plant_care_guides (
  plant_id,
  language_code,
  summary,
  planting_guide,
  care_guide
)
select
  plant_id,
  'zh',
  '注册后可以读取的基础概要',
  '仅云空间可读取的种植参数',
  '仅云空间可读取的完整养护内容'
from membership_access_test_context;

insert into public.plant_parameters (
  species_id,
  sun_score,
  need_trellis,
  container_friendly_score,
  indoor_friendly_score,
  balcony_friendly_score,
  soil_moisture_score,
  optimal_growth_temp_min,
  optimal_growth_temp_max
)
select plant_id, 4, true, 8, 5, 9, 3, 18, 26
from membership_access_test_context;

insert into public.plant_growth_cycle (
  species_id,
  germination_days,
  seedling_days,
  vegetative_days,
  flowering_days,
  harvest_days
)
select plant_id, 5, 12, 30, 10, 20
from membership_access_test_context;

insert into public.archives (
  id,
  user_id,
  title,
  category,
  species_id,
  is_public,
  system_name,
  species_name_snapshot
)
select
  archive_id,
  other_user,
  '会员权限公开种植项目',
  'plant',
  plant_id,
  true,
  '会员权限测试植物',
  '会员权限测试植物'
from membership_access_test_context;

do $$
begin
  if not exists (
    select 1
    from membership_access_test_context c
    join public.guide_candidate_usages usage
      on usage.archive_id = c.archive_id
     and usage.user_id = c.other_user
    join public.guide_candidates candidate
      on candidate.id = usage.candidate_id
     and candidate.created_by = c.other_user
     and candidate.category = 'plant'
     and candidate.normalized_name = public.normalize_guide_name('会员权限测试植物')
  ) then
    raise exception 'membership archive guide usage was not linked to its author';
  end if;
end;
$$;

insert into public.records (
  id,
  archive_id,
  user_id,
  note,
  visibility
)
select
  record_id,
  archive_id,
  other_user,
  '游客仍可在发现页查看的公开记录',
  'public'
from membership_access_test_context;

-- Create ended/reactivation fixtures while the transitional and paid accounts
-- are active. The expired account is moved past due immediately afterwards.
insert into public.market_posts (
  id,
  user_id,
  title,
  post_type,
  item_category,
  status
)
select
  consultation_market_id,
  other_user,
  'registered-consultation-fixture',
  'offer',
  'seed',
  'active'
from membership_access_test_context
union all
select
  trial_ended_market_id,
  trial_user,
  'trial-ended-reactivation-fixture',
  'offer',
  'seed',
  'ended'
from membership_access_test_context
union all
select
  expired_active_market_id,
  expired_user,
  'expired-active-fixture',
  'offer',
  'seed',
  'active'
from membership_access_test_context
union all
select
  expired_ended_market_id,
  expired_user,
  'expired-ended-fixture',
  'offer',
  'seed',
  'ended'
from membership_access_test_context;

insert into public.follows (follower_id, following_id)
select expired_user, other_user
from membership_access_test_context;

update public.user_memberships m
set
  status = 'expired',
  paid_until = now() - interval '1 day'
from membership_access_test_context c
where m.user_id = c.expired_user;

-- Visitors: directory columns and ordinary public content remain readable,
-- while overview text, guide details, and guide-related records stay hidden.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;

do $$
declare
  c membership_access_test_context%rowtype;
begin
  select * into c from membership_access_test_context;

  if not exists (
    select 1
    from public.plant_species ps
    where ps.id = c.plant_id
      and ps.common_name = '会员权限测试植物'
      and ps.category = 'vegetable'
  ) then
    raise exception 'visitor could not read safe plant directory columns';
  end if;

  if not exists (
    select 1
    from public.plant_species_i18n psi
    where psi.plant_id = c.plant_id
      and psi.common_name = '会员权限测试植物'
  ) then
    raise exception 'visitor could not read safe localized directory columns';
  end if;

  if not exists (
    select 1
    from public.plant_species_aliases psa
    where psa.species_id = c.plant_id
      and psa.alias_name = '权限测试别名'
  ) then
    raise exception 'visitor could not read safe plant aliases';
  end if;

  if not exists (
    select 1
    from public.records r
    where r.id = c.record_id
      and r.visibility = 'public'
  ) then
    raise exception 'visitor lost ordinary public-record browsing';
  end if;

  begin
    perform ps.description
    from public.plant_species ps
    where ps.id = c.plant_id;
    raise exception 'visitor read the plant description';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform psi.description
    from public.plant_species_i18n psi
    where psi.plant_id = c.plant_id;
    raise exception 'visitor read the localized overview';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform *
    from public.get_plant_basic_overviews(c.plant_id, 'zh');
    raise exception 'visitor called the registered-only overview RPC';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform *
    from public.get_plant_core_parameters(c.plant_id);
    raise exception 'visitor called the registered-only core-parameter RPC';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform pcg.summary
    from public.plant_care_guides pcg
    where pcg.plant_id = c.plant_id;
    raise exception 'visitor read full guide data';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform v.archive_id
    from public.plant_related_archives_view v
    where v.species_id = c.plant_id;
    raise exception 'visitor read guide-related planting records';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;

-- Registered local-free: overview, narrow core parameters, and marketplace
-- consultation work; full guidance, social writes, and publishing still fail.
select set_config(
  'request.jwt.claim.sub',
  (select local_user::text from membership_access_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  c membership_access_test_context%rowtype;
begin
  select * into c from membership_access_test_context;

  if public.has_active_cloud_access() then
    raise exception 'local-free account gained cloud access';
  end if;

  if not exists (
    select 1
    from public.get_plant_basic_overviews(c.plant_id, 'zh') o
    where o.summary = '注册后可以读取的基础概要'
  ) then
    raise exception 'registered local-free account could not read the basic overview';
  end if;

  if not exists (
    select 1
    from public.get_plant_core_parameters(c.plant_id) p
    where p.sun_score = 4
      and p.need_trellis = true
      and p.container_friendly_score = 8
      and p.indoor_friendly_score = 5
      and p.balcony_friendly_score = 9
  ) then
    raise exception 'registered local-free account could not read the core parameter subset';
  end if;

  if (select count(*) from public.plant_care_guides where plant_id = c.plant_id) <> 0
     or (select count(*) from public.plant_parameters where species_id = c.plant_id) <> 0
     or (select count(*) from public.plant_growth_cycle where species_id = c.plant_id) <> 0 then
    raise exception 'local-free account read cloud-only plant guidance';
  end if;

  begin
    perform v.archive_id
    from public.plant_related_archives_view v
    where v.species_id = c.plant_id;
    raise exception 'local-free account read guide-related records';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.follows (follower_id, following_id)
    values (c.local_user, c.other_user);
    raise exception 'local-free account created a follow';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.record_likes (record_id, user_id)
    values (c.record_id, c.local_user);
    raise exception 'local-free account created a like';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.comments (record_id, user_id, content)
    values (c.record_id, c.local_user, 'should be rejected');
    raise exception 'local-free account created a comment';
  exception when insufficient_privilege then
    null;
  end;

  insert into public.market_comments (
    market_post_id,
    user_id,
    content
  )
  values (
    c.consultation_market_id,
    c.local_user,
    'local-free marketplace consultation'
  );

  if not exists (
    select 1
    from public.market_comments mc
    where mc.market_post_id = c.consultation_market_id
      and mc.user_id = c.local_user
  ) then
    raise exception 'registered local-free account could not consult on an active market post';
  end if;

  begin
    insert into public.user_plant_interests (user_id, species_id)
    values (c.local_user, c.plant_id);
    raise exception 'local-free account created a cloud plant interest';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.market_posts (
      user_id,
      title,
      post_type,
      item_category,
      status
    )
    values (
      c.local_user,
      'local-free-market-rejected',
      'offer',
      'seed',
      'active'
    );
    raise exception 'local-free market insert was accepted';
  exception
    when insufficient_privilege then
      null;
    when raise_exception then
      if sqlerrm <> 'membership_inactive' then
        raise;
      end if;
  end;
end;
$$;

reset role;

-- Paid cloud: full guidance and all representative cloud interactions work.
select set_config(
  'request.jwt.claim.sub',
  (select cloud_user::text from membership_access_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  c membership_access_test_context%rowtype;
begin
  select * into c from membership_access_test_context;

  if not public.has_active_cloud_access() then
    raise exception 'paid cloud account lost cloud access';
  end if;

  if (select count(*) from public.plant_care_guides where plant_id = c.plant_id) <> 1
     or (select count(*) from public.plant_parameters where species_id = c.plant_id) <> 1
     or (select count(*) from public.plant_growth_cycle where species_id = c.plant_id) <> 1 then
    raise exception 'paid cloud account could not read complete guidance';
  end if;

  insert into public.follows (follower_id, following_id)
  values (c.cloud_user, c.other_user);

  insert into public.record_likes (record_id, user_id)
  values (c.record_id, c.cloud_user);

  insert into public.comments (record_id, user_id, content)
  values (c.record_id, c.cloud_user, 'cloud member comment');

  insert into public.user_plant_interests (user_id, species_id)
  values (c.cloud_user, c.plant_id);

  insert into public.market_posts (
    user_id,
    title,
    post_type,
    item_category,
    status
  )
  values (
    c.cloud_user,
    'cloud-market-allowed',
    'offer',
    'seed',
    'active'
  );
end;
$$;

reset role;

-- Existing trials keep cloud rights and their original three-post quota.
select set_config(
  'request.jwt.claim.sub',
  (select trial_user::text from membership_access_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  c membership_access_test_context%rowtype;
  v_index integer;
begin
  select * into c from membership_access_test_context;

  if not public.has_active_cloud_access()
     or (select count(*) from public.plant_parameters where species_id = c.plant_id) <> 1 then
    raise exception 'active legacy trial lost cloud-member rights';
  end if;

  for v_index in 1..3 loop
    insert into public.market_posts (
      user_id,
      title,
      post_type,
      item_category,
      status
    )
    values (
      c.trial_user,
      format('trial-active-%s', v_index),
      'offer',
      'seed',
      'active'
    );
  end loop;

  begin
    insert into public.market_posts (
      user_id,
      title,
      post_type,
      item_category,
      status
    )
    values (
      c.trial_user,
      'trial-fourth-rejected',
      'offer',
      'seed',
      'active'
    );
    raise exception 'trial exceeded its original three-post quota';
  exception
    when insufficient_privilege then
      null;
    when raise_exception then
      if sqlerrm <> 'market_post_limit_reached' then
        raise;
      end if;
  end;

  begin
    update public.market_posts
    set status = 'active'
    where id = c.trial_ended_market_id;
    raise exception 'ended trial post bypassed the active quota on reactivation';
  exception
    when insufficient_privilege then
      null;
    when raise_exception then
      if sqlerrm <> 'market_post_limit_reached' then
        raise;
      end if;
  end;

  update public.market_posts
  set status = 'ended'
  where user_id = c.trial_user
    and title = 'trial-active-1';

  update public.market_posts
  set status = 'active'
  where id = c.trial_ended_market_id;

  if public.get_user_active_market_post_count(c.trial_user) <> 3 then
    raise exception 'ended-to-active quota transition produced the wrong count';
  end if;
end;
$$;

reset role;

-- Expired users may wind down and remove existing state, but cannot reactivate
-- or read cloud-only guide data.
select set_config(
  'request.jwt.claim.sub',
  (select expired_user::text from membership_access_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  c membership_access_test_context%rowtype;
begin
  select * into c from membership_access_test_context;

  if public.has_active_cloud_access()
     or (select count(*) from public.plant_parameters where species_id = c.plant_id) <> 0 then
    raise exception 'expired account retained cloud-only access';
  end if;

  if not exists (
    select 1
    from public.get_plant_basic_overviews(c.plant_id, 'zh') o
    where o.summary = '注册后可以读取的基础概要'
  ) then
    raise exception 'expired account lost registered local-free overview access';
  end if;

  if not exists (
    select 1
    from public.get_plant_core_parameters(c.plant_id) p
    where p.sun_score = 4
      and p.need_trellis = true
  ) then
    raise exception 'expired account lost registered core-parameter access';
  end if;

  update public.market_posts
  set status = 'ended'
  where id = c.expired_active_market_id;

  if not exists (
    select 1
    from public.market_posts
    where id = c.expired_active_market_id
      and status = 'ended'
  ) then
    raise exception 'expired account could not end an existing market post';
  end if;

  begin
    update public.market_posts
    set status = 'active'
    where id = c.expired_ended_market_id;
    raise exception 'expired account reactivated an ended market post';
  exception
    when insufficient_privilege then
      null;
    when raise_exception then
      if sqlerrm <> 'membership_inactive' then
        raise;
      end if;
  end;

  delete from public.follows
  where follower_id = c.expired_user
    and following_id = c.other_user;

  if exists (
    select 1
    from public.follows
    where follower_id = c.expired_user
      and following_id = c.other_user
  ) then
    raise exception 'expired account could not remove an existing follow';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

rollback;
