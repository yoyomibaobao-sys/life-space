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
  assert.doesNotMatch(config, /"triggers?"\s*:/);
});

test("Cloudflare prepares maintenance without activating a second cron", () => {
  const worker = read("cloudflare/worker-entry.mjs");
  const maintenance = read("cloudflare/scheduled-maintenance.mjs");

  assert.match(worker, /async scheduled\(_controller, env, ctx\)/);
  assert.match(worker, /runScheduledMaintenance\(app, env, ctx\)/);
  assert.match(maintenance, /env\?\.CRON_SECRET/);
  assert.match(maintenance, /authorization: `Bearer \$\{getCronSecret\(env\)\}`/);
  assert.match(maintenance, /app\.fetch\(request, env, ctx\)/);
  assert.doesNotMatch(maintenance, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("scheduled maintenance reuses the protected internal route", async () => {
  const { runScheduledMaintenance, STORAGE_DELETION_WORKER_PATH } = await import(
    "../cloudflare/scheduled-maintenance.mjs"
  );
  const env = { CRON_SECRET: "test-only-cron-secret" };
  const ctx = { waitUntil() {} };
  let capturedRequest;
  let capturedEnv;
  let capturedContext;
  const app = {
    async fetch(request, receivedEnv, receivedContext) {
      capturedRequest = request;
      capturedEnv = receivedEnv;
      capturedContext = receivedContext;
      return Response.json({ ok: true });
    },
  };

  assert.equal(await runScheduledMaintenance(app, env, ctx), 200);
  assert.equal(new URL(capturedRequest.url).pathname, STORAGE_DELETION_WORKER_PATH);
  assert.equal(capturedRequest.method, "GET");
  assert.equal(
    capturedRequest.headers.get("authorization"),
    "Bearer test-only-cron-secret"
  );
  assert.equal(capturedEnv, env);
  assert.equal(capturedContext, ctx);

  await assert.rejects(
    () => runScheduledMaintenance(app, {}, ctx),
    /cloudflare_cron_secret_missing/
  );

  await assert.rejects(
    () =>
      runScheduledMaintenance(
        { fetch: async () => new Response(null, { status: 503 }) },
        env,
        ctx
      ),
    /cloudflare_scheduled_maintenance_failed:503/
  );
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

test("Cloudflare deployment uses low-privilege public auth config and encrypted infrastructure secrets", () => {
  const workflow = read(".github/workflows/cloudflare-canary.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(
    workflow,
    /permissions:\s*\n\s*contents: read\s*\n\s*statuses: write/
  );
  assert.match(
    workflow,
    /NEXT_PUBLIC_SUPABASE_URL: https:\/\/[a-z0-9]+\.supabase\.co/
  );
  assert.match(
    workflow,
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb_publishable_[A-Za-z0-9_-]+/
  );
  assert.doesNotMatch(workflow, /cloudflare-canary\.invalid|cloudflare-canary-placeholder/);
  assert.match(workflow, /npm run build:vinext/);
  assert.match(workflow, /ensure-cloudflare-r2-canary-bucket\.mjs/);
  assert.match(workflow, /cloudflare\/wrangler-action@v4/);
  assert.match(workflow, /deploy --config dist\/server\/wrangler\.json/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /steps\.deploy\.outputs\.deployment-url/);
  assert.match(workflow, /npm run test:r2-canary/);
  assert.match(workflow, /name: Report the canary result on the commit/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /gh api --method POST/);
  assert.match(workflow, /context="Cloudflare canary"/);
  assert.doesNotMatch(workflow, /^\s*schedule:/m);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(workflow, /sb_secret_/);
});

test("browser Supabase clients prefer the modern publishable key", () => {
  for (const path of ["lib/supabase.ts", "lib/media-storage-upload.ts"]) {
    const source = read(path);
    assert.match(source, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    assert.match(source, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
  }
});

test("R2 canary bucket setup is idempotent and never exposes its API token", async () => {
  const { ensureR2CanaryBucket, R2_CANARY_BUCKET_NAME } = await import(
    "../scripts/ensure-cloudflare-r2-canary-bucket.mjs"
  );
  const token = "test-only-cloudflare-token";
  const accountId = "test-account";
  const calls = [];
  const existingFetch = async (url, options = {}) => {
    calls.push({ url, options });
    return Response.json({
      success: true,
      result: { buckets: [{ name: R2_CANARY_BUCKET_NAME }] },
    });
  };

  assert.deepEqual(
    await ensureR2CanaryBucket({ accountId, apiToken: token, fetchImpl: existingFetch }),
    { created: false, name: R2_CANARY_BUCKET_NAME }
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${token}`);
  assert.doesNotMatch(calls[0].url, new RegExp(token));

  const createCalls = [];
  const createFetch = async (url, options = {}) => {
    createCalls.push({ url, options });
    if (options.method === "POST") {
      return Response.json({ success: true, result: { name: R2_CANARY_BUCKET_NAME } });
    }
    return Response.json({ success: true, result: { buckets: [] } });
  };

  assert.deepEqual(
    await ensureR2CanaryBucket({ accountId, apiToken: token, fetchImpl: createFetch }),
    { created: true, name: R2_CANARY_BUCKET_NAME }
  );
  assert.equal(createCalls.length, 2);
  assert.equal(createCalls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(createCalls[1].options.body), {
    name: R2_CANARY_BUCKET_NAME,
  });

  await assert.rejects(
    () => ensureR2CanaryBucket({ accountId: "", apiToken: token, fetchImpl: createFetch }),
    /Missing CLOUDFLARE_ACCOUNT_ID/
  );

  const deniedFetch = async () =>
    Response.json(
      {
        success: false,
        errors: [
          {
            code: 10000,
            message: `Authentication failed for ${token}`,
          },
        ],
      },
      { status: 403 }
    );

  await assert.rejects(
    () =>
      ensureR2CanaryBucket({
        accountId,
        apiToken: token,
        fetchImpl: deniedFetch,
      }),
    (error) => {
      assert.match(error.message, /HTTP 403/);
      assert.match(error.message, /Cloudflare error code: 10000/);
      assert.doesNotMatch(error.message, new RegExp(token));
      assert.doesNotMatch(error.message, /Authentication failed/);
      return true;
    }
  );
});
