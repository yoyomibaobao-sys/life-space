-- Annual and seasonal plants continue to use stage durations in days. Long-
-- lived plants may use a year range, or omit a fixed cycle when it would be
-- misleading. Existing rows remain day-based.

alter table public.plant_growth_cycle
  add column if not exists cycle_unit text not null default 'day',
  add column if not exists cycle_min numeric,
  add column if not exists cycle_max numeric,
  add column if not exists cycle_note text;

alter table public.plant_growth_cycle
  drop constraint if exists plant_growth_cycle_unit_check,
  add constraint plant_growth_cycle_unit_check
    check (cycle_unit in ('day', 'year', 'hidden')),
  drop constraint if exists plant_growth_cycle_range_check,
  add constraint plant_growth_cycle_range_check
    check (
      (cycle_min is null or cycle_min > 0)
      and (cycle_max is null or cycle_max > 0)
      and (cycle_min is null or cycle_max is null or cycle_max >= cycle_min)
    );

update public.plant_growth_cycle
set cycle_unit = 'day'
where cycle_unit is null;

-- A perennial, woody, or clearly long-lived plant without an explicit year
-- range should not be shown with a fabricated day total. Existing seasonal
-- rows stay day-based; only known long-lived rows with no meaningful year data
-- are hidden.
update public.plant_growth_cycle cycle
set cycle_unit = 'hidden',
    cycle_note = coalesce(cycle.cycle_note, '固定周期不适用，按季节和实际生长观察记录。')
from public.plant_species species
where species.id = cycle.species_id
  and lower(coalesce(species.growth_type, '')) in (
    'perennial', 'tree', 'shrub', 'cactus', 'succulent', 'fern',
    'epiphytic_fern', 'groundcover'
  )
  and cycle.cycle_unit = 'day'
  and cycle.cycle_min is null
  and cycle.cycle_max is null;

comment on column public.plant_growth_cycle.cycle_unit is
  'day uses the five stage-day columns; year uses cycle_min/cycle_max; hidden omits the fixed-cycle block.';
comment on column public.plant_growth_cycle.cycle_min is
  'Lower bound for a non-day cycle, normally years to first maturity for a long-lived plant.';
comment on column public.plant_growth_cycle.cycle_max is
  'Upper bound for a non-day cycle, normally years to first maturity for a long-lived plant.';
comment on column public.plant_growth_cycle.cycle_note is
  'Optional localized-neutral note explaining cultivar or environment variation.';
