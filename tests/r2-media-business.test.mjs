import assert from "node:assert/strict";
import test from "node:test";
import {
  businessMediaPath, collectR2MediaCandidates, sha256Hex, stageVerifiedR2Photo,
  readVerifiedR2Photo, createR2ReadTicket, verifyR2ReadTicket,
  deleteUnreferencedR2Copy,
} from "../lib/r2-media-business.mjs";
import {
  R2_BUSINESS_STAGE_PATH, R2_BUSINESS_READ_PATH, handleR2BusinessMediaRequest,
} from "../cloudflare/r2-media-business.mjs";

const owner = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const other = "867387ba-eb8a-4233-860b-86531533fd56";
const path = owner + "/record-1/photo.jpg";
const thumbPath = owner + "/record-1/thumbs/photo-sm.jpg";
const secret = "test-migration-secret-0123456789-0123456789";
const signingSecret = "test-signing-secret-0123456789-0123456789";
const photo = new TextEncoder().encode("fixture image jpeg bytes \0 1 2 3");
const thumb = new TextEncoder().encode("thumb bytes image/jpeg");

function fakeR2() {
  const objects = new Map();
  const actions = { writes: 0, deletes: 0 };
  return {
    objects, actions,
    async head(key) {
      const object = objects.get(key);
      return object ? { size: object.bytes.byteLength } : null;
    },
    async get(key) {
      const object = objects.get(key);
      return object ? {
        size: object.bytes.byteLength,
        httpMetadata: object.httpMetadata,
        async arrayBuffer() { return object.bytes.slice().buffer; },
      } : null;
    },
    async put(key, bytes, options) {
      if (options.onlyIf?.etagDoesNotMatch !== "*") throw Error("conditional_immutability_required");
      if (objects.has(key)) return null;
      objects.set(key, {
        bytes: Uint8Array.from(bytes),
        httpMetadata: options.httpMetadata,
        customMetadata: options.customMetadata,
      });
      actions.writes++;
      return { size: bytes.byteLength };
    },
    async delete(key) {
      objects.delete(key);
      actions.deletes++;
    },
  };
}

test("business manifest deduplicates shared record/cover/experience photos and separates thumbnails", () => {
  const refs = {
    media: [{ id: "m1", user_id: owner, storage_path: path, thumb_path: thumbPath }],
    records: [{ id: "r1", user_id: owner, primary_image_path: path, primary_thumb_path: thumbPath }],
    archives: [{ id: "a1", user_id: owner, cover_image_path: path, cover_thumb_path: thumbPath }],
    market_posts: [{ id: "p1", user_id: owner, cover_image_path: path, cover_thumb_path: thumbPath }],
    market_media: [{ id: "mm1", user_id: owner, path, thumb_path: thumbPath }],
    experience_cards: [{ id: "c1", user_id: owner, cover_media_id: "m1" }],
    profiles: [{ id: owner, avatar_url: "https://other.invalid/avatars/photo.jpg" }],
  };
  const manifest = collectR2MediaCandidates(refs, "https://supabase.invalid");
  assert.equal(manifest.entries.length, 2);
  assert.equal(manifest.unresolved.length, 0);
  assert.equal(manifest.entries.find((row) => row.path === path).references.length, 5);
  assert.equal(manifest.entries.find((row) => row.path === thumbPath).references.length, 5);
  assert.ok(manifest.entries.every((row) => row.key.startsWith(owner + "/")));
});

test("manifest rejects cross-owner, traversal and external URLs without carrying source names", () => {
  assert.equal(businessMediaPath(other + "/foo.jpg", owner), null);
  assert.equal(businessMediaPath(owner + "/../foo.jpg", owner), null);
  assert.equal(businessMediaPath(owner + "/file\\photo.jpg", owner), null);
  assert.equal(businessMediaPath(owner + "/file?key=1", owner), null);
  const manifest = collectR2MediaCandidates({
    media: [
      { id: "bad", user_id: owner, storage_path: other + "/private.jpg" },
      { id: "legacy", user_id: owner, url: "https://external.invalid/storage/v1/object/public/media/" + path },
      { id: "good", user_id: owner, url: "https://supabase.invalid/storage/v1/object/public/media/" + path },
    ],
  }, "https://supabase.invalid");
  assert.equal(manifest.entries.length, 1);
  assert.equal(manifest.unresolved.length, 2);
});

