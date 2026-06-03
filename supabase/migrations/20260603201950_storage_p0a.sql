-- Storage P0a security hardening.
--
-- Goal:
-- 1. Remove the dangerous public upload policy on storage.objects.
-- 2. Keep existing public URL display working for now.
-- 3. Restrict media/avatar writes to authenticated users under their own
--    user-id path prefix.
--
-- This migration intentionally does not make the media bucket private.
-- TODO(P0b): Move private record media to a private-bucket/signed-URL flow.

-- ---------------------------------------------------------------------------
-- 1. Remove anonymous/public arbitrary uploads.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "public upload" ON "storage"."objects";

ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Bucket configuration.
-- ---------------------------------------------------------------------------

-- Avatars remain public because author avatar display uses getPublicUrl.
UPDATE "storage"."buckets"
SET
  "public" = true,
  "file_size_limit" = 10485760,
  "allowed_mime_types" = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]::text[]
WHERE "id" = 'avatars';

-- Media remains public in P0a to avoid breaking existing getPublicUrl usage.
-- TODO(P0b): Set media.public = false after front-end signed URL support exists.
UPDATE "storage"."buckets"
SET
  "public" = true,
  "file_size_limit" = 20971520,
  "allowed_mime_types" = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]::text[]
WHERE "id" = 'media';

-- ---------------------------------------------------------------------------
-- 3. Avatars policies.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "avatars_public_select" ON "storage"."objects";
DROP POLICY IF EXISTS "avatars_insert_own_path" ON "storage"."objects";
DROP POLICY IF EXISTS "avatars_update_own_path" ON "storage"."objects";
DROP POLICY IF EXISTS "avatars_delete_own_path" ON "storage"."objects";

CREATE POLICY "avatars_public_select"
ON "storage"."objects"
FOR SELECT
TO "anon", "authenticated"
USING ("bucket_id" = 'avatars');

CREATE POLICY "avatars_insert_own_path"
ON "storage"."objects"
FOR INSERT
TO "authenticated"
WITH CHECK (
  "bucket_id" = 'avatars'
  AND "auth"."role"() = 'authenticated'
  AND ("storage"."foldername"("name"))[1] = ("auth"."uid"())::text
);

CREATE POLICY "avatars_update_own_path"
ON "storage"."objects"
FOR UPDATE
TO "authenticated"
USING (
  "bucket_id" = 'avatars'
  AND "auth"."role"() = 'authenticated'
  AND ("storage"."foldername"("name"))[1] = ("auth"."uid"())::text
)
WITH CHECK (
  "bucket_id" = 'avatars'
  AND "auth"."role"() = 'authenticated'
  AND ("storage"."foldername"("name"))[1] = ("auth"."uid"())::text
);

CREATE POLICY "avatars_delete_own_path"
ON "storage"."objects"
FOR DELETE
TO "authenticated"
USING (
  "bucket_id" = 'avatars'
  AND "auth"."role"() = 'authenticated'
  AND ("storage"."foldername"("name"))[1] = ("auth"."uid"())::text
);

-- ---------------------------------------------------------------------------
-- 4. Media policies.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "media_public_select" ON "storage"."objects";
DROP POLICY IF EXISTS "media_insert_own_path" ON "storage"."objects";
DROP POLICY IF EXISTS "media_update_own_path" ON "storage"."objects";
DROP POLICY IF EXISTS "media_delete_own_path" ON "storage"."objects";

-- Public read is kept temporarily so existing getPublicUrl image rendering keeps
-- working. Private record images may still be accessible by URL until P0b.
CREATE POLICY "media_public_select"
ON "storage"."objects"
FOR SELECT
TO "anon", "authenticated"
USING ("bucket_id" = 'media');

CREATE POLICY "media_insert_own_path"
ON "storage"."objects"
FOR INSERT
TO "authenticated"
WITH CHECK (
  "bucket_id" = 'media'
  AND "auth"."role"() = 'authenticated'
  AND ("storage"."foldername"("name"))[1] = ("auth"."uid"())::text
);

CREATE POLICY "media_update_own_path"
ON "storage"."objects"
FOR UPDATE
TO "authenticated"
USING (
  "bucket_id" = 'media'
  AND "auth"."role"() = 'authenticated'
  AND ("storage"."foldername"("name"))[1] = ("auth"."uid"())::text
)
WITH CHECK (
  "bucket_id" = 'media'
  AND "auth"."role"() = 'authenticated'
  AND ("storage"."foldername"("name"))[1] = ("auth"."uid"())::text
);

CREATE POLICY "media_delete_own_path"
ON "storage"."objects"
FOR DELETE
TO "authenticated"
USING (
  "bucket_id" = 'media'
  AND "auth"."role"() = 'authenticated'
  AND ("storage"."foldername"("name"))[1] = ("auth"."uid"())::text
);

COMMENT ON POLICY "avatars_public_select" ON "storage"."objects" IS
'Public avatar read policy. Writes must be authenticated and scoped to avatars/{auth.uid()}/ paths.';

COMMENT ON POLICY "media_public_select" ON "storage"."objects" IS
'Temporary P0a public media read policy. The media bucket remains public; private record images may still be reachable by URL. TODO(P0b): migrate to a private bucket plus signed URLs.';
