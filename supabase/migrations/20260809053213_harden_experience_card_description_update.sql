-- Keep description updates inside ordinary RLS instead of exposing a
-- SECURITY DEFINER write function in the public API schema.

drop policy if exists experience_cards_update_description_owner_active
  on public.experience_cards;
create policy experience_cards_update_description_owner_active
on public.experience_cards
for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_user_membership_active((select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  and public.is_user_membership_active((select auth.uid()))
);

revoke update on table public.experience_cards
  from public, anon, authenticated;
revoke update (description) on table public.experience_cards
  from public, anon, authenticated;
grant update (description) on table public.experience_cards
  to authenticated;

create or replace function public.update_experience_card_description(
  p_card_id uuid,
  p_description text
)
returns boolean
language plpgsql
security invoker
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
  'Updates only the owned card description as the caller; column grants and RLS require the owner to have active cloud access.';
