-- Keep cloud project classification depth independent from device-local settings.

create table if not exists public.archive_category_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  max_depth smallint not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category),
  constraint archive_category_settings_category_check
    check (category in ('plant', 'system', 'insect_fish', 'other')),
  constraint archive_category_settings_max_depth_check
    check (max_depth between 1 and 3)
);

alter table public.archive_category_settings enable row level security;

revoke all on table public.archive_category_settings from anon;
grant select on table public.archive_category_settings to anon;
grant select, insert, update, delete on table public.archive_category_settings to authenticated;

drop policy if exists "archive category settings select visible" on public.archive_category_settings;
create policy "archive category settings select visible"
  on public.archive_category_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "archive category settings insert own" on public.archive_category_settings;
create policy "archive category settings insert own"
  on public.archive_category_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "archive category settings update own" on public.archive_category_settings;
create policy "archive category settings update own"
  on public.archive_category_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "archive category settings delete own" on public.archive_category_settings;
create policy "archive category settings delete own"
  on public.archive_category_settings
  for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.archive_category_settings is
  'Per-user maximum classification depth for cloud projects; local projects use device-local settings.';
