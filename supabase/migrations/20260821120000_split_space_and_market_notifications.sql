-- Keep cultivation-space interactions and marketplace consultations in separate
-- notification surfaces. Marketplace comments can now target a specific
-- earlier comment so the recipient receives an explicit reply notice.

alter table public.market_comments
  add column if not exists parent_comment_id uuid;

alter table public.market_comments
  drop constraint if exists market_comments_parent_comment_id_fkey;
alter table public.market_comments
  add constraint market_comments_parent_comment_id_fkey
  foreign key (parent_comment_id)
  references public.market_comments(id)
  on delete set null;

create index if not exists market_comments_parent_idx
  on public.market_comments(parent_comment_id)
  where parent_comment_id is not null;

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
    'experience_helpful',
    'market_comment',
    'market_reply'
  ));

create or replace function private.notify_on_market_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_owner_id uuid;
  v_post_title text;
  v_actor_name text;
  v_parent_user_id uuid;
  v_parent_post_id uuid;
  v_related_url text;
begin
  select mp.user_id, mp.title
  into v_post_owner_id, v_post_title
  from public.market_posts as mp
  where mp.id = new.market_post_id;

  select coalesce(p.username, '有人')
  into v_actor_name
  from public.profiles as p
  where p.id = new.user_id;

  v_related_url := '/market/' || new.market_post_id::text
    || '#market-comment-' || new.id::text;

  if new.parent_comment_id is not null then
    select mc.user_id, mc.market_post_id
    into v_parent_user_id, v_parent_post_id
    from public.market_comments as mc
    where mc.id = new.parent_comment_id;

    if v_parent_post_id is null or v_parent_post_id <> new.market_post_id then
      raise exception 'market comment reply must target the same market post';
    end if;

    perform public.create_notification(
      v_parent_user_id,
      new.user_id,
      'market_reply',
      coalesce(v_actor_name, '有人') || ' 回复了你的集市留言',
      left(new.content, 80),
      null,
      null,
      null,
      v_related_url,
      jsonb_build_object(
        'market_post_id', new.market_post_id,
        'market_comment_id', new.id,
        'parent_comment_id', new.parent_comment_id,
        'market_post_title', v_post_title
      )
    );
  end if;

  if v_post_owner_id is not null
     and v_post_owner_id <> new.user_id
     and (v_parent_user_id is null or v_post_owner_id <> v_parent_user_id) then
    perform public.create_notification(
      v_post_owner_id,
      new.user_id,
      'market_comment',
      coalesce(v_actor_name, '有人') || ' 留言了你的集市发布',
      left(new.content, 80),
      null,
      null,
      null,
      v_related_url,
      jsonb_build_object(
        'market_post_id', new.market_post_id,
        'market_comment_id', new.id,
        'market_post_title', v_post_title
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function private.notify_on_market_comment_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_notify_market_comment_insert
  on public.market_comments;
create trigger trg_notify_market_comment_insert
after insert on public.market_comments
for each row execute function private.notify_on_market_comment_insert();

comment on column public.market_comments.parent_comment_id is
  'Optional earlier comment on the same market post that this consultation reply targets.';
