-- LOCAL SUPABASE ONLY. Experience-card ownership, membership, publication,
-- source visibility, and source-reference behavior.

begin;

create temporary table experience_card_test_context (
  cloud_user uuid not null,
  archive_id uuid not null,
  other_archive_id uuid not null,
  record_one uuid not null,
  record_two uuid not null,
  record_three uuid not null,
  record_unselected uuid not null,
  record_other_archive uuid not null,
  cover_media_id uuid not null,
  card_id uuid
);

grant select, update on experience_card_test_context
  to anon, authenticated;

insert into experience_card_test_context
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
  null;

insert into public.users (id, username, cloud_enabled)
select cloud_user, 'experience-card-cloud-user', true
from experience_card_test_context;

insert into public.profiles (id, username)
select cloud_user, 'experience-card-cloud-user'
from experience_card_test_context;

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
  null,
  now() + interval '1 year',
  1000000000,
  30
from experience_card_test_context;

insert into public.archives (
  id,
  user_id,
  title,
  category,
  is_public
)
select archive_id, cloud_user, '经验卡测试项目', 'plant', false
from experience_card_test_context
union all
select other_archive_id, cloud_user, '另一个项目', 'plant', false
from experience_card_test_context;

insert into public.records (
  id,
  archive_id,
  user_id,
  note,
  record_time,
  visibility
)
select record_one, archive_id, cloud_user, '起点记录', now() - interval '3 days', 'private'
from experience_card_test_context
union all
select record_two, archive_id, cloud_user, '过程记录', now() - interval '2 days', 'private'
from experience_card_test_context
union all
select record_three, archive_id, cloud_user, '结果记录', now() - interval '1 day', 'private'
from experience_card_test_context
union all
select record_unselected, archive_id, cloud_user, '未选择记录', now(), 'private'
from experience_card_test_context
union all
select record_other_archive, other_archive_id, cloud_user, '其他项目记录', now(), 'private'
from experience_card_test_context;

insert into public.media (
  id,
  record_id,
  user_id,
  type,
  url,
  sort_order
)
select
  cover_media_id,
  record_one,
  cloud_user,
  'image',
  'https://example.invalid/experience-card-cover.jpg',
  0
from experience_card_test_context;

insert into public.records (
  id,
  archive_id,
  user_id,
  note,
  record_time,
  visibility
)
select
  gen_random_uuid(),
  c.archive_id,
  c.cloud_user,
  '额外记录' || extra.sequence_no,
  now() + make_interval(secs => extra.sequence_no),
  'private'
from experience_card_test_context as c
cross join generate_series(1, 9) as extra(sequence_no);

