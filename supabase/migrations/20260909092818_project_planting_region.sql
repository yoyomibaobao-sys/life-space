-- Nullable addition keeps legacy projects / restores / imports readable.
-- The new-project RPC enforces the required field for current creation flows.
begin;

create or replace function private.is_valid_planting_region(p_region jsonb)
returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare pair record;
begin
  if p_region is null or jsonb_typeof(p_region) <> 'object' then return false; end if;
  if p_region - array['country_code','country_name','region_name','city_name'] <> '{}'::jsonb then return false; end if;
  for pair in select key, value from jsonb_each(p_region) loop
    if jsonb_typeof(pair.value) <> 'string' or length(pair.value #>> '{}') > 80
      or (pair.value #>> '{}') ~ '[[:cntrl:]]' then return false; end if;
  end loop;
  return coalesce((p_region->>'country_code') ~ '^([A-Z]{2}|OTHER)$'
    and length(trim(p_region->>'city_name')) > 0
    and ((p_region->>'country_code') <> 'OTHER' or length(trim(p_region->>'country_name')) > 0), false);
end;
$$;
revoke all on function private.is_valid_planting_region(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.is_valid_planting_region(jsonb) to authenticated, service_role;

alter table public.archives add column if not exists planting_region jsonb;
alter table public.archives add constraint archives_planting_region_shape_check
  check (planting_region is null or private.is_valid_planting_region(planting_region));
comment on column public.archives.planting_region is 'Coarse country/state/city or district where this project is grown. Follows archive visibility; never contains record GPS or street addresses. Null for legacy projects until explicitly edited.';

create or replace function public.create_project(p_project jsonb)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid; v_region jsonb := nullif(p_project->'planting_region', 'null'::jsonb);
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if jsonb_typeof(p_project) is distinct from 'object'
    or coalesce(trim(p_project->>'title'), '') = ''
    or coalesce(p_project->>'category', '') not in ('plant', 'system', 'insect_fish', 'other') then
    raise exception using errcode = '22023', message = 'invalid_project';
  end if;
  if p_project->>'category' = 'plant' and not private.is_valid_planting_region(v_region) then
    raise exception using errcode = '22023', message = 'planting_region_required';
  end if;
  insert into public.archives (user_id, title, category, species_id, species_name_snapshot, system_name,
    source, note, planting_region, is_public, default_record_visibility)
  values (auth.uid(), trim(p_project->>'title'), p_project->>'category',
    nullif(p_project->>'species_id', '')::uuid, nullif(trim(p_project->>'species_name_snapshot'), ''),
    nullif(trim(p_project->>'system_name'), ''), nullif(trim(p_project->>'source'), ''),
    nullif(trim(p_project->>'note'), ''), v_region,
    coalesce((p_project->>'is_public')::boolean, true), coalesce(p_project->>'default_record_visibility', 'public'))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_project(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_project(jsonb) to authenticated;
comment on function public.create_project(jsonb) is 'Current user project creation with required coarse planting region. Security invoker preserves the existing archive membership and ownership RLS.';
commit;
