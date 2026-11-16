import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_WORKER = "life-space-canary";
const MEDIA_WORKER = "life-space-business-media";
const REQUIRED_SITE_BUCKET = {
  binding: "R2_MEDIA_CANARY",
  bucket_name: "life-space-media-canary",
};
const REQUIRED_FLAGS = Object.freeze({
  R2_BUSINESS_MEDIA_MODE: "isolated",
  R2_MEDIA_READ_ENABLED: "false",
  R2_MEDIA_MIRROR_WRITE_ENABLED: "false",
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function mergeFormalWranglerConfig(base, overlay) {
  if (!isObject(base) || !isObject(overlay)) {
    throw new Error("invalid_wrangler_config");
  }
  if (base.name !== SITE_WORKER || overlay.name !== SITE_WORKER) {
    throw new Error("unexpected_site_worker_name");
  }
  if (!Array.isArray(base.r2_buckets) || !base.r2_buckets.some(
    (item) => item?.binding === REQUIRED_SITE_BUCKET.binding &&
      item?.bucket_name === REQUIRED_SITE_BUCKET.bucket_name
  )) {
    throw new Error("existing_canary_r2_binding_missing_or_changed");
  }
  if (!Array.isArray(overlay.services) || overlay.services.length !== 1) {
    throw new Error("formal_media_service_binding_required");
  }
  const service = overlay.services[0];
  if (!isObject(service) ||
      service.binding !== "R2_BUSINESS_MEDIA_SERVICE" ||
      service.service !== MEDIA_WORKER ||
      Object.keys(service).some((key) => !["binding", "service"].includes(key))) {
    throw new Error("unexpected_formal_media_service_binding");
  }
  if (!isObject(overlay.vars) ||
      Object.keys(overlay.vars).length !== Object.keys(REQUIRED_FLAGS).length) {
    throw new Error("unexpected_formal_media_gate_variables");
  }
  for (const [key, expected] of Object.entries(REQUIRED_FLAGS)) {
    if (overlay.vars[key] !== expected) {
      throw new Error("formal_media_gate_must_start_closed:" + key);
    }
  }
  if ("r2_buckets" in overlay || "routes" in overlay || "workers_dev" in overlay ||
      "preview_urls" in overlay) {
    throw new Error("site_overlay_must_not_change_routes_or_bucket_bindings");
  }

  const services = Array.isArray(base.services)
    ? base.services.map((item) => ({ ...item }))
    : [];
  const existingService = services.find((item) =>
    item?.binding === service.binding
  );
  if (existingService && existingService.service !== service.service) {
    throw new Error("conflicting_existing_media_service_binding");
  }
  if (!existingService) services.push({ ...service });

  const vars = { ...(isObject(base.vars) ? base.vars : {}) };
  for (const [key, expected] of Object.entries(REQUIRED_FLAGS)) {
    if (vars[key] !== undefined && vars[key] !== expected) {
      throw new Error("existing_media_gate_not_closed:" + key);
    }
    vars[key] = expected;
  }

  return { ...base, services, vars };
}

export function addFormalPublicRuntimeVars(config, runtimeEnv = process.env) {
  if (!isObject(config) || !isObject(config.vars)) {
    throw new Error("formal_public_runtime_config_invalid");
  }
  const urlText = runtimeEnv?.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = runtimeEnv?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (typeof urlText !== "string" || typeof publicKey !== "string") {
    throw new Error("formal_public_runtime_env_missing");
  }
  let url;
  try { url = new URL(urlText.trim()); } catch {
    throw new Error("formal_public_supabase_url_invalid");
  }
  if (url.href !== "https://eidltoikfpnrzxruvawf.supabase.co/" ||
      !/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publicKey.trim())) {
    throw new Error("formal_public_supabase_identity_mismatch");
  }
  const vars = { ...config.vars };
  if ((vars.NEXT_PUBLIC_SUPABASE_URL && vars.NEXT_PUBLIC_SUPABASE_URL !== url.origin) ||
      (vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== publicKey.trim())) {
    throw new Error("conflicting_formal_public_supabase_vars");
  }
  vars.NEXT_PUBLIC_SUPABASE_URL = url.origin;
  vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publicKey.trim();
  return { ...config, vars };
}

function prepareFormalWranglerConfig() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const basePath = path.join(root, "dist", "server", "wrangler.json");
  const overlayPath = path.join(root, "wrangler.site-formal-candidate.jsonc");
  if (!fs.existsSync(basePath)) {
    throw new Error("vinext_build_config_missing:dist/server/wrangler.json");
  }
  if (!fs.existsSync(overlayPath)) {
    throw new Error("formal_site_overlay_missing:wrangler.site-formal-candidate.jsonc");
  }

  const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
  const overlay = JSON.parse(fs.readFileSync(overlayPath, "utf8"));
  const prepared = addFormalPublicRuntimeVars(mergeFormalWranglerConfig(base, overlay));
  const bytes = Buffer.from(JSON.stringify(prepared, null, 2) + "\n", "utf8");
  fs.writeFileSync(basePath, bytes);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

  console.log(JSON.stringify({
    status: "formal_candidate_config_prepared",
    config: "dist/server/wrangler.json",
    worker: prepared.name,
    service_binding: {
      binding: "R2_BUSINESS_MEDIA_SERVICE",
      service: MEDIA_WORKER,
    },
    preserved_site_bucket: REQUIRED_SITE_BUCKET,
    gates: REQUIRED_FLAGS,
    sha256,
    deployment_performed: false,
  }, null, 2));
}

if (process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareFormalWranglerConfig();
}
