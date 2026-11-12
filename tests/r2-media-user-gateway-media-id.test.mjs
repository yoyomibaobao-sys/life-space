import test from "node:test";
import assert from "node:assert/strict";
import { handleR2BusinessUserMirrorRequest, R2_BUSINESS_MIRROR_PATH } from "../cloudflare/r2-media-user-gateway.mjs";
import { verifyR2MediaServiceRequest } from "../lib/r2-media-service-auth.mjs";
import { sha256Hex } from "../lib/r2-media-business.mjs";

const OWNER = "f99fd44d-820f-41f2-ad4e-85feb7c990a6";
const VIEWER = "867387ba-eb8a-4233-860b-86531533fd56";
const MEDIA = "ed4d0534-f686-42ff-82a6-1ab10e510063";
const RECORD = "b5baa3e2-68c9-45a3-ab9f-8a98cd4ef526";
const ARCHIVE = "0cebadc6-f936-43d1-af45-eb9f9e720c7c";
const FULL_PATH = OWNER + "/" + RECORD + "/0cebadc6-f936-43d1-af45-eb9f9e720c7c-PR95-Cloud-Image-QA-Synthetic-20261018.jpg";
const THUMB_PATH = OWNER + "/" + RECORD + "/thumbs/0cebadc6-f936-43d1-af45-eb9f9e720c7c-thumb-PR95-Cloud-Image-QA-Synthetic-20261018.jpg";
const SECRET = "isolated-r2-media-service-auth-secret-at-least-32-bytes";

function jpeg(length, seed) {
  const bytes = new Uint8Array(length);
  bytes.set([0xff, 0xd8, 0xff, seed & 0xff, (seed + 1) & 0xff], 0);
  bytes.set([0xff, 0xd9], length - 2);
  return bytes;
}
const FULL = jpeg(14663, 17);
const THUMB = jpeg(10997, 41);

function request(variant) {
  return new Request("https://site.example" + R2_BUSINESS_MIRROR_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer mock-owner-session",
      Origin: "https://site.example",
    },
    body: JSON.stringify({ businessType: "media", businessId: MEDIA, variant }),
  });
}

