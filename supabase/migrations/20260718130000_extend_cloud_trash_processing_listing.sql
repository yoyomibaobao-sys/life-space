-- B3.5.4 phase 2: expose owner-only active, purging, and failed root entries.

drop function if exists public.list_my_trash_entries();

create function public.list_my_trash_entries()
returns table (
  trash_entry_id uuid,
  target_type text,
  target_id uuid,
  deleted_at timestamptz,
  status text,
  display_title text,
  parent_title text,
  child_record_count integer,
  child_media_count integer,
  can_retry boolean
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
    te.id as trash_entry_id,
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
    ) as child_media_count,
    (
      te.status = 'failed'
      and te.deletion_job_id is not null
      and not te.capacity_reconciliation_required
    ) as can_retry
  from public.trash_entries te
  join current_user_id cu on cu.id is not null
  left join public.archives a
    on a.id = te.target_id
   and a.user_id = cu.id
   and a.trash_entry_id = te.id
   and a.trashed_at is not null
  where te.owner_user_id = cu.id
    and te.target_type = 'archive'
    and te.root_type = te.target_type
    and te.root_id = te.target_id
    and te.status in ('active', 'purging', 'failed')

  union all

  select
    te.id as trash_entry_id,
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
    ) as child_media_count,
    (
      te.status = 'failed'
      and te.deletion_job_id is not null
      and not te.capacity_reconciliation_required
    ) as can_retry
  from public.trash_entries te
  join current_user_id cu on cu.id is not null
  left join public.records r
    on r.id = te.target_id
   and r.user_id = cu.id
   and r.trash_entry_id = te.id
   and r.trashed_at is not null
  left join public.archives a
    on a.id = te.parent_archive_id
   and a.user_id = cu.id
  where te.owner_user_id = cu.id
    and te.target_type = 'record'
    and te.root_type = te.target_type
    and te.root_id = te.target_id
    and te.status in ('active', 'purging', 'failed')

  union all

  select
    te.id as trash_entry_id,
    te.target_type,
    te.target_id,
    te.deleted_at,
    te.status,
    '照片'::text as display_title,
    coalesce(nullif(btrim(a.title), ''), '未命名项目') as parent_title,
    0 as child_record_count,
    0 as child_media_count,
    (
      te.status = 'failed'
      and te.deletion_job_id is not null
      and not te.capacity_reconciliation_required
    ) as can_retry
  from public.trash_entries te
  join current_user_id cu on cu.id is not null
  left join public.records r
    on r.id = te.parent_record_id
   and r.user_id = cu.id
  left join public.archives a
    on a.id = te.parent_archive_id
   and a.user_id = cu.id
  where te.owner_user_id = cu.id
    and te.target_type = 'media'
    and te.root_type = te.target_type
    and te.root_id = te.target_id
    and te.status in ('active', 'purging', 'failed')

  order by deleted_at desc, trash_entry_id desc;
$$;

revoke all on function public.list_my_trash_entries()
  from public, anon, authenticated;
grant execute on function public.list_my_trash_entries()
  to authenticated;

comment on function public.list_my_trash_entries() is
  'Owner-only active, purging, and failed cloud trash roots with display-safe fields. Does not expose owner ids, deletion jobs, paths, URLs, or internal errors.';
