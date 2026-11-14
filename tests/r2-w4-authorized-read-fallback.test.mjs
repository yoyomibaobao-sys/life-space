import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, webcrypto } from "node:crypto";
import { handleR2BusinessUserReadRequest } from "../cloudflare/r2-media-user-gateway.mjs";
import { handleR2BusinessMediaRequest } from "../cloudflare/r2-media-business.mjs";
import { handleR2MediaStageBytesRequest } from "../cloudflare/r2-media-stage-bytes.mjs";
import { createR2InternalReadHeaders, verifyR2InternalReadRequest,
  R2_BUSINESS_INTERNAL_READ_PATH } from "../lib/r2-media-read-service-auth.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const A = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const B = "1b56bb48-f090-4db5-b738-d09031c58cce";
const MEDIA = "867387ba-eb8a-4233-860b-86531533fd56";
const RECORD = "b5df6d9d-0c9e-4f8e-ad5e-c842f7ae57a3";
const ARCHIVE = "2457a9be-1533-4686-b8c8-775513590501";
const SECRET = "r2-media-internal-read-signing-secret-123456";
const FULL = A + "/original.jpg";
const THUMB = A + "/thumbnail.jpg";
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const SHA = createHash("sha256").update(BYTES).digest("hex");
const url = (variant = "full") =>
  "https://site.qa.example/api/media/record-image?id=" + MEDIA + "&variant=" + variant;
const blob = () => new Blob([BYTES], { type: "image/jpeg" });

function setup(options = {}) {
  const state = { public: Boolean(options.isPublic), trashed: false,
    ownerAllowed: options.ownerReadAllowed !== false,
    legacyCalls: [], mediaCalls: [], lookups: 0, ownerChecks: 0 };
  const rows = {
    media: () => ({ id: MEDIA, user_id: A, record_id: RECORD, type: "image",
      trashed_at: state.trashed ? "2026-11-13" : null,
      storage_path: options.legacyOnly ? null : FULL,
      thumb_path: options.legacyOnly ? null : THUMB,
      url: (options.legacyForeignOrigin ? "https://foreign.supabase.co" : "https://qa.supabase.co") +
        "/storage/v1/object/public/media/" + FULL,
      thumb_url: "https://qa.supabase.co/storage/v1/object/public/media/" + THUMB,
      size_bytes: 8 }),
    records: () => ({ id: RECORD, user_id: A, archive_id: ARCHIVE,
      visibility: state.public ? "public" : "private", trashed_at: null }),
    archives: () => ({ id: ARCHIVE, user_id: A, is_public: state.public, trashed_at: null }),
  };
  const admin = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          state.lookups++;
          return { data: rows[table]?.() || null, error: null };
        },
      };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "media");
        return {
          async download(path) {
            state.legacyCalls.push(path);
            return options.storageUnavailable
              ? { data: null, error: new Error("storage_unavailable") }
              : { data: options.legacySvg ? new Blob(["<svg/>"], { type: "image/svg+xml" }) : blob(), error: null };
          },
        };
      },
    },
  };
  const bucket = {
    async get(key) {
      state.mediaCalls.push(key);
      if (options.r2Unavailable) throw new Error("r2 unavailable");
      if (options.r2Missing) return null;
      return {
        size: BYTES.byteLength,
        httpMetadata: { contentType: "image/jpeg" },
        customMetadata: { sha256: options.invalidSha ? "0".repeat(64) : SHA },
        async arrayBuffer() { return BYTES.buffer; },
      };
    },
  };
  const serviceEnv = { R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket,
    R2_MEDIA_SERVICE_AUTH_SECRET: SECRET };
  const env = {
    R2_BUSINESS_MEDIA_MODE: "isolated", R2_MEDIA_READ_ENABLED: "true",
    R2_MEDIA_SERVICE_AUTH_SECRET: SECRET,
    SUPABASE_URL: "https://qa.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public_test_key",
    SUPABASE_SERVICE_ROLE_KEY: "server_only_test_key",
    R2_BUSINESS_MEDIA_SERVICE: {
      async fetch(request) {
        if (options.afterFetch) options.afterFetch(state);
        if (options.serviceStatus) return new Response(null, { status: options.serviceStatus });
        return handleR2MediaStageBytesRequest(request, serviceEnv);
      },
    },
  };
  const dependencies = {
    createUserClient: (request) => ({
      accessToken: null, cookieWrites: [],
      supabase: {
        auth: { async getUser() {
          const id = state.viewerOverride !== undefined ? state.viewerOverride :
            request.headers.get("x-test-viewer") || null;
          return { data: { user: id ? { id } : null }, error: null };
        } },
        async rpc(name, args) {
          assert.equal(name, "can_access_record");
          assert.deepEqual(args, { p_record_id: RECORD });
          state.ownerChecks++;
          const viewer = state.viewerOverride !== undefined ? state.viewerOverride :
            request.headers.get("x-test-viewer") || null;
          return { data: !state.trashed && state.ownerAllowed &&
            (viewer === A || state.public), error: null };
        },
      },
    }),
    createAdminClient: () => admin,
  };
  const get = (viewer, variant = "full", headers = {}) => {
    const requestHeaders = new Headers(headers);
    if (viewer) requestHeaders.set("x-test-viewer", viewer);
    return handleR2BusinessUserReadRequest(new Request(url(variant), {
      headers: requestHeaders,
    }), env, dependencies);
  };
  return { state, get, env, bucket, serviceEnv };
}