select set_config(
  'request.jwt.claim.sub',
  (select cloud_user::text from experience_card_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  c experience_card_test_context%rowtype;
  v_record_ids uuid[];
  v_unlimited_card_id uuid;
begin
  select * into c from experience_card_test_context;

  begin
    perform public.save_experience_card(
      null,
      c.archive_id,
      '无效跨项目经验卡',
      array[c.record_one, c.record_two, c.record_other_archive],
      c.cover_media_id
    );
    raise exception 'cross-archive experience card was accepted';
  exception when raise_exception then
    if sqlerrm <> 'experience_card_records_must_share_archive' then
      raise;
    end if;
  end;

  begin
    insert into public.experience_cards (
      user_id,
      archive_id,
      title,
      source_record_count
    )
    values (
      c.cloud_user,
      c.archive_id,
      'direct insert must fail',
      3
    );
    raise exception 'authenticated user inserted a card without the RPC';
  exception when insufficient_privilege then
    null;
  end;

  select array_agg(r.id order by r.record_time, r.id)
  into v_record_ids
  from public.records as r
  where r.archive_id = c.archive_id
    and r.user_id = c.cloud_user
    and r.trashed_at is null;

  if cardinality(v_record_ids) <= 12 then
    raise exception 'unlimited source test did not prepare more than 12 records';
  end if;

  v_unlimited_card_id := public.save_experience_card(
    null,
    c.archive_id,
    '超过十二条的长期经验',
    v_record_ids,
    c.cover_media_id
  );

  if not exists (
    select 1
    from public.experience_cards as card
    where card.id = v_unlimited_card_id
      and card.source_record_count = cardinality(v_record_ids)
  ) then
    raise exception 'experience card still rejected more than 12 records';
  end if;

  if not public.delete_experience_card(v_unlimited_card_id) then
    raise exception 'unlimited source test card could not be deleted';
  end if;
end;
$$;

update experience_card_test_context
set card_id = public.save_experience_card(
  null,
  archive_id,
  '三天生长经验',
  array[record_three, record_one, record_two],
  cover_media_id
);

do $$
declare
  c experience_card_test_context%rowtype;
begin
  select * into c from experience_card_test_context;

  if not exists (
    select 1
    from public.experience_cards card
    where card.id = c.card_id
      and card.status = 'draft'
      and card.source_record_count = 3
  ) then
    raise exception 'valid card draft was not created';
  end if;

  if (
    select count(*)
    from public.experience_card_records cr
    where cr.card_id = c.card_id
  ) <> 3 then
    raise exception 'card did not retain exactly three source references';
  end if;

  if not public.update_experience_card_description(
    c.card_id,
    '从播种到出苗的关键条件与结果。'
  ) then
    raise exception 'experience-card description update returned false';
  end if;

  if not exists (
    select 1
    from public.experience_cards card
    where card.id = c.card_id
      and card.description = '从播种到出苗的关键条件与结果。'
      and card.status = 'draft'
      and card.source_record_count = 3
  ) then
    raise exception 'experience-card description was not saved';
  end if;

  begin
    update public.experience_cards
    set description = '绕过描述RPC'
    where id = c.card_id;
    raise exception 'authenticated user directly updated a card description';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.update_experience_card_description(
      c.card_id,
      repeat('字', 501)
    );
    raise exception 'experience-card description accepted more than 500 characters';
  exception when raise_exception then
    if sqlerrm <> 'experience_card_description_invalid' then
      raise;
    end if;
  end;
end;
$$;

reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;

do $$
declare
  c experience_card_test_context%rowtype;
begin
  select * into c from experience_card_test_context;

  if exists (
    select 1
    from public.experience_cards card
    where card.id = c.card_id
  ) then
    raise exception 'visitor read a private experience-card draft';
  end if;
end;
$$;

reset role;

select set_config(
  'request.jwt.claim.sub',
  (select cloud_user::text from experience_card_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  c experience_card_test_context%rowtype;
begin
  select * into c from experience_card_test_context;

  if not public.publish_experience_card(c.card_id) then
    raise exception 'valid experience card did not publish';
  end if;
end;
$$;

reset role;

do $$
declare
  c experience_card_test_context%rowtype;
begin
  select * into c from experience_card_test_context;

  if not exists (
    select 1
    from public.archives a
    where a.id = c.archive_id
      and a.is_public is true
  ) then
    raise exception 'publishing did not expose the archive shell';
  end if;

  if (
    select count(*)
    from public.records r
    where r.id in (c.record_one, c.record_two, c.record_three)
      and r.visibility = 'public'
  ) <> 3 then
    raise exception 'publishing did not expose all selected records';
  end if;

  if exists (
    select 1
    from public.records r
    where r.id = c.record_unselected
      and r.visibility = 'public'
  ) then
    raise exception 'publishing exposed an unselected record';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (select cloud_user::text from experience_card_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  c experience_card_test_context%rowtype;
  v_published_at timestamptz;
begin
  select * into c from experience_card_test_context;

  select card.published_at
  into v_published_at
  from public.experience_cards as card
  where card.id = c.card_id;

  perform public.save_experience_card(
    c.card_id,
    c.archive_id,
    '公开状态下修改后的经验卡',
    array[c.record_one, c.record_two, c.record_unselected],
    c.cover_media_id
  );

  if not exists (
    select 1
    from public.experience_cards as card
    where card.id = c.card_id
      and card.status = 'published'
      and card.published_at = v_published_at
      and card.title = '公开状态下修改后的经验卡'
      and card.source_record_count = 3
  ) then
    raise exception 'saving published content changed its visibility';
  end if;

  if not exists (
    select 1
    from public.records as r
    where r.id = c.record_unselected
      and r.visibility = 'public'
  ) then
    raise exception 'saving a published card did not publish its newly selected source';
  end if;

  if not public.is_experience_card_public(c.card_id) then
    raise exception 'saving published content interrupted public availability';
  end if;
end;
$$;

reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;

do $$
declare
  c experience_card_test_context%rowtype;
begin
  select * into c from experience_card_test_context;

  if not public.is_experience_card_public(c.card_id)
     or not exists (
       select 1
       from public.experience_cards card
       where card.id = c.card_id
         and card.description = '从播种到出苗的关键条件与结果。'
     )
     or (
       select count(*)
       from public.experience_card_records cr
       where cr.card_id = c.card_id
     ) <> 3 then
    raise exception 'visitor could not read the valid published card';
  end if;
end;
$$;

reset role;

select set_config(
  'request.jwt.claim.sub',
  (select cloud_user::text from experience_card_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

update public.records
set visibility = 'private'
where id = (select record_two from experience_card_test_context);

reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;

do $$
declare
  c experience_card_test_context%rowtype;
begin
  select * into c from experience_card_test_context;

  if public.is_experience_card_public(c.card_id)
     or exists (
       select 1
       from public.experience_cards card
       where card.id = c.card_id
     ) then
    raise exception 'card remained public after one source became private';
  end if;
end;
$$;

reset role;

update public.records
set visibility = 'public'
where id = (select record_two from experience_card_test_context);

update public.user_memberships
set paid_until = now() - interval '1 day'
where user_id = (select cloud_user from experience_card_test_context);

select set_config(
  'request.jwt.claim.sub',
  (select cloud_user::text from experience_card_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  c experience_card_test_context%rowtype;
begin
  select * into c from experience_card_test_context;

  if not public.unpublish_experience_card(c.card_id) then
    raise exception 'expired owner could not unpublish an existing card';
  end if;

  begin
    perform public.save_experience_card(
      c.card_id,
      c.archive_id,
      '过期后不应允许修改',
      array[c.record_one, c.record_two, c.record_three],
      c.cover_media_id
    );
    raise exception 'expired owner modified an experience card';
  exception when raise_exception then
    if sqlerrm <> 'experience_card_cloud_access_required' then
      raise;
    end if;
  end;

  begin
    perform public.update_experience_card_description(
      c.card_id,
      '过期后不应允许修改描述'
    );
    raise exception 'expired owner modified an experience-card description';
  exception when raise_exception then
    if sqlerrm <> 'experience_card_cloud_access_required' then
      raise;
    end if;
  end;

  if not public.delete_experience_card(c.card_id) then
    raise exception 'expired owner could not delete an existing card';
  end if;
end;
$$;

reset role;

rollback;
