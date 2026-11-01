import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { once } from "node:events";
import { Miniflare } from "miniflare";
import {
  stageVerifiedR2Photo, sha256Hex, readVerifiedR2Photo, createR2ReadTicket,
} from "../lib/r2-media-business.mjs";
import {
  R2_BUSINESS_STAGE_PATH, R2_BUSINESS_READ_PATH, handleR2BusinessMediaRequest,
} from "../cloudflare/r2-media-business.mjs";

/** Isolated local network only; never connects to Cloudflare or Supabase. */
const ownerId = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const secret = "test-migration-secret-0123456789-0123456789";
const signingSecret = "test-signing-secret-0123456789-0123456789";
const fullPath = ownerId + "/records/http-original.jpg";
const thumbPath = ownerId + "/records/thumbs/http-thumbnail.jpg";
const full = new Uint8Array([255,216,1,2,3,4,255,217]);
const thumb = new Uint8Array([255,216,5,6,255,217]);

async function withIsolatedR2(callback) {
  const mf = new Miniflare({
    workers: [{
      config: {
        name: "d-r2-thirdbatch", type: "worker", compatibilityDate: "2026-09-01",
        manifest: { mainModule: "test.mjs", modulesRoot: "/", modules: {
          "test.mjs": { type: "esm", contents: "export default {fetch(){return new Response('local')}};" },
        } },
        env: { R2_BUSINESS_MEDIA: { type: "r2", name: "d-r2-thirdbatch-only" } },
      },
      dev: {},
    }],
  });
  try {
    await callback(await mf.getR2Bucket("R2_BUSINESS_MEDIA", "d-r2-thirdbatch"));
  } finally { await mf.dispose(); }
}
function headers() {
  return { Authorization: "Bearer " + secret, "Content-Type": "application/json" };
}
function stageBody(path, bytes, sha256) {
  return JSON.stringify({ ownerId, path, bytes, sha256 });
}
function validReferenceFetch(source, { gate } = {}) {
  return async (url) => {
    if (new URL(url).pathname.endsWith("/get_referenced_storage_paths")) {
      return Response.json([{ object_path: fullPath }]);
    }
    if (gate) await gate();
    return new Response(source, { headers: { "Content-Type": "image/jpeg", "Content-Length": String(source.byteLength) } });
  };
}
async function createLocalHttpServer(env, sourceFetch) {
  const active = new Set();
  const server = http.createServer(async (req, res) => {
    const work = (async () => {
      const chunks = [];
      for await (const part of req) chunks.push(part);
      const payload = Buffer.concat(chunks);
      const request = new Request("http://localhost" + req.url, {
        method: req.method, headers: req.headers,
        ...(req.method === "POST" ? { body: payload } : {}),
      });
      const response = await handleR2BusinessMediaRequest(request, env, sourceFetch);
      if (res.destroyed) return;
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        for await (const chunk of response.body) {
          if (res.destroyed) break;
          res.write(chunk);
        }
      }
      if (!res.destroyed) res.end();
    })().catch((err) => {
      if (!res.destroyed) { res.statusCode = 503; res.end("isolated_handler_failure"); }
      throw err;
    });
    active.add(work);
    work.finally(() => active.delete(work)).catch(() => {});
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    origin: "http://127.0.0.1:" + port,
    async close() {
      await Promise.allSettled(Array.from(active));
      await new Promise((resolve) => server.close(resolve));
    },
    async done() { await Promise.allSettled(Array.from(active)); },
  };
}

