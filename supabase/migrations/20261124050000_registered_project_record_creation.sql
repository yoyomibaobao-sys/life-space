-- Registered owners may create projects and records within their current quota.
create or replace function public.can_add_own_cloud_content()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and public.get_user_storage_limit_bytes(p.id) > 0
      and coalesce(p.storage_used, 0) <= public.get_user_storage_limit_bytes(p.id)
  );
$$;
revoke all on function public.can_add_own_cloud_content() from public, anon;
grant execute on function public.can_add_own_cloud_content() to authenticated, service_role;

alter policy archives_insert_own on public.archives with check (
  user_id = (select auth.uid()) and trashed_at is null and trash_entry_id is null
  and (select public.can_add_own_cloud_content())
  and (public.is_user_membership_active((select auth.uid())) or help_status = 'none')
);

alter policy records_insert_own_active_archive on public.records with check (
  user_id = (select auth.uid()) and trashed_at is null and trash_entry_id is null
  and (select public.can_add_own_cloud_content())
  and exists (select 1 from public.archives a where a.id = records.archive_id
    and a.user_id = (select auth.uid()) and a.trashed_at is null
    and (a.is_public or records.visibility = 'private'))
  and (public.is_user_membership_active((select auth.uid())) or status_tag is null)
);

alter policy record_locations_insert_own on public.record_locations with check (
  user_id = (select auth.uid()) and (select public.can_add_own_cloud_content())
  and exists (select 1 from public.records r join public.archives a on a.id = r.archive_id
    where r.id = record_locations.record_id and r.user_id = (select auth.uid())
      and a.user_id = (select auth.uid()) and r.trashed_at is null and a.trashed_at is null)
);

alter policy record_locations_update_own on public.record_locations with check (
  user_id = (select auth.uid()) and (select public.can_add_own_cloud_content())
  and exists (select 1 from public.records r join public.archives a on a.id = r.archive_id
    where r.id = record_locations.record_id and r.user_id = (select auth.uid())
      and a.user_id = (select auth.uid()) and r.trashed_at is null and a.trashed_at is null)
);

CREATE OR REPLACE FUNCTION public.create_record_with_location(p_archive_id uuid, p_cycle_id uuid, p_note text, p_record_time timestamp with time zone, p_visibility text, p_status_tag text, p_location jsonb)
 RETURNS SETOF public.records
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_record public.records;
begin
  if p_record_time is null then raise exception 'Record time required'; end if;
  if (select auth.uid()) is null or not public.can_add_own_cloud_content() then raise exception 'Cloud membership required' using errcode = '42501'; end if;
  if not exists (select 1 from public.archives a where a.id = p_archive_id and a.user_id = (select auth.uid()) and a.trashed_at is null) then raise exception 'Project not found or not owned' using errcode = '42501'; end if;
  if p_visibility is null or p_visibility not in ('public', 'private') then raise exception 'Invalid visibility'; end if;
  if p_cycle_id is not null and not exists (select 1 from public.archive_cycles c where c.id = p_cycle_id and c.archive_id = p_archive_id and c.status = 'active') then raise exception 'Invalid project period'; end if;
  insert into public.records(archive_id, cycle_id, user_id, note, visibility, status_tag, photo_time, record_time, upload_time)
    values(p_archive_id, p_cycle_id, (select auth.uid()), p_note, p_visibility, p_status_tag, p_record_time, p_record_time, now())
    returning * into v_record;
  perform public.set_record_location(v_record.id, p_location);
  return next v_record;
end;
$function$
;
