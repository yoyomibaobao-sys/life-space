-- B3.5.1: add cloud trash state without moving or deleting existing content.

create table public.trash_entries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  root_type text not null,
  root_id uuid not null,
  parent_archive_id uuid,
  parent_record_id uuid,
  status text not null default 'active',
  deleted_at timestamptz not null default now(),
  restore_snapshot jsonb not null default '{}'::jsonb,
  restoring_at timestamptz,
  restored_at timestamptz,
  purging_at timestamptz,
  purged_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trash_entries_target_type_check
    check (target_type in ('archive', 'record', 'media')),
  constraint trash_entries_root_type_check
    check (root_type in ('archive', 'record', 'media')),
  constraint trash_entries_status_check
    check (status in ('active', 'restoring', 'purging', 'restored', 'purged', 'failed')),
  constraint trash_entries_root_target_check
    check (root_type = target_type and root_id = target_id),
  constraint trash_entries_parent_shape_check
    check (
      (target_type = 'archive' and parent_archive_id is null and parent_record_id is null)
      or (target_type = 'record' and parent_archive_id is not null and parent_record_id is null)
      or (target_type = 'media' and parent_archive_id is not null and parent_record_id is not null)
    )
);

comment on table public.trash_entries is
  'Root-level cloud trash operations. Descendants moved with a root share its id on their business rows.';

create unique index trash_entries_active_target_uidx
  on public.trash_entries (target_type, target_id)
  where status in ('active', 'restoring', 'purging');

create index trash_entries_owner_status_deleted_idx
  on public.trash_entries (owner_user_id, status, deleted_at desc, id desc);

create index trash_entries_root_idx
  on public.trash_entries (root_type, root_id);

create index trash_entries_parent_archive_idx
  on public.trash_entries (parent_archive_id)
  where parent_archive_id is not null;

create index trash_entries_parent_record_idx
  on public.trash_entries (parent_record_id)
  where parent_record_id is not null;

create index trash_entries_purge_work_idx
  on public.trash_entries (status, updated_at, id)
  where status in ('purging', 'failed');

create trigger trg_trash_entries_updated_at
before update on public.trash_entries
for each row execute function public.set_updated_at();

alter table public.trash_entries enable row level security;

revoke all on table public.trash_entries from public;
revoke all on table public.trash_entries from anon;
revoke all on table public.trash_entries from authenticated;
grant all on table public.trash_entries to service_role;

alter table public.archives
  add column trashed_at timestamptz,
  add column trash_entry_id uuid references public.trash_entries(id) on delete restrict;

alter table public.records
  add column trashed_at timestamptz,
  add column trash_entry_id uuid references public.trash_entries(id) on delete restrict;

alter table public.media
  add column trashed_at timestamptz,
  add column trash_entry_id uuid references public.trash_entries(id) on delete restrict;

alter table public.archives
  add constraint archives_trash_state_check
  check ((trashed_at is null) = (trash_entry_id is null));

alter table public.records
  add constraint records_trash_state_check
  check ((trashed_at is null) = (trash_entry_id is null));

alter table public.media
  add constraint media_trash_state_check
  check ((trashed_at is null) = (trash_entry_id is null));

create index archives_trash_entry_idx
  on public.archives (trash_entry_id)
  where trash_entry_id is not null;

create index records_trash_entry_idx
  on public.records (trash_entry_id)
  where trash_entry_id is not null;

create index media_trash_entry_idx
  on public.media (trash_entry_id)
  where trash_entry_id is not null;

create index archives_active_user_created_idx
  on public.archives (user_id, created_at desc, id desc)
  where trashed_at is null;

create index records_active_archive_activity_idx
  on public.records (
    archive_id,
    record_time desc nulls last,
    created_at desc nulls last,
    id desc
  )
  where trashed_at is null;

create index media_active_record_sort_idx
  on public.media (record_id, sort_order, created_at, id)
  where trashed_at is null;

create or replace function public.is_archive_not_trashed(p_archive_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.archives a
    where a.id = p_archive_id
      and a.trashed_at is null
  );
$$;

revoke all on function public.is_archive_not_trashed(uuid) from public;
grant execute on function public.is_archive_not_trashed(uuid) to anon, authenticated, service_role;

