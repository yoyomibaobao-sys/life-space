import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { Miniflare } from "miniflare";
import {
  r2BusinessKey, stageVerifiedR2Photo, sha256Hex,
  readVerifiedR2Photo, deleteUnreferencedR2Copy,
} from "../lib/r2-media-business.mjs";

const C_SOURCE = process.env.LIFESPACE_C_R2_ADAPTER_SOURCE;
const ownerId = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const path = ownerId + "/records/original.jpg";
const thumbPath = ownerId + "/records/thumbs/thumbnail.jpg";
const image = new Uint8Array([255, 216, 1, 0, 2, 3, 255, 217]);
const thumb = new Uint8Array([255, 216, 11, 12, 255, 217]);

test("C/D cross-worktree adapter contract with the real local R2 binding", { skip: !C_SOURCE }, async () => {
  // The C-group file is imported from its own untouched worktree; no copy,
  // no Git mutation, no worker deployment, and no Cloudflare remote account.
  const C = await import(pathToFileURL(C_SOURCE).href);
  const runtime = new Miniflare({
    workers: [{
      config: {
        name: "lifespace-cd-isolated", type: "worker", compatibilityDate: "2026-09-01",
        manifest: { mainModule: "isolated.mjs", modulesRoot: "/", modules: {
          "isolated.mjs": { type: "esm", contents: "export default { fetch() { return new Response('isolated'); } };" },
        } },
        env: { R2_BUSINESS_MEDIA: { type: "r2", name: "lifespace-cd-only" } },
      },
      dev: {},
    }],
  });
  try {
    const bucket = await runtime.getR2Bucket("R2_BUSINESS_MEDIA", "lifespace-cd-isolated");
    const originalSha = await sha256Hex(image);
    const thumbnailSha = await sha256Hex(thumb);
    const key = r2BusinessKey(path, ownerId);
    assert.equal(key, path, "D must use C's owner-relative key, not a second namespace prefix");
    assert.equal(C.validateMediaR2Key(key, ownerId), key);
    const result = await stageVerifiedR2Photo({
      bucket, ownerId, path, sourceBytes: image,
      contentType: "image/jpeg", expectedBytes: image.length, expectedSha256: originalSha,
    });
    assert.equal(result.key, key);
    const cRead = await C.getVerifiedR2Media(bucket, {
      key, ownerId, size: image.length, sha256: originalSha,
    });
    assert.deepEqual(new Uint8Array(cRead), image);

    // Thumbnail also uses the same raw key convention.
    const cThumb = await C.putVerifiedR2Media(bucket, {
      key: thumbPath, ownerId, data: thumb, contentType: "image/jpeg",
    });
    assert.equal(cThumb.sha256, thumbnailSha);
    assert.deepEqual((await readVerifiedR2Photo({
      bucket, ownerId, path: thumbPath, expectedBytes: thumb.length, expectedSha256: thumbnailSha,
    })).bytes, thumb);

    const resumed = await stageVerifiedR2Photo({
      bucket, ownerId, path, sourceBytes: image,
      contentType: "image/jpeg", expectedBytes: image.length, expectedSha256: originalSha,
    });
    assert.equal(resumed.status, "already_verified");

    // Same base image used by multiple business records: refusal to delete
    // while references remain, including a shared market/experience cover.
    const retained = await deleteUnreferencedR2Copy({
      bucket, ownerId, path, deletionJobConfirmed: true,
      hasCurrentReferences: async () => true,
    });
    assert.equal(retained.status, "retained_shared");
    await assert.rejects(C.removeVerifiedR2Media(bucket, {
      key, ownerId, size: image.length, sha256: originalSha,
      canDelete: async () => false,
    }), /still_referenced/);
    assert.ok(await bucket.head(key));

    const deleted = await C.removeVerifiedR2Media(bucket, {
      key, ownerId, size: image.length, sha256: originalSha,
      canDelete: async () => true,
    });
    assert.equal(deleted.deleted, true);
    assert.equal(await bucket.head(key), null);
    assert.ok(await bucket.head(thumbPath));
    assert.equal((await bucket.list()).objects.length, 1);
  } finally {
    await runtime.dispose();
  }
});
