import assert from "node:assert/strict";
import test from "node:test";
import {
  FORMAL_SITE_ORIGIN,
  FORMAL_SUPABASE_URL,
  QA_MEDIA_ORIGIN,
  QA_SUPABASE_URL,
  resolveAndroidR2MediaMirrorBuildConfig,
  resolveLifeSpaceBuildScope,
  resolveR2MediaMirrorBuildConfig,
  resolveVinextR2MediaMirrorBuildConfig,
} from "../scripts/r2-media-mirror-build-config.mjs";

test("formal website build accepts only the formal Supabase and site Worker pair", () => {
  assert.deepEqual(resolveVinextR2MediaMirrorBuildConfig({
    NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED: "true",
    NEXT_PUBLIC_R2_MEDIA_MIRROR_SCOPE: "production",
    NEXT_PUBLIC_SUPABASE_URL: FORMAL_SUPABASE_URL,
    NEXT_PUBLIC_R2_MEDIA_MIRROR_ORIGIN: FORMAL_SITE_ORIGIN,
    NEXT_PUBLIC_SITE_URL: FORMAL_SITE_ORIGIN,
  }), { enabled: true, validated: true, origin: FORMAL_SITE_ORIGIN, scope: "production" });
});

test("QA website build accepts only the isolated QA Supabase and media Worker pair", () => {
  assert.deepEqual(resolveVinextR2MediaMirrorBuildConfig({
    NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED: "true",
    NEXT_PUBLIC_R2_MEDIA_MIRROR_SCOPE: "qa",
    NEXT_PUBLIC_SUPABASE_URL: QA_SUPABASE_URL,
    NEXT_PUBLIC_R2_MEDIA_MIRROR_ORIGIN: QA_MEDIA_ORIGIN,
    NEXT_PUBLIC_SITE_URL: QA_MEDIA_ORIGIN,
  }), { enabled: true, validated: true, origin: QA_MEDIA_ORIGIN, scope: "qa" });
});

test("formal and QA endpoints cannot be mixed", () => {
  assert.throws(() => resolveR2MediaMirrorBuildConfig({
    enabled: true, scope: "production", supabaseUrl: QA_SUPABASE_URL,
    mirrorOrigin: FORMAL_SITE_ORIGIN, cloudOrigin: FORMAL_SITE_ORIGIN,
  }), /r2_media_mirror_target_mismatch:production/);
  assert.throws(() => resolveR2MediaMirrorBuildConfig({
    enabled: true, scope: "qa", supabaseUrl: FORMAL_SUPABASE_URL,
    mirrorOrigin: QA_MEDIA_ORIGIN, cloudOrigin: QA_MEDIA_ORIGIN,
  }), /r2_media_mirror_target_mismatch:qa/);
});

test("formal and QA builds require their matching cloud origin", () => {
  assert.throws(() => resolveR2MediaMirrorBuildConfig({
    enabled: true, scope: "production", supabaseUrl: FORMAL_SUPABASE_URL,
    mirrorOrigin: FORMAL_SITE_ORIGIN, cloudOrigin: "",
  }), /r2_media_mirror_cloud_origin_missing/);
  assert.throws(() => resolveR2MediaMirrorBuildConfig({
    enabled: true, scope: "production", supabaseUrl: FORMAL_SUPABASE_URL,
    mirrorOrigin: FORMAL_SITE_ORIGIN, cloudOrigin: QA_MEDIA_ORIGIN,
  }), /r2_media_mirror_cloud_origin_mismatch:production/);
  assert.throws(() => resolveR2MediaMirrorBuildConfig({
    enabled: true, scope: "qa", supabaseUrl: QA_SUPABASE_URL,
    mirrorOrigin: QA_MEDIA_ORIGIN, cloudOrigin: FORMAL_SITE_ORIGIN,
  }), /r2_media_mirror_cloud_origin_mismatch:qa/);
});

test("missing opt-in strips all mirror routing values", () => {
  assert.deepEqual(resolveVinextR2MediaMirrorBuildConfig({
    NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED: "false",
    NEXT_PUBLIC_R2_MEDIA_MIRROR_SCOPE: "qa",
    NEXT_PUBLIC_SUPABASE_URL: QA_SUPABASE_URL,
    NEXT_PUBLIC_R2_MEDIA_MIRROR_ORIGIN: QA_MEDIA_ORIGIN,
  }), { enabled: false, validated: false, origin: "", scope: "" });
});

