import assert from "node:assert/strict";
import test from "node:test";
import { handleR2BusinessUserMirrorRequest, R2_BUSINESS_MIRROR_PATH } from "../cloudflare/r2-media-user-gateway.mjs";
import { handleR2InternalReadRequest } from "../cloudflare/r2-media-business.mjs";
import { handleR2MediaStageBytesRequest } from "../cloudflare/r2-media-stage-bytes.mjs";
import { sha256Hex } from "../lib/r2-media-business.mjs";
import { createR2InternalReadHeaders, R2_BUSINESS_INTERNAL_READ_PATH } from "../lib/r2-media-read-service-auth.mjs";
import { createR2MediaServiceHeaders, R2_BUSINESS_STAGE_BYTES_PATH } from "../lib/r2-media-service-auth.mjs";

const OWNER = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const PATH = OWNER + "/records/formal-gate.jpg";
const SECRET = "formal-r2-service-auth-test-secret-0123456789";
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0xff, 0xd9]);

function fakeBucket() {
  let gets = 0;
  let puts = 0;
  return {
    getCount: () => gets,
    putCount: () => puts,
    async get() {
      gets++;
      return {
        size: JPEG.byteLength,
        httpMetadata: { contentType: "image/jpeg" },
        customMetadata: { sha256: await sha256Hex(JPEG) },
        async arrayBuffer() { return JPEG.slice().buffer; },
      };
    },
    async put() { puts++; return { size: JPEG.byteLength }; },
    async head() { return null; },
  };
}

test("media Worker read switch is independent and defaults closed", async () => {
  const bucket = fakeBucket();
  const headers = await createR2InternalReadHeaders({ secret: SECRET, ownerId: OWNER, path: PATH });
  const request = new Request("https://media.internal" + R2_BUSINESS_INTERNAL_READ_PATH, {
    method: "GET", headers,
  });
  const response = await handleR2InternalReadRequest(request, {
    R2_BUSINESS_MEDIA_MODE: "isolated",
    R2_BUSINESS_MEDIA: bucket,
    R2_MEDIA_SERVICE_AUTH_SECRET: SECRET,
    R2_MEDIA_READ_ENABLED: "false",
  });
  assert.equal(response.status, 404);
  assert.equal(bucket.getCount(), 0);
});

test("media Worker serves a signed Owner path only when read switch is enabled", async () => {
  const bucket = fakeBucket();
  const headers = await createR2InternalReadHeaders({ secret: SECRET, ownerId: OWNER, path: PATH });
  const request = new Request("https://media.internal" + R2_BUSINESS_INTERNAL_READ_PATH, {
    method: "GET", headers,
  });
  const response = await handleR2InternalReadRequest(request, {
    R2_BUSINESS_MEDIA_MODE: "isolated",
    R2_BUSINESS_MEDIA: bucket,
    R2_MEDIA_SERVICE_AUTH_SECRET: SECRET,
    R2_MEDIA_READ_ENABLED: "true",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), JPEG);
  assert.equal(bucket.getCount(), 1);
});

test("media Worker write switch prevents stage-bytes mutation independently of read", async () => {
  const bucket = fakeBucket();
  const headers = await createR2MediaServiceHeaders({
    secret: SECRET, ownerId: OWNER, path: PATH, bytes: JPEG.byteLength,
    sha256: await sha256Hex(JPEG), contentType: "image/jpeg",
  });
  const request = new Request("https://media.internal" + R2_BUSINESS_STAGE_BYTES_PATH, {
    method: "POST", headers, body: JPEG,
  });
  const response = await handleR2MediaStageBytesRequest(request, {
    R2_BUSINESS_MEDIA_MODE: "isolated",
    R2_BUSINESS_MEDIA: bucket,
    R2_MEDIA_SERVICE_AUTH_SECRET: SECRET,
    R2_MEDIA_READ_ENABLED: "true",
    R2_MEDIA_MIRROR_WRITE_ENABLED: "false",
  });
  assert.equal(response.status, 404);
  assert.equal(bucket.putCount(), 0);
});

test("site Worker write switch blocks mirror before authentication or source access", async () => {
  let authCalls = 0;
  const request = new Request("https://life-space.uk" + R2_BUSINESS_MIRROR_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ businessType: "media", businessId: "ad6c0b1c-425e-4b1c-a2e5-4e0026bc4a6c", variant: "full" }),
  });
  const response = await handleR2BusinessUserMirrorRequest(request, {
    R2_BUSINESS_MEDIA_MODE: "isolated",
    R2_MEDIA_MIRROR_WRITE_ENABLED: "false",
  }, {
    createUserClient() { authCalls++; throw new Error("must_not_authenticate_when_write_gate_is_off"); },
  });
  assert.equal(response.status, 404);
  assert.equal(authCalls, 0);
});