-- Core business rows: ordinary clients can only create, read, and update active rows.

drop policy if exists archives_insert_own on public.archives;
create policy archives_insert_own
on public.archives for insert
with check (
  auth.uid() = user_id
  and public.is_user_membership_active(auth.uid())
  and trashed_at is null
  and trash_entry_id is null
);

drop policy if exists archives_select_own_or_public on public.archives;
create policy archives_select_own_or_public
on public.archives for select
using (
  trashed_at is null
  and (is_public is true or auth.uid() = user_id)
);

drop policy if exists archives_update_own on public.archives;
create policy archives_update_own
on public.archives for update
using (auth.uid() = user_id and trashed_at is null)
with check (
  auth.uid() = user_id
  and trashed_at is null
  and trash_entry_id is null
);

drop policy if exists records_insert_own_active_archive on public.records;
create policy records_insert_own_active_archive
on public.records for insert
with check (
  auth.uid() = user_id
  and public.is_user_membership_active(auth.uid())
  and trashed_at is null
  and trash_entry_id is null
  and exists (
    select 1
    from public.archives a
    where a.id = records.archive_id
      and a.user_id = auth.uid()
      and a.trashed_at is null
  )
);

drop policy if exists records_select_own_or_public on public.records;
create policy records_select_own_or_public
on public.records for select
using (
  trashed_at is null
  and exists (
    select 1
    from public.archives a
    where a.id = records.archive_id
      and a.trashed_at is null
      and (
        auth.uid() = records.user_id
        or (records.visibility = 'public' and a.is_public is true)
      )
  )
);

drop policy if exists records_update_own_archive on public.records;
create policy records_update_own_archive
on public.records for update
using (
  auth.uid() = user_id
  and trashed_at is null
  and exists (
    select 1
    from public.archives a
    where a.id = records.archive_id
      and a.user_id = auth.uid()
      and a.trashed_at is null
  )
)
with check (
  auth.uid() = user_id
  and trashed_at is null
  and trash_entry_id is null
  and exists (
    select 1
    from public.archives a
    where a.id = records.archive_id
      and a.user_id = auth.uid()
      and a.trashed_at is null
  )
);

drop policy if exists media_insert_own_active_record on public.media;
create policy media_insert_own_active_record
on public.media for insert
with check (
  auth.uid() = user_id
  and public.is_user_membership_active(auth.uid())
  and trashed_at is null
  and trash_entry_id is null
  and exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = media.record_id
      and r.user_id = auth.uid()
      and r.trashed_at is null
      and a.trashed_at is null
  )
);

drop policy if exists media_select_own_or_public_record on public.media;
create policy media_select_own_or_public_record
on public.media for select
using (
  trashed_at is null
  and exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = media.record_id
      and r.trashed_at is null
      and a.trashed_at is null
      and (
        auth.uid() = media.user_id
        or (r.visibility = 'public' and a.is_public is true)
      )
  )
);

drop policy if exists media_update_own on public.media;
create policy media_update_own
on public.media for update
using (
  auth.uid() = user_id
  and trashed_at is null
  and exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = media.record_id
      and r.user_id = auth.uid()
      and r.trashed_at is null
      and a.trashed_at is null
  )
)
with check (
  auth.uid() = user_id
  and trashed_at is null
  and trash_entry_id is null
  and exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = media.record_id
      and r.user_id = auth.uid()
      and r.trashed_at is null
      and a.trashed_at is null
  )
);

-- Child tables without trash columns inherit visibility and write access from active parents.

drop policy if exists "archive cycles insert own archive" on public.archive_cycles;
create policy "archive cycles insert own archive"
on public.archive_cycles for insert
with check (
  exists (
    select 1 from public.archives a
    where a.id = archive_cycles.archive_id
      and a.user_id = auth.uid()
      and a.trashed_at is null
  )
);

drop policy if exists "archive cycles select own or public archive" on public.archive_cycles;
create policy "archive cycles select own or public archive"
on public.archive_cycles for select
using (
  exists (
    select 1 from public.archives a
    where a.id = archive_cycles.archive_id
      and a.trashed_at is null
      and (a.user_id = auth.uid() or a.is_public is true)
  )
);