test("production Android build requires the formal app origin and formal Supabase", () => {
  const env = {
    NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED: "true",
    NEXT_PUBLIC_R2_MEDIA_MIRROR_SCOPE: "production",
    NEXT_PUBLIC_SUPABASE_URL: FORMAL_SUPABASE_URL,
    NEXT_PUBLIC_R2_MEDIA_MIRROR_ORIGIN: FORMAL_SITE_ORIGIN,
  };
  assert.deepEqual(resolveAndroidR2MediaMirrorBuildConfig({
    env, qaBuild: false, supabaseUrl: FORMAL_SUPABASE_URL, cloudOrigin: FORMAL_SITE_ORIGIN,
  }), { enabled: true, validated: true, origin: FORMAL_SITE_ORIGIN, scope: "production" });
  assert.throws(() => resolveAndroidR2MediaMirrorBuildConfig({
    env, qaBuild: false, supabaseUrl: FORMAL_SUPABASE_URL, cloudOrigin: QA_MEDIA_ORIGIN,
  }), /r2_media_mirror_cloud_origin_mismatch:production/);
});

test("QA Android build ignores formal mirror variables and needs explicit QA opt-in", () => {
  const env = {
    NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED: "true",
    NEXT_PUBLIC_R2_MEDIA_MIRROR_SCOPE: "production",
    NEXT_PUBLIC_R2_MEDIA_MIRROR_ORIGIN: FORMAL_SITE_ORIGIN,
    ANDROID_QA_R2_MIRROR_ENABLED: "1",
  };
  assert.deepEqual(resolveAndroidR2MediaMirrorBuildConfig({
    env, qaBuild: true, supabaseUrl: QA_SUPABASE_URL, cloudOrigin: QA_MEDIA_ORIGIN,
  }), { enabled: true, validated: true, origin: QA_MEDIA_ORIGIN, scope: "qa" });
  assert.deepEqual(resolveAndroidR2MediaMirrorBuildConfig({
    env: { ...env, ANDROID_QA_R2_MIRROR_ENABLED: "0" },
    qaBuild: true, supabaseUrl: QA_SUPABASE_URL, cloudOrigin: QA_MEDIA_ORIGIN,
  }), { enabled: false, validated: false, origin: "", scope: "" });
  assert.throws(() => resolveAndroidR2MediaMirrorBuildConfig({
    env, qaBuild: true, supabaseUrl: FORMAL_SUPABASE_URL, cloudOrigin: FORMAL_SITE_ORIGIN,
  }), /r2_media_mirror_target_mismatch:qa/);
});

test("build scope follows the Supabase project so formal artifacts exclude QA hosts", () => {
  assert.equal(resolveLifeSpaceBuildScope({
    supabaseUrl: FORMAL_SUPABASE_URL, cloudOrigin: FORMAL_SITE_ORIGIN,
  }), "production");
  // A formal Supabase build remains production-scoped even if its site-origin
  // input is absent or wrong; the independent mirror gate rejects that mismatch.
  assert.equal(resolveLifeSpaceBuildScope({
    supabaseUrl: FORMAL_SUPABASE_URL, cloudOrigin: QA_MEDIA_ORIGIN,
  }), "production");
  assert.equal(resolveLifeSpaceBuildScope({
    supabaseUrl: QA_SUPABASE_URL, cloudOrigin: QA_MEDIA_ORIGIN,
  }), "qa");
  assert.equal(resolveLifeSpaceBuildScope({
    supabaseUrl: QA_SUPABASE_URL, cloudOrigin: FORMAL_SITE_ORIGIN,
  }), "qa");
  assert.equal(resolveLifeSpaceBuildScope({
    supabaseUrl: "https://example.supabase.co", cloudOrigin: FORMAL_SITE_ORIGIN,
  }), "dynamic");
  assert.equal(resolveLifeSpaceBuildScope({ supabaseUrl: "" }), "dynamic");
});

test("non-HTTPS origins and paths are rejected", () => {
  assert.throws(() => resolveR2MediaMirrorBuildConfig({
    enabled: true, scope: "production", supabaseUrl: FORMAL_SUPABASE_URL,
    mirrorOrigin: "http://life-space.uk", cloudOrigin: FORMAL_SITE_ORIGIN,
  }), /r2_media_mirror_origin_must_be_https_origin/);
  assert.throws(() => resolveR2MediaMirrorBuildConfig({
    enabled: true, scope: "production", supabaseUrl: FORMAL_SUPABASE_URL,
    mirrorOrigin: FORMAL_SITE_ORIGIN + "/api", cloudOrigin: FORMAL_SITE_ORIGIN,
  }), /r2_media_mirror_origin_must_be_https_origin/);
});
