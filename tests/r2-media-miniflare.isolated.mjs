import assert from "node:assert/strict";
import test from "node:test";
import { Miniflare } from "miniflare";
import { sha256Hex, stageVerifiedR2Photo, readVerifiedR2Photo, deleteUnreferencedR2Copy } from "../lib/r2-media-business.mjs";

/** Local R2 runtime only. No Cloudflare account, network, production bucket or DB. */
test("real Miniflare R2 binding preserves SHA, immutable replay, thumbnail and deletion guards", async () => {
  const runtime = new Miniflare({
    workers: [{
      config: {
        name: "isolated-media", type: "worker", compatibilityDate: "2026-09-01",
        manifest: { mainModule: "isolated.mjs", modulesRoot: "/", modules: {
          "isolated.mjs": { type: "esm", contents: "export default { fetch() { return new Response('isolated'); } };" },
        } },
        env: { BUSINESS_MEDIA: { type: "r2", name: "isolated-media-r2" } },
      },
      dev: {},
    }],
  });
  try {
    const bucket = await runtime.getR2Bucket("BUSINESS_MEDIA", "isolated-media");
    const ownerId = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
    const full = ownerId + "/record/photo.jpg";
    const thumb = ownerId + "/record/thumbs/photo.jpg";
    const bytes = new TextEncoder().encode("local-r2-image-original");
    const thumbBytes = new TextEncoder().encode("local-r2-image-thumb");
    const sha256 = await sha256Hex(bytes), thumbSha256 = await sha256Hex(thumbBytes);
    const first = await stageVerifiedR2Photo({
      bucket, ownerId, path: full, sourceBytes: bytes,
      contentType: "image/jpeg", expectedBytes: bytes.length, expectedSha256: sha256,
    });
    assert.equal(first.status, "copied_verified");
    const replay = await stageVerifiedR2Photo({
      bucket, ownerId, path: full, sourceBytes: bytes,
      contentType: "image/jpeg", expectedBytes: bytes.length, expectedSha256: sha256,
    });
    assert.equal(replay.status, "already_verified");
    await stageVerifiedR2Photo({
      bucket, ownerId, path: thumb, sourceBytes: thumbBytes,
      contentType: "image/jpeg", expectedBytes: thumbBytes.length, expectedSha256: thumbSha256,
    });
    assert.deepEqual((await readVerifiedR2Photo({
      bucket, ownerId, path: full, expectedBytes: bytes.length, expectedSha256: sha256,
    })).bytes, bytes);
    assert.deepEqual((await readVerifiedR2Photo({
      bucket, ownerId, path: thumb, expectedBytes: thumbBytes.length, expectedSha256: thumbSha256,
    })).bytes, thumbBytes);
    const retained = await deleteUnreferencedR2Copy({
      bucket, ownerId, path: full, deletionJobConfirmed: true, hasCurrentReferences: async () => true,
    });
    assert.equal(retained.status, "retained_shared");
    assert.ok(await bucket.head(first.key));
    const done = await deleteUnreferencedR2Copy({
      bucket, ownerId, path: full, deletionJobConfirmed: true, hasCurrentReferences: async () => false,
    });
    assert.equal(done.status, "r2_copy_deleted");
    assert.equal(await bucket.head(first.key), null);
    assert.ok(await bucket.head(thumb));
    assert.equal((await bucket.list()).objects.length, 1);
  } finally {
    await runtime.dispose();
  }
});
