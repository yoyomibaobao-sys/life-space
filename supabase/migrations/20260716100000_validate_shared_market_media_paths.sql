-- Allow source record media to be shared by stable Storage path while
-- preserving the original ownership and source-record validation.

CREATE OR REPLACE FUNCTION public.validate_market_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_post record;
  v_media record;
  v_record record;
  v_source_path text;
  v_source_thumb_path text;
  v_requested_path text;
  v_requested_thumb_path text;
BEGIN
  SELECT
    mp.id,
    mp.user_id,
    mp.source_record_id
  INTO v_post
  FROM public.market_posts AS mp
  WHERE mp.id = new.market_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'market_post_not_found';
  END IF;

  IF new.user_id IS NULL OR new.user_id <> v_post.user_id THEN
    RAISE EXCEPTION 'market_media_user_mismatch';
  END IF;

  IF auth.uid() IS NOT NULL AND new.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'market_media_auth_user_mismatch';
  END IF;

  IF new.source_media_id IS NOT NULL THEN
    SELECT
      m.id,
      m.user_id,
      m.record_id,
      m.url,
      m.storage_path,
      m.thumb_url,
      m.thumb_path
    INTO v_media
    FROM public.media AS m
    WHERE m.id = new.source_media_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'source_media_not_found';
    END IF;

    IF v_media.user_id <> new.user_id THEN
      RAISE EXCEPTION 'source_media_owner_mismatch';
    END IF;

    IF new.source_record_id IS NULL THEN
      new.source_record_id := v_media.record_id;
    END IF;

    IF new.source_record_id <> v_media.record_id THEN
      RAISE EXCEPTION 'source_media_record_mismatch';
    END IF;

    IF v_post.source_record_id IS NOT NULL
       AND new.source_record_id <> v_post.source_record_id THEN
      RAISE EXCEPTION 'market_media_source_record_mismatch';
    END IF;

    v_source_path := COALESCE(
      NULLIF(btrim(v_media.storage_path), ''),
      public.media_object_path_from_public_url(v_media.url)
    );
    v_requested_path := COALESCE(
      NULLIF(btrim(new.path), ''),
      public.media_object_path_from_public_url(new.url)
    );

    IF v_source_path IS NULL OR v_requested_path IS DISTINCT FROM v_source_path THEN
      RAISE EXCEPTION 'source_media_path_mismatch';
    END IF;

    v_source_thumb_path := COALESCE(
      NULLIF(btrim(v_media.thumb_path), ''),
      public.media_object_path_from_public_url(v_media.thumb_url)
    );
    v_requested_thumb_path := COALESCE(
      NULLIF(btrim(new.thumb_path), ''),
      public.media_object_path_from_public_url(new.thumb_url)
    );

    IF v_requested_thumb_path IS NOT NULL
       AND v_requested_thumb_path IS DISTINCT FROM v_source_thumb_path THEN
      RAISE EXCEPTION 'source_media_thumb_path_mismatch';
    END IF;
  END IF;

  IF new.source_record_id IS NOT NULL AND new.source_media_id IS NULL THEN
    SELECT
      r.id,
      r.user_id
    INTO v_record
    FROM public.records AS r
    WHERE r.id = new.source_record_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'source_record_not_found';
    END IF;

    IF v_record.user_id <> new.user_id THEN
      RAISE EXCEPTION 'source_record_owner_mismatch';
    END IF;
  END IF;

  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.validate_market_media() IS
'Validates market media ownership and source linkage. Source media may use the same stable Storage paths only when they match the trusted media row.';
