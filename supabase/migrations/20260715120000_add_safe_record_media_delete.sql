-- B2 safe deletion requests for cloud records and record media.
-- Business rows and queue entries are changed in one database transaction.
-- Storage deletion remains the responsibility of the B1 server worker.

CREATE OR REPLACE FUNCTION public.collect_record_media_deletion_paths(
  p_record_id uuid,
  p_media_id uuid DEFAULT NULL
)
RETURNS TABLE (object_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH target_media AS (
    SELECT
      m.storage_path,
      m.thumb_path,
      m.url,
      m.thumb_url
    FROM public.media AS m
    WHERE m.record_id = p_record_id
      AND (p_media_id IS NULL OR m.id = p_media_id)
  ),
  candidate_paths AS (
    SELECT NULLIF(btrim(m.storage_path), '') AS object_path
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
    UNION ALL
    SELECT NULLIF(btrim(r.primary_image_path), '')
    FROM public.records AS r
    WHERE p_media_id IS NULL
      AND r.id = p_record_id
    UNION ALL
    SELECT NULLIF(btrim(r.primary_thumb_path), '')
    FROM public.records AS r
    WHERE p_media_id IS NULL
      AND r.id = p_record_id
    UNION ALL
    SELECT public.media_object_path_from_public_url(r.primary_image_url)
    FROM public.records AS r
    WHERE p_media_id IS NULL
      AND r.id = p_record_id
  )
  SELECT DISTINCT btrim(c.object_path) AS object_path
  FROM candidate_paths AS c
  WHERE NULLIF(btrim(c.object_path), '') IS NOT NULL
  ORDER BY object_path;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_media_deletion_items(
  p_job_id uuid,
  p_object_paths text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_path text;
  v_existing_item_id uuid;
  v_inserted_item_id uuid;
  v_inserted_count integer := 0;
BEGIN
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'deletion job id is required'
      USING ERRCODE = '22023';
  END IF;

  FOR v_path IN
    SELECT DISTINCT btrim(p.path)
    FROM unnest(COALESCE(p_object_paths, ARRAY[]::text[])) AS p(path)
    WHERE NULLIF(btrim(p.path), '') IS NOT NULL
    ORDER BY btrim(p.path)
  LOOP
    IF left(v_path, 1) = '/'
      OR v_path ~* '^https?://'
      OR v_path ~ '(^|/)\.\.?(?:/|$)'
      OR position(chr(92) IN v_path) > 0 THEN
      RAISE EXCEPTION 'unsafe media object path'
        USING ERRCODE = '22023';
    END IF;

    LOOP
      v_existing_item_id := NULL;

      SELECT i.id
      INTO v_existing_item_id
      FROM public.storage_deletion_items AS i
      WHERE i.job_id = p_job_id
        AND i.bucket_id = 'media'
        AND i.object_path = v_path
      LIMIT 1
      FOR UPDATE;

      IF v_existing_item_id IS NOT NULL THEN
        EXIT;
      END IF;

      SELECT i.id
      INTO v_existing_item_id
      FROM public.storage_deletion_items AS i
      WHERE i.bucket_id = 'media'
        AND i.object_path = v_path
        AND i.status IN ('pending', 'processing', 'retry_wait')
      LIMIT 1
      FOR UPDATE;

      IF v_existing_item_id IS NOT NULL THEN
        -- Keep the active item locked until this deletion transaction commits.
        -- The worker will then check references after the business row is gone.
        EXIT;
      END IF;

      v_inserted_item_id := NULL;

      INSERT INTO public.storage_deletion_items (
        job_id,
        bucket_id,
        object_path,
        size_bytes,
        status
      )
      VALUES (
        p_job_id,
        'media',
        v_path,
        NULL,
        'pending'
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_inserted_item_id;

      IF v_inserted_item_id IS NOT NULL THEN
        v_inserted_count := v_inserted_count + 1;
        EXIT;
      END IF;

      -- A concurrent transaction won the active-path constraint. Loop so its
      -- row is locked before this transaction removes the final reference.
    END LOOP;
  END LOOP;

  RETURN v_inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_delete_record(
  p_record_id uuid
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
  v_record public.records%ROWTYPE;
  v_media record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT j.id, j.owner_user_id, j.status
  INTO v_job_id, v_job_owner_user_id, v_job_status
  FROM public.storage_deletion_jobs AS j
  WHERE j.source_type = 'record'
    AND j.source_id = p_record_id;

  IF FOUND THEN
    IF v_job_owner_user_id IS DISTINCT FROM v_user_id THEN
      RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'not_found_or_forbidden'::text;
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

  SELECT r.*
  INTO v_record
  FROM public.records AS r
  WHERE r.id = p_record_id
  FOR UPDATE;

  IF NOT FOUND OR v_record.user_id IS DISTINCT FROM v_user_id THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'not_found_or_forbidden'::text;
    RETURN;
  END IF;

  v_owner_user_id := v_record.user_id;

  IF NULLIF(btrim(v_record.primary_image_path), '') IS NOT NULL
    AND (
      left(btrim(v_record.primary_image_path), 1) = '/'
      OR btrim(v_record.primary_image_path) ~* '^https?://'
    ) THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'unsafe_media_path'::text;
    RETURN;
  END IF;

  IF NULLIF(btrim(v_record.primary_thumb_path), '') IS NOT NULL
    AND (
      left(btrim(v_record.primary_thumb_path), 1) = '/'
      OR btrim(v_record.primary_thumb_path) ~* '^https?://'
    ) THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'unsafe_media_path'::text;
    RETURN;
  END IF;

  IF NULLIF(btrim(v_record.primary_image_url), '') IS NOT NULL
    AND NULLIF(btrim(v_record.primary_image_path), '') IS NULL
    AND public.media_object_path_from_public_url(v_record.primary_image_url) IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'unparseable_media_url'::text;
    RETURN;
  END IF;

  FOR v_media IN
    SELECT m.storage_path, m.thumb_path, m.url, m.thumb_url
    FROM public.media AS m
    WHERE m.record_id = p_record_id
    ORDER BY m.id
    FOR UPDATE
  LOOP
    IF NULLIF(btrim(v_media.storage_path), '') IS NOT NULL
      AND (
        left(btrim(v_media.storage_path), 1) = '/'
        OR btrim(v_media.storage_path) ~* '^https?://'
      ) THEN
      RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'unsafe_media_path'::text;
      RETURN;
    END IF;

    IF NULLIF(btrim(v_media.thumb_path), '') IS NOT NULL
      AND (
        left(btrim(v_media.thumb_path), 1) = '/'
        OR btrim(v_media.thumb_path) ~* '^https?://'
      ) THEN
      RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'unsafe_media_path'::text;
      RETURN;
    END IF;

    IF NULLIF(btrim(v_media.url), '') IS NOT NULL
      AND NULLIF(btrim(v_media.storage_path), '') IS NULL
      AND public.media_object_path_from_public_url(v_media.url) IS NULL THEN
      RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'unparseable_media_url'::text;
      RETURN;
    END IF;

    IF NULLIF(btrim(v_media.thumb_url), '') IS NOT NULL
      AND NULLIF(btrim(v_media.thumb_path), '') IS NULL
      AND public.media_object_path_from_public_url(v_media.thumb_url) IS NULL THEN
      RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'unparseable_media_url'::text;
      RETURN;
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(p.object_path ORDER BY p.object_path), ARRAY[]::text[])
  INTO v_paths
  FROM public.collect_record_media_deletion_paths(p_record_id, NULL) AS p;

  INSERT INTO public.storage_deletion_jobs (
    owner_user_id,
    source_type,
    source_id,
    status
  )
  VALUES (
    v_owner_user_id,
    'record',
    p_record_id,
    'pending'
  )
  ON CONFLICT (source_type, source_id) DO NOTHING
  RETURNING id, status INTO v_job_id, v_job_status;

  IF v_job_id IS NULL THEN
    SELECT j.id, j.owner_user_id, j.status
    INTO v_job_id, v_job_owner_user_id, v_job_status
    FROM public.storage_deletion_jobs AS j
    WHERE j.source_type = 'record'
      AND j.source_id = p_record_id;

    IF v_job_id IS NULL OR v_job_owner_user_id IS DISTINCT FROM v_user_id THEN
      RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'not_found_or_forbidden'::text;
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

  v_path_count := public.enqueue_media_deletion_items(v_job_id, v_paths);

  DELETE FROM public.records AS r
  WHERE r.id = p_record_id;

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

CREATE OR REPLACE FUNCTION public.request_delete_media(
  p_media_id uuid
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
  v_record_id uuid;
  v_job_id uuid;
  v_job_owner_user_id uuid;
  v_job_status text;
  v_path_count integer := 0;
  v_paths text[] := ARRAY[]::text[];
  v_media public.media%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT j.id, j.owner_user_id, j.status
  INTO v_job_id, v_job_owner_user_id, v_job_status
  FROM public.storage_deletion_jobs AS j
  WHERE j.source_type = 'media'
    AND j.source_id = p_media_id;

  IF FOUND THEN
    IF v_job_owner_user_id IS DISTINCT FROM v_user_id THEN
      RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'not_found_or_forbidden'::text;
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

  SELECT m.*
  INTO v_media
  FROM public.media AS m
  WHERE m.id = p_media_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'not_found_or_forbidden'::text;
    RETURN;
  END IF;

  v_record_id := v_media.record_id;

  SELECT r.user_id
  INTO v_owner_user_id
  FROM public.records AS r
  WHERE r.id = v_record_id
  FOR UPDATE;

  IF NOT FOUND OR v_owner_user_id IS DISTINCT FROM v_user_id THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'not_found_or_forbidden'::text;
    RETURN;
  END IF;

  IF NULLIF(btrim(v_media.storage_path), '') IS NOT NULL
    AND (
      left(btrim(v_media.storage_path), 1) = '/'
      OR btrim(v_media.storage_path) ~* '^https?://'
    ) THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'unsafe_media_path'::text;
    RETURN;
  END IF;

  IF NULLIF(btrim(v_media.thumb_path), '') IS NOT NULL
    AND (
      left(btrim(v_media.thumb_path), 1) = '/'
      OR btrim(v_media.thumb_path) ~* '^https?://'
    ) THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'unsafe_media_path'::text;
    RETURN;
  END IF;

  IF NULLIF(btrim(v_media.url), '') IS NOT NULL
    AND NULLIF(btrim(v_media.storage_path), '') IS NULL
    AND public.media_object_path_from_public_url(v_media.url) IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'unparseable_media_url'::text;
    RETURN;
  END IF;

  IF NULLIF(btrim(v_media.thumb_url), '') IS NOT NULL
    AND NULLIF(btrim(v_media.thumb_path), '') IS NULL
    AND public.media_object_path_from_public_url(v_media.thumb_url) IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'unparseable_media_url'::text;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(p.object_path ORDER BY p.object_path), ARRAY[]::text[])
  INTO v_paths
  FROM public.collect_record_media_deletion_paths(v_record_id, p_media_id) AS p;

  INSERT INTO public.storage_deletion_jobs (
    owner_user_id,
    source_type,
    source_id,
    status
  )
  VALUES (
    v_owner_user_id,
    'media',
    p_media_id,
    'pending'
  )
  ON CONFLICT (source_type, source_id) DO NOTHING
  RETURNING id, status INTO v_job_id, v_job_status;

  IF v_job_id IS NULL THEN
    SELECT j.id, j.owner_user_id, j.status
    INTO v_job_id, v_job_owner_user_id, v_job_status
    FROM public.storage_deletion_jobs AS j
    WHERE j.source_type = 'media'
      AND j.source_id = p_media_id;

    IF v_job_id IS NULL OR v_job_owner_user_id IS DISTINCT FROM v_user_id THEN
      RETURN QUERY SELECT false, NULL::uuid, false, 0, NULL::text, 'not_found_or_forbidden'::text;
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

  v_path_count := public.enqueue_media_deletion_items(v_job_id, v_paths);

  DELETE FROM public.media AS m
  WHERE m.id = p_media_id;

  WITH next_media AS (
    SELECT
      COALESCE(
        NULLIF(btrim(m.storage_path), ''),
        public.media_object_path_from_public_url(m.url)
      ) AS image_path,
      COALESCE(
        NULLIF(btrim(m.thumb_path), ''),
        public.media_object_path_from_public_url(m.thumb_url)
      ) AS thumb_path
    FROM public.media AS m
    WHERE m.record_id = v_record_id
    ORDER BY m.sort_order ASC NULLS LAST, m.created_at ASC NULLS LAST
    LIMIT 1
  )
  UPDATE public.records AS r
  SET
    primary_image_path = n.image_path,
    primary_thumb_path = n.thumb_path
  FROM (
    SELECT nm.image_path, nm.thumb_path
    FROM next_media AS nm
    UNION ALL
    SELECT NULL::text, NULL::text
    WHERE NOT EXISTS (SELECT 1 FROM next_media)
    LIMIT 1
  ) AS n
  WHERE r.id = v_record_id;

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

DROP POLICY IF EXISTS records_delete_own ON public.records;
DROP POLICY IF EXISTS media_delete_own ON public.media;

REVOKE DELETE ON TABLE public.records FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON TABLE public.media FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.collect_record_media_deletion_paths(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.collect_record_media_deletion_paths(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.collect_record_media_deletion_paths(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.collect_record_media_deletion_paths(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_media_deletion_items(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_media_deletion_items(uuid, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_media_deletion_items(uuid, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_media_deletion_items(uuid, text[]) TO service_role;

REVOKE ALL ON FUNCTION public.request_delete_record(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_delete_record(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_delete_record(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.request_delete_media(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_delete_media(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_delete_media(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.request_delete_record(uuid) IS
  'Owner-only idempotent record deletion request. Enqueues trusted media paths and deletes the record in one transaction.';

COMMENT ON FUNCTION public.request_delete_media(uuid) IS
  'Owner-only idempotent record-media deletion request. Enqueues trusted paths and deletes one media row in one transaction.';
