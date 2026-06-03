-- P0 database security hardening for 有时·耕作 / LifeSpace for Cultivation.
--
-- This migration is a draft for review before running in Supabase.
-- It does not handle Storage bucket policies. The media and avatars buckets
-- must be audited separately in Supabase Dashboard before production rollout.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. profiles: stop exposing the full profiles table publicly.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_public_read" ON "public"."profiles";

DROP POLICY IF EXISTS "profiles_select_own" ON "public"."profiles";
CREATE POLICY "profiles_select_own"
ON "public"."profiles"
FOR SELECT
USING ("auth"."uid"() = "id");

-- Keep direct access to profiles private. Public author metadata should be read
-- from public_profiles instead of the full profiles table.
REVOKE ALL PRIVILEGES ON TABLE "public"."profiles" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."profiles" FROM "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."profiles" TO "authenticated";

CREATE OR REPLACE VIEW "public"."public_profiles"
WITH (security_barrier = true)
AS
SELECT
  "id",
  "username",
  "avatar_url",
  "level",
  "flower_count",
  "view_count",
  "country_code",
  "country_name",
  "region_name",
  "city_name",
  "created_at"
FROM "public"."profiles";

COMMENT ON VIEW "public"."public_profiles" IS
'公开作者资料视图。只暴露用户名、头像、公开统计和模糊地区；禁止包含 email、location、storage_used、storage_limit。';

REVOKE ALL PRIVILEGES ON TABLE "public"."public_profiles" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."public_profiles" FROM "authenticated";
GRANT SELECT ON TABLE "public"."public_profiles" TO "anon";
GRANT SELECT ON TABLE "public"."public_profiles" TO "authenticated";
GRANT SELECT ON TABLE "public"."public_profiles" TO "service_role";

-- ---------------------------------------------------------------------------
-- 2. timeline_view: remove external access to a private/unfiltered timeline.
-- ---------------------------------------------------------------------------

REVOKE ALL PRIVILEGES ON TABLE "public"."timeline_view" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."timeline_view" FROM "authenticated";

COMMENT ON VIEW "public"."timeline_view" IS
'内部遗留时间线视图：当前未按公开/私密过滤，不能对 anon/authenticated 开放。Discover 应使用 discovery_feed_view。';

-- discovery_feed_view already filters records.visibility = public and
-- archives.is_public = true. Keep it as the public Discover data source.
REVOKE ALL PRIVILEGES ON TABLE "public"."discovery_feed_view" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."discovery_feed_view" FROM "authenticated";
GRANT SELECT ON TABLE "public"."discovery_feed_view" TO "anon";
GRANT SELECT ON TABLE "public"."discovery_feed_view" TO "authenticated";

-- ---------------------------------------------------------------------------
-- 3. Dangerous RPC execution grants.
-- ---------------------------------------------------------------------------