test("R2 stage verifies exact bytes/SHA, then repeat resumes without extra write", async () => {
  const bucket = fakeR2(), sha256 = await sha256Hex(photo);
  const params = { bucket, ownerId: owner, path, sourceBytes: photo, contentType: "image/jpeg", expectedBytes: photo.byteLength, expectedSha256: sha256 };
  const first = await stageVerifiedR2Photo(params);
  assert.equal(first.status, "copied_verified");
  assert.equal(bucket.actions.writes, 1);
  const second = await stageVerifiedR2Photo(params);
  assert.equal(second.status, "already_verified");
  assert.equal(bucket.actions.writes, 1);
  const result = await readVerifiedR2Photo({ bucket, ownerId: owner, path, expectedBytes: photo.length, expectedSha256: sha256 });
  assert.deepEqual(result.bytes, photo);
  assert.equal(result.contentType, "image/jpeg");
});

test("separate thumbnail is byte-verified; a bad source never mutates R2", async () => {
  const bucket = fakeR2();
  const thumbSha = await sha256Hex(thumb), sourceSha = await sha256Hex(photo);
  const result = await stageVerifiedR2Photo({ bucket, ownerId: owner, path: thumbPath, sourceBytes: thumb, contentType: "image/jpeg", expectedBytes: thumb.length, expectedSha256: thumbSha });
  assert.equal(result.bytes, thumb.length);
  await assert.rejects(stageVerifiedR2Photo({ bucket, ownerId: owner, path, sourceBytes: photo, contentType: "image/jpeg", expectedBytes: photo.length, expectedSha256: thumbSha }), /source_sha256/);
  await assert.rejects(stageVerifiedR2Photo({ bucket, ownerId: owner, path, sourceBytes: photo, contentType: "image/jpeg", expectedBytes: thumb.length, expectedSha256: sourceSha }), /source_sha256/);
  assert.equal(bucket.actions.writes, 1);
});

test("conflicting R2 destination fails closed and is not overwritten", async () => {
  const bucket = fakeR2(), sha256 = await sha256Hex(photo);
  bucket.objects.set(path, { bytes: new TextEncoder().encode("intruder"), httpMetadata: { contentType: "image/jpeg" } });
  await assert.rejects(stageVerifiedR2Photo({ bucket, ownerId: owner, path, sourceBytes: photo, contentType: "image/jpeg", expectedBytes: photo.length, expectedSha256: sha256 }), /r2_(sha256|size)/);
  assert.equal(bucket.actions.writes, 0);
});

test("same source SHA with conflicting R2 MIME metadata is not accepted as verified", async () => {
  const bucket = fakeR2(), sha256 = await sha256Hex(photo);
  bucket.objects.set(path, { bytes: Uint8Array.from(photo), httpMetadata: { contentType: "text/plain" } });
  await assert.rejects(stageVerifiedR2Photo({
    bucket, ownerId: owner, path, sourceBytes: photo, contentType: "image/jpeg",
    expectedBytes: photo.length, expectedSha256: sha256,
  }), /r2_content_type_mismatch/);
  assert.equal(bucket.actions.writes, 0);
});

test("short HMAC read ticket checks expiry, SHA/bytes, tampering, and owner", async () => {
  const sha256 = await sha256Hex(photo);
  const base = { secret: signingSecret, ownerId: owner, path, expectedBytes: photo.length, expectedSha256: sha256, now: 10_000_000, ttlSeconds: 45 };
  const ticket = await createR2ReadTicket(base);
  assert.equal((await verifyR2ReadTicket(ticket, signingSecret, 10_020_000)).path, path);
  assert.equal(await verifyR2ReadTicket(ticket, signingSecret, 10_050_000), null);
  assert.equal(await verifyR2ReadTicket(ticket.slice(0, -3) + "xxx", signingSecret, 10_020_000), null);
  assert.equal(await verifyR2ReadTicket(ticket, secret, 10_020_000), null);
  await assert.rejects(createR2ReadTicket({ ...base, ownerId: other }), /unsafe_or_foreign/);
  await assert.rejects(createR2ReadTicket({ ...base, ttlSeconds: 3601 }), /invalid_ticket_ttl/);
});

