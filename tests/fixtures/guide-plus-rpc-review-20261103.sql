-- REVIEW ONLY / NOT INSTALLED -- C-group guide gate, 2026-11-03
-- Existing RPCs get_public_guide_catalog and get_member_guide_content already
-- depend on private.can_read_full_guide; replace only the entitlement predicate.
-- QA confirmation: paid Plus uses plan=basic with server paid_until.
-- Free/Trial/admin without an independently paid active Plus period cannot read.
create or replace function private.can_read_full_guide(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
      from public.user_memberships as m
     where m.user_id = p_user_id
       and m.plan = 'basic'
       and m.status = 'active'
       and m.paid_until > now()
  );
$$;
revoke all on function private.can_read_full_guide(uuid)
  from public, anon, authenticated, service_role;

-- New narrowly-scoped Plus read contract for the plant detail path.
-- MUST deploy authenticated client switch before revoking legacy direct reads.
create or replace function public.get_plus_plant_guide(
  p_species_id uuid, p_language text default 'zh'
) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'parameters', (
      select pg_catalog.to_jsonb(par)
      from public.plant_parameters as par
      where par.species_id = p_species_id
      limit 1
    ),
    'growth_cycle', (
      select pg_catalog.to_jsonb(gc)
      from public.plant_growth_cycle as gc
      where gc.species_id = p_species_id
      limit 1
    ),
    'care_guide', (
      select pg_catalog.to_jsonb(care)
      from public.plant_care_guides as care
      where care.plant_id = p_species_id
        and care.language_code = 'zh'
      limit 1
    )
  )
  where p_species_id is not null
    and p_language in ('zh', 'en')
    and private.can_read_full_guide((select auth.uid()))
    and exists (select 1 from public.plant_species as species
                 where species.id = p_species_id and species.is_active = true);
$$;
revoke all on function public.get_plus_plant_guide(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_plus_plant_guide(uuid,text)
  to authenticated, service_role;

-- AFTER independent A-group website/Android deployment validation ONLY:
-- separate held file performs the legacy table SELECT ACL closeout.
-- THIS FILE DOES NOT REVOKE PLANT TABLE SELECT.