test("R2 private owner full and thumb get verified media without Storage fallback or cache", async () => {
  const { state, get } = setup();
  for (const variant of ["full", "thumb"]) {
    const res = await get(A, variant);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(res.headers.get("cdn-cache-control"), "no-store");
    assert.equal(res.headers.get("vary"), "Cookie, Authorization");
    assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), BYTES);
  }
  assert.deepEqual(state.mediaCalls, [FULL, THUMB]);
  assert.deepEqual(state.legacyCalls, []);
});

test("private media denies B and anonymous before any R2 or Storage read", async () => {
  const { get, state } = setup();
  assert.equal((await get(B)).status, 404);
  assert.equal((await get(null)).status, 404);
  assert.equal(state.mediaCalls.length, 0);
  assert.equal(state.legacyCalls.length, 0);
});

test("public record can be read anonymously, but existing link revokes when made private or trashed", async () => {
  const { get, state } = setup({ isPublic: true });
  assert.equal((await get(null)).status, 200);
  state.public = false;
  assert.equal((await get(null)).status, 404);
  state.trashed = true;
  assert.equal((await get(A)).status, 404);
});

test("legacy Storage fallback works for missing R2 full and thumbnail, preserving Owner check", async () => {
  const { get, state } = setup({ r2Missing: true });
  assert.equal((await get(A, "full")).status, 200);
  assert.equal((await get(A, "thumb")).status, 200);
  assert.deepEqual(state.legacyCalls, [FULL, THUMB]);
  assert.equal((await get(B)).status, 404);
  assert.deepEqual(state.legacyCalls, [FULL, THUMB]);
});

test("transient R2 failure falls back to legacy source, but Storage failure returns no image", async () => {
  const good = setup({ r2Unavailable: true });
  assert.equal((await good.get(A)).status, 200);
  assert.deepEqual(good.state.legacyCalls, [FULL]);
  const gone = setup({ r2Unavailable: true, storageUnavailable: true });
  assert.equal((await gone.get(A)).status, 404);
});

test("R2 integrity failure and service-auth rejection fail closed, with zero fallback", async () => {
  const badHash = setup({ invalidSha: true });
  assert.equal((await badHash.get(A)).status, 503);
  assert.deepEqual(badHash.state.legacyCalls, []);
  const badAuth = setup({ serviceStatus: 401 });
  assert.equal((await badAuth.get(A)).status, 503);
  assert.deepEqual(badAuth.state.legacyCalls, []);
});

test("authorization is rechecked after asynchronous media read", async () => {
  const { get } = setup({ isPublic: true, afterFetch(state) { state.public = false; } });
  assert.equal((await get(null)).status, 404);
});

test("site route disabled by default, invalid requests/cross-site requests rejected", async () => {
  const { get, env } = setup();
  env.R2_MEDIA_READ_ENABLED = "false";
  assert.equal((await get(A)).status, 404);
  env.R2_MEDIA_READ_ENABLED = "true";
  assert.equal((await get(A, "unknown")).status, 400);
  assert.equal((await get(A, "full", { "sec-fetch-site": "cross-site" })).status, 403);
});

test("internal HMAC expires after 60 seconds, cannot be tampered with or used as direct URL", async () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = await createR2InternalReadHeaders({ secret: SECRET, ownerId: A, path: FULL,
    timestamp, nonce: "a".repeat(32) });
  const valid = new Request("https://media.internal" + R2_BUSINESS_INTERNAL_READ_PATH,
    { headers });
  assert.deepEqual(await verifyR2InternalReadRequest(valid, SECRET, timestamp), { ownerId: A, path: FULL });
  assert.equal(await verifyR2InternalReadRequest(valid, SECRET, timestamp + 61), null);
  assert.equal(await verifyR2InternalReadRequest(valid, "x".repeat(40), timestamp), null);
  const altered = new Headers(headers);
  altered.set("x-ls-media-path", encodeURIComponent(A + "/foreign.jpg"));
  const forged = new Request(valid.url, { headers: altered });
  assert.equal(await verifyR2InternalReadRequest(forged, SECRET, timestamp), null);
  const direct = await handleR2MediaStageBytesRequest(new Request(valid.url),
    { R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: { get() { throw new Error("must not read"); } },
      R2_MEDIA_SERVICE_AUTH_SECRET: SECRET });
  assert.equal(direct.status, 401);
});

test("legacy URL-only rows use configured Supabase origin and owner-scoped paths", async () => {
  const legacy = setup({ legacyOnly: true, r2Missing: true });
  assert.equal((await legacy.get(A, "full")).status, 200);
  assert.equal((await legacy.get(A, "thumb")).status, 200);
  assert.deepEqual(legacy.state.legacyCalls, [FULL, THUMB]);
  const foreign = setup({ legacyOnly: true, legacyForeignOrigin: true, r2Missing: true });
  assert.equal((await foreign.get(A)).status, 404);
  assert.deepEqual(foreign.state.legacyCalls, []);
  assert.deepEqual(foreign.state.mediaCalls, []);
});

test("untrusted legacy content type is not rendered as an image", async () => {
  const { get, state } = setup({ r2Missing: true, legacySvg: true });
  assert.equal((await get(A)).status, 404);
  assert.deepEqual(state.legacyCalls, [FULL]);
});

test("owner session revoked during internal R2 read cannot access already-fetched bytes", async () => {
  const { get } = setup({ afterFetch(state) { state.viewerOverride = null; } });
  assert.equal((await get(A)).status, 403);
});

test("record access RPC fails closed before fetch and after owner access changes", async () => {
  const unavailable = setup({ ownerReadAllowed: false });
  assert.equal((await unavailable.get(A)).status, 403);
  assert.deepEqual(unavailable.state.mediaCalls, []);
  const changed = setup({ afterFetch(state) { state.ownerAllowed = false; } });
  assert.equal((await changed.get(A)).status, 403);
  assert.equal(changed.state.ownerChecks, 2);
});
