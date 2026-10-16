import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transformSync } from "esbuild";

const src = readFileSync(new URL("../lib/media-urls.ts", import.meta.url), "utf8");
const transpiled = transformSync(src, { loader: "ts", format: "esm" }).code;
const { resolveMediaDisplayPairs, resolveMediaDisplayUrl } = await import(
  "data:text/javascript;base64," + Buffer.from(transpiled).toString("base64")
);

const owner = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const recordId = "b5df6d9d-0c9e-4f8e-ad5e-c842f7ae57a3";
const media = {
  id: "867387ba-eb8a-4233-860b-86531533fd56",
  user_id: owner, record_id: recordId, type: "image",
  storage_path: owner + "/main.jpg", thumb_path: owner + "/thumb.jpg",
};
const cover = { storage_path: owner + "/cover.jpg", thumb_path: owner + "/cover-thumb.jpg" };

function signer() {
  const called = [];
  const storage = {
    from(bucket) {
      assert.equal(bucket, "media");
      return {
        async createSignedUrl(path) {
          called.push([path]);
          return { data: { signedUrl: "signed:" + path }, error: null };
        },
        async createSignedUrls(paths) {
          called.push(paths);
          return { data: paths.map((path) => ({ path, signedUrl: "signed:" + path })), error: null };
        },
      };
    },
  };
  return { storage, called };
}

test("signed-media baseline remains identical with proxy flag absent", async () => {
  const original = process.env.NEXT_PUBLIC_TRIAL_MEDIA_PROXY_ENABLED;
  delete process.env.NEXT_PUBLIC_TRIAL_MEDIA_PROXY_ENABLED;
  try {
    const mock = signer();
    const [row] = await resolveMediaDisplayPairs(mock, [media]);
    assert.equal(row.display_url, "signed:" + media.storage_path);
    assert.equal(row.display_thumb_url, "signed:" + media.thumb_path);
    assert.equal(mock.called.length, 1);
    assert.deepEqual(mock.called[0], [media.storage_path, media.thumb_path]);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_TRIAL_MEDIA_PROXY_ENABLED;
    else process.env.NEXT_PUBLIC_TRIAL_MEDIA_PROXY_ENABLED = original;
  }
});

test("opt-in only proxies verifiable record images and never signs those paths", async () => {
  const original = process.env.NEXT_PUBLIC_TRIAL_MEDIA_PROXY_ENABLED;
  process.env.NEXT_PUBLIC_TRIAL_MEDIA_PROXY_ENABLED = "true";
  try {
    const mock = signer();
    const [row, coverRow] = await resolveMediaDisplayPairs(mock, [media, cover]);
    const protectedPath = "/api/media/record-image?id=" + media.id;
    assert.equal(row.display_url, protectedPath + "&variant=full");
    assert.equal(row.display_thumb_url, protectedPath + "&variant=thumb");
    assert.equal(coverRow.display_url, "signed:" + cover.storage_path);
    assert.deepEqual(mock.called, [[cover.storage_path, cover.thumb_path]]);
    const single = await resolveMediaDisplayUrl(mock, media);
    assert.equal(single, row.display_url);
    assert.deepEqual(mock.called, [[cover.storage_path, cover.thumb_path]]);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_TRIAL_MEDIA_PROXY_ENABLED;
    else process.env.NEXT_PUBLIC_TRIAL_MEDIA_PROXY_ENABLED = original;
  }
});
