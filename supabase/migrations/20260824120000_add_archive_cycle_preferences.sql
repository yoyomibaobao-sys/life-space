alter table public.archives
  add column if not exists cycle_enabled boolean not null default false,
  add column if not exists next_cycle_name text;

alter table public.archive_cycles
  add column if not exists display_name text;

update public.archives as a
set cycle_enabled = true
where exists (
  select 1
  from public.archive_cycles as ac
  where ac.archive_id = a.id
)
and a.cycle_enabled = false;

alter table public.archives
  drop constraint if exists archives_next_cycle_name_length_check;

alter table public.archives
  add constraint archives_next_cycle_name_length_check
  check (
    next_cycle_name is null
    or char_length(btrim(next_cycle_name)) between 1 and 80
  );

alter table public.archive_cycles
  drop constraint if exists archive_cycles_display_name_length_check;

alter table public.archive_cycles
  add constraint archive_cycles_display_name_length_check
  check (
    display_name is null
    or char_length(btrim(display_name)) between 1 and 80
  );

comment on column public.archives.cycle_enabled is
  'Whether this archive uses crop-cycle/round grouping. Existing archives with cycles are backfilled to true.';

comment on column public.archives.next_cycle_name is
  'Optional user-defined display name for the next crop cycle or round.';

comment on column public.archive_cycles.display_name is
  'Optional user-defined name captured when this crop cycle or round starts.';
