import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("active cloud archives are cached and ended archives are pruned", () => {
  const cache = read("lib/cloud-offline-cache.ts");
  const db = read("lib/local-offline-db.ts");

  assert.match(cache, /archive\.status === "ended"/);
  assert.match(cache, /pruneCloudOfflineCacheForEndedSource/);
  assert.match(cache, /replaceCloudOfflineCache/);
  assert.match(cache, /MAX_CLOUD_CACHE_THUMB_BYTES/);
  assert.doesNotMatch(cache, /downloadMediaStorageObject/);
  assert.doesNotMatch(cache, /cloud_media_url: media\.url/);
  assert.doesNotMatch(cache, /display_url \|\|/);
  assert.match(db, /local_role: "cloud-offline-cache"/);
  assert.match(db, /export function replaceCloudOfflineCache/);
  assert.match(db, /export async function pruneCloudOfflineCacheForEndedSource/);
  assert.match(db, /`cloud_cache_archive_\$\{ownerUserId\}_\$\{cloudArchiveId\}`/);
});

test("cloud cache refresh does not delete local-project or saved-local-copy", () => {
  const db = read("lib/local-offline-db.ts");
  const replace = db.slice(
    db.indexOf("async function replaceCloudOfflineCacheUnlocked"),
    db.indexOf("export async function pruneCloudOfflineCacheForEndedSource")
  );
  const prune = db.slice(
    db.indexOf("export async function pruneCloudOfflineCacheForEndedSource"),
    db.indexOf("export async function createLocalArchiveCycle")
  );

  assert.match(replace, /resolveLocalArchiveRole\(archive\) === "cloud-offline-cache"/);
  assert.match(replace, /archiveStore\.put\(archive\)/);
  assert.doesNotMatch(replace, /local_role === "local-project"/);
  assert.doesNotMatch(replace, /local_role === "saved-local-copy"/);
  assert.doesNotMatch(replace, /archiveStore\.clear\(/);
  assert.match(prune, /getCloudOfflineCacheByCloudSource/);
  assert.match(db, /resolveLocalArchiveRole\(archive\) !== "cloud-offline-cache"/);
});

test("cloud offline cache is read-only for existing cloud content", () => {
  const db = read("lib/local-offline-db.ts");
  const sliceExport = (name, nextName) => {
    const start = db.indexOf(`export async function ${name}`);
    assert.notEqual(start, -1, `missing ${name}`);
    const end = db.indexOf(`export async function ${nextName}`, start + 1);
    assert.notEqual(end, -1, `missing next ${nextName}`);
    return db.slice(start, end);
  };

  assert.match(db, /云项目离线缓存只读，不能修改。/);
  assert.match(db, /云项目离线缓存只读，不能删除。/);
  assert.match(db, /云端期次离线时只读/);
  assert.match(db, /function isUserLocalArchive/);
  assert.match(db, /function abortIfCloudOfflineCacheWrite/);
  assert.match(db, /filter\(isUserLocalArchive\)/);

  const rejectWrite = [
    ["updateLocalArchiveFields", "updateLocalArchiveMigrationState"],
    ["updateLocalArchiveMigrationState", "updateLocalArchiveCloudSyncOperation"],
    ["updateLocalArchiveCloudSyncOperation", "persistLocalCloudArchiveMapping"],
    ["markLocalArchiveForOwner", "createLocalArchive"],
    ["deleteLocalArchive", "mergeLocalOriginBaseSnapshot"],
  ];
  for (const [name, nextName] of rejectWrite) {
    assert.match(
      sliceExport(name, nextName),
      /assertWritableUserArchive|abortIfCloudOfflineCacheWrite/,
      `${name} must reject cloud-offline-cache writes`
    );
  }

  const createRecord = sliceExport("createLocalRecord", "deleteLocalRecord");
  assert.match(createRecord, /queueCloudSyncOperation/);
  assert.match(createRecord, /这个云项目已经结束，不能继续新增离线记录。/);
  assert.match(createRecord, /云端期次离线时只读/);
  assert.doesNotMatch(
    createRecord,
    /assertWritableUserArchive\(normalizedArchive, "云项目离线缓存只读，不能新增记录。"\)/
  );

  const updateRecord = sliceExport("updateLocalRecordFields", "updateLocalRecordSyncMeta");
  assert.match(updateRecord, /云端已有记录离线时只读，请联网后修改。/);
  assert.match(updateRecord, /record\.sync\?\.status !== "pending-cloud-sync"/);

  const deleteRecord = sliceExport("deleteLocalRecord", "deleteLocalArchive");
  assert.match(deleteRecord, /云端已有记录离线时只读，不能删除。/);
  assert.match(deleteRecord, /record\.sync\?\.status !== "pending-cloud-sync"/);

  const skipCache = [
    ["deleteLocalTaxonomyItem", "renameLocalTaxonomyItem"],
    ["renameLocalTaxonomyItem", "updateLocalArchiveFields"],
    ["markUnownedLocalArchivesForOwner", "markLocalArchiveForOwner"],
    ["mergeLocalOriginBaseSnapshot", "mergeLocalOriginImage"],
    ["mergeLocalOriginImage", "finalizeLocalOriginMigration"],
  ];
  for (const [name, nextName] of skipCache) {
    assert.match(
      sliceExport(name, nextName),
      /!isUserLocalArchive|isUserLocalArchive\(|cloud-offline-cache/,
      `${name} must skip cloud-offline-cache rows`
    );
  }

  const replace = db.slice(db.indexOf("async function replaceCloudOfflineCacheUnlocked"), db.indexOf("export async function pruneCloudOfflineCacheForEndedSource"));
  const prune = sliceExport("pruneCloudOfflineCacheForEndedSource", "createLocalArchiveCycle");
  const clear = sliceExport("clearCloudOfflineCachesForOwner", "beginCloudArchiveLocalImport");
  assert.doesNotMatch(replace, /abortIfCloudOfflineCacheWrite/);
  assert.doesNotMatch(prune, /abortIfCloudOfflineCacheWrite/);
  assert.doesNotMatch(clear, /abortIfCloudOfflineCacheWrite/);
  assert.match(replace, /archiveStore\.put\(archive\)/);
});

test("explicit logout clears owner cloud cache and ambient sign-out does not", () => {
  const session = read("lib/cloud-offline-cache-session.ts");
  const owner = read("lib/local-owner-context.ts");
  const sync = read("components/LocalOwnerContextSync.tsx");
  const navbar = read("components/navbar.tsx");
  const profile = read("app/profile/page.tsx");

  assert.match(session, /clearCloudOfflineCachesForOwner/);
  assert.match(session, /clearRememberedLocalOwnerContext\(\)/);
  assert.match(owner, /wasLocalOwnerExplicitlySignedOut/);
  assert.match(owner, /EXPLICIT_LOCAL_SIGN_OUT_KEY/);
  assert.match(navbar, /clearCloudOfflineCacheOnExplicitLogout\(user\)/);
  assert.match(profile, /clearCloudOfflineCacheOnExplicitLogout\(user\)/);
  assert.doesNotMatch(sync, /clearCloudOfflineCachesForOwner/);
  assert.doesNotMatch(sync, /clearCloudOfflineCacheOnExplicitLogout/);
  assert.match(sync, /onAuthStateChange\(\(_event, session\)/);
  assert.match(sync, /remember\(session\?\.user\)/);
  assert.match(sync, /if \(!user\?\.id\) \{ rememberedUserId = ""; return; \}/);
});

test("android webview archive page refreshes caches after cloud list loads", () => {
  const page = read("app/archive/page.tsx");
  const cache = read("lib/cloud-offline-cache.ts");
  const diagnostic = read("lib/local-storage-diagnostic.ts");

  assert.match(page, /isCapacitorAndroid\(\)/);
  assert.match(page, /Capacitor\.getPlatform\(\) === "android"/);
  assert.match(page, /archivesResult\.error/);
  assert.match(page, /void refreshCloudOfflineCaches\(/);
  assert.match(
    page,
    /void refreshCloudOfflineCaches\([\s\S]*?\)\.catch\(\(error\) => \{[\s\S]*?console\.warn\("\[lifespace-cloud-cache\]", error\);/
  );
  assert.match(page, /archivesData \|\| \[\]\) as CloudOfflineCacheArchiveSource\[\]/);
  assert.match(page, /logLifespaceStorageDiagnostic/);
  assert.match(page, /PersonalSpaceMobileIdentity/);
  assert.match(cache, /\[lifespace-cloud-cache\]", "refresh start"/);
  assert.match(cache, /\[lifespace-cloud-cache\]", "refresh done"/);
  assert.match(cache, /if \(!ownerContext\?\.userId\) return;/);
  assert.match(diagnostic, /\[lifespace-storage-diagnostic\]/);
  assert.match(diagnostic, /indexedDB\.databases/);
  assert.match(diagnostic, /transaction\(storeName, "readonly"\)/);
  assert.doesNotMatch(diagnostic, /readwrite/);
  assert.doesNotMatch(cache, /Capacitor\.isNativePlatform\(\)/);
});

test("cloud offline copies stay lightweight and thumbnail-only", () => {
  const cache = read("lib/cloud-offline-cache.ts");

  assert.match(cache, /media\.display_thumb_url \|\| media\.thumb_url/);
  assert.doesNotMatch(cache, /display_url \|\|/);
  assert.doesNotMatch(cache, /downloadMediaStorageObject/);
  assert.match(cache, /archive\.status === "ended"/);
  assert.match(cache, /pruneCloudOfflineCacheForEndedSource/);
  assert.match(cache, /archive\.last_record_time \|\| archive\.created_at/);
  assert.match(cache, /JSON\.stringify\(archive\.planting_region \|\| null\)/);
  assert.doesNotMatch(cache, /archive\.updated_at \|\| ""/);
});

test("cloud offline copies are distinct from local projects and preserve pending work", () => {
  const db = read("lib/local-offline-db.ts");

  assert.match(db, /"cloud-offline-cache"/);
  assert.match(db, /function isUserLocalArchive/);
  assert.match(db, /resolveLocalArchiveRole\(archive\) !== "cloud-offline-cache"/);
  assert.match(db, /status: "pending-cloud-sync"/);
  assert.match(db, /record\.sync\?\.status !== "pending-cloud-sync"/);
  assert.match(db, /const hasPending = pendingRecords\.length > 0 \|\| pendingImages\.length > 0/);
  assert.match(db, /云端已有记录离线时只读/);
  assert.match(db, /云端期次离线时只读/);
});

test("pending cloud records upload by explicit action without deleting local originals", () => {
  const sync = read("lib/local-to-cloud-sync.ts");
  const page = read("app/archive/page.tsx");
  const offline = read("mobile-offline-src/main.tsx");
  const db = read("lib/local-offline-db.ts");

  assert.match(sync, /export async function uploadPendingCloudOfflineRecords/);
  assert.match(sync, /record\.sync\?\.status === "pending-cloud-sync"/);
  assert.match(sync, /原云端项目已不存在/);
  assert.match(sync, /原云端项目已结束/);
  assert.match(offline, /syncAllPendingCloudArchives/);
  assert.match(offline, /onClick=\{\(\) => void uploadPendingProject\(item\)\}/);
  assert.match(offline, /onClick=\{\(\) => void uploadAllPending\(\)\}/);
  assert.match(db, /stripSyncedCloudOfflineCacheRows/);
  assert.match(db, /keepUserCreated/);
  assert.doesNotMatch(page, /addEventListener\(["']online["']/);
  assert.doesNotMatch(sync, /addEventListener\(["']online["']/);
  assert.match(offline, /pendingUpload/);
});

test("offline shell separates true local projects from cloud offline copies", () => {
  const offline = read("mobile-offline-src/main.tsx");
  const adapters = read("lib/local-archive-detail-adapters.ts");
  const deviceDetail = read("components/archive-ui/DeviceOwnedProjectDetail.tsx");

  const view = read("components/archive-ui/localArchiveProjectView.ts");

  assert.match(offline, /listVisibleCloudOfflineArchiveSummaries/);
  assert.match(offline, /type ShellSourceFilter = "all" \| "cloud" \| "local"/);
  assert.match(offline, /filteredCloudCaches\.map/);
  assert.match(offline, /filteredCloudArchives\.map\(renderCloudProjectCard\)/);
  assert.match(offline, /liveCloudWorkspace \? \(/);
  assert.match(offline, /const cloudSourceCount = workspace\.counts\.cloud/);
  assert.match(offline, /count: workspace\.counts\.all/);
  assert.match(view, /cloud_cache_copy/);
  assert.match(offline, /cloudCacheReadOnly/);
  assert.match(adapters, /isPendingCloudSyncStatus\(record\.sync\?\.status\)/);
  assert.match(deviceDetail, /canEditLocalArchiveRecord\(archive, source\)/);
  assert.match(deviceDetail, /mode=\{editable \? "owner" : "viewer"\}/);
});