test("real local R2 rejects overlapping different-content conditional puts", async () => {
  await withIsolatedR2(async (bucket) => {
    const path = ownerId + "/records/concurrent.jpg";
    const a = new Uint8Array([1,2,3,4]);
    const b = new Uint8Array([5,6,7,8]);
    const make = async (bytes) => stageVerifiedR2Photo({
      bucket, ownerId, path, sourceBytes: bytes, contentType: "image/jpeg",
      expectedBytes: bytes.byteLength, expectedSha256: await sha256Hex(bytes),
    });
    const results = await Promise.allSettled([make(a), make(b)]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1, "only one valid payload can win");
    assert.equal(results.filter((x) => x.status === "rejected").length, 1, "conflicting payload must fail closed");
    const saved = new Uint8Array(await (await bucket.get(path)).arrayBuffer());
    assert.ok([a,b].some(x => Buffer.from(x).equals(Buffer.from(saved))));
    assert.equal((await bucket.list()).objects.length, 1);

    // Under repeated same-content arrivals, one stored result is enough.
    const repeat = await Promise.all(Array.from({ length: 7 }, () => make(saved)));
    assert.ok(repeat.every(x => x.status === "already_verified"));
    assert.equal((await bucket.list()).objects.length, 1);
  });
});

test("HTTP POST/GET: exact content-length, SHA, thumbnail, signing and expired ticket", async () => {
  await withIsolatedR2(async (bucket) => {
    const env = {
      R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket,
      R2_MEDIA_MIGRATION_SECRET: secret, R2_MEDIA_SIGNING_SECRET: signingSecret,
      SUPABASE_URL: "https://test-source.invalid/", SUPABASE_SERVICE_ROLE_KEY: "test-role",
    };
    const sha = await sha256Hex(full);
    const sourceFetch = validReferenceFetch(full);
    const server = await createLocalHttpServer(env, sourceFetch);
    try {
      const badAuth = await fetch(server.origin + R2_BUSINESS_STAGE_PATH, {
        method: "POST", body: stageBody(fullPath, full.byteLength, sha),
      });
      assert.equal(badAuth.status, 401);
      const stage = await fetch(server.origin + R2_BUSINESS_STAGE_PATH, {
        method: "POST", headers: headers(), body: stageBody(fullPath, full.byteLength, sha),
      });
      assert.equal(stage.status, 200);
      const info = await stage.json();
      assert.equal(info.bytes, full.byteLength);
      assert.equal(info.sha256, sha);
      const image = await fetch(server.origin + info.readPath);
      assert.equal(image.status, 200);
      assert.equal(Number(image.headers.get("content-length")), full.byteLength);
      assert.equal(image.headers.get("content-type"), "image/jpeg");
      assert.match(image.headers.get("cache-control") || "", /no-store/);
      const body = new Uint8Array(await image.arrayBuffer());
      assert.deepEqual(body, full);
      assert.equal(await sha256Hex(body), sha);
      const repeat = await fetch(server.origin + R2_BUSINESS_STAGE_PATH, {
        method: "POST", headers: headers(), body: stageBody(fullPath, full.byteLength, sha),
      });
      assert.equal((await repeat.json()).status, "already_verified");
      const tampered = await fetch(server.origin + R2_BUSINESS_READ_PATH + "?ticket=broken");
      assert.equal(tampered.status, 403);
      const old = await createR2ReadTicket({
        secret: signingSecret, ownerId, path: fullPath,
        expectedBytes: full.byteLength, expectedSha256: sha, now: 1000, ttlSeconds: 1,
      });
      const expired = await fetch(server.origin + R2_BUSINESS_READ_PATH + "?ticket=" + encodeURIComponent(old));
      assert.equal(expired.status, 403);
      const thumbSha = await sha256Hex(thumb);
      await stageVerifiedR2Photo({
        bucket, ownerId, path: thumbPath, sourceBytes: thumb,
        expectedBytes: thumb.byteLength, expectedSha256: thumbSha, contentType: "image/jpeg",
      });
      const thumbVerified = await readVerifiedR2Photo({
        bucket, ownerId, path: thumbPath, expectedBytes: thumb.byteLength, expectedSha256: thumbSha,
      });
      assert.deepEqual(thumbVerified.bytes, thumb);
      assert.equal((await bucket.list()).objects.length, 2);
    } finally { await server.close(); }
  });
});

