-- Additive only. Precise record locations never join public record responses.
set lock_timeout = '5s';
create table public.record_locations (
  record_id uuid primary key references public.records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '' check (char_length(label) <= 240),
  latitude double precision,
  longitude double precision,
  source text not null default 'manual' check (source in ('profile', 'manual', 'photo')),
  constraint record_location_coordinates check (
    (latitude is null and longitude is null) or
    (latitude between -90 and 90 and longitude between -180 and 180
     and latitude is not null and longitude is not null)
  )
);
create index record_locations_user_id_idx on public.record_locations(user_id);
alter table public.record_locations enable row level security;
create policy record_locations_read_own on public.record_locations for select to authenticated
  using (user_id = (select auth.uid()));
create policy record_locations_insert_own on public.record_locations for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_user_membership_active((select auth.uid()))
    and exists (select 1 from public.records r join public.archives a on a.id = r.archive_id
      where r.id = record_locations.record_id and r.user_id = (select auth.uid()) and a.user_id = (select auth.uid())
      and r.trashed_at is null and a.trashed_at is null));
create policy record_locations_update_own on public.record_locations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_user_membership_active((select auth.uid()))
    and exists (select 1 from public.records r join public.archives a on a.id = r.archive_id
      where r.id = record_locations.record_id and r.user_id = (select auth.uid()) and a.user_id = (select auth.uid())
      and r.trashed_at is null and a.trashed_at is null));
create policy record_locations_delete_own on public.record_locations for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.record_locations from anon;
grant select, insert, update, delete on public.record_locations to authenticated, service_role;

create function public.set_record_location(p_record_id uuid, p_location jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.records r join public.archives a on a.id = r.archive_id
    where r.id = p_record_id and r.user_id = (select auth.uid()) and a.user_id = (select auth.uid())
      and r.trashed_at is null and a.trashed_at is null
  ) then raise exception 'Record not found or not owned' using errcode = '42501'; end if;
  if p_location is null or p_location = 'null'::jsonb then
    delete from public.record_locations where record_id = p_record_id;
    return;
  end if;
  if jsonb_typeof(p_location) <> 'object' then raise exception 'Invalid location'; end if;
  insert into public.record_locations(record_id, user_id, label, latitude, longitude, source)
    values (p_record_id, (select auth.uid()), coalesce(p_location->>'label', ''),
      (p_location->>'latitude')::double precision, (p_location->>'longitude')::double precision,
      coalesce(p_location->>'source', 'manual'))
  on conflict (record_id) do update set label = excluded.label, latitude = excluded.latitude,
    longitude = excluded.longitude, source = excluded.source;
end;
$$;