drop policy if exists "archive cycles update own archive" on public.archive_cycles;
create policy "archive cycles update own archive"
on public.archive_cycles for update
using (
  exists (
    select 1 from public.archives a
    where a.id = archive_cycles.archive_id
      and a.user_id = auth.uid()
      and a.trashed_at is null
  )
)
with check (
  exists (
    select 1 from public.archives a
    where a.id = archive_cycles.archive_id
      and a.user_id = auth.uid()
      and a.trashed_at is null
  )
);

drop policy if exists "archive follows allow read" on public.archive_follows;
create policy "archive follows allow read"
on public.archive_follows for select
using (public.is_archive_not_trashed(archive_id));

drop policy if exists "archive follows allow insert own" on public.archive_follows;
create policy "archive follows allow insert own"
on public.archive_follows for insert
with check (
  auth.uid() = user_id
  and public.is_archive_not_trashed(archive_id)
);

drop policy if exists "archive follows allow delete own" on public.archive_follows;
create policy "archive follows allow delete own"
on public.archive_follows for delete
using (
  auth.uid() = user_id
  and public.is_archive_not_trashed(archive_id)
);

drop policy if exists record_tags_select_own_or_public_record on public.record_tags;
create policy record_tags_select_own_or_public_record
on public.record_tags for select
using (
  exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = record_tags.record_id
      and r.trashed_at is null
      and a.trashed_at is null
      and (
        r.user_id = auth.uid()
        or (r.visibility = 'public' and a.is_public is true)
      )
  )
);

drop policy if exists record_tags_insert_own_record on public.record_tags;
create policy record_tags_insert_own_record
on public.record_tags for insert
with check (
  exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = record_tags.record_id
      and r.user_id = auth.uid()
      and r.trashed_at is null
      and a.trashed_at is null
  )
);

drop policy if exists record_tags_update_own_record on public.record_tags;
create policy record_tags_update_own_record
on public.record_tags for update
using (
  exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = record_tags.record_id
      and r.user_id = auth.uid()
      and r.trashed_at is null
      and a.trashed_at is null
  )
)
with check (
  exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = record_tags.record_id
      and r.user_id = auth.uid()
      and r.trashed_at is null
      and a.trashed_at is null
  )
);

drop policy if exists record_tags_delete_own_record on public.record_tags;
create policy record_tags_delete_own_record
on public.record_tags for delete
using (
  exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = record_tags.record_id
      and r.user_id = auth.uid()
      and r.trashed_at is null
      and a.trashed_at is null
  )
);

drop policy if exists comments_select_visible_record on public.comments;
create policy comments_select_visible_record
on public.comments for select
using (public.can_access_record(record_id));

drop policy if exists comments_insert_own_active_visible_record on public.comments;
create policy comments_insert_own_active_visible_record
on public.comments for insert
with check (
  auth.uid() = user_id
  and public.is_user_membership_active(auth.uid())
  and public.can_access_record(record_id)
);

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
on public.comments for update
using (auth.uid() = user_id and public.can_access_record(record_id))
with check (auth.uid() = user_id and public.can_access_record(record_id));

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own
on public.comments for delete
using (auth.uid() = user_id and public.can_access_record(record_id));

drop policy if exists record_likes_select_visible_record on public.record_likes;
create policy record_likes_select_visible_record
on public.record_likes for select
using (public.can_access_record(record_id));

drop policy if exists record_likes_insert_own on public.record_likes;
create policy record_likes_insert_own
on public.record_likes for insert
with check (auth.uid() = user_id and public.can_access_record(record_id));

drop policy if exists record_likes_delete_own on public.record_likes;
create policy record_likes_delete_own
on public.record_likes for delete
using (auth.uid() = user_id and public.can_access_record(record_id));

drop policy if exists comment_likes_select_visible_record on public.comment_likes;
create policy comment_likes_select_visible_record
on public.comment_likes for select
using (
  exists (
    select 1 from public.comments c
    where c.id = comment_likes.comment_id
      and public.can_access_record(c.record_id)
  )
);

drop policy if exists comment_likes_insert_own on public.comment_likes;
create policy comment_likes_insert_own
on public.comment_likes for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.comments c
    where c.id = comment_likes.comment_id
      and public.can_access_record(c.record_id)
  )
);

