begin;
-- ADM2 minimal append-only admin action audit. Existing support RPCs remain unchanged.
create table public.support_submission_admin_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null,
  actor_id uuid not null,
  previous_status text not null,
  next_status text not null,
  resolution text,
  admin_note text,
  occurred_at timestamptz not null default now()
);
create index support_submission_admin_events_recent_idx
  on public.support_submission_admin_events (occurred_at desc, id desc);
alter table public.support_submission_admin_events enable row level security;
revoke all on public.support_submission_admin_events from public, anon, authenticated;
grant select on public.support_submission_admin_events to service_role;
revoke all on sequence public.support_submission_admin_events_id_seq from public,anon,authenticated;

create function public.audit_support_submission_admin_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- Only administrator-initiated review state changes are audited.
  if v_actor is null or not public.is_app_admin(v_actor) then return new; end if;
  if old.status is distinct from new.status
      or old.resolution is distinct from new.resolution
      or old.admin_note is distinct from new.admin_note
      or old.resolved_by is distinct from new.resolved_by then
    insert into public.support_submission_admin_events(
      submission_id,actor_id,previous_status,next_status,resolution,admin_note
    ) values (new.id,v_actor,old.status,new.status,new.resolution,new.admin_note);
  end if;
  return new;
end;
$$;
revoke all on function public.audit_support_submission_admin_update()
  from public,anon,authenticated,service_role;
create trigger support_submission_admin_audit_after_update
after update of status,resolution,admin_note,resolved_by
on public.support_submissions
for each row execute function public.audit_support_submission_admin_update();

create function public.admin_list_support_audit_events(
  p_limit integer default 50, p_offset integer default 0
)
returns table (
  id bigint,submission_id uuid,actor_id uuid,previous_status text,next_status text,
  resolution text,admin_note text,occurred_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select e.id,e.submission_id,e.actor_id,e.previous_status,e.next_status,
    e.resolution,e.admin_note,e.occurred_at
  from public.support_submission_admin_events e
  where public.is_app_admin(auth.uid())
  order by e.occurred_at desc,e.id desc
  limit least(greatest(coalesce(p_limit,50),1),100)
  offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.admin_list_support_audit_events(integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_list_support_audit_events(integer,integer)
  to authenticated,service_role;

notify pgrst, 'reload schema';
commit;