create function public.save_record_details(p_record_id uuid, p_note text, p_record_time timestamptz, p_location jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_user_membership_active((select auth.uid())) then raise exception 'Cloud membership required' using errcode = '42501'; end if;
  if p_record_time is null then raise exception 'Record time required'; end if;
  update public.records set note = p_note, record_time = p_record_time
    where id = p_record_id and user_id = (select auth.uid());
  if not found then raise exception 'Record not found or not editable' using errcode = '42501'; end if;
  perform public.set_record_location(p_record_id, p_location);
end;
$$;

create function public.create_record_with_location(p_archive_id uuid, p_cycle_id uuid, p_note text,
  p_record_time timestamptz, p_visibility text, p_status_tag text, p_location jsonb)
returns setof public.records language plpgsql security invoker set search_path = '' as $$
declare v_record public.records;
begin
  if p_record_time is null then raise exception 'Record time required'; end if;
  if (select auth.uid()) is null or not public.is_user_membership_active((select auth.uid())) then raise exception 'Cloud membership required' using errcode = '42501'; end if;
  if not exists (select 1 from public.archives a where a.id = p_archive_id and a.user_id = (select auth.uid()) and a.trashed_at is null) then raise exception 'Project not found or not owned' using errcode = '42501'; end if;
  if p_visibility is null or p_visibility not in ('public', 'private') then raise exception 'Invalid visibility'; end if;
  if p_cycle_id is not null and not exists (select 1 from public.archive_cycles c where c.id = p_cycle_id and c.archive_id = p_archive_id and c.status = 'active') then raise exception 'Invalid project period'; end if;
  insert into public.records(archive_id, cycle_id, user_id, note, visibility, status_tag, photo_time, record_time, upload_time)
    values(p_archive_id, p_cycle_id, (select auth.uid()), p_note, p_visibility, p_status_tag, p_record_time, p_record_time, now())
    returning * into v_record;
  perform public.set_record_location(v_record.id, p_location);
  return next v_record;
end;
$$;
revoke all on function public.set_record_location(uuid, jsonb) from public, anon;
revoke all on function public.save_record_details(uuid, text, timestamptz, jsonb) from public, anon;
revoke all on function public.create_record_with_location(uuid, uuid, text, timestamptz, text, text, jsonb) from public, anon;
grant execute on function public.set_record_location(uuid, jsonb) to authenticated;
grant execute on function public.save_record_details(uuid, text, timestamptz, jsonb) to authenticated;
grant execute on function public.create_record_with_location(uuid, uuid, text, timestamptz, text, text, jsonb) to authenticated;
comment on table public.record_locations is 'Owner-only optional address and photo GPS. Never expose with public records.';

create or replace function public.admin_search_memberships_page(
  p_keyword text default '',
  p_limit integer default 11,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  username text,
  plan text,
  status text,
  trial_ends_at timestamptz,
  paid_until timestamptz,
  storage_used bigint,
  storage_limit_bytes bigint,
  base_market_post_limit integer,
  active_market_post_count integer,
  market_post_limit integer,
  created_at timestamptz,
  updated_at timestamptz,
  account_number text,
  is_internal_test boolean,
  registered_at timestamptz,
  last_sign_in_at timestamptz,
  archive_count bigint,
  record_count bigint,
  auth_missing boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidate_users as (
    select au.id as user_id
    from auth.users as au
    where au.deleted_at is null

    union

    select u.id
    from public.users as u

    union

    select p.id
    from public.profiles as p

    union

    select a.user_id
    from public.archives as a
    where a.user_id is not null

    union

    select r.user_id
    from public.records as r
    where r.user_id is not null

    union

    select m.user_id
    from public.media as m
    where m.user_id is not null

    union

    select um.user_id
    from public.user_memberships as um

    union

    select market.user_id
    from public.market_posts as market
    where market.user_id is not null

    union

    select c.user_id
    from public.comments as c
    where c.user_id is not null

    union

    select l.user_id
    from public.locations as l
    where l.user_id is not null

    union

    select g.user_id
    from public.group_tags as g
    where g.user_id is not null

    union

    select s.user_id
    from public.sub_tags as s
    where s.user_id is not null

    union

    select objects.owner_id::uuid
    from storage.objects as objects
    where objects.bucket_id in ('media', 'avatars', 'payment-proofs')
      and objects.owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )
  select
    candidates.user_id,
    au.email::text,
    p.username,
    m.plan,
    case
      when m.plan = 'admin' then 'active'
      when m.paid_until is not null and m.paid_until > now() then 'active'
      when m.plan = 'trial'
       and (
         (m.trial_ends_at is null and m.status = 'trialing')
         or m.trial_ends_at > now()
       ) then 'trialing'
      when m.status in ('past_due', 'canceled') then m.status
      else 'expired'
    end,
    m.trial_ends_at,
    m.paid_until,
    coalesce(p.storage_used, 0)::bigint,
    m.storage_limit_bytes,
    m.base_market_post_limit,
    public.get_user_active_market_post_count(candidates.user_id),
    public.get_user_market_post_limit(candidates.user_id),
    m.created_at,
    m.updated_at,
    u.account_number,
    coalesce(u.is_internal_test, false),
    au.created_at,
    au.last_sign_in_at,
    coalesce(archive_totals.archive_count, 0),
    coalesce(record_totals.record_count, 0),
    (au.id is null or au.deleted_at is not null)
  from candidate_users as candidates
  left join auth.users as au on au.id = candidates.user_id
  left join public.profiles as p on p.id = candidates.user_id
  left join public.users as u on u.id = candidates.user_id
  left join public.user_memberships as m on m.user_id = candidates.user_id
  left join lateral (
    select
      count(*)::bigint as archive_count,
      min(a.created_at) as first_archive_at
    from public.archives as a
    where a.user_id = candidates.user_id
  ) as archive_totals on true
  left join lateral (
    select count(*)::bigint as record_count
    from public.records as r
    where r.user_id = candidates.user_id
      or exists (
        select 1
        from public.archives as owned_archive
        where owned_archive.id = r.archive_id
          and owned_archive.user_id = candidates.user_id
      )
  ) as record_totals on true
  where public.is_app_admin(auth.uid())
    and (
      coalesce(nullif(trim(p_keyword), ''), '') = ''
      or au.email ilike '%' || trim(p_keyword) || '%'
      or p.username ilike '%' || trim(p_keyword) || '%'
      or u.account_number ilike '%' || trim(p_keyword) || '%'
      or candidates.user_id::text = trim(p_keyword)
    )
  order by coalesce(au.created_at, u.created_at, archive_totals.first_archive_at) desc nulls last, candidates.user_id
  limit least(greatest(coalesce(p_limit, 11), 1), 51)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.admin_search_memberships_page(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_search_memberships_page(text, integer, integer)
  to authenticated, service_role;

comment on function public.admin_search_memberships_page(text, integer, integer) is
  'Admin-only registration/member and residual-account search, including Storage-only owners, with usage and content totals.';
