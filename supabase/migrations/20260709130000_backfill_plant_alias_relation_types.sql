-- Backfill the first reviewed batch of plant alias relation types.
-- Requires 20260709120000_plant_species_relations.sql to have added
-- plant_species_aliases.relation_type.

-- Plum cultivar groups: these names describe cultivar/form groups under Prunus mume,
-- not default exact system-name matches.
UPDATE public.plant_species_aliases AS psa
SET relation_type = 'cultivar_group'
FROM public.plant_species AS ps
WHERE ps.id = psa.species_id
  AND ps.slug = 'prunus-mume'
  AND psa.alias_name IN (
    '垂枝梅',
    '宫粉梅',
    '朱砂梅',
    '杏梅',
    '洒金梅',
    '照水梅',
    '玉蝶梅',
    '绿萼梅',
    '龙游梅'
  );

-- Rosemary old scientific name: keep searchable as a strong historical/scientific relation.
UPDATE public.plant_species_aliases AS psa
SET relation_type = 'old_scientific_name'
FROM public.plant_species AS ps
WHERE ps.id = psa.species_id
  AND ps.slug = 'salvia-rosmarinus'
  AND psa.alias_name = 'Rosmarinus officinalis';

-- Corn seasonal types: these are planting-season/cropping types, not separate exact species.
UPDATE public.plant_species_aliases AS psa
SET relation_type = 'seasonal_type'
FROM public.plant_species AS ps
WHERE ps.id = psa.species_id
  AND ps.slug = 'corn'
  AND psa.alias_name IN ('春玉米', '夏玉米');