test("safe R2-only delete retains shared image until last trusted reference is absent", async () => {
  const bucket = fakeR2(), sha256 = await sha256Hex(photo);
  await stageVerifiedR2Photo({ bucket, ownerId: owner, path, sourceBytes: photo, contentType: "image/jpeg", expectedBytes: photo.length, expectedSha256: sha256 });
  await assert.rejects(deleteUnreferencedR2Copy({ bucket, ownerId: owner, path, hasCurrentReferences: async () => false }), /deletion_authority_missing/);
  const retained = await deleteUnreferencedR2Copy({ bucket, ownerId: owner, path, deletionJobConfirmed: true, hasCurrentReferences: async () => true });
  assert.equal(retained.status, "retained_shared");
  assert.equal(bucket.actions.deletes, 0);
  const deleted = await deleteUnreferencedR2Copy({ bucket, ownerId: owner, path, deletionJobConfirmed: true, hasCurrentReferences: async () => false });
  assert.equal(deleted.status, "r2_copy_deleted");
  assert.equal(bucket.actions.deletes, 1);
  assert.equal(bucket.objects.size, 0);
});

test("Worker adapter stays disabled unless C activates isolated media binding", async () => {
  const response = await handleR2BusinessMediaRequest(new Request("https://qa.invalid" + R2_BUSINESS_STAGE_PATH, { method: "POST" }), {});
  assert.equal(response.status, 404);
});

test("isolated stage rejects anonymous caller and invalid input before reading Supabase", async () => {
  const bucket = fakeR2();
  const env = { R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket, R2_MEDIA_MIGRATION_SECRET: secret };
  const response = await handleR2BusinessMediaRequest(new Request("https://qa.invalid" + R2_BUSINESS_STAGE_PATH, { method: "POST" }), env, () => { throw Error("should not fetch"); });
  assert.equal(response.status, 401);
  const invalid = await handleR2BusinessMediaRequest(new Request("https://qa.invalid" + R2_BUSINESS_STAGE_PATH, {
    method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify({ path: other + "/private.jpg", ownerId: owner, bytes: 100, sha256: "a".repeat(64) }),
  }), env, () => { throw Error("should not fetch"); });
  assert.equal(invalid.status, 400);
  assert.equal(bucket.actions.writes, 0);
});

test("isolated Worker stage fetches old Storage, copies to R2 and serves signed bytes", async () => {
  const bucket = fakeR2(), sha256 = await sha256Hex(photo);
  const env = { R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket,
    R2_MEDIA_MIGRATION_SECRET: secret, R2_MEDIA_SIGNING_SECRET: signingSecret,
    SUPABASE_URL: "https://supabase.invalid/", SUPABASE_SERVICE_ROLE_KEY: "test-service-role" };
  let calls = 0;
  const fakeSource = async (url, options) => {
    calls++;
    assert.equal(options.headers.authorization, "Bearer test-service-role");
    if (new URL(url).pathname === "/rest/v1/rpc/get_referenced_storage_paths") {
      assert.deepEqual(JSON.parse(options.body), { p_bucket_id: "media", p_object_paths: [path] });
      return Response.json([{ object_path: path }]);
    }
    assert.equal(new URL(url).pathname, "/storage/v1/object/authenticated/media/" + path);
    return new Response(photo, { headers: { "Content-Type": "image/jpeg", "Content-Length": String(photo.byteLength) } });
  };
  const makeStage = () => new Request("https://qa.invalid" + R2_BUSINESS_STAGE_PATH, {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify({ ownerId: owner, path, bytes: photo.byteLength, sha256 }),
  });
  const stage = await handleR2BusinessMediaRequest(makeStage(), env, fakeSource);
  assert.equal(stage.status, 200);
  const first = await stage.json();
  assert.equal(first.status, "copied_verified");
  assert.equal(first.bytes, photo.byteLength);
  assert.equal(bucket.objects.size, 1);
  const second = await handleR2BusinessMediaRequest(makeStage(), env, fakeSource);
  assert.equal((await second.json()).status, "already_verified");
  assert.equal(bucket.actions.writes, 1);
  assert.equal(calls, 4);
  const read = await handleR2BusinessMediaRequest(new Request("https://qa.invalid" + first.readPath), env);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.deepEqual(new Uint8Array(await read.arrayBuffer()), photo);
  const unauthorizedRead = await handleR2BusinessMediaRequest(new Request("https://qa.invalid" + R2_BUSINESS_READ_PATH + "?ticket=bad"), env);
  assert.equal(unauthorizedRead.status, 403);
});

test("Worker refuses copying unreferenced Storage media even with operator token", async () => {
  const bucket = fakeR2(), sha256 = await sha256Hex(photo);
  const env = { R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket,
    R2_MEDIA_MIGRATION_SECRET: secret, R2_MEDIA_SIGNING_SECRET: signingSecret,
    SUPABASE_URL: "https://supabase.invalid/", SUPABASE_SERVICE_ROLE_KEY: "test-service-role" };
  const request = new Request("https://qa.invalid" + R2_BUSINESS_STAGE_PATH, {
    method: "POST", headers: { Authorization: "Bearer " + secret },
    body: JSON.stringify({ ownerId: owner, path, bytes: photo.length, sha256 }),
  });
  const result = await handleR2BusinessMediaRequest(request, env, async () => Response.json([]));
  assert.equal(result.status, 409);
  assert.equal(bucket.objects.size, 0);
});

