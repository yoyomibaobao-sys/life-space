import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("cloud offline copies stay lightweight and thumbnail-only", () => {
  const cache = read("lib/cloud-offline-cache.ts");

  assert.match(cache, /Capacitor\.isNativePlatform\(\)/);
  assert.match(cache, /media\.display_thumb_url \|\| media\.thumb_url/);
  assert.doesNotMatch(cache, /display_url \|\|/);
  assert.doesNotMatch(cache, /downloadMediaStorageObject/);
  assert.match(cache, /archive\.status === "ended"/);
  assert.match(cache, /pruneCloudOfflineCacheForEndedSource/);
});

test("cloud offline copies are distinct from local projects and preserve pending work", () => {
  const db = read("lib/local-offline-db.ts");

  assert.match(db, /"cloud-offline-cache"/);
  assert.match(db, /function isUserLocalArchive/);
  assert.match(db, /normalizeLocalArchiveRole\(archive\) !== "cloud-offline-cache"/);
  assert.match(db, /status: "pending-cloud-sync"/);
  assert.match(db, /record\.sync\?\.status !== "pending-cloud-sync"/);
  assert.match(db, /const hasPending = pendingRecords\.length > 0 \|\| pendingImages\.length > 0/);
  assert.match(db, /云端已有记录离线时只读/);
  assert.match(db, /云端期次离线时只读/);
});

test("pending cloud records upload only from an explicit user action", () => {
  const sync = read("lib/local-to-cloud-sync.ts");
  const page = read("app/archive/page.tsx");
  const offline = read("mobile-offline-src/main.tsx");

  assert.match(sync, /export async function uploadPendingCloudOfflineRecords/);
  assert.match(sync, /record\.sync\?\.status === "pending-cloud-sync"/);
  assert.match(sync, /const currentPayload = \{/);
  assert.match(sync, /\.update\(currentPayload\)/);
  assert.match(sync, /原云端项目已不存在/);
  assert.match(sync, /原云端项目已结束/);
  assert.match(page, /onClick=\{\(\) => void uploadOfflinePendingRecords\(\)\}/);
  assert.doesNotMatch(sync, /addEventListener\(["']online["']/);
  assert.match(offline, /pendingUpload/);
});

test("offline shell separates true local projects from cloud offline copies", () => {
  const offline = read("mobile-offline-src/main.tsx");

  assert.match(offline, /listVisibleCloudOfflineArchiveSummaries/);
  assert.match(offline, /"all" \| "cache" \| "local"/);
  assert.match(offline, /archive\.local_role === "cloud-offline-cache"/);
  assert.match(offline, /record\.sync\?\.status === "pending-cloud-sync"/);
  assert.match(offline, /cloudCacheReadOnly/);
});
