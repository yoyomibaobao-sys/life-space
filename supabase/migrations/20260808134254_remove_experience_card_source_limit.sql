-- Experience cards can grow with a long-running project. Keep the minimum
-- needed to form a useful card, but remove the product-level maximum.

alter table public.experience_cards
  drop constraint if exists experience_cards_source_record_count_check;

alter table public.experience_cards
  alter column source_record_count type integer
  using source_record_count::integer;

alter table public.experience_cards
  add constraint experience_cards_source_record_count_check
  check (source_record_count >= 3);

comment on column public.experience_cards.source_record_count is
  'Expected selected-record count, with a minimum of three and no product-level maximum. A source deletion mismatch immediately stops public access.';

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

  if v_record_count < 3 then
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
      and c.source_record_count >= 3
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
  'True only while the published card has at least three expected source records and every source remains public, active, and attached to the same active archive.';

comment on function public.save_experience_card(
  uuid,
  uuid,
  text,
  uuid[],
  uuid
) is
  'Creates or updates a private draft from at least three active records in one owned cloud archive, without a product-level maximum. Editing a published card returns it to draft.';
