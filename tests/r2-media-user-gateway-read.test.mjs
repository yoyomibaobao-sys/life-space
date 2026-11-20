import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  handleR2BusinessUserReadRequest,
  R2_BUSINESS_VIEW_PATH,
} from "../cloudflare/r2-media-user-gateway.mjs";
import { verifyR2InternalReadRequest } from "../lib/r2-media-read-service-auth.mjs";

const OWNER = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const OTHER = "867387ba-eb8a-4233-860b-86531533fd56";
const MEDIA = "ad6c0b1c-425e-4b1c-a2e5-4e0026bc4a6c";
const RECORD = "b5baa3e2-68c9-45a3-ab9f-8a98cd4ef526";
const ARCHIVE = "0cebadc6-f936-43d1-af45-eb9f9e720c7c";
const FULL_PATH = OWNER + "/" + RECORD + "/record.jpg";
const THUMB_PATH = OWNER + "/" + RECORD + "/thumbs/record.jpg";
const SECRET = "formal-r2-read-service-secret-at-least-32-bytes";
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0xff, 0xd9]);

function request(variant = "full", viewerId = OWNER, extraHeaders = {}) {
  return new Request(
    "https://life-space.uk" + R2_BUSINESS_VIEW_PATH +
      "?id=" + MEDIA + "&variant=" + variant,
    {
      method: "GET",
      headers: {
        ...(viewerId ? { Authorization: "Bearer test-user-token" } : {}),
        ...extraHeaders,
      },
    },
  );
}

