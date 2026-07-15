-- B1 storage deletion infrastructure only.
-- This migration creates an empty service-role queue. It does not enqueue
-- business data, delete Storage objects, or release user capacity.

CREATE TABLE public.storage_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT storage_deletion_jobs_source_type_check
    CHECK (source_type IN ('record', 'archive', 'account', 'media')),
  CONSTRAINT storage_deletion_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'retry_wait', 'succeeded', 'failed')),
  CONSTRAINT storage_deletion_jobs_last_error_code_check
    CHECK (
      last_error_code IS NULL
      OR last_error_code ~ '^[a-z0-9_]{1,64}$'
    ),
  CONSTRAINT storage_deletion_jobs_source_key
    UNIQUE (source_type, source_id)
);

CREATE TABLE public.storage_deletion_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL
    REFERENCES public.storage_deletion_jobs(id) ON DELETE CASCADE,
  bucket_id text NOT NULL,
  object_path text NOT NULL,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'pending',
  result_code text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_by uuid,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  last_error_code text,
  processed_at timestamptz,
  capacity_released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_deletion_items_object_path_check
    CHECK (
      length(btrim(object_path)) > 0
      AND object_path = btrim(object_path)
      AND left(object_path, 1) <> '/'
    ),
  CONSTRAINT storage_deletion_items_size_bytes_check
    CHECK (size_bytes IS NULL OR size_bytes >= 0),
  CONSTRAINT storage_deletion_items_status_check
    CHECK (
      status IN (
        'pending',
        'processing',
        'retry_wait',
        'succeeded',
        'retained_shared',
        'failed'
      )
    ),
  CONSTRAINT storage_deletion_items_result_code_check
    CHECK (
      result_code IS NULL
      OR result_code IN ('deleted', 'not_found', 'retained_shared')
    ),
  CONSTRAINT storage_deletion_items_attempts_check
    CHECK (attempts >= 0),
  CONSTRAINT storage_deletion_items_last_error_code_check
    CHECK (
      last_error_code IS NULL
      OR last_error_code ~ '^[a-z0-9_]{1,64}$'
    ),
  CONSTRAINT storage_deletion_items_claim_state_check
    CHECK (
      (
        status = 'processing'
        AND claimed_by IS NOT NULL
        AND claimed_at IS NOT NULL
        AND lease_expires_at IS NOT NULL
      )
      OR (
        status <> 'processing'
        AND claimed_by IS NULL
        AND claimed_at IS NULL
        AND lease_expires_at IS NULL
      )
    ),
  CONSTRAINT storage_deletion_items_processed_state_check
    CHECK (
      (
        status IN ('succeeded', 'retained_shared', 'failed')
        AND processed_at IS NOT NULL
      )
      OR (
        status IN ('pending', 'processing', 'retry_wait')
        AND processed_at IS NULL
      )
    ),
  CONSTRAINT storage_deletion_items_result_state_check
    CHECK (
      (status = 'succeeded' AND result_code IN ('deleted', 'not_found'))
      OR (status = 'retained_shared' AND result_code = 'retained_shared')
      OR (status IN ('pending', 'processing', 'retry_wait', 'failed') AND result_code IS NULL)
    ),
  CONSTRAINT storage_deletion_items_job_object_key
    UNIQUE (job_id, bucket_id, object_path)
);

CREATE UNIQUE INDEX storage_deletion_items_active_path_key
  ON public.storage_deletion_items(bucket_id, object_path)
  WHERE status IN ('pending', 'processing', 'retry_wait');

CREATE INDEX storage_deletion_items_status_idx
  ON public.storage_deletion_items(status);

CREATE INDEX storage_deletion_items_next_attempt_at_idx
  ON public.storage_deletion_items(next_attempt_at);

CREATE INDEX storage_deletion_items_lease_expires_at_idx
  ON public.storage_deletion_items(lease_expires_at);

CREATE INDEX storage_deletion_items_job_id_idx
  ON public.storage_deletion_items(job_id);

