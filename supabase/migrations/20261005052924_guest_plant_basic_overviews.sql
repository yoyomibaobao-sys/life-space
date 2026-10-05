-- The overview is the agreed visitor guide tier. Keep detailed care guides,
-- parameters, and growth cycles behind their existing membership policies.
create or replace function private.get_plant_basic_overviews(
  p_species_id uuid default null,
  p_language_code text default 'zh'
)
returns table (species_id uuid, summary text)
language sql
stable
security definer
set search_path = ''
as $$
  select ps.id as species_id,
    coalesce(nullif(trim(pcg.summary), ''),
             nullif(trim(psi.description), ''),
             nullif(trim(ps.description), '')) as summary
  from public.plant_species as ps
  left join public.plant_species_i18n as psi
    on psi.plant_id = ps.id
   and psi.language_code = coalesce(nullif(trim(p_language_code), ''), 'zh')
  left join public.plant_care_guides as pcg
    on pcg.plant_id = ps.id
   and pcg.language_code = coalesce(nullif(trim(p_language_code), ''), 'zh')
  where ps.is_active = true
    and (p_species_id is null or ps.id = p_species_id)
  order by ps.sort_order asc nulls last, ps.common_name asc;
$$;

revoke all on function private.get_plant_basic_overviews(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.get_plant_basic_overviews(uuid, text)
  to authenticated;

-- The public wrapper runs with its owner so anon never needs USAGE on the
-- private schema. Its only result is the two-column active-species overview.
create or replace function public.get_plant_basic_overviews(
  p_species_id uuid default null,
  p_language_code text default 'zh'
)
returns table (species_id uuid, summary text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.get_plant_basic_overviews(p_species_id, p_language_code);
$$;

revoke all on function public.get_plant_basic_overviews(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_plant_basic_overviews(uuid, text)
  to anon, authenticated;

comment on function public.get_plant_basic_overviews(uuid, text) is
  'Public active-species overview only. Detailed parameters, care guidance, growth cycles, and related records remain member-controlled.';