-- create_notification is intended as an internal helper for triggers/server
-- workflows. Direct external calls could forge notifications.
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_notification"(
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  jsonb
) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_notification"(
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  jsonb
) FROM "authenticated";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."create_notification"(
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."create_notification"(
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  jsonb
) TO "service_role";

COMMENT ON FUNCTION "public"."create_notification"(
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  jsonb
) IS
'内部通知创建函数。不得直接暴露给 anon/authenticated；如未来需要外部调用，必须增加 auth.uid、资源归属和频率校验。';

-- Storage quota RPCs require a logged-in user. Keep authenticated access for
-- the current upload/delete flow, but remove anonymous execution.
REVOKE ALL PRIVILEGES ON FUNCTION "public"."release_storage_bytes"(bigint) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."release_storage_bytes"(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."release_storage_bytes"(bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."release_storage_bytes"(bigint) TO "service_role";

COMMENT ON FUNCTION "public"."release_storage_bytes"(bigint) IS
'删除媒体后释放用户容量。TODO：后续应绑定 media_id 或服务端确认的 Storage 删除事件，防止用户反复调用降低 storage_used。';

REVOKE ALL PRIVILEGES ON FUNCTION "public"."reserve_storage_bytes"(bigint) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."reserve_storage_bytes"(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."reserve_storage_bytes"(bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reserve_storage_bytes"(bigint) TO "service_role";

COMMENT ON FUNCTION "public"."reserve_storage_bytes"(bigint) IS
'上传媒体前预留用户容量。仅 authenticated/service_role 可调用；TODO：后续与 Storage 上传和 media 记录写入建立更强一致性。';

-- Membership RPC is only meaningful for the current logged-in user.
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_my_membership"() FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."get_my_membership"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_my_membership"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_my_membership"() TO "service_role";

-- Admin detection should not be anonymous. Keep authenticated for current admin
-- UI/RPC checks, but this should later be tightened to only check auth.uid().
REVOKE ALL PRIVILEGES ON FUNCTION "public"."is_app_admin"(uuid) FROM "anon";
REVOKE ALL PRIVILEGES ON FUNCTION "public"."is_app_admin"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_app_admin"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_app_admin"(uuid) TO "service_role";

COMMENT ON FUNCTION "public"."is_app_admin"(uuid) IS
'判断用户是否为有时·耕作后台管理员。TODO：后续建议收紧为只判断当前 auth.uid()，避免普通用户枚举任意 user_id 是否为管理员。';

-- Admin RPCs keep their internal is_app_admin(auth.uid()) checks, but should
-- not be callable by anon. Keep authenticated so the existing admin UI can call
-- them after the internal admin check passes.
DO $$
DECLARE
  target_function regprocedure;
BEGIN
  FOR target_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'admin\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM anon', target_function);
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC', target_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', target_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', target_function);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION "public"."increment_archive_view_count"(uuid) IS
'公开档案浏览量递增函数。当前仅更新 is_public=true 的 archive，可暂时保留 anon 调用；TODO：后续增加防刷、限流或服务端聚合。';

-- ---------------------------------------------------------------------------
-- 4. plant_species_pending: enable RLS and limit reads/writes.
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."plant_species_pending" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "public"."plant_species_pending" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."plant_species_pending" FROM "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."plant_species_pending" TO "authenticated";
GRANT ALL PRIVILEGES ON TABLE "public"."plant_species_pending" TO "service_role";

DROP POLICY IF EXISTS "plant_species_pending_select_own" ON "public"."plant_species_pending";
DROP POLICY IF EXISTS "plant_species_pending_insert_own" ON "public"."plant_species_pending";
DROP POLICY IF EXISTS "plant_species_pending_update_own_pending" ON "public"."plant_species_pending";
DROP POLICY IF EXISTS "plant_species_pending_admin_select_all" ON "public"."plant_species_pending";
DROP POLICY IF EXISTS "plant_species_pending_admin_update_all" ON "public"."plant_species_pending";
DROP POLICY IF EXISTS "plant_species_pending_admin_delete_all" ON "public"."plant_species_pending";

CREATE POLICY "plant_species_pending_select_own"
ON "public"."plant_species_pending"
FOR SELECT
TO "authenticated"
USING ("user_id" = "auth"."uid"());

CREATE POLICY "plant_species_pending_insert_own"
ON "public"."plant_species_pending"
FOR INSERT
TO "authenticated"
WITH CHECK (
  "user_id" = "auth"."uid"()
  AND "status" = 'pending'
);

CREATE POLICY "plant_species_pending_update_own_pending"
ON "public"."plant_species_pending"
FOR UPDATE
TO "authenticated"
USING (
  "user_id" = "auth"."uid"()
  AND "status" = 'pending'
)
WITH CHECK (
  "user_id" = "auth"."uid"()
  AND "status" = 'pending'
);

CREATE POLICY "plant_species_pending_admin_select_all"
ON "public"."plant_species_pending"
FOR SELECT
TO "authenticated"
USING ("public"."is_app_admin"("auth"."uid"()));

CREATE POLICY "plant_species_pending_admin_update_all"
ON "public"."plant_species_pending"
FOR UPDATE
TO "authenticated"
USING ("public"."is_app_admin"("auth"."uid"()))
WITH CHECK ("public"."is_app_admin"("auth"."uid"()));

CREATE POLICY "plant_species_pending_admin_delete_all"
ON "public"."plant_species_pending"
FOR DELETE
TO "authenticated"
USING ("public"."is_app_admin"("auth"."uid"()));

COMMENT ON TABLE "public"."plant_species_pending" IS
'用户提交的待审核作物名称。RLS：普通登录用户只能新增/读取/更新自己的 pending 提交，不能直接 approved；管理员可审核全部。TODO：是否允许匿名提交需产品确认，若允许应走受限 RPC。';

-- ---------------------------------------------------------------------------
-- 5. Narrow obvious over-broad grants without broad frontend breakage.
-- ---------------------------------------------------------------------------

-- Sensitive tables should not be exposed to anonymous users directly.
REVOKE ALL PRIVILEGES ON TABLE "public"."app_admins" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."membership_payments" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."notifications" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."user_memberships" FROM "anon";

-- TODO: Follow-up P1 migration should review all remaining GRANT ALL entries
-- for anon/authenticated and replace them with least-privilege grants.

-- Prevent future objects in public from being automatically exposed with ALL
-- privileges. Future migrations should grant privileges explicitly per object.
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
REVOKE ALL ON TABLES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
REVOKE ALL ON TABLES FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
REVOKE ALL ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
REVOKE ALL ON FUNCTIONS FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
REVOKE ALL ON SEQUENCES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
REVOKE ALL ON SEQUENCES FROM "authenticated";

-- ---------------------------------------------------------------------------
-- 6. Storage is intentionally out of scope for this migration.
-- ---------------------------------------------------------------------------
--
-- TODO: media bucket policy needs a separate Dashboard/schema audit.
-- TODO: avatars bucket policy needs a separate Dashboard/schema audit.
-- TODO: confirm whether private record images can be accessed by public URL.

COMMIT;
