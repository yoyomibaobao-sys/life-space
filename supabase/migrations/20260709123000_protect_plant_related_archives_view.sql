-- Protect plant related archive auto-matching from weak or ambiguous aliases.
-- Strong alias relations can auto-link public archives to plant pages.
-- Weak relations remain available for future search/confirmation flows.

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
   AND COALESCE(psa.relation_type, 'exact') IN ('exact', 'common_name', 'old_scientific_name')
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
