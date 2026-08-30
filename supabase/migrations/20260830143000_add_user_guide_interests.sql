-- Private bookmarks for the three non-plant guide libraries.
-- Existing user_plant_interests and all guide/project content remain unchanged.
begin;

create table public.user_guide_interests (
  user_id uuid not null references auth.users(id) on delete cascade,
  guide_id uuid not null references public.guide_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, guide_id)
);

create index user_guide_interests_guide_id_idx on public.user_guide_interests (guide_id);
create index user_guide_interests_user_created_idx on public.user_guide_interests (user_id, created_at desc);

alter table public.user_guide_interests enable row level security;
revoke all on public.user_guide_interests from public, anon, authenticated;
grant select, insert, delete on public.user_guide_interests to authenticated;
grant all on public.user_guide_interests to service_role;

create policy "guide interests owner read"
  on public.user_guide_interests for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "guide interests owner add"
  on public.user_guide_interests for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select public.has_active_cloud_access())
    and exists (
      select 1 from public.guide_entries guide
      where guide.id = user_guide_interests.guide_id and guide.is_active = true
        and guide.source in ('preset', 'approved')
    )
  );

create policy "guide interests owner remove"
  on public.user_guide_interests for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.user_guide_interests is
  'Private saved guides; neither guide authors nor other users can read another user''s bookmarks.';

notify pgrst, 'reload schema';
commit;
