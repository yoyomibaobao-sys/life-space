-- Keep the new category and guide policies efficient at scale and index their foreign keys.

drop policy if exists "archive category settings insert own"
  on public.archive_category_settings;
create policy "archive category settings insert own"
  on public.archive_category_settings
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "archive category settings update own"
  on public.archive_category_settings;
create policy "archive category settings update own"
  on public.archive_category_settings
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "archive category settings delete own"
  on public.archive_category_settings;
create policy "archive category settings delete own"
  on public.archive_category_settings
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "guide entries admin insert"
  on public.guide_entries;
create policy "guide entries admin insert"
  on public.guide_entries
  for insert
  to authenticated
  with check ((select public.is_app_admin((select auth.uid()))));

drop policy if exists "guide entries admin update"
  on public.guide_entries;
create policy "guide entries admin update"
  on public.guide_entries
  for update
  to authenticated
  using ((select public.is_app_admin((select auth.uid()))))
  with check ((select public.is_app_admin((select auth.uid()))));

drop policy if exists "guide entries admin delete"
  on public.guide_entries;
create policy "guide entries admin delete"
  on public.guide_entries
  for delete
  to authenticated
  using ((select public.is_app_admin((select auth.uid()))));

drop policy if exists "guide candidates involved user read"
  on public.guide_candidates;
create policy "guide candidates involved user read"
  on public.guide_candidates
  for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or (select public.is_app_admin((select auth.uid())))
    or exists (
      select 1
      from public.guide_candidate_usages usage
      where usage.candidate_id = guide_candidates.id
        and usage.user_id = (select auth.uid())
    )
  );

drop policy if exists "guide candidate usages own read"
  on public.guide_candidate_usages;
create policy "guide candidate usages own read"
  on public.guide_candidate_usages
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_app_admin((select auth.uid())))
  );

create index if not exists guide_entries_created_by_idx
  on public.guide_entries (created_by)
  where created_by is not null;
create index if not exists guide_entries_approved_by_idx
  on public.guide_entries (approved_by)
  where approved_by is not null;
create index if not exists guide_candidates_created_by_idx
  on public.guide_candidates (created_by)
  where created_by is not null;
create index if not exists guide_candidates_reviewed_by_idx
  on public.guide_candidates (reviewed_by)
  where reviewed_by is not null;
create index if not exists guide_candidates_public_guide_id_idx
  on public.guide_candidates (public_guide_id)
  where public_guide_id is not null;