test("signing misconfiguration prevents any R2 mirror mutation", async () => {
  const bucket = fakeR2(), sha256 = await sha256Hex(photo);
  const env = { R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket,
    R2_MEDIA_MIGRATION_SECRET: secret,
    SUPABASE_URL: "https://supabase.invalid/", SUPABASE_SERVICE_ROLE_KEY: "test-service-role" };
  const request = new Request("https://qa.invalid" + R2_BUSINESS_STAGE_PATH, {
    method: "POST", headers: { Authorization: "Bearer " + secret },
    body: JSON.stringify({ ownerId: owner, path, bytes: photo.length, sha256 }),
  });
  const response = await handleR2BusinessMediaRequest(request, env, async () => { throw Error("unexpected source fetch"); });
  assert.equal(response.status, 503);
  assert.equal(bucket.objects.size, 0);
});

test("missing Supabase source can resume later without writing an incomplete R2 object", async () => {
  const bucket = fakeR2(), sha256 = await sha256Hex(photo);
  const env = { R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket,
    R2_MEDIA_MIGRATION_SECRET: secret, R2_MEDIA_SIGNING_SECRET: signingSecret,
    SUPABASE_URL: "https://supabase.invalid/", SUPABASE_SERVICE_ROLE_KEY: "test-service-role" };
  const request = () => new Request("https://qa.invalid" + R2_BUSINESS_STAGE_PATH, {
    method: "POST", headers: { Authorization: "Bearer " + secret },
    body: JSON.stringify({ ownerId: owner, path, bytes: photo.length, sha256 }),
  });
  const referenceCheck = (url) => new URL(url).pathname.endsWith("get_referenced_storage_paths");
  const missing = await handleR2BusinessMediaRequest(request(), env,
    async (url) => referenceCheck(url) ? Response.json([{ object_path: path }]) : new Response("absent", { status: 404 }));
  assert.equal(missing.status, 502);
  assert.equal(bucket.objects.size, 0);
  const resumed = await handleR2BusinessMediaRequest(request(), env,
    async (url) => referenceCheck(url) ? Response.json([{ object_path: path }]) :
      new Response(photo, { headers: { "Content-Type": "image/jpeg" } }));
  assert.equal(resumed.status, 200);
  assert.equal((await resumed.json()).status, "copied_verified");
  assert.equal(bucket.objects.size, 1);
});

test("source SHA mismatch rejects the whole object without a partial R2 copy", async () => {
  const bucket = fakeR2(), sha256 = await sha256Hex(photo);
  const env = { R2_BUSINESS_MEDIA_MODE: "isolated", R2_BUSINESS_MEDIA: bucket,
    R2_MEDIA_MIGRATION_SECRET: secret, R2_MEDIA_SIGNING_SECRET: signingSecret,
    SUPABASE_URL: "https://supabase.invalid/", SUPABASE_SERVICE_ROLE_KEY: "test-service-role" };
  const req = new Request("https://qa.invalid" + R2_BUSINESS_STAGE_PATH, {
    method: "POST", headers: { Authorization: "Bearer " + secret },
    body: JSON.stringify({ ownerId: owner, path, bytes: photo.length, sha256 }),
  });
  const result = await handleR2BusinessMediaRequest(req, env, async (url) =>
    new URL(url).pathname.endsWith("get_referenced_storage_paths")
      ? Response.json([{ object_path: path }])
      : new Response(new Uint8Array(photo.length), { headers: { "Content-Type": "image/jpeg" } }),
  );
  assert.equal(result.status, 409);
  assert.equal(bucket.objects.size, 0);
});

test("migration reader rejects corrupted bytes, and unverified mirror is never served", async () => {
  const bucket = fakeR2(), sha256 = await sha256Hex(photo);
  await stageVerifiedR2Photo({ bucket, ownerId: owner, path, sourceBytes: photo, contentType: "image/jpeg", expectedBytes: photo.length, expectedSha256: sha256 });
  bucket.objects.get(path).bytes[0] ^= 1;
  await assert.rejects(readVerifiedR2Photo({ bucket, ownerId: owner, path, expectedBytes: photo.length, expectedSha256: sha256 }), /r2_sha256/);
});
