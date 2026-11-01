begin;

-- Behavior restrictions are independent of membership benefits. Each active
-- restriction remains in force until an administrator explicitly releases it.
create table if not exists public.user_behavior_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  permission_key text not null,
  reason text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  released_by uuid,
  released_at timestamptz,
  release_reason text,
  constraint user_behavior_restrictions_permission_check
    check (permission_key in ('comment', 'public_publish', 'market_publish')),
  constraint user_behavior_restrictions_reason_check
    check (char_length(btrim(reason)) between 1 and 1000),
  constraint user_behavior_restrictions_release_check
    check (
      (
        released_at is null
        and released_by is null
        and release_reason is null
      )
      or
      (
        released_at is not null
        and released_by is not null
        and release_reason is not null
        and char_length(btrim(release_reason)) between 1 and 1000
      )
    )
);

alter table public.user_behavior_restrictions enable row level security;
revoke all on table public.user_behavior_restrictions
  from public, anon, authenticated, service_role;

create index if not exists user_behavior_restrictions_user_history_idx
  on public.user_behavior_restrictions (user_id, created_at desc, id desc);

create unique index if not exists user_behavior_restrictions_one_active_idx
  on public.user_behavior_restrictions (user_id, permission_key)
  where released_at is null;

comment on table public.user_behavior_restrictions is
  'Auditable, independent user behavior restrictions. Active rows have no expiry and remain active until an administrator manually releases them.';

