-- Experience-card comments, private bookmarks and restrained "helpful" feedback.
-- Interaction writes require an active cloud-space membership. Public readers
-- receive aggregate counts only; bookmark/helpful user lists are not public.

create table if not exists public.experience_card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.experience_cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experience_card_comments_content_check
    check (char_length(btrim(content)) between 1 and 1000)
);

create table if not exists public.experience_card_bookmarks (
  card_id uuid not null references public.experience_cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

create table if not exists public.experience_card_helpful_marks (
  card_id uuid not null references public.experience_cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

create index if not exists experience_card_comments_card_created_idx
  on public.experience_card_comments (card_id, created_at, id);
create index if not exists experience_card_comments_user_created_idx
  on public.experience_card_comments (user_id, created_at desc, id desc);
create index if not exists experience_card_bookmarks_user_created_idx
  on public.experience_card_bookmarks (user_id, created_at desc, card_id);
create index if not exists experience_card_helpful_user_created_idx
  on public.experience_card_helpful_marks (user_id, created_at desc, card_id);

alter table public.experience_card_comments enable row level security;
alter table public.experience_card_bookmarks enable row level security;
alter table public.experience_card_helpful_marks enable row level security;

drop trigger if exists trg_experience_card_comments_updated_at
  on public.experience_card_comments;
create trigger trg_experience_card_comments_updated_at
before update on public.experience_card_comments
for each row execute function public.set_updated_at();

drop policy if exists experience_card_comments_select_accessible
  on public.experience_card_comments;
create policy experience_card_comments_select_accessible
on public.experience_card_comments
for select
to anon, authenticated
using (public.can_access_experience_card(card_id));

drop policy if exists experience_card_comments_insert_active_member
  on public.experience_card_comments;
create policy experience_card_comments_insert_active_member
on public.experience_card_comments
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
  and public.is_experience_card_public(card_id)
);

drop policy if exists experience_card_comments_update_own
  on public.experience_card_comments;
create policy experience_card_comments_update_own
on public.experience_card_comments
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and public.is_experience_card_public(card_id)
);

drop policy if exists experience_card_comments_delete_own_or_card_owner
  on public.experience_card_comments;
create policy experience_card_comments_delete_own_or_card_owner
on public.experience_card_comments
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.experience_cards as c
    where c.id = experience_card_comments.card_id
      and c.user_id = (select auth.uid())
  )
);

drop policy if exists experience_card_bookmarks_select_own
  on public.experience_card_bookmarks;
create policy experience_card_bookmarks_select_own
on public.experience_card_bookmarks
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists experience_card_bookmarks_insert_active_member
  on public.experience_card_bookmarks;
create policy experience_card_bookmarks_insert_active_member
on public.experience_card_bookmarks
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
  and public.is_experience_card_public(card_id)
  and exists (
    select 1
    from public.experience_cards as c
    where c.id = experience_card_bookmarks.card_id
      and c.user_id <> (select auth.uid())
  )
);

drop policy if exists experience_card_bookmarks_delete_own
  on public.experience_card_bookmarks;
create policy experience_card_bookmarks_delete_own
on public.experience_card_bookmarks
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists experience_card_helpful_select_participant
  on public.experience_card_helpful_marks;
create policy experience_card_helpful_select_participant
on public.experience_card_helpful_marks
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.experience_cards as c
    where c.id = experience_card_helpful_marks.card_id
      and c.user_id = (select auth.uid())
  )
);

drop policy if exists experience_card_helpful_insert_active_member
  on public.experience_card_helpful_marks;
create policy experience_card_helpful_insert_active_member
on public.experience_card_helpful_marks
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.is_user_membership_active((select auth.uid()))
  and public.is_experience_card_public(card_id)
  and exists (
    select 1
    from public.experience_cards as c
    where c.id = experience_card_helpful_marks.card_id
      and c.user_id <> (select auth.uid())
  )
);

drop policy if exists experience_card_helpful_delete_own
  on public.experience_card_helpful_marks;
create policy experience_card_helpful_delete_own
on public.experience_card_helpful_marks
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.experience_card_comments
  from public, anon, authenticated;
revoke all on table public.experience_card_bookmarks
  from public, anon, authenticated;
revoke all on table public.experience_card_helpful_marks
  from public, anon, authenticated;
grant select on table public.experience_card_comments to anon, authenticated;
grant insert, update, delete on table public.experience_card_comments to authenticated;
grant select, insert, delete on table public.experience_card_bookmarks to authenticated;
grant select, insert, delete on table public.experience_card_helpful_marks to authenticated;
grant all on table public.experience_card_comments,
  public.experience_card_bookmarks,
  public.experience_card_helpful_marks to service_role;

