import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("official site probe is required before leaving the bundled shell", () => {
  const reachability = read("lib/cloud-reachability.ts");
  const hook = read("lib/use-cloud-availability.ts");
  const shell = read("mobile-offline-src/main.tsx");
  const template = read("mobile-offline-src/offline.template.html");

  assert.match(reachability, /export const OFFICIAL_SITE_ORIGIN = "https:\/\/life-space.uk"/);
  assert.match(reachability, /probeOfficialSite/);
  assert.match(reachability, /probeSupabaseAuth/);
  assert.match(reachability, /probeCloudReachable/);
  assert.match(reachability, /replaceWithOfficialSite/);
  assert.match(reachability, /location\.replace/);
  assert.match(reachability, /isCloudUnavailableError/);
  assert.doesNotMatch(reachability, /navigator\.onLine/);
  assert.match(hook, /probeCloudReachable/);
  assert.match(shell, /markBundledOfflineShell/);
  assert.match(shell, /probeCloudReachable/);
  assert.match(shell, /replaceWithOfficialSite/);
  assert.match(shell, /async function reconnect\(\)/);
  assert.match(template, /__LIFESPACE_OFFLINE_SHELL__/);
});

test("cloud-offline-cache identity cannot collapse into saved-local-copy", () => {
  const db = read("lib/local-offline-db.ts");
  const page = read("app/archive/page.tsx");

  assert.match(db, /export function resolveLocalArchiveRole/);
  assert.match(db, /isCloudOfflineCacheArchiveId\(archive\.id\) \|\| archive\.local_role === "cloud-offline-cache"/);
  assert.match(db, /source_cloud_cache_revision/);
  assert.match(db, /persistRepairedLocalArchiveRoles/);
  assert.match(page, /deviceLocalArchives/);
  assert.match(page, /item\.local_role !== "cloud-offline-cache"/);
  assert.match(page, /count: deviceLocalArchives\.length/);
});