function fixture(viewerId = OWNER) {
  const downloaded = [];
  const queried = [];
  const internal = [];
  let rpcCalls = 0;
  let limiterCalls = 0;
  const rows = {
    media: {
      id: MEDIA, user_id: OWNER, record_id: RECORD, type: "image", trashed_at: null,
      storage_path: FULL_PATH, thumb_path: THUMB_PATH, size_bytes: FULL.byteLength,
    },
    records: {
      id: RECORD, user_id: OWNER, archive_id: ARCHIVE, visibility: "public", trashed_at: null,
    },
    archives: {
      id: ARCHIVE, user_id: OWNER, is_public: true, trashed_at: null,
    },
  };
  const env = {
    R2_BUSINESS_MEDIA_MODE: "isolated",
    R2_MEDIA_SERVICE_AUTH_SECRET: SECRET,
    R2_MEDIA_MIRROR_RATE_LIMITER: {
      async limit({ key }) {
        limiterCalls++;
        assert.equal(key, "mirror:" + viewerId);
        return { success: true };
      },
    },
    R2_BUSINESS_MEDIA_SERVICE: {
      async fetch(internalRequest) {
        internal.push(internalRequest);
        assert.equal(internalRequest.method, "POST");
        assert.equal(new URL(internalRequest.url).pathname, "/__internal/r2/business-media/stage-bytes");
        assert.equal(internalRequest.headers.has("authorization"), false);
        assert.equal(internalRequest.headers.has("cookie"), false);
        assert.equal(internalRequest.headers.has("apikey"), false);
        const metadata = await verifyR2MediaServiceRequest(internalRequest, SECRET);
        assert.ok(metadata, "existing HMAC/timestamp/Nonce contract must verify");
        const bytes = new Uint8Array(await internalRequest.arrayBuffer());
        assert.equal(bytes.byteLength, metadata.bytes);
        assert.equal(await sha256Hex(bytes), metadata.sha256);
        const expected = metadata.path === FULL_PATH ? FULL : THUMB;
        assert.deepEqual(bytes, expected);
        return Response.json({
          status: "copied_verified",
          bytes: metadata.bytes,
          sha256: metadata.sha256,
          contentType: metadata.contentType,
        }, { status: 200 });
      },
    },
  };
  const dependencies = {
    createUserClient() {
      return {
        accessToken: "mock-owner-session",
        cookieWrites: [],
        supabase: {
          auth: {
            async getUser(token) {
              assert.equal(token, "mock-owner-session");
              return { data: { user: { id: viewerId } }, error: null };
            },
          },
          storage: {
            from(bucket) {
              assert.equal(bucket, "media");
              return {
                async download(objectPath) {
                  downloaded.push(objectPath);
                  const bytes = objectPath === FULL_PATH ? FULL : THUMB;
                  return { data: new Blob([bytes], { type: "image/jpeg" }), error: null };
                },
              };
            },
          },
        },
      };
    },
    createAdminClient() {
      return {
        from(table) {
          return {
            select(columns) {
              return {
                eq(column, id) {
                  queried.push({ table, columns, column, id });
                  return {
                    async maybeSingle() {
                      return { data: rows[table] || null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        async rpc(name, args) {
          assert.equal(name, "get_referenced_storage_paths");
          assert.equal(args.p_bucket_id, "media");
          rpcCalls++;
          return { data: [{ object_path: args.p_object_paths[0] }], error: null };
        },
      };
    },
  };
  return {
    env, dependencies, downloaded, queried, internal,
    counts: () => ({ rpcCalls, limiterCalls, internalCalls: internal.length, downloadCalls: downloaded.length }),
  };
}

test("actual mediaId resolves distinct full/thumb paths and preserves signed stage-bytes contract", async () => {
  const f = fixture(OWNER);
  const full = await handleR2BusinessUserMirrorRequest(request("full"), f.env, f.dependencies);
  assert.equal(full.status, 200);
  const fullReceipt = await full.json();
  assert.equal(fullReceipt.status, "copied_verified");
  assert.equal(fullReceipt.bytes, 14663);
  assert.equal(fullReceipt.contentType, "image/jpeg");

  const thumb = await handleR2BusinessUserMirrorRequest(request("thumb"), f.env, f.dependencies);
  assert.equal(thumb.status, 200);
  const thumbReceipt = await thumb.json();
  assert.equal(thumbReceipt.status, "copied_verified");
  assert.equal(thumbReceipt.bytes, 10997);
  assert.equal(thumbReceipt.contentType, "image/jpeg");

  assert.deepEqual(f.downloaded, [FULL_PATH, THUMB_PATH]);
  assert.deepEqual(f.internal.map((req) => decodeURIComponent(req.headers.get("x-ls-media-path"))), [FULL_PATH, THUMB_PATH]);
  assert.ok(f.internal.every((req) => req.headers.get("x-ls-owner-id") === OWNER));
  assert.ok(f.internal.every((req) => req.headers.get("x-ls-timestamp")));
  assert.ok(f.internal.every((req) => req.headers.get("x-ls-nonce")));
  assert.ok(f.internal.every((req) => req.headers.get("x-ls-signature")));
  assert.deepEqual(f.queried.filter((item) => item.table === "media").map((item) => item.id), [MEDIA, MEDIA]);
  assert.deepEqual(f.queried.filter((item) => item.table === "records").map((item) => item.id), [RECORD, RECORD]);
  assert.deepEqual(f.queried.filter((item) => item.table === "archives").map((item) => item.id), [ARCHIVE, ARCHIVE]);
  assert.deepEqual(f.counts(), { rpcCalls: 4, limiterCalls: 2, internalCalls: 2, downloadCalls: 2 });
});

test("public readability never lets a non-owner trigger a media mirror", async () => {
  const f = fixture(VIEWER);
  const response = await handleR2BusinessUserMirrorRequest(request("full"), f.env, f.dependencies);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "media_unavailable");
  assert.deepEqual(f.downloaded, []);
  assert.deepEqual(f.internal, []);
  assert.equal(f.counts().limiterCalls, 1);
});