create or replace function private.is_current_user_behavior_restricted(
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and p_permission_key in ('comment', 'public_publish', 'market_publish')
    and exists (
      select 1
      from public.user_behavior_restrictions as r
      where r.user_id = auth.uid()
        and r.permission_key = p_permission_key
        and r.released_at is null
    );
$$;

revoke all on function private.is_current_user_behavior_restricted(text)
  from public, anon, authenticated, service_role;

create or replace function private.enforce_user_behavior_restrictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permission_key text;
  v_requires_permission boolean := false;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_table_name in ('comments', 'experience_card_comments', 'market_comments') then
    v_permission_key := 'comment';
    if tg_op = 'INSERT' then
      v_requires_permission := true;
    else
      v_requires_permission := new.content is distinct from old.content;
    end if;
  elsif tg_table_name = 'archives' then
    v_permission_key := 'public_publish';
    if tg_op = 'INSERT' then
      v_requires_permission := coalesce(new.is_public, false);
    else
      v_requires_permission :=
        coalesce(new.is_public, false)
        and not coalesce(old.is_public, false);
    end if;
  elsif tg_table_name = 'records' then
    v_permission_key := 'public_publish';
    if tg_op = 'INSERT' then
      v_requires_permission := coalesce(new.visibility, 'private') = 'public';
    else
      v_requires_permission :=
        coalesce(new.visibility, 'private') = 'public'
        and new.visibility is distinct from old.visibility;
    end if;
  elsif tg_table_name = 'experience_cards' then
    v_permission_key := 'public_publish';
    if tg_op = 'INSERT' then
      v_requires_permission := new.status = 'published';
    else
      v_requires_permission :=
        new.status = 'published'
        and new.status is distinct from old.status;
    end if;
  elsif tg_table_name = 'market_posts' then
    v_permission_key := 'market_publish';
    if tg_op = 'INSERT' then
      v_requires_permission := new.status = 'active';
    else
      v_requires_permission :=
        new.status = 'active'
        and new.status is distinct from old.status;
    end if;
  end if;

  if v_requires_permission
     and private.is_current_user_behavior_restricted(v_permission_key) then
    raise exception using
      errcode = 'P0001',
      message = 'behavior_permission_restricted:' || v_permission_key;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_user_behavior_restrictions()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_behavior_restrictions_comments
  on public.comments;
create trigger trg_behavior_restrictions_comments
before insert or update on public.comments
for each row execute function private.enforce_user_behavior_restrictions();

drop trigger if exists trg_behavior_restrictions_experience_card_comments
  on public.experience_card_comments;
create trigger trg_behavior_restrictions_experience_card_comments
before insert or update on public.experience_card_comments
for each row execute function private.enforce_user_behavior_restrictions();

drop trigger if exists trg_behavior_restrictions_market_comments
  on public.market_comments;
create trigger trg_behavior_restrictions_market_comments
before insert or update on public.market_comments
for each row execute function private.enforce_user_behavior_restrictions();

drop trigger if exists trg_behavior_restrictions_archives
  on public.archives;
create trigger trg_behavior_restrictions_archives
before insert or update on public.archives
for each row execute function private.enforce_user_behavior_restrictions();

drop trigger if exists trg_behavior_restrictions_records
  on public.records;
create trigger trg_behavior_restrictions_records
before insert or update on public.records
for each row execute function private.enforce_user_behavior_restrictions();

drop trigger if exists trg_behavior_restrictions_experience_cards
  on public.experience_cards;
create trigger trg_behavior_restrictions_experience_cards
before insert or update on public.experience_cards
for each row execute function private.enforce_user_behavior_restrictions();

drop trigger if exists trg_behavior_restrictions_market_posts
  on public.market_posts;
create trigger trg_behavior_restrictions_market_posts
before insert or update on public.market_posts
for each row execute function private.enforce_user_behavior_restrictions();

create or replace function public.admin_list_user_behavior_restrictions(
  p_user_id uuid
)
returns table (
  id uuid,
  permission_key text,
  reason text,
  created_by uuid,
  created_at timestamptz,
  released_by uuid,
  released_at timestamptz,
  release_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_app_admin(auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'permission_denied';
  end if;

  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'target_user_required';
  end if;

  return query
  select
    r.id,
    r.permission_key,
    r.reason,
    r.created_by,
    r.created_at,
    r.released_by,
    r.released_at,
    r.release_reason
  from public.user_behavior_restrictions as r
  where r.user_id = p_user_id
  order by r.created_at desc, r.id desc
  limit 50;
end;
$$;

revoke all on function public.admin_list_user_behavior_restrictions(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_list_user_behavior_restrictions(uuid)
  to authenticated, service_role;

create or replace function public.admin_set_user_behavior_restriction(
  p_user_id uuid,
  p_permission_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_permission_key text := lower(btrim(coalesce(p_permission_key, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_restriction_id uuid;
begin
  if v_admin_id is null or not public.is_app_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'target_user_required');
  end if;

  if v_permission_key not in ('comment', 'public_publish', 'market_publish') then
    return jsonb_build_object('ok', false, 'error', 'invalid_permission');
  end if;

  if v_reason is null then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if char_length(v_reason) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'reason_too_long');
  end if;

  if not exists (
    select 1
    from auth.users as u
    join public.profiles as p on p.id = u.id
    where u.id = p_user_id
      and u.deleted_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'target_not_found');
  end if;

  insert into public.user_behavior_restrictions (
    user_id,
    permission_key,
    reason,
    created_by
  )
  values (
    p_user_id,
    v_permission_key,
    v_reason,
    v_admin_id
  )
  on conflict (user_id, permission_key) where released_at is null
  do nothing
  returning id into v_restriction_id;

  if v_restriction_id is null then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'error', 'already_restricted'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'id', v_restriction_id,
    'permission_key', v_permission_key
  );
end;
$$;

revoke all on function public.admin_set_user_behavior_restriction(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_set_user_behavior_restriction(uuid, text, text)
  to authenticated, service_role;

create or replace function public.admin_release_user_behavior_restriction(
  p_user_id uuid,
  p_permission_key text,
  p_release_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_permission_key text := lower(btrim(coalesce(p_permission_key, '')));
  v_release_reason text := nullif(btrim(coalesce(p_release_reason, '')), '');
  v_restriction_id uuid;
begin
  if v_admin_id is null or not public.is_app_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'target_user_required');
  end if;

  if v_permission_key not in ('comment', 'public_publish', 'market_publish') then
    return jsonb_build_object('ok', false, 'error', 'invalid_permission');
  end if;

  if v_release_reason is null then
    return jsonb_build_object('ok', false, 'error', 'release_reason_required');
  end if;
  if char_length(v_release_reason) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'reason_too_long');
  end if;

  update public.user_behavior_restrictions as r
  set
    released_by = v_admin_id,
    released_at = now(),
    release_reason = v_release_reason
  where r.user_id = p_user_id
    and r.permission_key = v_permission_key
    and r.released_at is null
  returning r.id into v_restriction_id;

  if v_restriction_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_restricted');
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'id', v_restriction_id,
    'permission_key', v_permission_key
  );
end;
$$;

revoke all on function public.admin_release_user_behavior_restriction(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_release_user_behavior_restriction(uuid, text, text)
  to authenticated, service_role;

comment on function public.admin_set_user_behavior_restriction(uuid, text, text) is
  'Applies one independent behavior restriction. No automatic expiry; an administrator must explicitly release it.';
comment on function public.admin_release_user_behavior_restriction(uuid, text, text) is
  'Manually releases one active behavior restriction and preserves the original restriction and release audit.';

notify pgrst, 'reload schema';

commit;
