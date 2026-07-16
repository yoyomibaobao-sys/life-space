-- B3 safe deletion request for one cloud archive.
-- Business rows and queue entries change in one database transaction.
-- Storage cleanup remains the responsibility of the existing server worker.

CREATE OR REPLACE FUNCTION public.collect_archive_media_deletion_paths(
  p_archive_id uuid
)
RETURNS TABLE (object_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH target_records AS (
    SELECT
      r.id,
      r.primary_image_path,
      r.primary_thumb_path,
      r.primary_image_url
    FROM public.records AS r
    WHERE r.archive_id = p_archive_id
  ),
  target_media AS (
    SELECT
      m.storage_path,
      m.thumb_path,
      m.url,
      m.thumb_url
    FROM public.media AS m
    INNER JOIN target_records AS r
      ON r.id = m.record_id
  ),
  candidate_paths AS (
    SELECT NULLIF(btrim(a.cover_image_path), '') AS object_path
    FROM public.archives AS a
    WHERE a.id = p_archive_id
    UNION ALL
    SELECT NULLIF(btrim(a.cover_thumb_path), '')
    FROM public.archives AS a
    WHERE a.id = p_archive_id
    UNION ALL
    SELECT public.media_object_path_from_public_url(a.cover_image_url)
    FROM public.archives AS a
    WHERE a.id = p_archive_id
    UNION ALL
    SELECT NULLIF(btrim(r.primary_image_path), '')
    FROM target_records AS r
    UNION ALL
    SELECT NULLIF(btrim(r.primary_thumb_path), '')
    FROM target_records AS r
    UNION ALL
    SELECT public.media_object_path_from_public_url(r.primary_image_url)
    FROM target_records AS r
    UNION ALL
    SELECT NULLIF(btrim(m.storage_path), '')
    FROM target_media AS m
    UNION ALL
    SELECT NULLIF(btrim(m.thumb_path), '')
    FROM target_media AS m
    UNION ALL
    SELECT public.media_object_path_from_public_url(m.url)
    FROM target_media AS m
    UNION ALL
    SELECT public.media_object_path_from_public_url(m.thumb_url)
    FROM target_media AS m
  )
  SELECT DISTINCT btrim(c.object_path) AS object_path
  FROM candidate_paths AS c
  WHERE NULLIF(btrim(c.object_path), '') IS NOT NULL
  ORDER BY object_path;
$$;

CREATE OR REPLACE FUNCTION public.request_delete_archive(
  p_archive_id uuid
)
RETURNS TABLE (
  ok boolean,
  job_id uuid,
  already_requested boolean,
  queued_item_count integer,
  job_status text,
  error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_user_id uuid;
  v_job_id uuid;
  v_job_owner_user_id uuid;
  v_job_status text;
  v_path_count integer := 0;
  v_paths text[] := ARRAY[]::text[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT j.id, j.owner_user_id, j.status
  INTO v_job_id, v_job_owner_user_id, v_job_status
  FROM public.storage_deletion_jobs AS j
  WHERE j.source_type = 'archive'
    AND j.source_id = p_archive_id;

  IF FOUND THEN
    IF v_job_owner_user_id IS DISTINCT FROM v_user_id THEN
      RETURN QUERY
      SELECT false, NULL::uuid, false, 0, NULL::text, 'not_found_or_forbidden'::text;
      RETURN;
    END IF;

    SELECT count(*)::integer
    INTO v_path_count
    FROM public.storage_deletion_items AS i
    WHERE i.job_id = v_job_id;

    RETURN QUERY
    SELECT true, v_job_id, true, v_path_count, v_job_status, NULL::text;
    RETURN;
  END IF;

  SELECT a.user_id
  INTO v_owner_user_id
  FROM public.archives AS a
  WHERE a.id = p_archive_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- A concurrent request may have deleted the archive after the first job check.
    SELECT j.id, j.owner_user_id, j.status
    INTO v_job_id, v_job_owner_user_id, v_job_status
    FROM public.storage_deletion_jobs AS j
    WHERE j.source_type = 'archive'
      AND j.source_id = p_archive_id;

    IF FOUND AND v_job_owner_user_id IS NOT DISTINCT FROM v_user_id THEN
      SELECT count(*)::integer
      INTO v_path_count
      FROM public.storage_deletion_items AS i
      WHERE i.job_id = v_job_id;

      RETURN QUERY
      SELECT true, v_job_id, true, v_path_count, v_job_status, NULL::text;
      RETURN;
    END IF;

    RETURN QUERY
    SELECT false, NULL::uuid, false, 0, NULL::text, 'not_found_or_forbidden'::text;
    RETURN;
  END IF;

  IF v_owner_user_id IS DISTINCT FROM v_user_id THEN
    RETURN QUERY
    SELECT false, NULL::uuid, false, 0, NULL::text, 'not_found_or_forbidden'::text;
    RETURN;
  END IF;

  -- Lock child rows so their media references cannot change during collection.
  PERFORM r.id
  FROM public.records AS r
  WHERE r.archive_id = p_archive_id
  ORDER BY r.id
  FOR UPDATE;

  PERFORM m.id
  FROM public.media AS m
  INNER JOIN public.records AS r
    ON r.id = m.record_id
  WHERE r.archive_id = p_archive_id
  ORDER BY m.id
  FOR UPDATE OF m;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT a.cover_image_path AS object_path
      FROM public.archives AS a
      WHERE a.id = p_archive_id
      UNION ALL
      SELECT a.cover_thumb_path
      FROM public.archives AS a
      WHERE a.id = p_archive_id
      UNION ALL
      SELECT r.primary_image_path
      FROM public.records AS r
      WHERE r.archive_id = p_archive_id
      UNION ALL
      SELECT r.primary_thumb_path
      FROM public.records AS r
      WHERE r.archive_id = p_archive_id
      UNION ALL
      SELECT m.storage_path
      FROM public.media AS m
      INNER JOIN public.records AS r
        ON r.id = m.record_id
      WHERE r.archive_id = p_archive_id
      UNION ALL
      SELECT m.thumb_path
      FROM public.media AS m
      INNER JOIN public.records AS r
        ON r.id = m.record_id
      WHERE r.archive_id = p_archive_id
    ) AS p
    WHERE NULLIF(btrim(p.object_path), '') IS NOT NULL
      AND (
        left(btrim(p.object_path), 1) = '/'
        OR btrim(p.object_path) ~* '^https?://'
        OR btrim(p.object_path) ~ '(^|/)\.\.?(?:/|$)'
        OR position(chr(92) IN btrim(p.object_path)) > 0
      )
  ) THEN
    RETURN QUERY
    SELECT false, NULL::uuid, false, 0, NULL::text, 'unsafe_media_path'::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.archives AS a
    WHERE a.id = p_archive_id
      AND NULLIF(btrim(a.cover_image_url), '') IS NOT NULL
      AND NULLIF(btrim(a.cover_image_path), '') IS NULL
      AND public.media_object_path_from_public_url(a.cover_image_url) IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.records AS r
    WHERE r.archive_id = p_archive_id
      AND NULLIF(btrim(r.primary_image_url), '') IS NOT NULL
      AND NULLIF(btrim(r.primary_image_path), '') IS NULL
      AND public.media_object_path_from_public_url(r.primary_image_url) IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.media AS m
    INNER JOIN public.records AS r
      ON r.id = m.record_id
    WHERE r.archive_id = p_archive_id
      AND (
        (
          NULLIF(btrim(m.url), '') IS NOT NULL
          AND NULLIF(btrim(m.storage_path), '') IS NULL
          AND public.media_object_path_from_public_url(m.url) IS NULL
        )
        OR (
          NULLIF(btrim(m.thumb_url), '') IS NOT NULL
          AND NULLIF(btrim(m.thumb_path), '') IS NULL
          AND public.media_object_path_from_public_url(m.thumb_url) IS NULL
        )
      )
  ) THEN
    RETURN QUERY
    SELECT false, NULL::uuid, false, 0, NULL::text, 'unparseable_media_url'::text;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(p.object_path ORDER BY p.object_path), ARRAY[]::text[])
  INTO v_paths
  FROM public.collect_archive_media_deletion_paths(p_archive_id) AS p;

  INSERT INTO public.storage_deletion_jobs (
    owner_user_id,
    source_type,
    source_id,
    status
  )
  VALUES (
    v_owner_user_id,
    'archive',
    p_archive_id,
    'pending'
  )
  ON CONFLICT (source_type, source_id) DO NOTHING
  RETURNING id, status INTO v_job_id, v_job_status;

  IF v_job_id IS NULL THEN
    SELECT j.id, j.owner_user_id, j.status
    INTO v_job_id, v_job_owner_user_id, v_job_status
    FROM public.storage_deletion_jobs AS j
    WHERE j.source_type = 'archive'
      AND j.source_id = p_archive_id;

    IF v_job_id IS NULL OR v_job_owner_user_id IS DISTINCT FROM v_user_id THEN
      RETURN QUERY
      SELECT false, NULL::uuid, false, 0, NULL::text, 'not_found_or_forbidden'::text;
      RETURN;
    END IF;

    SELECT count(*)::integer
    INTO v_path_count
    FROM public.storage_deletion_items AS i
    WHERE i.job_id = v_job_id;

    RETURN QUERY
    SELECT true, v_job_id, true, v_path_count, v_job_status, NULL::text;
    RETURN;
  END IF;

  -- Keep matching active items locked until the archive references are gone.
  -- Those paths remain owned by their existing deletion task.
  PERFORM i.id
  FROM public.storage_deletion_items AS i
  WHERE i.bucket_id = 'media'
    AND i.object_path = ANY(v_paths)
    AND i.status IN ('pending', 'processing', 'retry_wait')
  ORDER BY i.id
  FOR UPDATE;

  INSERT INTO public.storage_deletion_items (
    job_id,
    bucket_id,
    object_path,
    size_bytes,
    status
  )
  SELECT
    v_job_id,
    'media',
    p.object_path,
    NULL,
    'pending'
  FROM (
    SELECT DISTINCT btrim(candidate.path) AS object_path
    FROM unnest(v_paths) AS candidate(path)
    WHERE NULLIF(btrim(candidate.path), '') IS NOT NULL
  ) AS p
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.storage_deletion_items AS i
    WHERE i.bucket_id = 'media'
      AND i.object_path = p.object_path
      AND i.status IN ('pending', 'processing', 'retry_wait')
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_path_count = ROW_COUNT;

  DELETE FROM public.archives AS a
  WHERE a.id = p_archive_id
    AND a.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'archive deletion lost ownership lock'
      USING ERRCODE = '40001';
  END IF;

  IF v_path_count = 0 THEN
    UPDATE public.storage_deletion_jobs AS j
    SET
      status = 'succeeded',
      last_error_code = NULL,
      processed_at = now()
    WHERE j.id = v_job_id;
    v_job_status := 'succeeded';
  ELSE
    v_job_status := 'pending';
  END IF;

  RETURN QUERY
  SELECT true, v_job_id, false, v_path_count, v_job_status, NULL::text;
END;
$$;

DROP POLICY IF EXISTS archives_delete_own ON public.archives;
REVOKE DELETE ON TABLE public.archives FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.collect_archive_media_deletion_paths(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.collect_archive_media_deletion_paths(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.collect_archive_media_deletion_paths(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.collect_archive_media_deletion_paths(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.request_delete_archive(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_delete_archive(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_delete_archive(uuid) TO authenticated;

COMMENT ON FUNCTION public.collect_archive_media_deletion_paths(uuid) IS
  'Returns distinct trusted media object paths referenced by one archive and its records.';

COMMENT ON FUNCTION public.request_delete_archive(uuid) IS
  'Owner-only idempotent archive deletion request. Enqueues trusted media paths and deletes the archive in one transaction.';
