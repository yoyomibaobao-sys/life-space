-- B3.5.1: keep trashed cloud content out of ordinary views, helpers, stats, and storage access.

create or replace function public.can_access_record(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = p_record_id
      and r.trashed_at is null
      and a.trashed_at is null
      and (
        auth.uid() = r.user_id
        or (r.visibility = 'public' and a.is_public is true)
      )
  );
$$;

create or replace function public.is_record_owner(p_record_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = p_record_id
      and r.user_id = p_user_id
      and r.trashed_at is null
      and a.trashed_at is null
  );
$$;

create or replace function public.get_public_user_space_group_tags(p_user_id uuid)
returns table (
  id uuid,
  user_id uuid,
  name text,
  created_at timestamp without time zone,
  sub_tag_id uuid
)
language sql
security definer
set search_path = ''
as $$
  select distinct
    gt.id,
    gt.user_id,
    gt.name,
    gt.created_at,
    a.sub_tag_id
  from public.group_tags gt
  join public.archives a
    on a.group_tag_id = gt.id
   and a.user_id = gt.user_id
  where gt.user_id = p_user_id
    and a.is_public is true
    and a.trashed_at is null
    and a.sub_tag_id is not null
  order by gt.created_at asc;
$$;

create or replace function public.increment_archive_view_count(p_archive_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_count integer;
begin
  update public.archives
  set view_count = coalesce(view_count, 0) + 1
  where id = p_archive_id
    and is_public is true
    and trashed_at is null
  returning view_count into next_count;

  return coalesce(next_count, 0);
end;
$$;

create or replace function public.mark_archive_ended(p_archive_id uuid)
returns public.archives
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_archive public.archives;
begin
  update public.archives
  set status = 'ended', ended_at = coalesce(ended_at, now())
  where id = p_archive_id
    and user_id = auth.uid()
    and trashed_at is null
  returning * into updated_archive;

  return updated_archive;
end;
$$;

create or replace function public.restore_archive_active(p_archive_id uuid)
returns public.archives
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_archive public.archives;
begin
  update public.archives
  set status = 'active', ended_at = null
  where id = p_archive_id
    and user_id = auth.uid()
    and trashed_at is null
  returning * into updated_archive;

  return updated_archive;
end;
$$;

create or replace function public.mark_archive_help_open(p_archive_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status text;
begin
  update public.archives
  set
    help_status = 'open',
    help_opened_at = coalesce(help_opened_at, now()),
    help_resolved_at = null,
    help_updated_at = now()
  where id = p_archive_id
    and user_id = auth.uid()
    and trashed_at is null
  returning help_status into next_status;

  return coalesce(next_status, 'none');
end;
$$;

create or replace function public.mark_archive_help_resolved(p_archive_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status text;
begin
  update public.archives
  set
    help_status = 'resolved',
    help_resolved_at = now(),
    help_updated_at = now()
  where id = p_archive_id
    and user_id = auth.uid()
    and trashed_at is null
  returning help_status into next_status;

  return coalesce(next_status, 'none');
end;
$$;

create or replace function public.clear_archive_help_status(p_archive_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status text;
begin
  update public.archives
  set
    help_status = 'none',
    help_opened_at = null,
    help_resolved_at = null,
    help_updated_at = now()
  where id = p_archive_id
    and user_id = auth.uid()
    and trashed_at is null
  returning help_status into next_status;

  return coalesce(next_status, 'none');
end;
$$;

create or replace function public.enforce_record_privacy_by_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_archive record;
begin
  select id, user_id, is_public
  into target_archive
  from public.archives
  where id = new.archive_id
    and trashed_at is null;

  if target_archive.id is null then
    raise exception 'Archive does not exist';
  end if;

  if new.user_id is distinct from target_archive.user_id then
    raise exception 'Record user_id must match archive owner';
  end if;

  if new.visibility is null or new.visibility not in ('public', 'private') then
    new.visibility := 'private';
  end if;

  if target_archive.is_public is not true then
    new.visibility := 'private';
  end if;

  return new;
end;
$$;

create or replace function public.private_archive_forces_private_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_public is not true then
    update public.records
    set visibility = 'private'
    where archive_id = new.id
      and trashed_at is null
      and visibility <> 'private';
  end if;

  return new;
end;
$$;

create or replace function public.delete_archive_cycle(p_cycle_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archive_id uuid;
  v_owner_id uuid;
  v_moved_record_count integer := 0;
begin
  select ac.archive_id, a.user_id
  into v_archive_id, v_owner_id
  from public.archive_cycles ac
  join public.archives a on a.id = ac.archive_id
  where ac.id = p_cycle_id
    and a.trashed_at is null
  for update of ac;

  if not found then
    raise exception using errcode = 'P0002', message = 'archive_cycle_not_found';
  end if;

  if auth.uid() is null or v_owner_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'archive_cycle_delete_forbidden';
  end if;

  update public.records
  set cycle_id = null
  where cycle_id = p_cycle_id
    and archive_id = v_archive_id
    and trashed_at is null;

  get diagnostics v_moved_record_count = row_count;

  delete from public.archive_cycles
  where id = p_cycle_id
    and archive_id = v_archive_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'archive_cycle_not_found';
  end if;

  return v_moved_record_count;
end;
$$;

-- Derived archive and record statistics ignore rows that are in trash.

create or replace function public.sync_archive_stats(p_archive_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_archive_id is null then
    return;
  end if;

  update public.archives a
  set
    record_count = (
      select count(*)::integer
      from public.records r
      where r.archive_id = p_archive_id
        and r.trashed_at is null
    ),
    last_record_time = (
      select max(r.record_time)
      from public.records r
      where r.archive_id = p_archive_id
        and r.trashed_at is null
    ),
    (cover_image_url, cover_image_path, cover_thumb_path) = (
      select r.primary_image_url, r.primary_image_path, r.primary_thumb_path
      from public.records r
      where r.archive_id = p_archive_id
        and r.trashed_at is null
        and (
          r.primary_image_url is not null
          or r.primary_image_path is not null
          or r.primary_thumb_path is not null
        )
      order by r.record_time desc nulls last, r.created_at desc nulls last
      limit 1
    )
  where a.id = p_archive_id;
end;
$$;

create or replace function public.sync_record_media_stats(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary_image_url text;
  v_primary_image_path text;
  v_primary_thumb_path text;
  v_media_count integer;
  v_archive_id uuid;
begin
  select m.url, m.storage_path, m.thumb_path
  into v_primary_image_url, v_primary_image_path, v_primary_thumb_path
  from public.media m
  where m.record_id = p_record_id
    and m.trashed_at is null
  order by m.sort_order asc nulls last, m.created_at asc nulls last
  limit 1;

  select count(*)::integer
  into v_media_count
  from public.media m
  where m.record_id = p_record_id
    and m.trashed_at is null;

  update public.records r
  set
    primary_image_url = v_primary_image_url,
    primary_image_path = v_primary_image_path,
    primary_thumb_path = v_primary_thumb_path,
    media_count = v_media_count
  where r.id = p_record_id;

  select r.archive_id
  into v_archive_id
  from public.records r
  where r.id = p_record_id
  limit 1;

  perform public.sync_archive_stats(v_archive_id);
end;
$$;

create or replace function public.sync_record_comment_count(p_record_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  comment_cnt integer;
begin
  select count(*)
  into comment_cnt
  from public.comments
  where record_id = p_record_id;

  update public.records
  set comment_count = comment_cnt
  where id = p_record_id
    and trashed_at is null;
end;
$$;

drop trigger if exists trg_record_archive_stats_change on public.records;
create trigger trg_record_archive_stats_change
after insert or delete or update of
  archive_id,
  record_time,
  primary_image_url,
  primary_image_path,
  primary_thumb_path,
  trashed_at
on public.records
for each row execute function public.handle_record_archive_stats_change();

drop index if exists public.records_public_archive_activity_idx;
create index records_public_archive_activity_idx
  on public.records (
    archive_id,
    record_time desc nulls last,
    created_at desc nulls last,
    id desc
  )
  where visibility = 'public' and trashed_at is null;

-- Public views preserve their existing columns and ordering while filtering trash.

create or replace view public.discovery_feed_view as
select
  r.id as record_id,
  r.archive_id,
  r.user_id,
  r.note,
  r.record_time,
  r.status_tag,
  r.primary_image_url,
  r.comment_count,
  r.media_count,
  a.title as archive_title,
  a.category as archive_category,
  a.species_id,
  a.species_name_snapshot,
  p.username,
  p.avatar_url,
  a.system_name,
  a.record_count as archive_record_count,
  a.view_count as archive_view_count,
  a.status as archive_status,
  a.ended_at as archive_ended_at,
  a.help_status as archive_help_status,
  a.help_opened_at as archive_help_opened_at,
  a.help_resolved_at as archive_help_resolved_at
from public.records r
join public.archives a on a.id = r.archive_id
left join public.profiles p on p.id = r.user_id
where r.visibility = 'public'
  and r.trashed_at is null
  and a.is_public is true
  and a.trashed_at is null
order by r.record_time desc;

create or replace view public.discovery_view as
select id, archive_id, note, record_time, user_id, archive_title, username, image_url,
  rn_archive, rn_user
from (
  select
    r.id,
    r.archive_id,
    r.note,
    r.record_time,
    r.user_id,
    a.title as archive_title,
    p.username,
    r.primary_image_url as image_url,
    row_number() over (partition by r.archive_id order by r.record_time desc) as rn_archive,
    row_number() over (partition by r.user_id order by r.record_time desc) as rn_user
  from public.records r
  join public.archives a on r.archive_id = a.id
  left join public.profiles p on r.user_id = p.id
  where r.visibility = 'public'
    and r.trashed_at is null
    and a.is_public is true
    and a.trashed_at is null
) t
where rn_archive = 1 and rn_user <= 4;

create or replace view public.discovery_project_feed_view
with (security_invoker = true, security_barrier = true)
as
with public_records as (
  select
    r.id,
    r.archive_id,
    r.note,
    r.record_time,
    r.created_at,
    r.primary_image_url,
    r.comment_count,
    r.status_tag
  from public.records r
  join public.archives a on a.id = r.archive_id
  where a.is_public is true
    and a.trashed_at is null
    and r.visibility = 'public'
    and r.trashed_at is null
),
latest_public_records as (
  select distinct on (pr.archive_id)
    pr.id,
    pr.archive_id,
    pr.note,
    pr.record_time,
    pr.created_at,
    pr.primary_image_url
  from public_records pr
  order by pr.archive_id, pr.record_time desc nulls last,
    pr.created_at desc nulls last, pr.id desc
),
public_record_stats as (
  select
    pr.archive_id,
    count(*)::bigint as public_record_count,
    coalesce(sum(coalesce(pr.comment_count, 0)::bigint), 0)::bigint as public_comment_count,
    coalesce(bool_or(pr.status_tag = 'help'), false) as has_public_help
  from public_records pr
  group by pr.archive_id
)
select
  a.id as archive_id,
  a.user_id as owner_user_id,
  a.title as archive_title,
  a.category,
  a.system_name,
  a.archive_summary,
  a.created_at as archive_created_at,
  a.ended_at as archive_ended_at,
  lpr.id as latest_public_record_id,
  lpr.note as latest_public_record_note,
  lpr.record_time as latest_public_record_time,
  lpr.created_at as latest_public_record_created_at,
  lpr.primary_image_url as latest_public_primary_image_url,
  a.species_name_snapshot,
  prs.public_record_count,
  prs.public_comment_count,
  prs.has_public_help,
  coalesce(lpr.record_time, lpr.created_at) as public_activity_at,
  pp.username as profile_display_name,
  pp.avatar_url as profile_avatar_url,
  nullif(
    concat_ws(
      ' ',
      nullif(trim(pp.country_name), ''),
      nullif(trim(pp.region_name), ''),
      nullif(trim(pp.city_name), '')
    ),
    ''
  ) as profile_region
from public_record_stats prs
join latest_public_records lpr on lpr.archive_id = prs.archive_id
join public.archives a
  on a.id = prs.archive_id
 and a.is_public is true
 and a.trashed_at is null
left join public.public_profiles pp on pp.id = a.user_id
order by public_activity_at desc nulls last, archive_id desc;

create or replace view public.plant_related_archives_view as
with archive_species_matches as (
  select distinct
    a.id as archive_id,
    coalesce(a.species_id, ps.id, psi.plant_id, psa.species_id) as related_species_id
  from public.archives a
  left join public.plant_species ps
    on a.species_id is null
   and (
      nullif(lower(regexp_replace(trim(a.species_name_snapshot), '\s+', '', 'g')), '') =
        nullif(lower(regexp_replace(trim(ps.common_name), '\s+', '', 'g')), '')
      or nullif(lower(regexp_replace(trim(a.species_name_snapshot), '\s+', '', 'g')), '') =
        nullif(lower(regexp_replace(trim(ps.scientific_name), '\s+', '', 'g')), '')
      or nullif(lower(regexp_replace(trim(a.system_name), '\s+', '', 'g')), '') =
        nullif(lower(regexp_replace(trim(ps.common_name), '\s+', '', 'g')), '')
      or nullif(lower(regexp_replace(trim(a.system_name), '\s+', '', 'g')), '') =
        nullif(lower(regexp_replace(trim(ps.scientific_name), '\s+', '', 'g')), '')
   )
  left join public.plant_species_i18n psi
    on a.species_id is null
   and (
      nullif(lower(regexp_replace(trim(a.species_name_snapshot), '\s+', '', 'g')), '') =
        nullif(lower(regexp_replace(trim(psi.common_name), '\s+', '', 'g')), '')
      or nullif(lower(regexp_replace(trim(a.system_name), '\s+', '', 'g')), '') =
        nullif(lower(regexp_replace(trim(psi.common_name), '\s+', '', 'g')), '')
   )
  left join public.plant_species_aliases psa
    on a.species_id is null
   and coalesce(psa.relation_type, 'exact') in ('exact', 'common_name', 'old_scientific_name')
   and (
      nullif(lower(regexp_replace(trim(a.species_name_snapshot), '\s+', '', 'g')), '') =
        nullif(lower(trim(psa.normalized_name)), '')
      or nullif(lower(regexp_replace(trim(a.species_name_snapshot), '\s+', '', 'g')), '') =
        nullif(lower(regexp_replace(trim(psa.alias_name), '\s+', '', 'g')), '')
      or nullif(lower(regexp_replace(trim(a.system_name), '\s+', '', 'g')), '') =
        nullif(lower(trim(psa.normalized_name)), '')
      or nullif(lower(regexp_replace(trim(a.system_name), '\s+', '', 'g')), '') =
        nullif(lower(regexp_replace(trim(psa.alias_name), '\s+', '', 'g')), '')
   )
  where a.is_public is true
    and a.trashed_at is null
    and coalesce(a.species_id, ps.id, psi.plant_id, psa.species_id) is not null
)
select
  a.id as archive_id,
  a.user_id,
  a.title as archive_title,
  a.system_name,
  asm.related_species_id as species_id,
  a.species_name_snapshot,
  a.status as archive_status,
  a.ended_at,
  a.help_status as archive_help_status,
  coalesce(nullif(to_jsonb(a)->>'cover_image_url', ''), lr.primary_image_url, lm.url) as cover_image_url,
  nullif(to_jsonb(a)->>'cover_image_path', '') as cover_image_path,
  nullif(to_jsonb(a)->>'cover_thumb_path', '') as cover_thumb_path,
  p.username,
  p.avatar_url,
  coalesce(rc.public_record_count, 0)::integer as public_record_count,
  lr.record_time as last_public_record_time,
  lr.note as last_public_record_note,
  coalesce(lr.primary_image_url, lm.url) as last_public_record_image_url,
  coalesce(nullif(to_jsonb(lr)->>'primary_image_path', ''), lm.storage_path) as last_public_record_image_path,
  coalesce(nullif(to_jsonb(lr)->>'primary_thumb_path', ''), lm.thumb_path) as last_public_record_thumb_path
from archive_species_matches asm
join public.archives a
  on a.id = asm.archive_id
 and a.trashed_at is null
left join public.profiles p on p.id = a.user_id
left join lateral (
  select count(*)::integer as public_record_count
  from public.records r
  where r.archive_id = a.id
    and r.visibility = 'public'
    and r.trashed_at is null
) rc on true
left join lateral (
  select r.*
  from public.records r
  where r.archive_id = a.id
    and r.visibility = 'public'
    and r.trashed_at is null
  order by r.record_time desc nulls last, r.created_at desc nulls last
  limit 1
) lr on true
left join lateral (
  select m.url, m.storage_path, m.thumb_path
  from public.media m
  where lr.id is not null
    and m.record_id = lr.id
    and m.type = 'image'
    and m.trashed_at is null
  order by m.sort_order asc nulls last, m.created_at asc nulls last
  limit 1
) lm on true
order by lr.record_time desc nulls last, a.created_at desc nulls last;

create or replace view public.timeline_view as
select
  r.id as record_id,
  a.title,
  r.note,
  r.photo_time,
  m.url
from public.records r
left join public.archives a
  on r.archive_id = a.id
 and a.trashed_at is null
left join public.media m
  on m.record_id = r.id
 and m.trashed_at is null
where r.trashed_at is null
  and a.id is not null
order by r.photo_time desc;

alter view public.discovery_feed_view owner to postgres;
alter view public.discovery_project_feed_view owner to postgres;
alter view public.discovery_view owner to postgres;
alter view public.plant_related_archives_view owner to postgres;
alter view public.timeline_view owner to postgres;

revoke all on table public.discovery_feed_view from public, anon, authenticated;
revoke all on table public.discovery_project_feed_view from public, anon, authenticated;
revoke all on table public.discovery_view from public, anon, authenticated;
revoke all on table public.plant_related_archives_view from public, anon, authenticated;
revoke all on table public.timeline_view from public, anon, authenticated;

grant select on table public.discovery_feed_view to anon, authenticated, service_role;
grant select on table public.discovery_project_feed_view to anon, authenticated, service_role;
grant select on table public.discovery_view to anon, authenticated, service_role;
grant select on table public.plant_related_archives_view to anon, authenticated, service_role;
grant select on table public.timeline_view to service_role;

-- Record-backed public media requires an active media/record/archive chain.
-- Market-backed media remains independent and continues to use its existing helper.

create or replace function public.can_read_public_record_media_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.media m
      join public.records r on r.id = m.record_id
      join public.archives a on a.id = r.archive_id
      where (
        coalesce(nullif(m.storage_path, ''), public.media_object_path_from_public_url(m.url)) = p_object_name
        or coalesce(nullif(m.thumb_path, ''), public.media_object_path_from_public_url(m.thumb_url)) = p_object_name
      )
        and m.trashed_at is null
        and r.trashed_at is null
        and a.trashed_at is null
        and r.visibility = 'public'
        and a.is_public is true
    )
    or exists (
      select 1
      from public.records r
      join public.archives a on a.id = r.archive_id
      where (
        coalesce(nullif(r.primary_image_path, ''), public.media_object_path_from_public_url(r.primary_image_url)) = p_object_name
        or nullif(r.primary_thumb_path, '') = p_object_name
      )
        and r.trashed_at is null
        and a.trashed_at is null
        and r.visibility = 'public'
        and a.is_public is true
    )
    or exists (
      select 1
      from public.archives a
      where (
        coalesce(nullif(a.cover_image_path, ''), public.media_object_path_from_public_url(a.cover_image_url)) = p_object_name
        or nullif(a.cover_thumb_path, '') = p_object_name
      )
        and a.trashed_at is null
        and a.is_public is true
    );
$$;

create or replace function public.can_access_active_owned_media_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with matching_references as (
    select
      (m.trashed_at is null and r.trashed_at is null and a.trashed_at is null) as is_active,
      (m.trashed_at is not null or r.trashed_at is not null or a.trashed_at is not null) as is_trashed
    from public.media m
    join public.records r on r.id = m.record_id
    join public.archives a on a.id = r.archive_id
    where m.user_id = auth.uid()
      and (
        coalesce(nullif(m.storage_path, ''), public.media_object_path_from_public_url(m.url)) = p_object_name
        or coalesce(nullif(m.thumb_path, ''), public.media_object_path_from_public_url(m.thumb_url)) = p_object_name
      )

    union all

    select
      (r.trashed_at is null and a.trashed_at is null) as is_active,
      (r.trashed_at is not null or a.trashed_at is not null) as is_trashed
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.user_id = auth.uid()
      and (
        coalesce(nullif(r.primary_image_path, ''), public.media_object_path_from_public_url(r.primary_image_url)) = p_object_name
        or nullif(r.primary_thumb_path, '') = p_object_name
      )

    union all

    select
      (a.trashed_at is null) as is_active,
      (a.trashed_at is not null) as is_trashed
    from public.archives a
    where a.user_id = auth.uid()
      and (
        coalesce(nullif(a.cover_image_path, ''), public.media_object_path_from_public_url(a.cover_image_url)) = p_object_name
        or nullif(a.cover_thumb_path, '') = p_object_name
      )
  )
  select
    coalesce(bool_or(is_active), false)
    or not coalesce(bool_or(is_trashed), false)
  from matching_references;
$$;

revoke all on function public.can_access_active_owned_media_object(text) from public;
grant execute on function public.can_access_active_owned_media_object(text) to authenticated;

drop policy if exists media_owner_select on storage.objects;
create policy media_owner_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_access_active_owned_media_object(name)
);

drop policy if exists media_delete_own_path on storage.objects;
create policy media_delete_own_path
on storage.objects for delete
to authenticated
using (
  bucket_id = 'media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_access_active_owned_media_object(name)
);

drop policy if exists media_update_own_path on storage.objects;
create policy media_update_own_path
on storage.objects for update
to authenticated
using (
  bucket_id = 'media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_access_active_owned_media_object(name)
)
with check (
  bucket_id = 'media'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_access_active_owned_media_object(name)
);

-- New and edited market sources must be active, while existing market rows and
-- their independent path references remain readable under the market policy.

create or replace function public.validate_market_post_source_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record record;
begin
  if new.source_record_id is null then
    return new;
  end if;

  select r.id, r.user_id, r.archive_id
  into v_record
  from public.records r
  join public.archives a on a.id = r.archive_id
  where r.id = new.source_record_id
    and r.trashed_at is null
    and a.trashed_at is null;

  if not found then
    raise exception 'source_record_not_found';
  end if;

  if new.user_id is null or new.user_id <> v_record.user_id then
    raise exception 'source_record_owner_mismatch';
  end if;

  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'market_post_user_mismatch';
  end if;

  if new.archive_id is null then
    new.archive_id := v_record.archive_id;
  end if;

  if new.archive_id <> v_record.archive_id then
    raise exception 'source_record_archive_mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.validate_market_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post record;
  v_media record;
  v_record record;
  v_source_path text;
  v_source_thumb_path text;
  v_requested_path text;
  v_requested_thumb_path text;
begin
  select mp.id, mp.user_id, mp.source_record_id
  into v_post
  from public.market_posts mp
  where mp.id = new.market_post_id;

  if not found then
    raise exception 'market_post_not_found';
  end if;

  if new.user_id is null or new.user_id <> v_post.user_id then
    raise exception 'market_media_user_mismatch';
  end if;

  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'market_media_auth_user_mismatch';
  end if;

  if new.source_media_id is not null then
    select
      m.id,
      m.user_id,
      m.record_id,
      m.url,
      m.storage_path,
      m.thumb_url,
      m.thumb_path
    into v_media
    from public.media m
    join public.records r on r.id = m.record_id
    join public.archives a on a.id = r.archive_id
    where m.id = new.source_media_id
      and m.trashed_at is null
      and r.trashed_at is null
      and a.trashed_at is null;

    if not found then
      raise exception 'source_media_not_found';
    end if;

    if v_media.user_id <> new.user_id then
      raise exception 'source_media_owner_mismatch';
    end if;

    if new.source_record_id is null then
      if tg_op = 'INSERT' then
        new.source_record_id := v_media.record_id;
      elsif tg_op = 'UPDATE' and old.source_media_id is distinct from new.source_media_id then
        new.source_record_id := v_media.record_id;
      end if;
    end if;

    if new.source_record_id is not null and new.source_record_id <> v_media.record_id then
      raise exception 'source_media_record_mismatch';
    end if;

    if v_post.source_record_id is not null
       and new.source_record_id is not null
       and new.source_record_id <> v_post.source_record_id then
      raise exception 'market_media_source_record_mismatch';
    end if;

    v_source_path := coalesce(
      nullif(btrim(v_media.storage_path), ''),
      public.media_object_path_from_public_url(v_media.url)
    );
    v_requested_path := coalesce(
      nullif(btrim(new.path), ''),
      public.media_object_path_from_public_url(new.url)
    );

    if v_source_path is null or v_requested_path is distinct from v_source_path then
      raise exception 'source_media_path_mismatch';
    end if;

    v_source_thumb_path := coalesce(
      nullif(btrim(v_media.thumb_path), ''),
      public.media_object_path_from_public_url(v_media.thumb_url)
    );
    v_requested_thumb_path := coalesce(
      nullif(btrim(new.thumb_path), ''),
      public.media_object_path_from_public_url(new.thumb_url)
    );

    if v_requested_thumb_path is not null
       and v_requested_thumb_path is distinct from v_source_thumb_path then
      raise exception 'source_media_thumb_path_mismatch';
    end if;
  end if;

  if new.source_record_id is not null and new.source_media_id is null then
    select r.id, r.user_id
    into v_record
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = new.source_record_id
      and r.trashed_at is null
      and a.trashed_at is null;

    if not found then
      raise exception 'source_record_not_found';
    end if;

    if v_record.user_id <> new.user_id then
      raise exception 'source_record_owner_mismatch';
    end if;
  end if;

  return new;
end;
$$;
