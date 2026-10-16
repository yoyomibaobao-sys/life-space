import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transformSync } from "esbuild";

const gateSource = readFileSync(new URL("../lib/server/record-media-gate.ts", import.meta.url), "utf8");
const code = transformSync(gateSource, { loader: "ts", format: "esm" }).code;
const { mayServeRecordImage, isOwnerMediaPath } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);

const id = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
const other = "867387ba-eb8a-4233-860b-86531533fd56";
const recordId = "b5df6d9d-0c9e-4f8e-ad5e-c842f7ae57a3";
const archiveId = "d88f94d2-2e8d-4b60-9ce4-4fbb4d0eb928";
const input = {
  media: { id, user_id: id, record_id: recordId, type: "image", trashed_at: null },
  record: { id: recordId, user_id: id, archive_id: archiveId, visibility: "public", trashed_at: null },
  archive: { id: archiveId, user_id: id, is_public: true, trashed_at: null },
  viewerId: null,
  trialOwnerCanRead: true,
};

test("guarded image route enforces both owner and viewer permissions", () => {
  assert.equal(mayServeRecordImage(input), true, "public record permits guest");
  assert.equal(mayServeRecordImage({ ...input, trialOwnerCanRead: false }), false);
  assert.equal(mayServeRecordImage({ ...input, record: { ...input.record, visibility: "private" } }), false);
  assert.equal(mayServeRecordImage({ ...input, archive: { ...input.archive, is_public: false } }), false);
  assert.equal(mayServeRecordImage({ ...input, viewerId: id, archive: { ...input.archive, is_public: false } }), true, "owner can view private");
  assert.equal(mayServeRecordImage({ ...input, media: { ...input.media, user_id: other } }), false);
  assert.equal(mayServeRecordImage({ ...input, record: { ...input.record, user_id: other } }), false);
  assert.equal(mayServeRecordImage({ ...input, archive: { ...input.archive, trashed_at: "2026-10-01" } }), false);
  assert.equal(mayServeRecordImage({ ...input, media: { ...input.media, trashed_at: "2026-10-01" } }), false);
  assert.equal(mayServeRecordImage({ ...input, record: { ...input.record, trashed_at: "2026-10-01" } }), false);
  assert.equal(mayServeRecordImage({ ...input, media: { ...input.media, type: "video" } }), false);
});

test("guarded Storage download denies other-account paths and traversal", () => {
  assert.equal(isOwnerMediaPath(id + "/records/photo.jpg", id), true);
  assert.equal(isOwnerMediaPath(other + "/records/photo.jpg", id), false);
  assert.equal(isOwnerMediaPath(id + "/../other.jpg", id), false);
  assert.equal(isOwnerMediaPath("media/" + id + "/photo.jpg", id), false);
  assert.equal(isOwnerMediaPath("photo.jpg", id), false);
});

test("new record image proxy is opt-in, never caches, and checks entitlement per GET", () => {
  const route = readFileSync(new URL("../app/api/media/record-image/route.ts", import.meta.url), "utf8");
  assert.doesNotThrow(() => transformSync(route, { loader: "ts", format: "esm" }));
  assert.match(route, /TRIAL_MEDIA_PROXY_ENABLED !== "true"/);
  assert.match(route, /private, no-store, max-age=0/);
  assert.match(route, /"CDN-Cache-Control": "no-store"/);
  assert.match(route, /"can_read_trial_cloud_owner"/);
  assert.match(route, /mayServeRecordImage/);
  assert.match(route, /isOwnerMediaPath/);
  assert.match(route, /\.from\("media"\)\.download\(path\)/);
  const download = route.indexOf('.from("media").download(path)');
  const recheck = route.indexOf('data: stillAllowed');
  const response = route.indexOf('return new Response(blob');
  assert.ok(download >= 0 && recheck > download && response > recheck,
    "access is rechecked after the download, before bytes leave the server");
  assert.match(route, /recheckError \|\| stillAllowed !== true/);
  assert.doesNotMatch(route, /createSignedUrl\s*\(/);
});