create or replace function public.get_experience_card_interaction_summaries(
  p_card_ids uuid[]
)
returns table (
  card_id uuid,
  comment_count integer,
  bookmark_count integer,
  helpful_count integer,
  bookmarked_by_me boolean,
  helpful_by_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    (
      select count(*)::integer
      from public.experience_card_comments as cc
      where cc.card_id = c.id
    ),
    (
      select count(*)::integer
      from public.experience_card_bookmarks as cb
      where cb.card_id = c.id
    ),
    (
      select count(*)::integer
      from public.experience_card_helpful_marks as ch
      where ch.card_id = c.id
    ),
    exists (
      select 1
      from public.experience_card_bookmarks as cb
      where cb.card_id = c.id
        and cb.user_id = auth.uid()
    ),
    exists (
      select 1
      from public.experience_card_helpful_marks as ch
      where ch.card_id = c.id
        and ch.user_id = auth.uid()
    )
  from public.experience_cards as c
  where c.id = any(coalesce(p_card_ids, array[]::uuid[]))
    and public.can_access_experience_card(c.id);
$$;

revoke all on function public.get_experience_card_interaction_summaries(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.get_experience_card_interaction_summaries(uuid[])
  to anon, authenticated, service_role;

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'comment',
    'user_follow',
    'archive_follow',
    'flower',
    'followed_archive_record',
    'experience_comment',
    'experience_helpful'
  ));

create or replace function public.notify_on_comment_flower_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_archive_id uuid;
  v_archive_title text;
begin
  select coalesce(p.username, '有人')
  into v_actor_name
  from public.profiles as p
  where p.id = new.sender_user_id;

  select r.archive_id, a.title
  into v_archive_id, v_archive_title
  from public.records as r
  left join public.archives as a on a.id = r.archive_id
  where r.id = new.record_id;

  perform public.create_notification(
    new.receiver_user_id,
    new.sender_user_id,
    'flower',
    coalesce(v_actor_name, '有人') || ' 认为你的回答有帮助',
    v_archive_title,
    v_archive_id,
    new.record_id,
    new.comment_id,
    '/archive/' || v_archive_id::text,
    jsonb_build_object('archive_title', v_archive_title, 'feedback_name', '有帮助')
  );
  return new;
end;
$$;

revoke all on function public.notify_on_comment_flower_insert()
  from public, anon, authenticated, service_role;

create or replace function private.notify_on_experience_card_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_actor_name text;
  v_card_title text;
begin
  select c.user_id, c.title
  into v_owner_id, v_card_title
  from public.experience_cards as c
  where c.id = new.card_id;

  select coalesce(p.username, '有人')
  into v_actor_name
  from public.profiles as p
  where p.id = new.user_id;

  perform public.create_notification(
    v_owner_id,
    new.user_id,
    'experience_comment',
    coalesce(v_actor_name, '有人') || ' 评论了你的经验卡',
    left(new.content, 80),
    null,
    null,
    null,
    '/experience-cards/' || new.card_id::text,
    jsonb_build_object('experience_card_id', new.card_id, 'card_title', v_card_title)
  );
  return new;
end;
$$;

create or replace function private.notify_on_experience_card_helpful_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_actor_name text;
  v_card_title text;
begin
  select c.user_id, c.title
  into v_owner_id, v_card_title
  from public.experience_cards as c
  where c.id = new.card_id;

  select coalesce(p.username, '有人')
  into v_actor_name
  from public.profiles as p
  where p.id = new.user_id;

  perform public.create_notification(
    v_owner_id,
    new.user_id,
    'experience_helpful',
    coalesce(v_actor_name, '有人') || ' 认为你的经验卡有帮助',
    v_card_title,
    null,
    null,
    null,
    '/experience-cards/' || new.card_id::text,
    jsonb_build_object('experience_card_id', new.card_id, 'card_title', v_card_title)
  );
  return new;
end;
$$;

revoke all on function private.notify_on_experience_card_comment_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.notify_on_experience_card_helpful_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_notify_experience_card_comment_insert
  on public.experience_card_comments;
create trigger trg_notify_experience_card_comment_insert
after insert on public.experience_card_comments
for each row execute function private.notify_on_experience_card_comment_insert();

drop trigger if exists trg_notify_experience_card_helpful_insert
  on public.experience_card_helpful_marks;
create trigger trg_notify_experience_card_helpful_insert
after insert on public.experience_card_helpful_marks
for each row execute function private.notify_on_experience_card_helpful_insert();

comment on table public.experience_card_bookmarks is
  'Private user collections for public experience cards. Public clients receive aggregate counts only.';
comment on table public.experience_card_helpful_marks is
  'Restrained one-per-user helpful feedback for public experience cards; replaces flower imagery in the product UI.';