function fixture(options = {}) {
  const viewerId = options.viewerId === undefined ? OWNER : options.viewerId;
  const readEnabled = options.readEnabled === true;
  const r2Status = options.r2Status ?? 404;
  const storagePaths = [];
  const internalRequests = [];
  const rpcCalls = [];
  let userLookups = 0;
  const rows = {
    media: {
      id: MEDIA, user_id: OWNER, record_id: RECORD, type: "image", trashed_at: null,
      storage_path: FULL_PATH, thumb_path: THUMB_PATH, size_bytes: JPEG.byteLength * 2,
    },
    records: {
      id: RECORD, user_id: OWNER, archive_id: ARCHIVE, visibility: "private", trashed_at: null,
    },
    archives: {
      id: ARCHIVE, user_id: OWNER, is_public: false, trashed_at: null,
    },
  };
  const env = {
    R2_BUSINESS_MEDIA_MODE: "isolated",
    R2_MEDIA_READ_ENABLED: readEnabled ? "true" : "false",
    SUPABASE_URL: "https://formal-project.supabase.co/",
    NEXT_PUBLIC_SUPABASE_URL: "https://formal-project.supabase.co/",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  };
  if (readEnabled) {
    env.R2_MEDIA_SERVICE_AUTH_SECRET = SECRET;
    env.R2_BUSINESS_MEDIA_SERVICE = {
      async fetch(internalRequest) {
        internalRequests.push(internalRequest);
        assert.equal(internalRequest.method, "GET");
        assert.equal(new URL(internalRequest.url).pathname, "/__internal/r2/business-media/read-by-path");
        const identity = await verifyR2InternalReadRequest(internalRequest, SECRET);
        assert.deepEqual(identity, {
          ownerId: OWNER,
          path: internalRequest.headers.get("x-ls-media-path") === encodeURIComponent(THUMB_PATH)
            ? THUMB_PATH : FULL_PATH,
        });
        if (options.r2Throws) throw new Error("simulated media Worker outage");
        if (r2Status === 200) {
          return new Response(JPEG, {
            status: 200,
            headers: { "Content-Type": "image/jpeg", "Content-Length": String(JPEG.byteLength) },
          });
        }
        return new Response(null, { status: r2Status });
      },
    };
  }
  const dependencies = {
    createUserClient() {
      return {
        accessToken: viewerId ? "test-user-token" : null,
        cookieWrites: [],
        supabase: {
          auth: {
            async getUser(token) {
              userLookups++;
              assert.equal(token, viewerId ? "test-user-token" : undefined);
              return { data: { user: viewerId ? { id: viewerId } : null }, error: null };
            },
          },
          async rpc(name, args) {
            rpcCalls.push({ name, args });
            assert.equal(name, "can_access_record");
            assert.equal(args.p_record_id, RECORD);
            return { data: viewerId === OWNER, error: null };
          },
        },
      };
    },
    createAdminClient() {
      return {
        from(table) {
          return {
            select() {
              return {
                eq() {
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
        storage: {
          from(bucket) {
            assert.equal(bucket, "media");
            return {
              async download(path) {
                storagePaths.push(path);
                return { data: new Blob([JPEG], { type: "image/jpeg" }), error: null };
              },
            };
          },
        },
      };
    },
  };
  return {
    env, dependencies, storagePaths, internalRequests, rpcCalls,
    counts: () => ({ userLookups, rpcCalls: rpcCalls.length, storageReads: storagePaths.length, r2Reads: internalRequests.length }),
  };
}

test("site Worker keeps same-origin Owner proxy on Storage while R2 read switch is off", async () => {
  for (const [variant, expectedPath] of [["full", FULL_PATH], ["thumb", THUMB_PATH]]) {
    const f = fixture({ readEnabled: false });
    const response = await handleR2BusinessUserReadRequest(
      request(variant), f.env, f.dependencies,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-ls-media-source"), "storage-fallback");
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), JPEG);
    assert.deepEqual(f.storagePaths, [expectedPath]);
    assert.equal(f.internalRequests.length, 0, "closed R2 read gate must not call the media Worker");
    assert.equal(f.rpcCalls.length, 2, "record permission is checked before and after transfer");
    assert.equal(f.counts().userLookups, 2, "session identity is rechecked after transfer");
  }
});

test("R2 hit serves verified image bytes without a Storage download", async () => {
  const f = fixture({ readEnabled: true, r2Status: 200 });
  const response = await handleR2BusinessUserReadRequest(
    request("full"), f.env, f.dependencies,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ls-media-source"), "r2");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), JPEG);
  assert.equal(f.internalRequests.length, 1);
  assert.equal(f.storagePaths.length, 0);
});

test("R2 404, 502, 503 and transport failure fall back to Storage", async () => {
  for (const options of [
    { r2Status: 404 },
    { r2Status: 502 },
    { r2Status: 503 },
    { r2Throws: true },
  ]) {
    const f = fixture({ readEnabled: true, ...options });
    const response = await handleR2BusinessUserReadRequest(
      request("thumb"), f.env, f.dependencies,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-ls-media-source"), "storage-fallback");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), JPEG);
    assert.equal(f.storagePaths[0], THUMB_PATH);
    assert.equal(f.internalRequests.length, 1);
  }
});

test("R2 integrity or authorization response fails closed without Storage fallback", async () => {
  const f = fixture({ readEnabled: true, r2Status: 409 });
  const response = await handleR2BusinessUserReadRequest(
    request("full"), f.env, f.dependencies,
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-ls-media-source"), null);
  assert.equal(f.storagePaths.length, 0);
  assert.equal(f.internalRequests.length, 1);
});

test("another Owner cannot read private full or thumbnail through the proxy", async () => {
  for (const variant of ["full", "thumb"]) {
    const f = fixture({ viewerId: OTHER, readEnabled: true, r2Status: 200 });
    const response = await handleR2BusinessUserReadRequest(
      request(variant, OTHER), f.env, f.dependencies,
    );
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-ls-media-source"), null);
    assert.equal(f.internalRequests.length, 0);
    assert.equal(f.storagePaths.length, 0);
  }
});

test("site Worker dispatches the media proxy even when the R2 read gate is closed", () => {
  const entry = readFileSync(new URL("../cloudflare/worker-entry.mjs", import.meta.url), "utf8");
  assert.match(
    entry,
    /url\.pathname === R2_BUSINESS_VIEW_PATH && env\?\.R2_BUSINESS_MEDIA_MODE === "isolated"/,
  );
});
