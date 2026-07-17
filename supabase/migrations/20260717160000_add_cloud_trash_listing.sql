-- B3.5.3: expose an owner-only, display-safe cloud trash listing.

create or replace function public.list_my_trash_entries()
returns table (
  target_type text,
  target_id uuid,
  deleted_at timestamptz,
  status text,
  display_title text,
  parent_title text,
  child_record_count integer,
  child_media_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_user_id as (
    select auth.uid() as id
  )
  select
    te.target_type,
    te.target_id,
    te.deleted_at,
    te.status,
    coalesce(nullif(btrim(a.title), ''), '未命名项目') as display_title,
    null::text as parent_title,
    (
      select count(*)::integer
      from public.records r
      where r.trash_entry_id = te.id
        and r.trashed_at is not null
    ) as child_record_count,
    (
      select count(*)::integer
      from public.media m
      where m.trash_entry_id = te.id
        and m.trashed_at is not null
    ) as child_media_count
  from public.trash_entries te
  join current_user_id cu on cu.id is not null
  join public.archives a
    on a.id = te.target_id
   and a.user_id = cu.id
   and a.trash_entry_id = te.id
   and a.trashed_at is not null
  where te.owner_user_id = cu.id
    and te.target_type = 'archive'
    and te.status = 'active'

  union all

  select
    te.target_type,
    te.target_id,
    te.deleted_at,
    te.status,
    left(
      coalesce(
        nullif(btrim(pg_catalog.regexp_replace(coalesce(r.note, ''), '\s+', ' ', 'g')), ''),
        '记录'
      ),
      80
    ) as display_title,
    coalesce(nullif(btrim(a.title), ''), '未命名项目') as parent_title,
    0 as child_record_count,
    (
      select count(*)::integer
      from public.media m
      where m.trash_entry_id = te.id
        and m.trashed_at is not null
    ) as child_media_count
  from public.trash_entries te
  join current_user_id cu on cu.id is not null
  join public.records r
    on r.id = te.target_id
   and r.user_id = cu.id
   and r.trash_entry_id = te.id
   and r.trashed_at is not null
  join public.archives a on a.id = r.archive_id
  where te.owner_user_id = cu.id
    and te.target_type = 'record'
    and te.status = 'active'

  union all

  select
    te.target_type,
    te.target_id,
    te.deleted_at,
    te.status,
    '照片'::text as display_title,
    coalesce(nullif(btrim(a.title), ''), '未命名项目') as parent_title,
    0 as child_record_count,
    0 as child_media_count
  from public.trash_entries te
  join current_user_id cu on cu.id is not null
  join public.media m
    on m.id = te.target_id
   and m.user_id = cu.id
   and m.trash_entry_id = te.id
   and m.trashed_at is not null
  join public.records r on r.id = m.record_id
  join public.archives a on a.id = r.archive_id
  where te.owner_user_id = cu.id
    and te.target_type = 'media'
    and te.status = 'active'

  order by deleted_at desc, target_id desc;
$$;

revoke all on function public.list_my_trash_entries() from public, anon, authenticated;
grant execute on function public.list_my_trash_entries() to authenticated;

comment on function public.list_my_trash_entries() is
  'Owner-only active cloud trash roots with display-safe titles and descendant counts. Does not expose owner ids, entry ids, snapshots, paths, or URLs.';
