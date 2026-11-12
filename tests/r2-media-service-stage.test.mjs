import assert from "node:assert/strict";
import test from "node:test";
import { sha256Hex } from "../lib/r2-media-business.mjs";
import {
  createR2MediaServiceHeaders,
  createR2MediaServiceNonce,
  R2_BUSINESS_STAGE_BYTES_PATH,
} from "../lib/r2-media-service-auth.mjs";
import { handleR2MediaStageBytesRequest } from "../cloudflare/r2-media-stage-bytes.mjs";

const OWNER = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const OTHER = "867387ba-eb8a-4233-860b-86531533fd56";
const PATH = OWNER + "/records/source.jpg";
const SECRET = "test-r2-media-service-auth-secret-0123456789";
const NOW = Math.floor(Date.now() / 1000);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03, 0xff, 0xd9]);
const PNG = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x01,0x02]);

function fakeBucket({ failNonce = false, failMediaWrites = 0 } = {}) {
  const objects = new Map();
  const actions = { puts: 0, noncePuts: 0, mediaPuts: 0 };
  return {
    objects,
    actions,
    failNonce,
    failMediaWrites,
    async put(key, value, options = {}) {
      if (options.onlyIf?.etagDoesNotMatch !== "*") throw new Error("atomic_only_if_required");
      if (key.startsWith("__lifespace_internal_nonces/v1/")) {
        actions.noncePuts++;
        if (this.failNonce) throw new Error("nonce_store_unavailable");
      } else {
        actions.mediaPuts++;
        if (this.failMediaWrites > 0) {
          this.failMediaWrites--;
          throw new Error("media_store_unavailable");
        }
      }
      if (objects.has(key)) return null;
      const data = value instanceof Uint8Array ? value.slice() : new Uint8Array(value);
      objects.set(key, {
        bytes: data,
        size: data.byteLength,
        httpMetadata: options.httpMetadata || {},
        customMetadata: options.customMetadata || {},
        async arrayBuffer() { return data.slice().buffer; },
      });
      actions.puts++;
      return { size: data.byteLength };
    },
    async get(key) { return objects.get(key) || null; },
    async head(key) {
      const object = objects.get(key);
      return object ? { size: object.size } : null;
    },
  };
}

async function signedRequest(options = {}) {
  const bodyBytes = options.bodyBytes ?? JPEG;
  const ownerId = options.ownerId ?? OWNER;
  const path = options.path ?? PATH;
  const expectedBytes = options.expectedBytes ?? bodyBytes.byteLength;
  const sha256 = options.sha256 ?? await sha256Hex(bodyBytes);
  const contentType = options.contentType ?? "image/jpeg";
  const timestamp = options.timestamp ?? NOW;
  const nonce = options.nonce ?? createR2MediaServiceNonce();
  const secret = options.secret ?? SECRET;
  const query = options.query ?? "";
  const overrides = options.overrides ?? {};
  const signedHeaders = await createR2MediaServiceHeaders({
    secret, ownerId, path, bytes: expectedBytes, sha256, contentType, timestamp, nonce,
  });
  const headers = new Headers(signedHeaders);
  for (const [name, value] of Object.entries(overrides)) headers.set(name, value);
  return {
    nonce,
    headers,
    request: new Request("https://media.internal" + R2_BUSINESS_STAGE_BYTES_PATH + query, {
      method: "POST", headers, body: bodyBytes,
    }),
  };
}

function env(bucket, extra = {}) {
  return {
    R2_BUSINESS_MEDIA_MODE: "isolated",
    R2_BUSINESS_MEDIA: bucket,
    R2_MEDIA_SERVICE_AUTH_SECRET: SECRET,
    ...extra,
  };
}

