-- Saving content and changing visibility are separate user actions.
-- Preserve an existing card's draft/published state while atomically replacing
-- its selected records. When the card is already published, newly selected
-- source records must become public in the same transaction so the card does
-- not temporarily or permanently lose public availability.

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
  v_was_published boolean := false;
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

    v_was_published := v_existing.status = 'published';

    update public.experience_cards as c
    set
      title = v_title,
      cover_media_id = p_cover_media_id,
      source_record_count = v_record_count
    where c.id = v_card_id;

    delete from public.experience_card_records as cr
    where cr.card_id = v_card_id;
  end if;

  insert into public.experience_card_records (card_id, record_id)
  select v_card_id, selected.record_id
  from unnest(p_record_ids) as selected(record_id);

  if v_was_published then
    update public.archives as a
    set is_public = true
    where a.id = p_archive_id
      and a.user_id = v_user_id
      and a.trashed_at is null
      and a.trash_entry_id is null;

    update public.records as r
    set visibility = 'public'
    where r.id = any(p_record_ids)
      and r.archive_id = p_archive_id
      and r.user_id = v_user_id
      and r.trashed_at is null
      and r.trash_entry_id is null;
  end if;

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
  'Creates a private draft or atomically updates an existing card without changing its visibility. A published card also publishes newly selected active source records.';
