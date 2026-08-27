-- Let any eligible viewer adopt another member's suggestion on an accessible
-- help record.  Mutations are kept behind one narrowly scoped function so a
-- client cannot rewrite the comment, recipient or record attached to a mark.

drop policy if exists comment_flowers_insert_help_owner
  on public.comment_flowers;
drop policy if exists comment_flowers_update_sender_only
  on public.comment_flowers;

create or replace function public.set_comment_adoption(
  p_comment_id uuid,
  p_active boolean
)
returns table (
  adoption_id uuid,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_comment public.comments%rowtype;
  v_record public.records%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if not coalesce(p_active, false) then
    update public.comment_flowers as cf
       set revoked_at = coalesce(cf.revoked_at, now())
     where cf.comment_id = p_comment_id
       and cf.sender_user_id = v_user_id;

    return query
      select cf.id, cf.revoked_at
        from public.comment_flowers as cf
       where cf.comment_id = p_comment_id
         and cf.sender_user_id = v_user_id;
    return;
  end if;

  if not public.is_user_membership_active(v_user_id) then
    raise exception 'active cloud access required';
  end if;

  select c.*
    into v_comment
    from public.comments as c
   where c.id = p_comment_id;

  if not found then
    raise exception 'comment not found';
  end if;

  if v_comment.user_id = v_user_id then
    raise exception 'cannot adopt your own suggestion';
  end if;

  select r.*
    into v_record
    from public.records as r
   where r.id = v_comment.record_id;

  if not found
     or v_record.status_tag not in ('help', 'resolved')
     or not public.can_access_record(v_comment.record_id) then
    raise exception 'record is not available for adoption';
  end if;

  insert into public.comment_flowers (
    record_id,
    comment_id,
    sender_user_id,
    receiver_user_id,
    revoked_at,
    revoke_until,
    reason
  ) values (
    v_comment.record_id,
    v_comment.id,
    v_user_id,
    v_comment.user_id,
    null,
    now() + interval '7 days',
    '采纳'
  )
  on conflict (comment_id, sender_user_id)
  do update set
    revoked_at = null,
    record_id = excluded.record_id,
    receiver_user_id = excluded.receiver_user_id,
    reason = excluded.reason;

  return query
    select cf.id, cf.revoked_at
      from public.comment_flowers as cf
     where cf.comment_id = p_comment_id
       and cf.sender_user_id = v_user_id;
end;
$$;

revoke all on function public.set_comment_adoption(uuid, boolean) from public;
revoke all on function public.set_comment_adoption(uuid, boolean) from anon;
grant execute on function public.set_comment_adoption(uuid, boolean)
  to authenticated, service_role;

revoke all on table public.comment_flowers from anon, authenticated;
grant select on table public.comment_flowers to anon, authenticated;
grant all on table public.comment_flowers to service_role;

comment on function public.set_comment_adoption(uuid, boolean) is
  'Adopt or cancel adoption of another user suggestion on an accessible help record.';