test("stage-bytes route copies exact image bytes and reads the R2 copy back without Supabase secrets", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest();
  const isolatedEnv = env(bucket);
  Object.defineProperty(isolatedEnv, "SUPABASE_SERVICE_ROLE_KEY", {
    get() { throw new Error("media Worker must not read Supabase service role"); },
  });
  const response = await handleR2MediaStageBytesRequest(input.request, isolatedEnv, NOW);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "copied_verified");
  assert.equal(result.bytes, JPEG.byteLength);
  assert.equal(result.sha256, await sha256Hex(JPEG));
  assert.equal(result.contentType, "image/jpeg");
  const saved = await bucket.get(PATH);
  assert.deepEqual(new Uint8Array(await saved.arrayBuffer()), JPEG);
  assert.equal(saved.httpMetadata.contentType, "image/jpeg");
  assert.equal(bucket.actions.mediaPuts, 1);
  assert.equal(bucket.actions.noncePuts, 1);
  assert.equal([...bucket.objects.keys()].filter((key) => key.startsWith("__lifespace_internal_nonces/v1/")).length, 1);
});

test("the same signed nonce cannot be replayed", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest({ nonce: "a".repeat(32) });
  const first = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  const replay = await handleR2MediaStageBytesRequest(
    (await signedRequest({ nonce: input.nonce })).request,
    env(bucket),
    NOW,
  );
  assert.equal(first.status, 200);
  assert.equal(replay.status, 409);
  assert.equal((await replay.json()).error, "replayed_internal_request");
  assert.equal(bucket.actions.mediaPuts, 1);
});

test("concurrent requests with one nonce have one winner and cannot double-stage", async () => {
  const bucket = fakeBucket();
  const nonce = "b".repeat(32);
  const [left, right] = await Promise.all([
    signedRequest({ nonce }),
    signedRequest({ nonce }),
  ]);
  const results = await Promise.all([
    handleR2MediaStageBytesRequest(left.request, env(bucket), NOW),
    handleR2MediaStageBytesRequest(right.request, env(bucket), NOW),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(bucket.actions.noncePuts, 2);
  assert.equal(bucket.actions.mediaPuts, 1);
});

test("signature tampering fails before nonce or media writes", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest({ overrides: { "x-ls-signature": "0".repeat(64) } });
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 401);
  assert.equal(bucket.actions.puts, 0);
});

test("expired and future timestamps outside the 60-second window are rejected", async () => {
  const bucket = fakeBucket();
  const expired = await signedRequest({ timestamp: NOW - 61 });
  const future = await signedRequest({ timestamp: NOW + 61 });
  assert.equal((await handleR2MediaStageBytesRequest(expired.request, env(bucket), NOW)).status, 401);
  assert.equal((await handleR2MediaStageBytesRequest(future.request, env(bucket), NOW)).status, 401);
  assert.equal(bucket.actions.puts, 0);
});

test("a valid signed request with a foreign owner path is rejected", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest({ path: OTHER + "/records/private.jpg" });
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 400);
  assert.equal(bucket.actions.puts, 0);
});

test("path traversal is rejected even when the internal request is correctly signed", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest({ path: OWNER + "/records/../private.jpg" });
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 400);
  assert.equal(bucket.actions.puts, 0);
});

test("request body shorter than the signed byte count is rejected without a nonce", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest({ expectedBytes: JPEG.byteLength + 1 });
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "content_length_mismatch");
  assert.equal(bucket.actions.puts, 0);
});

test("request body longer than the signed byte count is rejected without a nonce", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest({ bodyBytes: new Uint8Array([...JPEG, 0x01]), expectedBytes: JPEG.byteLength });
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 413);
  assert.equal(bucket.actions.puts, 0);
});

test("SHA mismatch is rejected before R2 writes", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest({ sha256: "0".repeat(64) });
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "image_sha256_mismatch");
  assert.equal(bucket.actions.puts, 0);
});

test("declared MIME must match the actual image byte signature", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest({ contentType: "image/png" });
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 415);
  assert.equal((await response.json()).error, "image_mime_mismatch");
  assert.equal(bucket.actions.puts, 0);
});