drop policy if exists comment_likes_delete_own on public.comment_likes;
create policy comment_likes_delete_own
on public.comment_likes for delete
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.comments c
    where c.id = comment_likes.comment_id
      and public.can_access_record(c.record_id)
  )
);

drop policy if exists comment_flowers_select_visible_record on public.comment_flowers;
create policy comment_flowers_select_visible_record
on public.comment_flowers for select
using (public.can_access_record(record_id));

drop policy if exists comment_flowers_insert_help_owner on public.comment_flowers;
create policy comment_flowers_insert_help_owner
on public.comment_flowers for insert
with check (
  auth.uid() = sender_user_id
  and sender_user_id <> receiver_user_id
  and public.can_access_record(record_id)
  and exists (
    select 1
    from public.records r
    join public.comments c
      on c.id = comment_flowers.comment_id
     and c.record_id = r.id
    where r.id = comment_flowers.record_id
      and r.user_id = auth.uid()
      and c.user_id = comment_flowers.receiver_user_id
      and r.status_tag in ('help', 'resolved')
  )
);

drop policy if exists comment_flowers_update_sender_only on public.comment_flowers;
create policy comment_flowers_update_sender_only
on public.comment_flowers for update
using (auth.uid() = sender_user_id and public.can_access_record(record_id))
with check (auth.uid() = sender_user_id and public.can_access_record(record_id));

-- Notification rows remain stored, but ordinary clients cannot read or mutate rows
-- whose linked archive, record, or comment is in trash.

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
on public.notifications for select
using (
  auth.uid() = user_id
  and (
    archive_id is null
    or exists (
      select 1 from public.archives a
      where a.id = notifications.archive_id
        and a.trashed_at is null
    )
  )
  and (
    record_id is null
    or exists (
      select 1
      from public.records r
      join public.archives a on a.id = r.archive_id
      where r.id = notifications.record_id
        and r.trashed_at is null
        and a.trashed_at is null
    )
  )
  and (
    comment_id is null
    or exists (
      select 1
      from public.comments c
      join public.records r on r.id = c.record_id
      join public.archives a on a.id = r.archive_id
      where c.id = notifications.comment_id
        and r.trashed_at is null
        and a.trashed_at is null
    )
  )
);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
on public.notifications for update
using (
  auth.uid() = user_id
  and (
    archive_id is null
    or exists (select 1 from public.archives a where a.id = notifications.archive_id and a.trashed_at is null)
  )
  and (
    record_id is null
    or exists (
      select 1 from public.records r join public.archives a on a.id = r.archive_id
      where r.id = notifications.record_id and r.trashed_at is null and a.trashed_at is null
    )
  )
  and (
    comment_id is null
    or exists (
      select 1 from public.comments c
      join public.records r on r.id = c.record_id
      join public.archives a on a.id = r.archive_id
      where c.id = notifications.comment_id and r.trashed_at is null and a.trashed_at is null
    )
  )
)
with check (
  auth.uid() = user_id
  and (
    archive_id is null
    or exists (select 1 from public.archives a where a.id = notifications.archive_id and a.trashed_at is null)
  )
  and (
    record_id is null
    or exists (
      select 1 from public.records r join public.archives a on a.id = r.archive_id
      where r.id = notifications.record_id and r.trashed_at is null and a.trashed_at is null
    )
  )
  and (
    comment_id is null
    or exists (
      select 1 from public.comments c
      join public.records r on r.id = c.record_id
      join public.archives a on a.id = r.archive_id
      where c.id = notifications.comment_id and r.trashed_at is null and a.trashed_at is null
    )
  )
);

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own
on public.notifications for delete
using (
  auth.uid() = user_id
  and (
    archive_id is null
    or exists (select 1 from public.archives a where a.id = notifications.archive_id and a.trashed_at is null)
  )
  and (
    record_id is null
    or exists (
      select 1 from public.records r join public.archives a on a.id = r.archive_id
      where r.id = notifications.record_id and r.trashed_at is null and a.trashed_at is null
    )
  )
  and (
    comment_id is null
    or exists (
      select 1 from public.comments c
      join public.records r on r.id = c.record_id
      join public.archives a on a.id = r.archive_id
      where c.id = notifications.comment_id and r.trashed_at is null and a.trashed_at is null
    )
  )
);
