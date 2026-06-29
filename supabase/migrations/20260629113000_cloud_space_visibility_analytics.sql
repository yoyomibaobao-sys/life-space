-- Cloud-space visibility defaults, plant related archive cards, and lightweight analytics.
-- This migration intentionally does not change Storage bucket configuration.

ALTER TABLE public.archives
  ADD COLUMN IF NOT EXISTS default_record_visibility text DEFAULT 'private' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'archives_default_record_visibility_check'
      AND conrelid = 'public.archives'::regclass
  ) THEN
    ALTER TABLE public.archives
      ADD CONSTRAINT archives_default_record_visibility_check
      CHECK (default_record_visibility IN ('private', 'public'));
  END IF;
END $$;

COMMENT ON COLUMN public.archives.default_record_visibility IS
  'Controls the default visibility for newly added records in this archive. Existing records are never bulk changed by this setting.';

CREATE OR REPLACE VIEW public.plant_related_archives_view AS
WITH archive_species_matches AS (
  SELECT DISTINCT
    a.id AS archive_id,
    COALESCE(a.species_id, ps.id, psi.plant_id, psa.species_id) AS related_species_id
  FROM public.archives a
  LEFT JOIN public.plant_species ps
    ON a.species_id IS NULL
   AND (
      NULLIF(lower(regexp_replace(trim(a.species_name_snapshot), '\s+', '', 'g')), '') =
        NULLIF(lower(regexp_replace(trim(ps.common_name), '\s+', '', 'g')), '')
      OR NULLIF(lower(regexp_replace(trim(a.species_name_snapshot), '\s+', '', 'g')), '') =
        NULLIF(lower(regexp_replace(trim(ps.scientific_name), '\s+', '', 'g')), '')
      OR NULLIF(lower(regexp_replace(trim(a.system_name), '\s+', '', 'g')), '') =
        NULLIF(lower(regexp_replace(trim(ps.common_name), '\s+', '', 'g')), '')
      OR NULLIF(lower(regexp_replace(trim(a.system_name), '\s+', '', 'g')), '') =
        NULLIF(lower(regexp_replace(trim(ps.scientific_name), '\s+', '', 'g')), '')
   )
  LEFT JOIN public.plant_species_i18n psi
    ON a.species_id IS NULL
   AND (
      NULLIF(lower(regexp_replace(trim(a.species_name_snapshot), '\s+', '', 'g')), '') =
        NULLIF(lower(regexp_replace(trim(psi.common_name), '\s+', '', 'g')), '')
      OR NULLIF(lower(regexp_replace(trim(a.system_name), '\s+', '', 'g')), '') =
        NULLIF(lower(regexp_replace(trim(psi.common_name), '\s+', '', 'g')), '')
   )
  LEFT JOIN public.plant_species_aliases psa
    ON a.species_id IS NULL
   AND (
      NULLIF(lower(regexp_replace(trim(a.species_name_snapshot), '\s+', '', 'g')), '') =
        NULLIF(lower(trim(psa.normalized_name)), '')
      OR NULLIF(lower(regexp_replace(trim(a.species_name_snapshot), '\s+', '', 'g')), '') =
        NULLIF(lower(regexp_replace(trim(psa.alias_name), '\s+', '', 'g')), '')
      OR NULLIF(lower(regexp_replace(trim(a.system_name), '\s+', '', 'g')), '') =
        NULLIF(lower(trim(psa.normalized_name)), '')
      OR NULLIF(lower(regexp_replace(trim(a.system_name), '\s+', '', 'g')), '') =
        NULLIF(lower(regexp_replace(trim(psa.alias_name), '\s+', '', 'g')), '')
   )
  WHERE a.is_public = true
    AND COALESCE(a.species_id, ps.id, psi.plant_id, psa.species_id) IS NOT NULL
)
SELECT
  a.id AS archive_id,
  a.user_id,
  a.title AS archive_title,
  a.system_name,
  asm.related_species_id AS species_id,
  a.species_name_snapshot,
  a.status AS archive_status,
  a.ended_at,
  a.help_status AS archive_help_status,
  COALESCE(
    NULLIF(to_jsonb(a)->>'cover_image_url', ''),
    lr.primary_image_url,
    lm.url
  ) AS cover_image_url,
  NULLIF(to_jsonb(a)->>'cover_image_path', '') AS cover_image_path,
  NULLIF(to_jsonb(a)->>'cover_thumb_path', '') AS cover_thumb_path,
  p.username,
  p.avatar_url,
  COALESCE(rc.public_record_count, 0)::integer AS public_record_count,
  lr.record_time AS last_public_record_time,
  lr.note AS last_public_record_note,
  COALESCE(lr.primary_image_url, lm.url) AS last_public_record_image_url,
  COALESCE(NULLIF(to_jsonb(lr)->>'primary_image_path', ''), lm.storage_path) AS last_public_record_image_path,
  COALESCE(NULLIF(to_jsonb(lr)->>'primary_thumb_path', ''), lm.thumb_path) AS last_public_record_thumb_path
