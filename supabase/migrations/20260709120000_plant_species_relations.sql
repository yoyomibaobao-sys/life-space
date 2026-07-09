-- Add minimal plant species relation modeling.
-- This keeps aliases backwards-compatible while allowing future canonical,
-- synonym, broad-term, cultivar, and seasonal relationships to be modeled.

ALTER TABLE public.plant_species_aliases
  ADD COLUMN IF NOT EXISTS relation_type text NOT NULL DEFAULT 'exact';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plant_species_aliases_relation_type_check'
      AND conrelid = 'public.plant_species_aliases'::regclass
  ) THEN
    ALTER TABLE public.plant_species_aliases
      ADD CONSTRAINT plant_species_aliases_relation_type_check
      CHECK (
        relation_type IN (
          'exact',
          'old_scientific_name',
          'common_name',
          'regional',
          'broad',
          'ambiguous',
          'cultivar_group',
          'growth_form',
          'seasonal_type',
          'search_only'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS plant_species_aliases_relation_type_idx
  ON public.plant_species_aliases (relation_type);

CREATE TABLE IF NOT EXISTS public.plant_species_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_species_id uuid NOT NULL REFERENCES public.plant_species(id) ON DELETE CASCADE,
  target_species_id uuid REFERENCES public.plant_species(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plant_species_relations_source_target_check'
      AND conrelid = 'public.plant_species_relations'::regclass
  ) THEN
    ALTER TABLE public.plant_species_relations
      ADD CONSTRAINT plant_species_relations_source_target_check
      CHECK (target_species_id IS NULL OR source_species_id <> target_species_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plant_species_relations_relation_type_check'
      AND conrelid = 'public.plant_species_relations'::regclass
  ) THEN
    ALTER TABLE public.plant_species_relations
      ADD CONSTRAINT plant_species_relations_relation_type_check
      CHECK (
        relation_type IN (
          'canonical_redirect',
          'old_scientific_name',
          'synonym',
          'broad_to_candidate',
          'cultivar_group',
          'seasonal_type',
          'regional_variant',
          'duplicate'
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS plant_species_relations_source_target_type_uidx
  ON public.plant_species_relations (source_species_id, target_species_id, relation_type);

CREATE INDEX IF NOT EXISTS plant_species_relations_source_species_id_idx
  ON public.plant_species_relations (source_species_id);

CREATE INDEX IF NOT EXISTS plant_species_relations_target_species_id_idx
  ON public.plant_species_relations (target_species_id);

CREATE INDEX IF NOT EXISTS plant_species_relations_relation_type_idx
  ON public.plant_species_relations (relation_type);

CREATE INDEX IF NOT EXISTS plant_species_relations_is_active_idx
  ON public.plant_species_relations (is_active);

ALTER TABLE public.plant_species_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plant species relations public read" ON public.plant_species_relations;
CREATE POLICY "plant species relations public read"
  ON public.plant_species_relations
  FOR SELECT
  USING (true);

GRANT SELECT ON TABLE public.plant_species_relations TO anon;
GRANT SELECT ON TABLE public.plant_species_relations TO authenticated;
GRANT ALL ON TABLE public.plant_species_relations TO service_role;

DROP TRIGGER IF EXISTS trg_plant_species_relations_updated_at ON public.plant_species_relations;
CREATE TRIGGER trg_plant_species_relations_updated_at
  BEFORE UPDATE ON public.plant_species_relations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

WITH relation_values AS (
  SELECT *
  FROM (
    VALUES
      (
        '迷迭香',
        'Rosmarinus officinalis',
        'rosemary-old-name',
        '迷迭香',
        'Salvia rosmarinus',
        'salvia-rosmarinus',
        'old_scientific_name',
        'Rosmarinus officinalis is an older scientific name / synonym; Salvia rosmarinus is the current canonical entry.'
      ),
      (
        '春玉米',
        'Zea mays',
        'spring-corn',
        '玉米',
        'Zea mays',
        'corn',
        'seasonal_type',
        'Spring corn is a planting-season/cropping type under corn, not a separate default species candidate.'
      ),
      (
        '夏玉米',
        'Zea mays',
        'summer-corn',
        '玉米',
        'Zea mays',
        'corn',
        'seasonal_type',
        'Summer corn is a planting-season/cropping type under corn, not a separate default species candidate.'
      ),
      (
        '柑橘',
        'Citrus reticulata',
        'citrus-reticulata',
        '橘子',
        'Citrus reticulata',
        'mandarin-orange',
        'broad_to_candidate',
        'Citrus is a broad entry here; this relation is not an exact synonym and should require confirmation.'
      ),
      (
        '文旦',
        'Citrus maxima',
        'wendan-pomelo',
        '柚子',
        'Citrus maxima',
        'pomelo',
        'cultivar_group',
        'Wendan is treated as a pomelo cultivar/regional cultivated type and is not a default canonical species candidate.'
      ),
      (
        '葱',
        'Allium fistulosum',
        'green-onion',
        '小葱',
        'Allium fistulosum',
        'scallion',
        'broad_to_candidate',
        'Cong is a broad entry and should branch to more specific candidates; it is not a default system-name candidate.'
      ),
      (
        '葱',
        'Allium fistulosum',
        'green-onion',
        '大葱',
        'Allium fistulosum',
        'welsh-onion',
        'broad_to_candidate',
        'Cong is a broad entry and should branch to more specific candidates; it is not a default system-name candidate.'
      )
  ) AS v(
    source_common_name,
    source_scientific_name,
    source_slug,
    target_common_name,
    target_scientific_name,
    target_slug,
    relation_type,
    note
  )
),
resolved_relations AS (
  SELECT
    source_species.id AS source_species_id,
    target_species.id AS target_species_id,
    relation_values.relation_type,
    relation_values.note
  FROM relation_values
  JOIN public.plant_species AS source_species
    ON source_species.common_name = relation_values.source_common_name
   AND source_species.scientific_name = relation_values.source_scientific_name
   AND source_species.slug = relation_values.source_slug
  JOIN public.plant_species AS target_species
    ON target_species.common_name = relation_values.target_common_name
   AND target_species.scientific_name = relation_values.target_scientific_name
   AND target_species.slug = relation_values.target_slug
)
INSERT INTO public.plant_species_relations (
  source_species_id,
  target_species_id,
  relation_type,
  note
)
SELECT
  resolved_relations.source_species_id,
  resolved_relations.target_species_id,
  resolved_relations.relation_type,
  resolved_relations.note
FROM resolved_relations
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plant_species_relations AS existing_relations
  WHERE existing_relations.source_species_id = resolved_relations.source_species_id
    AND existing_relations.target_species_id = resolved_relations.target_species_id
    AND existing_relations.relation_type = resolved_relations.relation_type
);
