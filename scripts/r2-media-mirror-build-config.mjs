export const FORMAL_SUPABASE_URL = "https://eidltoikfpnrzxruvawf.supabase.co";
export const FORMAL_SITE_ORIGIN = "https://life-space.uk";
export const QA_SUPABASE_URL = "https://mablwxlipcgbmbnfdbkc.supabase.co";
export const QA_MEDIA_ORIGIN = "https://lifespace-site-media-qa-20261028.lifespace-assets-isolated-lab.workers.dev";

const TARGETS = Object.freeze({
  production: Object.freeze({
    scope: "production",
    supabaseUrl: FORMAL_SUPABASE_URL,
    origin: FORMAL_SITE_ORIGIN,
  }),
  qa: Object.freeze({
    scope: "qa",
    supabaseUrl: QA_SUPABASE_URL,
    origin: QA_MEDIA_ORIGIN,
  }),
});

function httpsOrigin(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("r2_media_mirror_" + label + "_missing");
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("r2_media_mirror_" + label + "_invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("r2_media_mirror_" + label + "_must_be_https_origin");
  }
  return url.origin;
}
// The Supabase project identifies which app environment is being built.
// The mirror gate independently requires the exact matching HTTPS site origin;
// a missing or mismatched origin can never enable mirroring.
export function resolveLifeSpaceBuildScope({ supabaseUrl = "" } = {}) {
  let actualSupabase = "";
  try { actualSupabase = httpsOrigin(supabaseUrl, "build_scope_supabase_url"); }
  catch { return "dynamic"; }
  if (actualSupabase === FORMAL_SUPABASE_URL) return "production";
  if (actualSupabase === QA_SUPABASE_URL) return "qa";
  return "dynamic";
}


export function resolveR2MediaMirrorBuildConfig({
  enabled = false,
  scope = "",
  supabaseUrl = "",
  mirrorOrigin = "",
  cloudOrigin = "",
} = {}) {
  if (!enabled) return { enabled: false, validated: false, origin: "", scope: "" };

  const target = TARGETS[scope];
  if (!target) throw new Error("r2_media_mirror_scope_invalid");

  const actualSupabase = httpsOrigin(supabaseUrl, "supabase_url");
  const actualOrigin = httpsOrigin(mirrorOrigin, "origin");
  if (actualSupabase !== target.supabaseUrl || actualOrigin !== target.origin) {
    throw new Error("r2_media_mirror_target_mismatch:" + scope);
  }
  const actualCloudOrigin = httpsOrigin(cloudOrigin, "cloud_origin");
  if (actualCloudOrigin !== target.origin) {
    throw new Error("r2_media_mirror_cloud_origin_mismatch:" + scope);
  }
  return { enabled: true, validated: true, origin: target.origin, scope: target.scope };
}

export function resolveVinextR2MediaMirrorBuildConfig(env = process.env) {
  return resolveR2MediaMirrorBuildConfig({
    enabled: env.NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED === "true",
    scope: env.NEXT_PUBLIC_R2_MEDIA_MIRROR_SCOPE || "",
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL || "",
    mirrorOrigin: env.NEXT_PUBLIC_R2_MEDIA_MIRROR_ORIGIN || "",
    cloudOrigin: env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN || "",
  });
}

export function resolveAndroidR2MediaMirrorBuildConfig({
  env = process.env,
  qaBuild = false,
  supabaseUrl = "",
  cloudOrigin = "",
} = {}) {
  if (qaBuild) {
    return resolveR2MediaMirrorBuildConfig({
      enabled: env.ANDROID_QA_R2_MIRROR_ENABLED === "1",
      scope: "qa",
      supabaseUrl,
      mirrorOrigin: QA_MEDIA_ORIGIN,
      cloudOrigin,
    });
  }
  return resolveVinextR2MediaMirrorBuildConfig({
    ...env,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SITE_URL: cloudOrigin,
  });
}