CREATE TRIGGER storage_deletion_jobs_set_updated_at
BEFORE UPDATE ON public.storage_deletion_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER storage_deletion_items_set_updated_at
BEFORE UPDATE ON public.storage_deletion_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.storage_deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_deletion_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.storage_deletion_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.storage_deletion_items FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.storage_deletion_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.storage_deletion_items TO service_role;

COMMENT ON TABLE public.storage_deletion_jobs IS
  'Server-only deletion jobs. B1 creates infrastructure but does not enqueue real deletions.';

COMMENT ON TABLE public.storage_deletion_items IS
  'Server-only Storage object deletion queue with leases, retries, and shared-reference retention.';

CREATE OR REPLACE FUNCTION public.get_referenced_storage_paths(
  p_bucket_id text,
  p_object_paths text[]
)
RETURNS TABLE (object_path text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_bucket_id IS DISTINCT FROM 'media' THEN
    RAISE EXCEPTION 'unsupported storage bucket'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH input_paths AS (
    SELECT DISTINCT btrim(p.path) AS object_path
    FROM unnest(COALESCE(p_object_paths, ARRAY[]::text[])) AS p(path)
    WHERE NULLIF(btrim(p.path), '') IS NOT NULL
      AND left(btrim(p.path), 1) <> '/'
  ),
  referenced_paths AS (
    SELECT NULLIF(btrim(m.storage_path), '') AS object_path
    FROM public.media AS m
    UNION
    SELECT NULLIF(btrim(m.thumb_path), '')
    FROM public.media AS m
    UNION
    SELECT public.media_object_path_from_public_url(m.url)
    FROM public.media AS m
    UNION
    SELECT public.media_object_path_from_public_url(m.thumb_url)
    FROM public.media AS m
    UNION
    SELECT NULLIF(btrim(r.primary_image_path), '')
    FROM public.records AS r
    UNION
    SELECT NULLIF(btrim(r.primary_thumb_path), '')
    FROM public.records AS r
    UNION
    SELECT public.media_object_path_from_public_url(r.primary_image_url)
    FROM public.records AS r
    UNION
    SELECT NULLIF(btrim(a.cover_image_path), '')
    FROM public.archives AS a
    UNION
    SELECT NULLIF(btrim(a.cover_thumb_path), '')
    FROM public.archives AS a
    UNION
    SELECT public.media_object_path_from_public_url(a.cover_image_url)
    FROM public.archives AS a
    UNION
    SELECT NULLIF(btrim(mp.cover_image_path), '')
    FROM public.market_posts AS mp
    UNION
    SELECT NULLIF(btrim(mp.cover_thumb_path), '')
    FROM public.market_posts AS mp
    UNION
    SELECT public.media_object_path_from_public_url(mp.cover_image_url)
    FROM public.market_posts AS mp
    UNION
    SELECT public.media_object_path_from_public_url(mp.cover_thumb_url)
    FROM public.market_posts AS mp
    UNION
    SELECT NULLIF(btrim(mm.path), '')
    FROM public.market_media AS mm
    UNION
    SELECT NULLIF(btrim(mm.thumb_path), '')
    FROM public.market_media AS mm
    UNION
    SELECT public.media_object_path_from_public_url(mm.url)
    FROM public.market_media AS mm
    UNION
    SELECT public.media_object_path_from_public_url(mm.thumb_url)
    FROM public.market_media AS mm
  )
  SELECT i.object_path
  FROM input_paths AS i
  INNER JOIN referenced_paths AS r
    ON r.object_path = i.object_path
  WHERE r.object_path IS NOT NULL
  ORDER BY i.object_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_storage_deletion_job_status(
  p_job_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_last_error_code text;
BEGIN
  IF p_job_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    CASE
      WHEN count(*) FILTER (WHERE i.status = 'processing') > 0 THEN 'processing'
      WHEN count(*) FILTER (WHERE i.status = 'pending') > 0 THEN 'pending'
      WHEN count(*) FILTER (WHERE i.status = 'retry_wait') > 0 THEN 'retry_wait'
      WHEN count(*) FILTER (WHERE i.status = 'failed') > 0 THEN 'failed'
      WHEN count(*) > 0 THEN 'succeeded'
      ELSE NULL
    END,
    max(i.last_error_code) FILTER (WHERE i.last_error_code IS NOT NULL)
  INTO v_status, v_last_error_code
  FROM public.storage_deletion_items AS i
  WHERE i.job_id = p_job_id;

  IF v_status IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.storage_deletion_jobs AS j
  SET
    status = v_status,
    last_error_code = CASE
      WHEN v_status IN ('retry_wait', 'failed') THEN v_last_error_code
      ELSE NULL
    END,
    processed_at = CASE
      WHEN v_status IN ('succeeded', 'failed') THEN COALESCE(j.processed_at, now())
      ELSE NULL
    END
  WHERE j.id = p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_storage_deletion_items(
  p_worker_id uuid,
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  item_id uuid,
  job_id uuid,
  bucket_id text,
  object_path text,
  size_bytes bigint,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_lease_seconds integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 300), 30), 3600);
  v_now timestamptz := clock_timestamp();
  v_exhausted_job_ids uuid[];
  v_job_id uuid;