test("valid PNG bytes are accepted and stored with the verified MIME", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest({ bodyBytes: PNG, contentType: "image/png" });
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).contentType, "image/png");
  assert.equal((await bucket.get(PATH)).httpMetadata.contentType, "image/png");
});

test("invalid image payload is rejected even when the signed MIME says image/jpeg", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest({ bodyBytes: new TextEncoder().encode("not an image") });
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 415);
  assert.equal(bucket.actions.puts, 0);
});

test("unsupported MIME is rejected by the site signing helper", async () => {
  await assert.rejects(createR2MediaServiceHeaders({
    secret: SECRET, ownerId: OWNER, path: PATH, bytes: JPEG.length,
    sha256: await sha256Hex(JPEG), contentType: "image/svg+xml", timestamp: NOW, nonce: "c".repeat(32),
  }), /invalid_r2_media_service_manifest/);
});

test("a missing internal secret fails closed", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest();
  const noSecret = { R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket };
  const response = await handleR2MediaStageBytesRequest(input.request, noSecret, NOW);
  assert.equal(response.status, 503);
  assert.equal(bucket.actions.puts, 0);
});

test("disabled or unbound media Worker does not accept the internal route", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest();
  const response = await handleR2MediaStageBytesRequest(input.request, { R2_BUSINESS_MEDIA: bucket }, NOW);
  assert.equal(response.status, 404);
  assert.equal(bucket.actions.puts, 0);
});

test("nonce ledger write failure stops before media write", async () => {
  const bucket = fakeBucket({ failNonce: true });
  const input = await signedRequest();
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "replay_guard_unavailable");
  assert.equal(bucket.actions.mediaPuts, 0);
});

test("a conflicting R2 destination is not overwritten", async () => {
  const bucket = fakeBucket();
  const original = new Uint8Array([0xff, 0xd8, 0xff, 0x44, 0x55, 0xff, 0xd9]);
  bucket.objects.set(PATH, {
    bytes: original,
    size: original.length,
    httpMetadata: { contentType: "image/jpeg" },
    async arrayBuffer() { return original.slice().buffer; },
  });
  const input = await signedRequest();
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 409);
  assert.deepEqual(new Uint8Array(await (await bucket.get(PATH)).arrayBuffer()), original);
});

test("a failed R2 write can be retried with a fresh nonce and the same source bytes", async () => {
  const bucket = fakeBucket({ failMediaWrites: 1 });
  const first = await signedRequest({ nonce: "d".repeat(32) });
  const failed = await handleR2MediaStageBytesRequest(first.request, env(bucket), NOW);
  assert.equal(failed.status, 503);
  assert.equal(await bucket.get(PATH), null);
  const retry = await signedRequest({ nonce: "e".repeat(32) });
  const succeeded = await handleR2MediaStageBytesRequest(retry.request, env(bucket), NOW);
  assert.equal(succeeded.status, 200);
  assert.deepEqual(new Uint8Array(await (await bucket.get(PATH)).arrayBuffer()), JPEG);
});

test("an interrupted request body fails without an R2 object", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(JPEG.subarray(0, 3));
      controller.error(new Error("client_disconnected"));
    },
  });
  const request = new Request("https://media.internal" + R2_BUSINESS_STAGE_BYTES_PATH, {
    method: "POST",
    headers: input.headers,
    body: stream,
    duplex: "half",
  });
  const response = await handleR2MediaStageBytesRequest(request, env(bucket), NOW);
  assert.equal(response.status, 502);
  assert.equal(bucket.actions.puts, 0);
});

test("query-string variation is not accepted as a signed endpoint", async () => {
  const bucket = fakeBucket();
  const input = await signedRequest({ query: "?extra=1" });
  const response = await handleR2MediaStageBytesRequest(input.request, env(bucket), NOW);
  assert.equal(response.status, 401);
  assert.equal(bucket.actions.puts, 0);
});
