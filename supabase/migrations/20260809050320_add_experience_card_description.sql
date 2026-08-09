-- Add an optional short description that the card owner can edit without
-- replacing source records or changing the card's visibility.

alter table public.experience_cards
  add column if not exists description text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'experience_cards_description_check'
      and conrelid = 'public.experience_cards'::regclass
  ) then
    alter table public.experience_cards
      add constraint experience_cards_description_check
      check (
        description is null
        or (
          description = btrim(description)
          and char_length(description) between 1 and 500
        )
      );
  end if;
end;
$$;

comment on column public.experience_cards.description is
  'Optional owner-authored detail description. Empty input is stored as null; maximum 500 characters.';

comment on table public.experience_cards is
  'User-authored experience-card shells with a title, optional short description, and source references; record text and photos remain canonical in records/media.';

create or replace function public.update_experience_card_description(
  p_card_id uuid,
  p_description text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
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

  if v_description is not null and char_length(v_description) > 500 then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_description_invalid';
  end if;

  update public.experience_cards as card
  set description = v_description
  where card.id = p_card_id
    and card.user_id = v_user_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_not_found_or_forbidden';
  end if;

  return true;
end;
$$;

revoke all on function public.update_experience_card_description(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_experience_card_description(uuid, text)
  to authenticated, service_role;

comment on function public.update_experience_card_description(uuid, text) is
  'Updates only the owned card description while preserving its source records, visibility, and generated-video cache.';
