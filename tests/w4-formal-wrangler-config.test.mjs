import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { mergeFormalWranglerConfig } from "../scripts/prepare-w4-formal-wrangler.mjs";

const overlay = JSON.parse(fs.readFileSync(
  new URL("../wrangler.site-formal-candidate.jsonc", import.meta.url), "utf8"
));
const mediaConfig = JSON.parse(fs.readFileSync(
  new URL("../wrangler.media-formal-candidate.jsonc", import.meta.url), "utf8"
));

function baseConfig(overrides = {}) {
  return {
    name: "life-space-canary",
    main: "index.js",
    compatibility_date: "2026-09-01",
    assets: { directory: "../client", not_found_handling: "none", binding: "ASSETS" },
    r2_buckets: [{
      binding: "R2_MEDIA_CANARY",
      bucket_name: "life-space-media-canary",
    }],
    ratelimits: [],
    ...overrides,
  };
}

test("formal site overlay adds the private media service and enables the verified R2 gates", () => {
  const base = baseConfig();
  const merged = mergeFormalWranglerConfig(base, overlay);
  assert.equal(merged.name, "life-space-canary");
  assert.equal(merged.main, base.main);
  assert.equal(merged.compatibility_date, base.compatibility_date);
  assert.equal(merged.keep_vars, true);
  assert.deepEqual(merged.assets, base.assets);
  assert.deepEqual(merged.r2_buckets, base.r2_buckets);
  assert.deepEqual(merged.services, [{
    binding: "R2_BUSINESS_MEDIA_SERVICE",
    service: "life-space-business-media",
  }]);
  assert.deepEqual(merged.ratelimits, [{
    name: "R2_MEDIA_MIRROR_RATE_LIMITER",
    namespace_id: "2026111801",
    simple: { limit: 60, period: 60 },
  }]);
  assert.deepEqual(merged.vars, {
    R2_BUSINESS_MEDIA_MODE: "isolated",
    R2_MEDIA_READ_ENABLED: "true",
    R2_MEDIA_MIRROR_WRITE_ENABLED: "true",
  });
  assert.equal(base.services, undefined);
  assert.equal(base.vars, undefined);
});

test("formal site overlay is idempotent and preserves unrelated bindings and vars", () => {
  const base = baseConfig({
    services: [{ binding: "EXISTING_SERVICE", service: "existing-worker" }],
    vars: { EXISTING_FLAG: "keep" },
    ratelimits: [{
      name: "EXISTING_RATE_LIMITER",
      namespace_id: "2026111701",
      simple: { limit: 10, period: 10 },
    }],
  });
  const once = mergeFormalWranglerConfig(base, overlay);
  const twice = mergeFormalWranglerConfig(once, overlay);
  assert.deepEqual(twice, once);
  assert.equal(twice.services.length, 2);
  assert.equal(twice.vars.EXISTING_FLAG, "keep");
  assert.deepEqual(twice.ratelimits, [
    { name: "EXISTING_RATE_LIMITER", namespace_id: "2026111701", simple: { limit: 10, period: 10 } },
    { name: "R2_MEDIA_MIRROR_RATE_LIMITER", namespace_id: "2026111801", simple: { limit: 60, period: 60 } },
  ]);
});

test("formal site overlay refuses a reused rate-limit namespace", () => {
  assert.throws(() => mergeFormalWranglerConfig(baseConfig({
    ratelimits: [{
      name: "ANOTHER_RATE_LIMITER",
      namespace_id: "2026111801",
      simple: { limit: 10, period: 10 },
    }],
  }), overlay), /formal_rate_limit_namespace_id_already_bound/);
});

test("formal site overlay refuses a changed rate-limit contract", () => {
  const invalid = { ...overlay, ratelimits: [{
    name: "R2_MEDIA_MIRROR_RATE_LIMITER",
    namespace_id: "2026111801",
    simple: { limit: 60, period: 30 },
  }] };
  assert.throws(() => mergeFormalWranglerConfig(baseConfig(), invalid), /unexpected_formal_media_rate_limit_binding/);
});

test("formal site overlay refuses an unexpected Worker identity or canary bucket", () => {
  assert.throws(() => mergeFormalWranglerConfig(
    baseConfig({ name: "another-worker" }), overlay
  ), /unexpected_site_worker_name/);
  assert.throws(() => mergeFormalWranglerConfig(
    baseConfig({ r2_buckets: [] }), overlay
  ), /existing_canary_r2_binding_missing_or_changed/);
});

test("formal site overlay refuses a conflicting service target or disabled gate", () => {
  assert.throws(() => mergeFormalWranglerConfig(baseConfig({
    services: [{
      binding: "R2_BUSINESS_MEDIA_SERVICE",
      service: "wrong-worker",
    }],
  }), overlay), /conflicting_existing_media_service_binding/);
  assert.throws(() => mergeFormalWranglerConfig(baseConfig({
    vars: { R2_MEDIA_READ_ENABLED: "false" },
  }), overlay), /existing_media_gate_mismatch/);
});

test("media Worker candidate is private and preserves live production R2 gates", () => {
  assert.equal(mediaConfig.name, "life-space-business-media");
  assert.equal(mediaConfig.main, "./cloudflare/r2-media-worker-entry.mjs");
  assert.equal(mediaConfig.workers_dev, false);
  assert.equal(mediaConfig.preview_urls, false);
  assert.deepEqual(mediaConfig.r2_buckets, [{
    binding: "R2_BUSINESS_MEDIA",
    bucket_name: "life-space-business-media",
  }]);
  assert.deepEqual(mediaConfig.vars, {
    R2_BUSINESS_MEDIA_MODE: "isolated",
    R2_MEDIA_READ_ENABLED: "true",
    R2_MEDIA_MIRROR_WRITE_ENABLED: "true",
  });
});