BEGIN
  IF p_worker_id IS NULL THEN
    RAISE EXCEPTION 'worker id is required'
      USING ERRCODE = '22023';
  END IF;

  WITH exhausted AS (
    UPDATE public.storage_deletion_items AS i
    SET
      status = 'failed',
      last_error_code = 'lease_expired',
      claimed_by = NULL,
      claimed_at = NULL,
      lease_expires_at = NULL,
      processed_at = v_now
    WHERE i.status = 'processing'
      AND i.lease_expires_at <= v_now
      AND i.attempts >= 10
    RETURNING i.job_id
  )
  SELECT array_agg(DISTINCT exhausted.job_id)
  INTO v_exhausted_job_ids
  FROM exhausted;

  IF v_exhausted_job_ids IS NOT NULL THEN
    FOREACH v_job_id IN ARRAY v_exhausted_job_ids LOOP
      PERFORM public.refresh_storage_deletion_job_status(v_job_id);
    END LOOP;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT i.id
    FROM public.storage_deletion_items AS i
    WHERE i.attempts < 10
      AND (
        (i.status = 'pending' AND i.next_attempt_at <= v_now)
        OR (i.status = 'retry_wait' AND i.next_attempt_at <= v_now)
        OR (i.status = 'processing' AND i.lease_expires_at <= v_now)
      )
    ORDER BY
      CASE
        WHEN i.status = 'processing' THEN i.lease_expires_at
        ELSE i.next_attempt_at
      END,
      i.created_at,
      i.id
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.storage_deletion_items AS i
    SET
      status = 'processing',
      attempts = i.attempts + 1,
      claimed_by = p_worker_id,
      claimed_at = v_now,
      lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
      last_error_code = NULL,
      processed_at = NULL
    FROM candidates AS c
    WHERE i.id = c.id
    RETURNING
      i.id AS item_id,
      i.job_id,
      i.bucket_id,
      i.object_path,
      i.size_bytes,
      i.attempts
  ),
  touched_jobs AS (
    UPDATE public.storage_deletion_jobs AS j
    SET
      status = 'processing',
      last_error_code = NULL,
      processed_at = NULL
    WHERE j.id IN (SELECT DISTINCT c.job_id FROM claimed AS c)
    RETURNING j.id
  )
  SELECT
    c.item_id,
    c.job_id,
    c.bucket_id,
    c.object_path,
    c.size_bytes,
    c.attempts
  FROM claimed AS c;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_storage_deletion_item(
  p_item_id uuid,
  p_worker_id uuid,
  p_result_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id uuid;
  v_status text;
  v_existing_result_code text;
  v_target_status text;
BEGIN
  IF p_item_id IS NULL OR p_worker_id IS NULL THEN
    RAISE EXCEPTION 'item id and worker id are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_result_code IS NULL
    OR p_result_code NOT IN ('deleted', 'not_found', 'retained_shared') THEN
    RAISE EXCEPTION 'invalid deletion result code'
      USING ERRCODE = '22023';
  END IF;

  SELECT i.job_id, i.status, i.result_code
  INTO v_job_id, v_status, v_existing_result_code
  FROM public.storage_deletion_items AS i
  WHERE i.id = p_item_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_status IN ('succeeded', 'retained_shared')
    AND v_existing_result_code = p_result_code THEN
    RETURN true;
  END IF;

  v_target_status := CASE
    WHEN p_result_code = 'retained_shared' THEN 'retained_shared'
    ELSE 'succeeded'
  END;

  UPDATE public.storage_deletion_items AS i
  SET
    status = v_target_status,
    result_code = p_result_code,
    claimed_by = NULL,
    claimed_at = NULL,
    lease_expires_at = NULL,
    last_error_code = NULL,
    processed_at = now()
  WHERE i.id = p_item_id
    AND i.status = 'processing'
    AND i.claimed_by = p_worker_id
  RETURNING i.job_id INTO v_job_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM public.refresh_storage_deletion_job_status(v_job_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_storage_deletion_item(
  p_item_id uuid,
  p_worker_id uuid,
  p_error_code text,
  p_retryable boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  IF p_item_id IS NULL OR p_worker_id IS NULL THEN
    RAISE EXCEPTION 'item id and worker id are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'invalid deletion error code'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.storage_deletion_items AS i
  SET
    status = CASE
      WHEN COALESCE(p_retryable, false) AND i.attempts < 10 THEN 'retry_wait'
      ELSE 'failed'
    END,
    result_code = NULL,
    next_attempt_at = CASE
      WHEN COALESCE(p_retryable, false) AND i.attempts < 10 THEN
        now() + make_interval(
          secs => LEAST(
            3600,
            (30 * power(2, GREATEST(i.attempts - 1, 0)))::integer
          )
        )
      ELSE i.next_attempt_at
    END,
    claimed_by = NULL,
    claimed_at = NULL,
    lease_expires_at = NULL,
    last_error_code = p_error_code,
    processed_at = CASE
      WHEN COALESCE(p_retryable, false) AND i.attempts < 10 THEN NULL
      ELSE now()
    END
  WHERE i.id = p_item_id
    AND i.status = 'processing'
    AND i.claimed_by = p_worker_id
  RETURNING i.job_id INTO v_job_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM public.refresh_storage_deletion_job_status(v_job_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_referenced_storage_paths(text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_referenced_storage_paths(text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_referenced_storage_paths(text, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_referenced_storage_paths(text, text[]) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_storage_deletion_job_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_storage_deletion_job_status(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_storage_deletion_job_status(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_storage_deletion_job_status(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.claim_storage_deletion_items(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_storage_deletion_items(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_storage_deletion_items(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_storage_deletion_items(uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.complete_storage_deletion_item(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_storage_deletion_item(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_storage_deletion_item(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_storage_deletion_item(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.fail_storage_deletion_item(uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_storage_deletion_item(uuid, uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fail_storage_deletion_item(uuid, uuid, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fail_storage_deletion_item(uuid, uuid, text, boolean) TO service_role;

COMMENT ON FUNCTION public.get_referenced_storage_paths(text, text[]) IS
  'Service-role batch check for currently referenced media object paths. Returns paths only, without owner or row metadata.';

COMMENT ON FUNCTION public.claim_storage_deletion_items(uuid, integer, integer) IS
  'Service-role queue claim using leases and FOR UPDATE SKIP LOCKED. B1 processes media only.';

COMMENT ON FUNCTION public.complete_storage_deletion_item(uuid, uuid, text) IS
  'Service-role idempotent completion for deleted, missing, or retained shared Storage objects. Does not release capacity.';

COMMENT ON FUNCTION public.fail_storage_deletion_item(uuid, uuid, text, boolean) IS
  'Service-role retry/failure transition with capped exponential backoff. Accepts only short sanitized error codes.';