test("HTTP source truncation fails with no R2 object or false success response", async () => {
  await withIsolatedR2(async (bucket) => {
    const sha = await sha256Hex(full);
    const env = {
      R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket,
      R2_MEDIA_MIGRATION_SECRET: secret, R2_MEDIA_SIGNING_SECRET: signingSecret,
      SUPABASE_URL: "https://test-source.invalid/", SUPABASE_SERVICE_ROLE_KEY: "test-role",
    };
    const sourceFetch = async (url) => {
      if (new URL(url).pathname.endsWith("/get_referenced_storage_paths")) {
        return Response.json([{ object_path: fullPath }]);
      }
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(full.slice(0, 3));
          controller.error(new Error("source_connection_lost"));
        },
      }), { headers: { "Content-Type": "image/jpeg" } });
    };
    const server = await createLocalHttpServer(env, sourceFetch);
    try {
      const result = await fetch(server.origin + R2_BUSINESS_STAGE_PATH, {
        method: "POST", headers: headers(), body: stageBody(fullPath, full.byteLength, sha),
      });
      assert.equal(result.status, 502);
      assert.equal((await result.json()).error, "source_stream_interrupted");
      assert.equal((await bucket.list()).objects.length, 0);
    } finally { await server.close(); }
  });
});


test("reference RPC and source connection errors remain retryable; no partial copy", async () => {
  await withIsolatedR2(async (bucket) => {
    const sha = await sha256Hex(full);
    const env = {
      R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket,
      R2_MEDIA_MIGRATION_SECRET: secret, R2_MEDIA_SIGNING_SECRET: signingSecret,
      SUPABASE_URL: "https://test-source.invalid/", SUPABASE_SERVICE_ROLE_KEY: "test-role",
    };
    const input = () => new Request("https://test.local" + R2_BUSINESS_STAGE_PATH, {
      method: "POST", headers: headers(), body: stageBody(fullPath, full.length, sha),
    });
    const failedRef = await handleR2BusinessMediaRequest(input(), env, async () => {
      throw new Error("upstream_reference_timeout");
    });
    assert.equal(failedRef.status, 503);
    assert.equal((await failedRef.json()).error, "reference_check_unavailable");
    const failedSource = await handleR2BusinessMediaRequest(input(), env, async (url) => {
      if (new URL(url).pathname.endsWith("/get_referenced_storage_paths")) {
        return Response.json([{ object_path: fullPath }]);
      }
      throw new Error("upstream_source_timeout");
    });
    assert.equal(failedSource.status, 502);
    assert.equal((await failedSource.json()).error, "source_connection_failed");
    assert.equal((await bucket.list()).objects.length, 0);
  });
});
test("HTTP client disconnect yields safe retry: no partial or conflicting R2 bytes", async () => {
  await withIsolatedR2(async (bucket) => {
    const sha = await sha256Hex(full);
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    let resume;
    const barrier = new Promise(resolve => { resume = resolve; });
    const env = {
      R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket,
      R2_MEDIA_MIGRATION_SECRET: secret, R2_MEDIA_SIGNING_SECRET: signingSecret,
      SUPABASE_URL: "https://test-source.invalid/", SUPABASE_SERVICE_ROLE_KEY: "test-role",
    };
    const sourceFetch = validReferenceFetch(full, { gate: async () => { started(); await barrier; } });
    const server = await createLocalHttpServer(env, sourceFetch);
    try {
      const controller = new AbortController();
      const request = fetch(server.origin + R2_BUSINESS_STAGE_PATH, {
        method: "POST", headers: headers(),
        body: stageBody(fullPath, full.byteLength, sha), signal: controller.signal,
      });
      await ready;
      controller.abort();
      await assert.rejects(request, /abort/i);
      resume();
      await server.done();
      const retry = await fetch(server.origin + R2_BUSINESS_STAGE_PATH, {
        method: "POST", headers: headers(),
        body: stageBody(fullPath, full.byteLength, sha),
      });
      assert.equal(retry.status, 200);
      assert.ok(["already_verified", "copied_verified"].includes((await retry.json()).status));
      const bytes = new Uint8Array(await (await bucket.get(fullPath)).arrayBuffer());
      assert.deepEqual(bytes, full);
      assert.equal(await sha256Hex(bytes), sha);
      assert.equal((await bucket.list()).objects.length, 1);
    } finally { resume(); await server.close(); }
  });
});
