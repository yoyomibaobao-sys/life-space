-- Project-level public discovery feed. Every row represents one public archive
-- with at least one public record; private records never affect its content or stats.

CREATE INDEX IF NOT EXISTS records_public_archive_activity_idx
  ON public.records (
    archive_id,
    record_time DESC NULLS LAST,
    created_at DESC NULLS LAST,
    id DESC
  )
  WHERE visibility = 'public';

CREATE VIEW public.discovery_project_feed_view
WITH (security_invoker = true, security_barrier = true)
AS
WITH public_records AS (
  SELECT
    r.id,
    r.archive_id,
    r.note,
    r.record_time,
    r.created_at,
    r.primary_image_url,
    r.comment_count,
    r.status_tag
  FROM public.records r
  INNER JOIN public.archives a
    ON a.id = r.archive_id
  WHERE a.is_public = true
    AND r.visibility = 'public'
),
latest_public_records AS (
  SELECT DISTINCT ON (pr.archive_id)
    pr.id,
    pr.archive_id,
    pr.note,
    pr.record_time,
    pr.created_at,
    pr.primary_image_url
  FROM public_records pr
  ORDER BY
    pr.archive_id,
    pr.record_time DESC NULLS LAST,
    pr.created_at DESC NULLS LAST,
    pr.id DESC
),
public_record_stats AS (
  SELECT
    pr.archive_id,
    count(*)::bigint AS public_record_count,
    coalesce(sum(coalesce(pr.comment_count, 0)::bigint), 0)::bigint
      AS public_comment_count,
    coalesce(bool_or(pr.status_tag = 'help'), false) AS has_public_help
  FROM public_records pr
  GROUP BY pr.archive_id
)
SELECT
  a.id AS archive_id,
  a.user_id AS owner_user_id,
  a.title AS archive_title,
  a.category,
  a.system_name,
  a.archive_summary,
  a.created_at AS archive_created_at,
  a.ended_at AS archive_ended_at,
  lpr.id AS latest_public_record_id,
  lpr.note AS latest_public_record_note,
  lpr.record_time AS latest_public_record_time,
  lpr.created_at AS latest_public_record_created_at,
  lpr.primary_image_url AS latest_public_primary_image_url,
  a.species_name_snapshot,
  prs.public_record_count,
  prs.public_comment_count,
  prs.has_public_help,
  coalesce(lpr.record_time, lpr.created_at) AS public_activity_at,
  pp.username AS profile_display_name,
  pp.avatar_url AS profile_avatar_url,
  nullif(
    concat_ws(
      ' ',
      nullif(trim(pp.country_name), ''),
      nullif(trim(pp.region_name), ''),
      nullif(trim(pp.city_name), '')
    ),
    ''
  ) AS profile_region
FROM public_record_stats prs
INNER JOIN latest_public_records lpr
  ON lpr.archive_id = prs.archive_id
INNER JOIN public.archives a
  ON a.id = prs.archive_id
 AND a.is_public = true
LEFT JOIN public.public_profiles pp
  ON pp.id = a.user_id
ORDER BY
  public_activity_at DESC NULLS LAST,
  archive_id DESC;

COMMENT ON VIEW public.discovery_project_feed_view IS
  'One row per public archive with public-record-only latest content, media source, help state, and aggregate counts.';

REVOKE ALL PRIVILEGES ON TABLE public.discovery_project_feed_view FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.discovery_project_feed_view FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.discovery_project_feed_view FROM authenticated;

GRANT SELECT ON TABLE public.discovery_project_feed_view TO anon;
GRANT SELECT ON TABLE public.discovery_project_feed_view TO authenticated;
