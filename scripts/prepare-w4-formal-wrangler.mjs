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
const REQUIRED_RATE_LIMITER = Object.freeze({
  name: "R2_MEDIA_MIRROR_RATE_LIMITER",
  namespace_id: "2026111801",
  simple: Object.freeze({ limit: 60, period: 60 }),
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
  if (!Array.isArray(overlay.ratelimits) || overlay.ratelimits.length !== 1) {
    throw new Error("formal_media_rate_limit_binding_required");
  }
  const rateLimiter = overlay.ratelimits[0];
  if (!isObject(rateLimiter) ||
      rateLimiter.name !== REQUIRED_RATE_LIMITER.name ||
      rateLimiter.namespace_id !== REQUIRED_RATE_LIMITER.namespace_id ||
      !isObject(rateLimiter.simple) ||
      rateLimiter.simple.limit !== REQUIRED_RATE_LIMITER.simple.limit ||
      rateLimiter.simple.period !== REQUIRED_RATE_LIMITER.simple.period ||
      Object.keys(rateLimiter).some((key) => !["name", "namespace_id", "simple"].includes(key)) ||
      Object.keys(rateLimiter.simple).some((key) => !["limit", "period"].includes(key))) {
    throw new Error("unexpected_formal_media_rate_limit_binding");
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

  if (base.ratelimits !== undefined && !Array.isArray(base.ratelimits)) {
    throw new Error("existing_rate_limit_bindings_invalid");
  }
  const ratelimits = (base.ratelimits || []).map((item) => ({
    ...item,
    ...(isObject(item?.simple) ? { simple: { ...item.simple } } : {}),
  }));
  const sameName = ratelimits.filter((item) => item?.name === REQUIRED_RATE_LIMITER.name);
  if (sameName.length > 1) throw new Error("duplicate_formal_rate_limit_binding_name");
  if (ratelimits.some((item) =>
    item?.namespace_id === REQUIRED_RATE_LIMITER.namespace_id &&
    item?.name !== REQUIRED_RATE_LIMITER.name
  )) {
    throw new Error("formal_rate_limit_namespace_id_already_bound");
  }
  if (sameName.length === 1) {
    const existing = sameName[0];
    if (existing.namespace_id !== REQUIRED_RATE_LIMITER.namespace_id ||
        !isObject(existing.simple) ||
        existing.simple.limit !== REQUIRED_RATE_LIMITER.simple.limit ||
        existing.simple.period !== REQUIRED_RATE_LIMITER.simple.period) {
      throw new Error("conflicting_existing_formal_rate_limit_binding");
    }
  } else {
    ratelimits.push({
      ...REQUIRED_RATE_LIMITER,
      simple: { ...REQUIRED_RATE_LIMITER.simple },
    });
  }

  // Preserve existing dashboard vars that are not represented in this build overlay.
  // Wrangler otherwise deletes them before applying the configured vars.
  return { ...base, keep_vars: true, services, vars, ratelimits };
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
  const prepared = mergeFormalWranglerConfig(base, overlay);
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
    rate_limit_binding: REQUIRED_RATE_LIMITER,
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
