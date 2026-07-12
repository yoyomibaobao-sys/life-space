CREATE OR REPLACE FUNCTION public.get_followed_public_project_feed(
  p_owner_user_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_help_only boolean DEFAULT false,
  p_cursor_public_activity_at timestamptz DEFAULT NULL,
  p_cursor_archive_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  archive_id uuid,
  owner_user_id uuid,
  archive_title text,
  category text,
  system_name text,
  archive_summary text,
  archive_created_at timestamptz,
  archive_ended_at timestamptz,
  latest_public_record_id uuid,
  latest_public_record_note text,
  latest_public_record_time timestamptz,
  latest_public_record_created_at timestamptz,
  latest_public_primary_image_url text,
  species_name_snapshot text,
  public_record_count bigint,
  public_comment_count bigint,
  has_public_help boolean,
  public_activity_at timestamptz,
  profile_display_name text,
  profile_avatar_url text,
  profile_region text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF (p_cursor_public_activity_at IS NULL) <> (p_cursor_archive_id IS NULL) THEN
    RAISE EXCEPTION 'cursor fields must be provided together'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.archive_id,
    v.owner_user_id,
    v.archive_title,
    v.category,
    v.system_name,
    v.archive_summary,
    v.archive_created_at,
    v.archive_ended_at,
    v.latest_public_record_id,
    v.latest_public_record_note,
    v.latest_public_record_time,
    v.latest_public_record_created_at,
    v.latest_public_primary_image_url,
    v.species_name_snapshot,
    v.public_record_count,
    v.public_comment_count,
    v.has_public_help,
    v.public_activity_at,
    v.profile_display_name,
    v.profile_avatar_url,
    v.profile_region
  FROM public.follows AS f
  INNER JOIN public.discovery_project_feed_view AS v
    ON v.owner_user_id = f.following_id
  WHERE f.follower_id = auth.uid()
    AND (p_owner_user_id IS NULL OR v.owner_user_id = p_owner_user_id)
    AND (p_category IS NULL OR v.category = p_category)
    AND (NOT COALESCE(p_help_only, false) OR v.has_public_help = true)
    AND (
      p_cursor_public_activity_at IS NULL
      OR v.public_activity_at < p_cursor_public_activity_at
      OR (
        v.public_activity_at = p_cursor_public_activity_at
        AND v.archive_id < p_cursor_archive_id
      )
    )
  ORDER BY
    v.public_activity_at DESC,
    v.archive_id DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_followed_public_project_feed(
  uuid,
  text,
  boolean,
  timestamptz,
  uuid,
  integer
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_followed_public_project_feed(
  uuid,
  text,
  boolean,
  timestamptz,
  uuid,
  integer
) FROM anon;

GRANT EXECUTE ON FUNCTION public.get_followed_public_project_feed(
  uuid,
  text,
  boolean,
  timestamptz,
  uuid,
  integer
) TO authenticated;

COMMENT ON FUNCTION public.get_followed_public_project_feed(
  uuid,
  text,
  boolean,
  timestamptz,
  uuid,
  integer
) IS 'Returns a keyset-paginated public project feed limited to users followed by the authenticated caller.';
