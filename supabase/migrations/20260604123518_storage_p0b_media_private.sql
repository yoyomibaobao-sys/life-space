-- Storage P0b draft: make the media bucket private and replace public read.
--
-- IMPORTANT:
-- - Draft only. Do not run until historical URL/path coverage is reviewed.
-- - This migration does not touch the avatars bucket.
-- - This migration keeps P0a media insert/update/delete owner-path policies.
-- - Old url/thumb_url columns remain in application data as compatibility
--   fallback, but private Storage access must be authorized by object path.
-- - Historical URL checks showed old public media URLs are parseable, while
--   archives/records/market path columns may still be empty. This migration
--   backfills parseable media public URLs into path columns before making the
--   bucket private.

-- ---------------------------------------------------------------------------
-- 1. Helpers: parse public media URLs and authorize public media reads.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."media_object_path_from_public_url"(
  "p_url" text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT CASE
    WHEN "p_url" LIKE '%/storage/v1/object/public/media/%'
      THEN NULLIF(
        split_part(
          split_part("p_url", '/storage/v1/object/public/media/', 2),
          '?',
          1
        ),
        ''
      )
    ELSE NULL
  END;
$$;

-- These helper functions intentionally return only a boolean for one object
-- path. They do not list object names, URLs, file names, user ids, or private
-- record data. SECURITY DEFINER avoids failures where storage.objects policies
-- cannot evaluate public access because the referenced application tables have
-- their own RLS.
--
-- TODO before execution:
-- - Confirm the migration owner has the expected permission to create
--   SECURITY DEFINER functions in public.
-- - Confirm the application tables are not using FORCE ROW LEVEL SECURITY in a
--   way that would block the definer from reading public access metadata.
CREATE OR REPLACE FUNCTION "public"."can_read_public_record_media_object"(
  "p_object_name" text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM "public"."media" AS "m"
      JOIN "public"."records" AS "r"
        ON "r"."id" = "m"."record_id"
      JOIN "public"."archives" AS "a"
        ON "a"."id" = "r"."archive_id"
      WHERE
        (
          COALESCE(
            NULLIF(to_jsonb("m")->>'storage_path', ''),
            "public"."media_object_path_from_public_url"(to_jsonb("m")->>'url')
          ) = "p_object_name"
          OR COALESCE(
            NULLIF(to_jsonb("m")->>'thumb_path', ''),
            "public"."media_object_path_from_public_url"(to_jsonb("m")->>'thumb_url')
          ) = "p_object_name"
        )
        AND "r"."visibility" = 'public'
        AND "a"."is_public" IS TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM "public"."records" AS "r"
      JOIN "public"."archives" AS "a"
        ON "a"."id" = "r"."archive_id"
      WHERE
        (
          COALESCE(
            NULLIF(to_jsonb("r")->>'primary_image_path', ''),
            "public"."media_object_path_from_public_url"(to_jsonb("r")->>'primary_image_url')
          ) = "p_object_name"
          OR NULLIF(to_jsonb("r")->>'primary_thumb_path', '') = "p_object_name"
        )
        AND "r"."visibility" = 'public'
        AND "a"."is_public" IS TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM "public"."archives" AS "a"
      WHERE
        (
          COALESCE(
            NULLIF(to_jsonb("a")->>'cover_image_path', ''),
            "public"."media_object_path_from_public_url"(to_jsonb("a")->>'cover_image_url')
          ) = "p_object_name"
          OR NULLIF(to_jsonb("a")->>'cover_thumb_path', '') = "p_object_name"
        )
        AND "a"."is_public" IS TRUE
    );
$$;

CREATE OR REPLACE FUNCTION "public"."can_read_public_market_media_object"(
  "p_object_name" text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM "public"."market_posts" AS "mp"
      WHERE
        "mp"."status" = 'active'
        AND (
          COALESCE(
            NULLIF(to_jsonb("mp")->>'cover_image_path', ''),
            "public"."media_object_path_from_public_url"(to_jsonb("mp")->>'cover_image_url')
          ) = "p_object_name"
          OR COALESCE(
            NULLIF(to_jsonb("mp")->>'cover_thumb_path', ''),
            "public"."media_object_path_from_public_url"(to_jsonb("mp")->>'cover_thumb_url')
          ) = "p_object_name"
        )
    )
    OR EXISTS (
      SELECT 1
      FROM "public"."market_media" AS "mm"
      JOIN "public"."market_posts" AS "mp"
        ON "mp"."id" = "mm"."market_post_id"
      WHERE
        "mp"."status" = 'active'
        AND (
          COALESCE(
            NULLIF(to_jsonb("mm")->>'path', ''),
            "public"."media_object_path_from_public_url"(to_jsonb("mm")->>'url')
          ) = "p_object_name"
          OR COALESCE(
            NULLIF(to_jsonb("mm")->>'thumb_path', ''),
            "public"."media_object_path_from_public_url"(to_jsonb("mm")->>'thumb_url')
          ) = "p_object_name"
        )
    );
$$;

REVOKE ALL ON FUNCTION "public"."media_object_path_from_public_url"(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_read_public_record_media_object"(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_read_public_market_media_object"(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."can_read_public_record_media_object"(text) TO "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."can_read_public_market_media_object"(text) TO "anon", "authenticated";

COMMENT ON FUNCTION "public"."media_object_path_from_public_url"(text) IS
'P0b Storage helper: parses a Supabase public media URL into an object path for migration/backfill use. It is not granted to anon or authenticated.';

COMMENT ON FUNCTION "public"."can_read_public_record_media_object"(text) IS
'P0b Storage helper: returns whether one media object path belongs to a public record in a public archive. Uses path fields first, with URL parsing fallback. Does not expose paths or row data.';

COMMENT ON FUNCTION "public"."can_read_public_market_media_object"(text) IS
'P0b Storage helper: returns whether one media object path belongs to an active public market post cover image or market_media row. Uses path fields first, with URL parsing fallback. Does not expose paths or row data.';

-- ---------------------------------------------------------------------------
-- 2. Ensure path columns exist before historical URL backfill.
-- ---------------------------------------------------------------------------

-- Production checks showed some path fields may not exist yet. Add only the
-- path columns needed for media private compatibility; keep old URL fallback
-- columns intact.
ALTER TABLE "public"."archives"
  ADD COLUMN IF NOT EXISTS "cover_image_path" text,
  ADD COLUMN IF NOT EXISTS "cover_thumb_path" text;

ALTER TABLE "public"."records"
  ADD COLUMN IF NOT EXISTS "primary_image_path" text,
  ADD COLUMN IF NOT EXISTS "primary_thumb_path" text;

ALTER TABLE "public"."market_posts"
  ADD COLUMN IF NOT EXISTS "cover_image_path" text,
  ADD COLUMN IF NOT EXISTS "cover_thumb_path" text;

ALTER TABLE "public"."market_media"
  ADD COLUMN IF NOT EXISTS "path" text,
  ADD COLUMN IF NOT EXISTS "thumb_path" text;

-- ---------------------------------------------------------------------------
-- 3. Backfill parseable historical public media URLs into path fields.
-- ---------------------------------------------------------------------------

-- The following block updates only countable, parseable Supabase public media
-- URLs. It does not read storage.objects and does not output URLs, file names,
-- user ids, or object paths.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'archives'
      AND column_name = 'cover_image_path'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'archives'
      AND column_name = 'cover_image_url'
  ) THEN
    EXECUTE $sql$
      UPDATE "public"."archives"
      SET "cover_image_path" = "public"."media_object_path_from_public_url"("cover_image_url")
      WHERE NULLIF("cover_image_path", '') IS NULL
        AND "public"."media_object_path_from_public_url"("cover_image_url") IS NOT NULL
    $sql$;
  ELSE
    RAISE NOTICE 'TODO: archives.cover_image_path or archives.cover_image_url missing; skipped cover image path backfill.';
  END IF;

  -- The confirmed production schema has no archive thumb URL source column.
  -- cover_thumb_path is added above for future writes, but no historical thumb
  -- URL backfill is attempted here.

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'records'
      AND column_name = 'primary_image_path'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'records'
      AND column_name = 'primary_image_url'
  ) THEN
    EXECUTE $sql$
      UPDATE "public"."records"
      SET "primary_image_path" = "public"."media_object_path_from_public_url"("primary_image_url")
      WHERE NULLIF("primary_image_path", '') IS NULL
        AND "public"."media_object_path_from_public_url"("primary_image_url") IS NOT NULL
    $sql$;
  ELSE
    RAISE NOTICE 'TODO: records.primary_image_path or records.primary_image_url missing; skipped primary image path backfill.';
  END IF;

  -- The confirmed production schema has no record thumb URL source column.
  -- primary_thumb_path is added above for future writes, but no historical thumb
  -- URL backfill is attempted here.

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'market_posts'
      AND column_name = 'cover_image_path'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'market_posts'
      AND column_name = 'cover_image_url'
  ) THEN
    EXECUTE $sql$
      UPDATE "public"."market_posts"
      SET "cover_image_path" = "public"."media_object_path_from_public_url"("cover_image_url")
      WHERE NULLIF("cover_image_path", '') IS NULL
        AND "public"."media_object_path_from_public_url"("cover_image_url") IS NOT NULL
    $sql$;
  ELSE
    RAISE NOTICE 'TODO: market_posts.cover_image_path or market_posts.cover_image_url missing; skipped cover image path backfill.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'market_posts'
      AND column_name = 'cover_thumb_path'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'market_posts'
      AND column_name = 'cover_thumb_url'
  ) THEN
    EXECUTE $sql$
      UPDATE "public"."market_posts"
      SET "cover_thumb_path" = "public"."media_object_path_from_public_url"("cover_thumb_url")
      WHERE NULLIF("cover_thumb_path", '') IS NULL
        AND "public"."media_object_path_from_public_url"("cover_thumb_url") IS NOT NULL
    $sql$;
  ELSE
    RAISE NOTICE 'TODO: market_posts.cover_thumb_path or market_posts.cover_thumb_url missing; skipped cover thumb path backfill.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'market_media'
      AND column_name = 'path'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'market_media'
      AND column_name = 'url'
  ) THEN
    EXECUTE $sql$
      UPDATE "public"."market_media"
      SET "path" = "public"."media_object_path_from_public_url"("url")
      WHERE NULLIF("path", '') IS NULL
        AND "public"."media_object_path_from_public_url"("url") IS NOT NULL
    $sql$;
  ELSE
    RAISE NOTICE 'TODO: market_media.path or market_media.url missing; skipped media path backfill.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'market_media'
      AND column_name = 'thumb_path'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'market_media'
      AND column_name = 'thumb_url'
  ) THEN
    EXECUTE $sql$
      UPDATE "public"."market_media"
      SET "thumb_path" = "public"."media_object_path_from_public_url"("thumb_url")
      WHERE NULLIF("thumb_path", '') IS NULL
        AND "public"."media_object_path_from_public_url"("thumb_url") IS NOT NULL
    $sql$;
  ELSE
    RAISE NOTICE 'TODO: market_media.thumb_path or market_media.thumb_url missing; skipped media thumb path backfill.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Replace P0a's unconditional public media SELECT.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "media_public_select" ON "storage"."objects";
