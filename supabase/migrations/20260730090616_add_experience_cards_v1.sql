-- Experience cards v1.
--
-- A card is a lightweight, traceable reference to 3-12 records from one cloud
-- archive. Record text and media remain in their source rows; nothing is copied.
-- Publishing is explicit and makes only the archive shell plus the selected
-- records public. Public access stops immediately when any selected source is
-- private, trashed, or permanently deleted.

create table if not exists public.experience_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  archive_id uuid not null references public.archives(id) on delete cascade,
  title text not null,
  cover_media_id uuid references public.media(id) on delete set null,
  status text not null default 'draft',
  source_record_count smallint not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experience_cards_title_check
    check (char_length(btrim(title)) between 1 and 120),
  constraint experience_cards_status_check
    check (status in ('draft', 'published')),
  constraint experience_cards_source_record_count_check
    check (source_record_count between 3 and 12),
  constraint experience_cards_published_at_check
    check (
      (status = 'draft' and published_at is null)
      or (status = 'published' and published_at is not null)
    )
);

create table if not exists public.experience_card_records (
  card_id uuid not null
    references public.experience_cards(id) on delete cascade,
  record_id uuid not null
    references public.records(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, record_id)
);

create index if not exists experience_cards_user_created_idx
  on public.experience_cards (user_id, created_at desc, id desc);

create index if not exists experience_cards_archive_created_idx
  on public.experience_cards (archive_id, created_at desc, id desc);

create index if not exists experience_cards_public_idx
  on public.experience_cards (published_at desc, id desc)
  where status = 'published';

create index if not exists experience_card_records_record_idx
  on public.experience_card_records (record_id, card_id);

alter table public.experience_cards enable row level security;
alter table public.experience_card_records enable row level security;

drop trigger if exists trg_experience_cards_updated_at
  on public.experience_cards;
create trigger trg_experience_cards_updated_at
before update on public.experience_cards
for each row
execute function public.set_updated_at();

comment on table public.experience_cards is
  'User-authored experience-card shells. Titles and source references only; record text and photos remain canonical in records/media.';

comment on table public.experience_card_records is
  'Selected source records for one experience card. Display order always comes from the source record timeline, not from this relation.';

comment on column public.experience_cards.source_record_count is
  'Expected selected-record count. A cascade caused by permanent source deletion creates a mismatch and immediately stops public access.';

