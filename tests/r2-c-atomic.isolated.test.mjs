import assert from "node:assert/strict";
import test from "node:test";
import { Miniflare } from "miniflare";
import { getVerifiedR2Media, putVerifiedR2Media, sha256Media } from "../cloudflare/r2-media-adapter.mjs";
import { stageVerifiedR2Photo } from "../lib/r2-media-business.mjs";

const ownerId = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const a = new Uint8Array([255, 216, 11, 12, 255, 217]);
const b = new Uint8Array([255, 216, 31, 32, 255, 217]);
const config = {
  workers: [{
    config: {
      name: "wp10-c-atomic-r2", type: "worker", compatibilityDate: "2026-09-01",
      manifest: { mainModule: "isolated.mjs", modulesRoot: "/", modules: {
        "isolated.mjs": { type: "esm", contents: "export default { fetch() { return new Response('isolated'); } }" },
      }},
      env: { MEDIA: { type: "r2", name: "wp10-c-atomic-only" }},
    },
    dev: {},
  }],
};

test("actual Miniflare R2 conditional PUT is atomic, never overwrites a competing writer", async () => {
  const runtime = new Miniflare(config);
  try {
    const bucket = await runtime.getR2Bucket("MEDIA", "wp10-c-atomic-r2");
    const key = ownerId + "/records/concurrent-original.jpg";
    const opts = (data) => ({ key, ownerId, data, contentType: "image/jpeg" });
    const pair = await Promise.allSettled([
      putVerifiedR2Media(bucket, opts(a)),
      putVerifiedR2Media(bucket, opts(b)),
    ]);
    assert.equal(pair.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(pair.filter((x) => x.status === "rejected").length, 1);
    const winner = pair[0].status === "fulfilled" ? a : b;
    const loser = pair[0].status === "fulfilled" ? b : a;
    assert.deepEqual(await getVerifiedR2Media(bucket, {
      key, ownerId, size: winner.length, sha256: await sha256Media(winner),
    }), winner);
    await assert.rejects(
      putVerifiedR2Media(bucket, opts(loser)), /r2_media_integrity_mismatch/,
    );
    assert.equal((await bucket.list()).objects.length, 1);

    const another = ownerId + "/records/concurrent-thumbnail.jpg";
    const identical = await Promise.all([
      putVerifiedR2Media(bucket, { ...opts(a), key: another }),
      putVerifiedR2Media(bucket, { ...opts(a), key: another }),
    ]);
    assert.equal(identical.filter(x => x.alreadyExisted === true).length, 1);
    assert.deepEqual(await getVerifiedR2Media(bucket, {
      key: another, ownerId, size: a.length, sha256: await sha256Media(a),
    }), a);

    const mixed = ownerId + "/records/cd-conflict.jpg";
    const cross = await Promise.allSettled([
      stageVerifiedR2Photo({bucket, ownerId, path: mixed,
        sourceBytes: a, contentType: "image/jpeg", expectedBytes: a.length,
        expectedSha256: await sha256Media(a)}),
      putVerifiedR2Media(bucket, { ...opts(b), key: mixed }),
    ]);
    assert.equal(cross.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(cross.filter(x => x.status === "rejected").length, 1);
    const final = await bucket.get(mixed);
    const actual = new Uint8Array(await final.arrayBuffer());
    const crossWinner = cross[0].status === "fulfilled" ? a : b;
    assert.deepEqual(actual, crossWinner);
    assert.equal((await bucket.list()).objects.length, 3);
  } finally {
    await runtime.dispose();
  }
});