DROP POLICY IF EXISTS "media_owner_select" ON "storage"."objects";
DROP POLICY IF EXISTS "media_public_record_select" ON "storage"."objects";
DROP POLICY IF EXISTS "media_public_market_select" ON "storage"."objects";

-- Authenticated users may read media objects under their own user-id path.
CREATE POLICY "media_owner_select"
ON "storage"."objects"
FOR SELECT
TO "authenticated"
USING (
  "bucket_id" = 'media'
  AND "auth"."role"() = 'authenticated'
  AND ("storage"."foldername"("name"))[1] = ("auth"."uid"())::text
);

-- Public record media may be read only when it is linked through media rows,
-- record primary image fields, or archive cover fields that belong to public
-- content. The helper uses path fields first and falls back to parsing old
-- public URL fields for historical rows.
CREATE POLICY "media_public_record_select"
ON "storage"."objects"
FOR SELECT
TO "anon", "authenticated"
USING (
  "bucket_id" = 'media'
  AND "public"."can_read_public_record_media_object"("storage"."objects"."name")
);

-- Public active market post media may be read from market_posts cover fields
-- and market_media rows. The helper uses path fields first and falls back to
-- parsing old public URL fields for historical rows.
--
-- TODO before execution:
-- - Confirm market_posts has columns: id, status, cover_image_path,
--   cover_thumb_path, cover_image_url, cover_thumb_url.
-- - Confirm status = 'active' is the only public-readable market status.
-- - Production field check confirmed market_media.market_post_id points to
--   market_posts.id.
CREATE POLICY "media_public_market_select"
ON "storage"."objects"
FOR SELECT
TO "anon", "authenticated"
USING (
  "bucket_id" = 'media'
  AND "public"."can_read_public_market_media_object"("storage"."objects"."name")
);

COMMENT ON POLICY "media_owner_select" ON "storage"."objects" IS
'P0b: authenticated users can read media objects only under media/{auth.uid()}/ paths.';

COMMENT ON POLICY "media_public_record_select" ON "storage"."objects" IS
'P0b: public record media can be read when linked media rows belong to public records in public archives. Uses path fields first, with URL parsing fallback for historical rows.';

COMMENT ON POLICY "media_public_market_select" ON "storage"."objects" IS
'P0b: public active market post media can be read through market_posts cover fields or market_media.market_post_id. Uses path fields first, with URL parsing fallback for historical rows.';

-- ---------------------------------------------------------------------------
-- 5. Finally make media private while preserving image limits.
-- ---------------------------------------------------------------------------

UPDATE "storage"."buckets"
SET
  "public" = false,
  "file_size_limit" = 20971520,
  "allowed_mime_types" = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]::text[]
WHERE "id" = 'media';

-- P0a write policies intentionally remain in place:
-- - media_insert_own_path
-- - media_update_own_path
-- - media_delete_own_path