create or replace function private.validate_experience_card_selection(
  p_user_id uuid,
  p_archive_id uuid,
  p_record_ids uuid[],
  p_cover_media_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record_count integer := coalesce(cardinality(p_record_ids), 0);
  v_unique_count integer := 0;
  v_matching_count integer := 0;
begin
  if p_user_id is null or p_archive_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_not_found_or_forbidden';
  end if;

  if v_record_count < 3 or v_record_count > 12 then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_record_count_invalid';
  end if;

  if exists (
    select 1
    from unnest(p_record_ids) as selected(record_id)
    where selected.record_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_record_selection_invalid';
  end if;

  select count(distinct selected.record_id)::integer
  into v_unique_count
  from unnest(p_record_ids) as selected(record_id);

  if v_unique_count <> v_record_count then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_record_selection_invalid';
  end if;

  if not exists (
    select 1
    from public.archives as a
    where a.id = p_archive_id
      and a.user_id = p_user_id
      and a.trashed_at is null
      and a.trash_entry_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_archive_not_found';
  end if;

  select count(*)::integer
  into v_matching_count
  from public.records as r
  where r.id = any(p_record_ids)
    and r.archive_id = p_archive_id
    and r.user_id = p_user_id
    and r.trashed_at is null
    and r.trash_entry_id is null;

  if v_matching_count <> v_record_count then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_records_must_share_archive';
  end if;

  if p_cover_media_id is not null
     and not exists (
       select 1
       from public.media as m
       where m.id = p_cover_media_id
         and m.user_id = p_user_id
         and m.record_id = any(p_record_ids)
         and m.trashed_at is null
         and m.trash_entry_id is null
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_cover_invalid';
  end if;
end;
$$;

revoke all on function private.validate_experience_card_selection(
  uuid,
  uuid,
  uuid[],
  uuid
) from public, anon, authenticated, service_role;

create or replace function public.is_experience_card_public(
  p_card_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.experience_cards as c
    join public.archives as a
      on a.id = c.archive_id
     and a.user_id = c.user_id
    where c.id = p_card_id
      and c.status = 'published'
      and c.published_at is not null
      and c.source_record_count between 3 and 12
      and a.is_public is true
      and a.trashed_at is null
      and a.trash_entry_id is null
      and (
        select count(*)::integer
        from public.experience_card_records as cr
        where cr.card_id = c.id
      ) = c.source_record_count
      and not exists (
        select 1
        from public.experience_card_records as cr
        left join public.records as r
          on r.id = cr.record_id
        where cr.card_id = c.id
          and (
            r.id is null
            or r.archive_id is distinct from c.archive_id
            or r.user_id is distinct from c.user_id
            or r.visibility is distinct from 'public'
            or r.trashed_at is not null
            or r.trash_entry_id is not null
          )
      )
  );
$$;

revoke all on function public.is_experience_card_public(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_experience_card_public(uuid)
  to anon, authenticated, service_role;

comment on function public.is_experience_card_public(uuid) is
  'True only while the published card and every expected source record remain public, active, and attached to the same active archive.';

create or replace function public.can_access_experience_card(
  p_card_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.experience_cards as c
    where c.id = p_card_id
      and (
        c.user_id = auth.uid()
        or public.is_experience_card_public(c.id)
      )
  );
$$;

revoke all on function public.can_access_experience_card(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_access_experience_card(uuid)
  to anon, authenticated, service_role;

drop policy if exists experience_cards_select_owner_or_public
  on public.experience_cards;
create policy experience_cards_select_owner_or_public
on public.experience_cards
for select
to anon, authenticated
using (
  user_id = (select auth.uid())
  or public.is_experience_card_public(id)
);

drop policy if exists experience_card_records_select_accessible_card
  on public.experience_card_records;
create policy experience_card_records_select_accessible_card
on public.experience_card_records
for select
to anon, authenticated
using (public.can_access_experience_card(card_id));

revoke all on table public.experience_cards
  from public, anon, authenticated;
revoke all on table public.experience_card_records
  from public, anon, authenticated;
grant select on table public.experience_cards
  to anon, authenticated;
grant select on table public.experience_card_records
  to anon, authenticated;
grant all on table public.experience_cards
  to service_role;
grant all on table public.experience_card_records
  to service_role;

create or replace function public.save_experience_card(
  p_card_id uuid,
  p_archive_id uuid,
  p_title text,
  p_record_ids uuid[],
  p_cover_media_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_card_id uuid := p_card_id;
  v_existing public.experience_cards%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_record_count integer := coalesce(cardinality(p_record_ids), 0);
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_auth_required';
  end if;

  if not public.is_user_membership_active(v_user_id) then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_cloud_access_required';
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_title_invalid';
  end if;

  perform private.validate_experience_card_selection(
    v_user_id,
    p_archive_id,
    p_record_ids,
    p_cover_media_id
  );

  if v_card_id is null then
    insert into public.experience_cards (
      user_id,
      archive_id,
      title,
      cover_media_id,
      status,
      source_record_count,
      published_at
    )
    values (
      v_user_id,
      p_archive_id,
      v_title,
      p_cover_media_id,
      'draft',
      v_record_count,
      null
    )
    returning id into v_card_id;
  else
    select c.*
    into v_existing
    from public.experience_cards as c
    where c.id = v_card_id
    for update;

    if not found
       or v_existing.user_id is distinct from v_user_id
       or v_existing.archive_id is distinct from p_archive_id then
      raise exception using
        errcode = 'P0001',
        message = 'experience_card_not_found_or_forbidden';
    end if;

    update public.experience_cards as c
    set
      title = v_title,
      cover_media_id = p_cover_media_id,
      status = 'draft',
      source_record_count = v_record_count,
      published_at = null
    where c.id = v_card_id;

    delete from public.experience_card_records as cr
    where cr.card_id = v_card_id;
  end if;

  insert into public.experience_card_records (card_id, record_id)
  select v_card_id, selected.record_id
  from unnest(p_record_ids) as selected(record_id);

  return v_card_id;
end;
$$;

revoke all on function public.save_experience_card(
  uuid,
  uuid,
  text,
  uuid[],
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.save_experience_card(
  uuid,
  uuid,
  text,
  uuid[],
  uuid
) to authenticated, service_role;

comment on function public.save_experience_card(
  uuid,
  uuid,
  text,
  uuid[],
  uuid
) is
  'Creates or updates a private draft from 3-12 active records in one owned cloud archive. Editing a published card returns it to draft.';

create or replace function public.publish_experience_card(
  p_card_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_card public.experience_cards%rowtype;
  v_record_ids uuid[];
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_auth_required';
  end if;

  if not public.is_user_membership_active(v_user_id) then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_cloud_access_required';
  end if;

  select c.*
  into v_card
  from public.experience_cards as c
  where c.id = p_card_id
  for update;

  if not found or v_card.user_id is distinct from v_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_not_found_or_forbidden';
  end if;

  select array_agg(cr.record_id order by r.record_time, r.created_at, r.id)
  into v_record_ids
  from public.experience_card_records as cr
  join public.records as r
    on r.id = cr.record_id
  where cr.card_id = v_card.id;

  if coalesce(cardinality(v_record_ids), 0) <> v_card.source_record_count then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_source_changed';
  end if;

  perform private.validate_experience_card_selection(
    v_user_id,
    v_card.archive_id,
    v_record_ids,
    v_card.cover_media_id
  );

  update public.archives as a
  set is_public = true
  where a.id = v_card.archive_id
    and a.user_id = v_user_id
    and a.trashed_at is null;

  update public.records as r
  set visibility = 'public'
  where r.id = any(v_record_ids)
    and r.archive_id = v_card.archive_id
    and r.user_id = v_user_id
    and r.trashed_at is null;

  update public.experience_cards as c
  set
    status = 'published',
    published_at = now()
  where c.id = v_card.id;

  return true;
end;
$$;

revoke all on function public.publish_experience_card(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_experience_card(uuid)
  to authenticated, service_role;

comment on function public.publish_experience_card(uuid) is
  'Atomically publishes the card, its archive shell, and only its selected source records after active-cloud and ownership checks.';

create or replace function public.unpublish_experience_card(
  p_card_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  update public.experience_cards as c
  set
    status = 'draft',
    published_at = null
  where c.id = p_card_id
    and c.user_id = v_user_id;

  return found;
end;
$$;

revoke all on function public.unpublish_experience_card(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.unpublish_experience_card(uuid)
  to authenticated, service_role;

comment on function public.unpublish_experience_card(uuid) is
  'Stops public access to an owned card. Source record visibility is left unchanged so pre-existing public records are never silently made private.';

create or replace function public.delete_experience_card(
  p_card_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  delete from public.experience_cards as c
  where c.id = p_card_id
    and c.user_id = v_user_id;

  return found;
end;
$$;

revoke all on function public.delete_experience_card(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_experience_card(uuid)
  to authenticated, service_role;

comment on function public.delete_experience_card(uuid) is
  'Deletes only the experience-card shell and its relation rows. Source records and media are never deleted.';
