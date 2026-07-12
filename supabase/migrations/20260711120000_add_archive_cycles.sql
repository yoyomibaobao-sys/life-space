create table if not exists public.archive_cycles (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  cycle_no integer not null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint archive_cycles_cycle_no_check check (cycle_no > 0),
  constraint archive_cycles_status_check check (status in ('active', 'ended')),
  constraint archive_cycles_status_dates_check check (
    (status = 'active' and ended_at is null)
    or (status = 'ended' and ended_at is not null and ended_at >= started_at)
  ),
  constraint archive_cycles_archive_cycle_no_key unique (archive_id, cycle_no),
  constraint archive_cycles_id_archive_id_key unique (id, archive_id)
);

create index if not exists archive_cycles_archive_id_idx
  on public.archive_cycles (archive_id);

create index if not exists archive_cycles_status_idx
  on public.archive_cycles (status);

alter table public.records
  add column if not exists cycle_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'records_cycle_archive_required_check'
      and conrelid = 'public.records'::regclass
  ) then
    alter table public.records
      add constraint records_cycle_archive_required_check
      check (cycle_id is null or archive_id is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'records_cycle_archive_fkey'
      and conrelid = 'public.records'::regclass
  ) then
    alter table public.records
      add constraint records_cycle_archive_fkey
      foreign key (cycle_id, archive_id)
      references public.archive_cycles(id, archive_id);
  end if;
end $$;

create index if not exists records_cycle_id_idx
  on public.records (cycle_id);

alter table public.archive_cycles enable row level security;

drop policy if exists "archive cycles select own or public archive" on public.archive_cycles;
create policy "archive cycles select own or public archive"
  on public.archive_cycles
  for select
  using (
    exists (
      select 1
      from public.archives a
      where a.id = archive_cycles.archive_id
        and (a.user_id = auth.uid() or a.is_public = true)
    )
  );

drop policy if exists "archive cycles insert own archive" on public.archive_cycles;
create policy "archive cycles insert own archive"
  on public.archive_cycles
  for insert
  with check (
    exists (
      select 1
      from public.archives a
      where a.id = archive_cycles.archive_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists "archive cycles update own archive" on public.archive_cycles;
create policy "archive cycles update own archive"
  on public.archive_cycles
  for update
  using (
    exists (
      select 1
      from public.archives a
      where a.id = archive_cycles.archive_id
        and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.archives a
      where a.id = archive_cycles.archive_id
        and a.user_id = auth.uid()
    )
  );

drop trigger if exists trg_archive_cycles_updated_at on public.archive_cycles;
create trigger trg_archive_cycles_updated_at
  before update on public.archive_cycles
  for each row
  execute function public.set_updated_at();

grant select on table public.archive_cycles to anon;
grant select, insert, update on table public.archive_cycles to authenticated;
grant all on table public.archive_cycles to service_role;
