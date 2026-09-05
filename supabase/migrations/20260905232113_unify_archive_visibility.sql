-- Keep a cloud project's visibility and all of its active records in sync.

create or replace function public.make_my_archive_public(p_archive_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_archive_id is null then
    return false;
  end if;

  if not public.is_user_membership_active(v_user_id) then
    raise exception using
      errcode = 'P0001',
      message = 'membership_inactive';
  end if;

  perform 1
  from public.archives as a
  where a.id = p_archive_id
    and a.user_id = v_user_id
    and a.trashed_at is null
    and a.trash_entry_id is null
  for update;

  if not found then
    return false;
  end if;

  update public.archives as a
  set
    is_public = true,
    default_record_visibility = 'public'
  where a.id = p_archive_id
    and a.user_id = v_user_id
    and a.trashed_at is null;

  update public.records as r
  set visibility = 'public'
  where r.archive_id = p_archive_id
    and r.user_id = v_user_id
    and r.trashed_at is null;

  return true;
end;
$$;

revoke all on function public.make_my_archive_public(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.make_my_archive_public(uuid)
  to authenticated, service_role;

comment on function public.make_my_archive_public(uuid) is
  'Owner-only publication upgrade for active cloud members. The project and all active records become public together.';

create or replace function public.make_my_archive_private(p_archive_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_archive_id is null then
    return false;
  end if;

  perform 1
  from public.archives as a
  where a.id = p_archive_id
    and a.user_id = v_user_id
    and a.trashed_at is null
    and a.trash_entry_id is null
  for update;

  if not found then
    return false;
  end if;

  update public.archives as a
  set
    is_public = false,
    default_record_visibility = 'private'
  where a.id = p_archive_id
    and a.user_id = v_user_id
    and a.trashed_at is null;

  update public.records as r
  set visibility = 'private'
  where r.archive_id = p_archive_id
    and r.user_id = v_user_id
    and r.trashed_at is null;

  return true;
end;
$$;

revoke all on function public.make_my_archive_private(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.make_my_archive_private(uuid)
  to authenticated, service_role;

comment on function public.make_my_archive_private(uuid) is
  'Owner-only visibility downgrade. The project and all active records become private together, including during read-only retention.';