FROM archive_species_matches asm
JOIN public.archives a ON a.id = asm.archive_id
LEFT JOIN public.profiles p ON p.id = a.user_id
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS public_record_count
  FROM public.records r
  WHERE r.archive_id = a.id
    AND r.visibility = 'public'
) rc ON true
LEFT JOIN LATERAL (
  SELECT r.*
  FROM public.records r
  WHERE r.archive_id = a.id
    AND r.visibility = 'public'
  ORDER BY r.record_time DESC NULLS LAST, r.created_at DESC NULLS LAST
  LIMIT 1
) lr ON true
LEFT JOIN LATERAL (
  SELECT m.url, m.storage_path, m.thumb_path
  FROM public.media m
  WHERE lr.id IS NOT NULL
    AND m.record_id = lr.id
    AND m.type = 'image'
  ORDER BY m.sort_order ASC NULLS LAST, m.created_at ASC NULLS LAST
  LIMIT 1
) lm ON true
ORDER BY lr.record_time DESC NULLS LAST, a.created_at DESC NULLS LAST;

ALTER VIEW public.plant_related_archives_view OWNER TO postgres;
GRANT SELECT ON TABLE public.plant_related_archives_view TO anon;
GRANT SELECT ON TABLE public.plant_related_archives_view TO authenticated;
GRANT SELECT ON TABLE public.plant_related_archives_view TO service_role;

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  anonymous_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform text,
  app_version text,
  user_agent text,
  referrer text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'analytics_events_event_name_check'
      AND conrelid = 'public.analytics_events'::regclass
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_event_name_check
      CHECK (
        event_name IN (
          'apk_download',
          'app_first_open',
          'app_open',
          'register',
          'cloud_space_opened',
          'local_project_created',
          'local_record_created',
          'local_data_bound_to_account',
          'local_data_synced_to_cloud'
        )
      );
  END IF;
END $$;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics events anonymous insert limited" ON public.analytics_events;
CREATE POLICY "analytics events anonymous insert limited"
ON public.analytics_events
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NULL
  AND event_name IN (
    'apk_download',
    'app_first_open',
    'app_open'
  )
);

DROP POLICY IF EXISTS "analytics events authenticated insert own" ON public.analytics_events;
CREATE POLICY "analytics events authenticated insert own"
ON public.analytics_events
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid())
  AND event_name IN (
    'apk_download',
    'app_first_open',
    'app_open',
    'register',
    'cloud_space_opened',
    'local_project_created',
    'local_record_created',
    'local_data_bound_to_account',
    'local_data_synced_to_cloud'
  )
);

DROP POLICY IF EXISTS "analytics events admin select" ON public.analytics_events;
CREATE POLICY "analytics events admin select"
ON public.analytics_events
FOR SELECT
TO authenticated
USING (public.is_app_admin(auth.uid()));

GRANT INSERT ON TABLE public.analytics_events TO anon;
GRANT INSERT, SELECT ON TABLE public.analytics_events TO authenticated;
GRANT ALL ON TABLE public.analytics_events TO service_role;

COMMENT ON TABLE public.analytics_events IS
  'Lightweight privacy-preserving analytics events. Metadata must not include record text, image content, precise address, email, phone, or other sensitive user content.';
