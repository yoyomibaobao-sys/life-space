import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("Cloudflare remains an isolated canary without a production route", () => {
  const config = read("wrangler.jsonc");

  assert.match(config, /"name": "life-space-canary"/);
  assert.match(config, /"main": "\.\/cloudflare\/worker-entry\.mjs"/);
  assert.match(config, /"binding": "R2_MEDIA_CANARY"/);
  assert.match(config, /"bucket_name": "life-space-media-canary"/);
  assert.doesNotMatch(config, /"routes?"\s*:/);
});

test("R2 canary requires a Worker secret and removes its probe object", () => {
  const worker = read("cloudflare/worker-entry.mjs");
  const canary = read("cloudflare/r2-canary.mjs");

  assert.match(worker, /handleR2CanaryRequest/);
  assert.match(canary, /request\.method !== "POST"/);
  assert.match(canary, /env\.R2_CANARY_SECRET/);
  assert.match(canary, /R2_MEDIA_CANARY\.put/);
  assert.match(canary, /R2_MEDIA_CANARY\.get/);
  assert.match(canary, /R2_MEDIA_CANARY\.delete/);
  assert.match(canary, /R2_MEDIA_CANARY\.head/);
  assert.doesNotMatch(canary, /R2_CANARY_SECRET\s*=\s*["'][^"']+["']/);
});

test("R2 canary enforces method and token before completing a round trip", async () => {
  const { handleR2CanaryRequest } = await import("../cloudflare/r2-canary.mjs");
  const objects = new Map();
  const r2 = {
    async put(key, value) {
      objects.set(key, value);
    },
    async get(key) {
      if (!objects.has(key)) return null;
      return { text: async () => objects.get(key) };
    },
    async delete(key) {
      objects.delete(key);
    },
    async head(key) {
      return objects.has(key) ? {} : null;
    },
  };
  const env = {
    R2_MEDIA_CANARY: r2,
    R2_CANARY_SECRET: "test-only-secret",
  };

  const getResponse = await handleR2CanaryRequest(
    new Request("https://canary.invalid/__canary/r2"),
    env
  );
  assert.equal(getResponse.status, 405);

  const unauthorizedResponse = await handleR2CanaryRequest(
    new Request("https://canary.invalid/__canary/r2", {
      method: "POST",
      headers: { authorization: "Bearer incorrect" },
    }),
    env
  );
  assert.equal(unauthorizedResponse.status, 401);

  const successResponse = await handleR2CanaryRequest(
    new Request("https://canary.invalid/__canary/r2", {
      method: "POST",
      headers: { authorization: "Bearer test-only-secret" },
    }),
    env
  );
  assert.equal(successResponse.status, 200);
  assert.deepEqual(await successResponse.json(), {
    ok: true,
    write: true,
    read: true,
    cleanup: true,
  });
  assert.equal(objects.size, 0);
});

test("the canary checker reads credentials only from the process environment", () => {
  const checker = read("scripts/check-cloudflare-r2-canary.mjs");

  assert.match(checker, /process\.env\.CLOUDFLARE_CANARY_URL/);
  assert.match(checker, /process\.env\.R2_CANARY_SECRET/);
  assert.doesNotMatch(checker, /console\.(?:log|error)\([^\n]*secret/i);
});
