-- Phase A: additive, backwards compatible with the currently deployed web.
-- The old registered-only suitability RPC remains available until Phase B.
-- The overview is the agreed visitor guide tier. Keep detailed care guides,
-- parameters, and growth cycles behind their existing membership policies.
-- Both the directory and detail use this active-only, fixed-column reader.
-- The exposed function is SECURITY DEFINER because the summaries reside in
-- member-only tables. Its output contains no full-guide or account fields.
create or replace function public.get_public_plant_catalog(
  p_lookup text default null,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  id uuid,
  slug text,
  common_name text,
  scientific_name text,
  family text,
  category text,
  sub_category text,
  growth_type text,
  entry_type text,
  sort_order integer,
  is_active boolean,
  aliases jsonb,
  translations jsonb,
  summary_zh text,
  summary_en text
)
language sql
stable
security definer
set search_path = ''
as $$
  select ps.id, ps.slug, ps.common_name, ps.scientific_name,
    ps.family, ps.category, ps.sub_category, ps.growth_type,
    ps.entry_type, ps.sort_order, ps.is_active,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'species_id', a.species_id,
          'alias_name', a.alias_name,
          'relation_type', a.relation_type
        ) order by a.alias_name
      )
      from public.plant_species_aliases as a
      where a.species_id = ps.id
    ), '[]'::jsonb) as aliases,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'plant_id', i.plant_id,
          'language_code', i.language_code,
          'common_name', i.common_name,
          'family', i.family
        ) order by i.language_code
      )
      from public.plant_species_i18n as i
      where i.plant_id = ps.id and i.language_code in ('zh', 'en')
    ), '[]'::jsonb) as translations,
    coalesce(
      nullif(pg_catalog.btrim(czh.summary), ''),
      nullif(pg_catalog.btrim(izh.description), ''),
      nullif(pg_catalog.btrim(ps.description), '')
    ) as summary_zh,
    coalesce(
      nullif(pg_catalog.btrim(cen.summary), ''),
      nullif(pg_catalog.btrim(ien.description), ''),
      nullif(pg_catalog.btrim(ps.description), '')
    ) as summary_en
  from public.plant_species as ps
  left join public.plant_species_i18n as izh
    on izh.plant_id = ps.id and izh.language_code = 'zh'
  left join public.plant_species_i18n as ien
    on ien.plant_id = ps.id and ien.language_code = 'en'
  left join public.plant_care_guides as czh
    on czh.plant_id = ps.id and czh.language_code = 'zh'
  left join public.plant_care_guides as cen
    on cen.plant_id = ps.id and cen.language_code = 'en'
  where ps.is_active = true
    and (
      p_lookup is null
      or ps.id::text = p_lookup
      or ps.slug = p_lookup
      or ps.common_name = p_lookup
    )
    and (p_lookup is null or pg_catalog.length(p_lookup) <= 150)
  order by
    case when ps.id::text = p_lookup then 0
         when ps.slug = p_lookup then 1 else 2 end,
    ps.sort_order asc nulls last, ps.common_name asc, ps.id asc
  limit least(greatest(p_limit, 0), 500)
  offset least(greatest(p_offset, 0), 100000);
$$;

revoke all on function public.get_public_plant_catalog(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_plant_catalog(text, integer, integer)
  to anon, authenticated;

comment on function public.get_public_plant_catalog(text, integer, integer) is
  'Active plants only; fixed directory fields, public aliases/translations and basic summaries. No member-only parameters or full care content.';

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
