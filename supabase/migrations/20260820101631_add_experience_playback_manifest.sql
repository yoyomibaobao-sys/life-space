-- Store only the selected source-media ids needed to reproduce an Experience
-- Card as an in-app vertical playback. No MP4 or duplicate image is uploaded.

alter table public.experience_cards
  add column if not exists playback_media_ids uuid[];

comment on column public.experience_cards.playback_media_ids is
  'Ordered source media ids used for live in-app playback. NULL keeps the legacy all-source-images fallback; an empty array intentionally creates text-only playback.';

create or replace function public.save_experience_card_playback_selection(
  p_card_id uuid,
  p_media_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_card public.experience_cards%rowtype;
  v_media_ids uuid[] := coalesce(p_media_ids, array[]::uuid[]);
  v_media_count integer := coalesce(cardinality(v_media_ids), 0);
  v_valid_count integer := 0;
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

  if exists (
    select 1
    from unnest(v_media_ids) as selected(media_id)
    where selected.media_id is null
  ) or (
    select count(distinct selected.media_id)::integer
    from unnest(v_media_ids) as selected(media_id)
  ) <> v_media_count then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_playback_selection_invalid';
  end if;

  if v_media_count > 0 then
    select count(*)::integer
    into v_valid_count
    from public.media as m
    where m.id = any(v_media_ids)
      and m.user_id = v_user_id
      and m.trashed_at is null
      and m.trash_entry_id is null
      and (
        coalesce(m.mime_type, '') like 'image/%'
        or lower(coalesce(m.type, '')) in ('image', 'photo')
      )
      and exists (
        select 1
        from public.experience_card_records as cr
        where cr.card_id = v_card.id
          and cr.record_id = m.record_id
      );

    if v_valid_count <> v_media_count then
      raise exception using
        errcode = 'P0001',
        message = 'experience_card_playback_selection_invalid';
    end if;
  end if;

  update public.experience_cards as c
  set playback_media_ids = v_media_ids
  where c.id = v_card.id;

  return true;
end;
$$;

revoke all on function public.save_experience_card_playback_selection(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.save_experience_card_playback_selection(uuid, uuid[])
  to authenticated, service_role;

comment on function public.save_experience_card_playback_selection(uuid, uuid[]) is
  'Stores only an owned Experience Card playback manifest after validating every selected media id belongs to one of the card source records.';
