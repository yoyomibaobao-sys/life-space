import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";

globalThis.crypto ??= webcrypto;
const backing = { files: new Map(), connected: false, cancel: false, fail: "",
  failMirrorAfterMarker: false, restoreOpen: null, afterMarker: null };
const storage = {
  async list(path) {
    const prefix = path ? `${path}/` : "";
    return [...new Set([...backing.files.keys()].filter((file) => file.startsWith(prefix))
      .map((file) => file.slice(prefix.length).split("/")[0]))];
  },
  async read(path) { return backing.files.get(path) ?? null; },
  async create(path, bytes) {
    if (backing.fail && path.includes(backing.fail)) throw Error(`SAF failure: ${backing.fail}`);
    if (backing.files.has(path)) throw Error(`Immutable collision: ${path}`);
    backing.files.set(path, new Uint8Array(bytes));
    if (path.startsWith("commits/") && backing.afterMarker) await backing.afterMarker(path);
    if (backing.failMirrorAfterMarker && path.startsWith("commits/")) {
      backing.failMirrorAfterMarker = false;
      backing.restoreOpen = indexedDB.open.bind(indexedDB);
      indexedDB.open = () => { throw Error("Injected mirror failure"); };
    }
  },
  async checkpoint(path, bytes) { backing.files.set(path, new Uint8Array(bytes)); },
};
globalThis.__safBusiness = { backing, storage };
const output = await build({ entryPoints: ["lib/local-offline-db.ts", "lib/local-saf-core.ts",
  "lib/local-saf-cloud-transfer.ts"],
  bundle: true, write: false, platform: "node", format: "esm", outdir: "out", plugins: [{
    name: "android-saf-business-adapter", setup(ctx) {
      ctx.onResolve({ filter: /^@\/lib\/local-saf-native$/ }, () => ({ path: "saf-native", namespace: "test" }));
      ctx.onLoad({ filter: /^saf-native$/, namespace: "test" }, () => ({ loader: "js", contents: `
        export function isAndroidSafAvailable() { return true; }
        export async function getLocalSafDirectory() { return { available: globalThis.__safBusiness.backing.connected }; }
        export async function chooseLocalSafDirectory() {
          if (globalThis.__safBusiness.backing.cancel) throw Error("Folder selection cancelled");
        }
        export async function confirmLocalSafDirectory() { globalThis.__safBusiness.backing.connected = true; }
        export async function discardLocalSafDirectory() {}
        export function createNativeSafStorage() { return globalThis.__safBusiness.storage; }
      ` }));
      ctx.onResolve({ filter: /^@\/lib\/image-compression$/ }, () => ({ path: "photo", namespace: "test" }));
      ctx.onLoad({ filter: /^photo$/, namespace: "test" }, () => ({ loader: "js", contents: `
        export async function standardizeRecordPhotoFile(file) {
          return { file, wasCompressed: false, width: 10, height: 10 };
        }
      ` }));
    },
  }] });
const load = async (name) => import(`data:text/javascript;base64,${Buffer.from(output.outputFiles.find((file) =>
  file.path.endsWith(name)).contents).toString("base64")}`);
const local = await load("local-offline-db.js");
const core = await load("local-saf-core.js");
const transfer = await load("local-saf-cloud-transfer.js");
const ownerA = "a28ce2ab-1300-4f1d-94f0-2d032b0a0901";
const ownerB = "b28ce2ab-1300-4f1d-94f0-2d032b0a0902";
function freshMirror() {
  globalThis.indexedDB = new IDBFactory();
  const map = new Map();
  globalThis.window = { indexedDB, localStorage: {
    getItem(key) { return map.get(key) ?? null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  } };
}
function reset() { backing.files.clear(); backing.connected = false; backing.cancel = false;
  backing.fail = ""; backing.failMirrorAfterMarker = false; backing.restoreOpen = null;
  backing.afterMarker = null; freshMirror(); }
test.beforeEach(reset);
const project = (userId = null) => local.createLocalArchive({ title: "番茄", category: "system",
  system_name: "番茄", local_owner_user_id: userId });
const committed = () => core.readSafCommitted(storage);
const count = (prefix) => [...backing.files.keys()].filter((key) => key.startsWith(prefix)).length;
const stamp = "2026-10-06T00:00:00.000Z";
async function seedLegacy({ conflictingDepths = false } = {}) {
  await local.readLegacySafRows();
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("life-space-local-offline", 6);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = db.transaction(["archives", "records", "images", "taxonomy"], "readwrite");
  const finished = new Promise((resolve, reject) => {
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
  });
  const archive = { id: "legacy-project", local_role: "local-project", title: "Legacy",
    category: "system", main_category: "system", status: "active", local_only: true,
    local_owner_user_id: ownerA, created_at: stamp, updated_at: stamp,
    sync: { status: "local-only" }, cycles: [] };
  const record = { id: "legacy-record", archive_id: archive.id, note: "old",
    local_only: true, created_at: stamp, updated_at: stamp, sync: { status: "local-only" } };
  const image = { id: "legacy-photo", archive_id: archive.id, record_id: record.id,
    blob: new Blob([Uint8Array.of(4, 8, 12)], { type: "image/jpeg" }),
    mime_type: "image/jpeg", name: "old.jpg", cached_size: 3, original_size: 3,
    sort_order: 0, local_only: true, created_at: stamp, sync: { status: "local-only" } };
  const pending = { ...archive, id: "pending-cloud", sync: {
    status: "pending-cloud-sync", operation_kind: "create-archive", client_operation_id: "pending-op" } };
  const cache = { ...archive, id: "cloud_cache_archive_test", local_role: "cloud-offline-cache",
    source_cloud_archive_id: "remote", sync: { status: "synced" } };
  for (const item of [archive, pending, cache]) tx.objectStore("archives").put(item);
  tx.objectStore("records").put(record);
  tx.objectStore("images").put(image);
  tx.objectStore("taxonomy").put({ id: "legacy-taxonomy", kind: "group", label: "old group",
    local_only: true, local_owner_user_id: ownerA });
  await finished; db.close();
  window.localStorage.setItem("lifespace:archive-category-depths:local:v1:device", JSON.stringify({ system: 2 }));
  window.localStorage.setItem(`lifespace:archive-category-depths:local:v1:${ownerA}`,
    JSON.stringify({ system: conflictingDepths ? 3 : 2 }));
  return { archive, record, image, pending, cache };
}

test("cancelled folder selection cannot create a project in SAF or IndexedDB", async () => {
  backing.cancel = true;
  await assert.rejects(project(), /cancelled/);
  assert.equal((await local.readLegacySafRows()).archives.length, 0);
  assert.equal(backing.files.size, 0);
});

test("create, text/photo, edits, cycle, taxonomy, recycle and force hydrate use committed SAF state", async () => {
  const archive = await project(ownerA);
  const space = archive.saf_local_space_id;
  assert.equal((await committed()).manifest.localSpaceId, space);
  const text = await local.createLocalRecord({ archive_id: archive.id, note: "第一条" });
  const photo = new File([Uint8Array.of(1, 3, 5)], "test.jpg", { type: "image/jpeg" });
  const pictured = await local.createLocalRecord({ archive_id: archive.id, note: "照片", image_files: [photo] });
  await local.updateLocalRecordFields(text.id, { note: "文字修改" });
  await local.updateLocalArchiveFields(archive.id, { title: "小番茄", group_name: "小院" }, { userId: ownerB });
  const cycle = await local.createLocalArchiveCycle(archive.id, "2026-10-06T00:00:00.000Z", { userId: ownerB });
  await local.updateLocalRecordFields(pictured.id, { cycle_id: cycle.id });
  const taxonomy = await local.createLocalTaxonomyItem({ kind: "group", label: "小院", category: "system" });
  assert.equal(taxonomy.saf_local_space_id, space);
  await local.setLocalProjectTrashed(archive.id, true, { userId: ownerB });
  assert.equal((await local.listLocalProjectTrash({ userId: ownerB })).length, 1);
  await local.setLocalProjectTrashed(archive.id, false, { userId: ownerB });
  const head = await committed();
  assert.equal(head.source.entries[0].records.length, 2);
  assert.equal(head.source.entries[0].images.length, 1);
  assert.equal(head.source.entries[0].archive.cycles.length, 1);
  assert.equal(head.source.entries[0].archive.title, "小番茄");
  assert.equal(count("local/media/"), 1);
  freshMirror(); // The private runtime mirror is gone; immutable SAF data remains.
  const restored = await local.getLocalArchiveDetail(archive.id, { userId: ownerB });
  assert.equal(restored.records.length, 2);
  assert.equal(restored.records.find((row) => row.id === text.id).note, "文字修改");
  assert.deepEqual(new Uint8Array(await restored.records.find((row) => row.id === pictured.id)
    .images[0].blob.arrayBuffer()), Uint8Array.of(1, 3, 5));
  for (const identity of [null, ownerA, null, ownerB]) {
    assert.equal((await local.listVisibleLocalArchiveSummaries({ userId: identity })).archives.length, 1);
  }
  for (const online of [true, false, true]) {
    Object.defineProperty(globalThis.navigator ??= {}, "onLine", { configurable: true, value: online });
    assert.equal((await local.listVisibleLocalArchiveSummaries({ userId: ownerB })).archives.length, 1);
  }
});

test("failure before commit marker cannot report success or alter business mirror", async () => {
  const archive = await project();
  const before = (await committed()).commit.revision;
  backing.fail = "snapshots/";
  await assert.rejects(local.createLocalRecord({ archive_id: archive.id, note: "未保存" }), /SAF failure/);
  backing.fail = "";
  assert.equal((await committed()).commit.revision, before);
  assert.equal((await local.getLocalArchiveDetail(archive.id)).records.length, 0);
});

test("failed IDB mirror after marker is rebuilt from SAF on the next read", async () => {
  const archive = await project();
  backing.failMirrorAfterMarker = true;
  const previousError = console.error;
  console.error = () => {};
  let record;
  try { record = await local.createLocalRecord({ archive_id: archive.id, note: "已写目录" }); }
  finally { console.error = previousError; indexedDB.open = backing.restoreOpen; }
  assert.equal((await committed()).source.entries[0].records[0].id, record.id);
  assert.equal((await local.getLocalArchiveDetail(archive.id)).records[0].note, "已写目录");
});

test("taxonomy rename/delete and grouping depth survive a new business mirror", async () => {
  const archive = await project(ownerA);
  await local.createLocalTaxonomyItem({ kind: "subcategory", label: "果菜", category: "system" });
  await local.updateLocalArchiveFields(archive.id, { subcategory: "果菜" });
  await local.renameLocalTaxonomyItem({ kind: "subcategory", oldLabel: "果菜",
    newLabel: "蔬菜", category: "system" }, { userId: ownerB });
  await local.saveSafLocalCategoryDepths({ system: 2, plant: 3 });
  assert.equal((await committed()).source.entries[0].archive.subcategory, "蔬菜");
  assert.equal((await committed()).source.categoryDepths.local.system, 2);
  freshMirror();
  assert.equal((await local.getLocalArchiveDetail(archive.id, { userId: ownerB })).archive.subcategory, "蔬菜");
  await local.deleteLocalTaxonomyItem({ kind: "subcategory", label: "蔬菜",
    category: "system" }, { userId: ownerB });
  assert.equal((await committed()).source.taxonomy.length, 0);
  assert.equal((await committed()).source.entries[0].archive.subcategory, null);
});

test("cycle recycle/restore and permanent record/project removal only change the latest SAF snapshot", async () => {
  const archive = await project();
  const cycle = await local.createLocalArchiveCycle(archive.id, "2026-10-06T00:00:00.000Z");
  const record = await local.createLocalRecord({ archive_id: archive.id, cycle_id: cycle.id, note: "周期记录" });
  assert.equal(await local.deleteLocalArchiveCycle(archive.id, cycle.id), 1);
  const trashed = (await local.listLocalArchiveCycleTrash())[0];
  assert.equal((await local.getLocalArchiveDetail(archive.id)).records.length, 0);
  await local.restoreLocalArchiveCycle(archive.id, trashed.trash.id);
  assert.equal((await local.getLocalArchiveDetail(archive.id)).records.length, 1);
  await local.deleteLocalRecord(record.id);
  assert.equal((await committed()).source.entries[0].records.length, 0);
  await local.deleteLocalArchive(archive.id);
  assert.equal((await committed()).source.entries.length, 0);
  assert.equal((await local.listVisibleLocalArchiveSummaries()).archives.length, 0);
  assert.ok(count("local/projects/") > 0); // Older immutable revisions are retained; no media GC.
});

test("legacy IDB-only row stays on its previous path and does not enter SAF", async () => {
  const managed = await project();
  backing.connected = false;
  const pending = await local.createLocalArchive({ title: "旧流程", category: "system",
    system_name: "旧流程", local_owner_user_id: ownerA, sync_destination: "pending-cloud" });
  assert.equal(pending.saf_local_space_id, undefined);
  assert.equal((await committed()).source.entries.length, 1);
  assert.equal((await local.listVisibleLocalArchiveSummaries({ userId: ownerB })).archives.length, 0);
  const legacy = await local.listVisibleLocalArchiveSummaries({ userId: ownerA });
  assert.equal(legacy.safFolderDisconnected, true);
  assert.deepEqual(legacy.archives.map((row) => row.id), [pending.id]);
  assert.equal((await local.getLocalArchiveDetail(pending.id, { userId: ownerA })).archive.id, pending.id);
  await assert.rejects(local.getLocalArchiveDetail(managed.id), /Reconnect/);
  backing.connected = true;
  assert.equal((await local.listVisibleLocalArchiveSummaries({ userId: ownerA })).archives.length, 2);
});

test("connected account cloud cache and pending image are durable, merged and isolated", async () => {
  await project();
  backing.connected = false;
  const cloudId = "remote-1";
  const photoA = new Blob([Uint8Array.of(1, 2, 3)], { type: "image/jpeg" });
  const cached = await local.replaceCloudOfflineCache({ cloud_archive_id: cloudId,
    owner_context: { userId: ownerA }, title: "Cloud A", category: "system", cycles: [],
    records: [{ id: "remote-record", note: "synced", record_time: stamp }],
    images: [{ id: "remote-photo", record_id: "remote-record", blob: photoA }] });
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("life-space-local-offline", 6);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const tx = db.transaction("images", "readwrite");
  const complete = new Promise((resolve, reject) => {
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  tx.objectStore("images").put({ id: "pending-photo", archive_id: cached.id,
    record_id: "cloud_cache_record_remote-record", blob: new Blob([Uint8Array.of(8, 9)]),
    mime_type: "image/jpeg", name: "pending.jpg", cached_size: 2, original_size: 2,
    sort_order: 1, created_at: stamp, local_only: true,
    sync: { status: "pending-cloud-sync", operation_kind: "upload-image" } });
  await complete; db.close();
  backing.connected = true;
  await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerA });
  const state = await committed();
  const cloudEntries = state.source.entries.filter((row) => row.archive.id === cached.id);
  assert.deepEqual(cloudEntries.map((row) => row.kind).sort(), ["cloud-offline-cache", "pending-cloud-user-data"]);
  assert.equal(cloudEntries.reduce((n, row) => n + row.images.length, 0), 2);
  assert.equal((await local.getLocalArchiveDetail(cached.id, { userId: ownerA })).records[0].images.length, 2);
  await local.replaceCloudOfflineCache({ cloud_archive_id: cloudId,
    owner_context: { userId: ownerA }, title: "Cloud A refreshed", category: "system", cycles: [],
    records: [{ id: "remote-record", note: "synced newer", record_time: stamp }],
    images: [{ id: "remote-photo", record_id: "remote-record", blob: photoA }] });
  assert.equal((await local.getLocalArchiveDetail(cached.id, { userId: ownerA })).records[0].images.length, 2);
  freshMirror();
  await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerA });
  const restored = await local.getLocalArchiveDetail(cached.id, { userId: ownerA });
  assert.equal(restored.records[0].images.length, 2);
  assert.equal((await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerB })).length, 0);
  assert.equal((await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerA })).length, 1);
});

test("connected pending cloud create, text and photo are committed before the mirror", async () => {
  await project();
  const a = await local.createLocalArchive({ title: "Account A", category: "system",
    local_owner_user_id: ownerA, sync_destination: "pending-cloud" });
  const record = await local.createLocalRecord({ archive_id: a.id, note: "pending text",
    image_files: [new File([Uint8Array.of(3, 4)], "pending.jpg", { type: "image/jpeg" })] });
  const state = await committed();
  const entry = state.source.entries.find((row) => row.archive.id === a.id);
  assert.equal(entry.kind, "pending-cloud-user-data");
  assert.match(entry.partition, /\/pending$/);
  assert.equal(entry.records[0].id, record.id);
  assert.equal(entry.images.length, 1);
  freshMirror();
  assert.equal((await local.listVisibleLocalArchiveSummaries({ userId: ownerB })).archives.length, 1);
  assert.equal((await local.listVisibleLocalArchiveSummaries({ userId: ownerA })).archives.length, 2);
  const restored = await local.getLocalArchiveDetail(a.id, { userId: ownerA });
  assert.equal(restored.records[0].images[0].blob.size, 2);
  await local.clearCloudOfflineCachesForOwner({ userId: ownerA });
  assert.equal((await local.listPendingCloudSyncSummaries({ userId: ownerB })).length, 0);
  assert.equal((await local.listPendingCloudSyncSummaries({ userId: ownerA })).length, 1);
});

test("archive-only update creates a pending account overlay without a second runtime project", async () => {
  await project();
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("life-space-local-offline", 6);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const tx = db.transaction("archives", "readwrite");
  const finished = new Promise((resolve, reject) => {
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  tx.objectStore("archives").put({ id: "saved-cloud-copy", local_role: "saved-local-copy",
    source_cloud_archive_id: "remote-copy", local_owner_user_id: ownerA,
    title: "Before", category: "system", main_category: "system", status: "active",
    local_only: true, created_at: stamp, updated_at: stamp, sync: { status: "local-only" } });
  await finished; db.close();
  await local.updateLocalArchiveFields("saved-cloud-copy", { title: "After" }, { userId: ownerA });
  const state = await committed();
  const entry = state.source.entries.find((row) => row.archive.id === "saved-cloud-copy");
  assert.equal(entry.kind, "pending-cloud-user-data");
  assert.deepEqual(entry.archive.sync.pending_fields, ["title"]);
  assert.equal(entry.records.length, 0);
  freshMirror();
  await local.listPendingCloudSyncSummaries({ userId: ownerA });
  assert.equal((await local.getLocalArchiveDetail("saved-cloud-copy", { userId: ownerA })).archive.title, "After");
  assert.equal((await local.getLocalArchiveDetail("saved-cloud-copy", { userId: ownerB })), null);
});

test("editing a synced saved-copy record first persists its update-record operation in the owner partition", async () => {
  await project();
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("life-space-local-offline", 6);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const tx = db.transaction(["archives", "records"], "readwrite");
  const finished = new Promise((resolve, reject) => {
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  tx.objectStore("archives").put({ id: "saved-edit", local_role: "saved-local-copy",
    source_cloud_archive_id: "remote-edit", local_owner_user_id: ownerA,
    title: "Saved", category: "system", main_category: "system", status: "active",
    local_only: true, created_at: stamp, updated_at: stamp, sync: { status: "local-only" } });
  tx.objectStore("records").put({ id: "saved-record", archive_id: "saved-edit", note: "old",
    record_time: stamp, created_at: stamp, updated_at: stamp, local_only: true,
    sync: { status: "synced", cloud_record_id: "remote-record", cloud_archive_id: "remote-edit" } });
  await finished; db.close();
  const changed = await local.updateLocalRecordFields("saved-record", { note: "new" });
  assert.equal(changed.sync.operation_kind, "update-record");
  const entry = (await committed()).source.entries.find((row) => row.archive.id === "saved-edit");
  assert.equal(entry.kind, "pending-cloud-user-data");
  assert.equal(entry.records[0].note, "new");
  assert.equal((await local.listPendingCloudSyncSummaries({ userId: ownerB })).length, 0);
  const uploaded = await local.updateLocalRecordCloudSyncOperation("saved-record",
    changed.sync.client_operation_id, { status: "synced", cloud_record_id: "remote-record" });
  assert.equal(uploaded.sync.status, "synced");
  assert.equal((await local.getLocalArchiveDetail("saved-edit", { userId: ownerA })).records[0].note, "new");
});

test("pending cloud write failure before marker keeps the old mirror and head", async () => {
  await project();
  const previous = (await committed()).commit.revision;
  backing.fail = "snapshots/";
  await assert.rejects(local.createLocalArchive({ title: "Not saved", category: "system",
    local_owner_user_id: ownerA, sync_destination: "pending-cloud" }), /SAF failure/);
  backing.fail = "";
  assert.equal((await committed()).commit.revision, previous);
  assert.equal((await local.listPendingCloudSyncSummaries({ userId: ownerA })).length, 0);
});

test("pending cloud marker success with mirror failure is rebuilt on the next account read", async () => {
  await project();
  backing.failMirrorAfterMarker = true;
  const previousError = console.error;
  console.error = () => {};
  let archive;
  try { archive = await local.createLocalArchive({ title: "Durable", category: "system",
    local_owner_user_id: ownerA, sync_destination: "pending-cloud" }); }
  finally { console.error = previousError; indexedDB.open = backing.restoreOpen; }
  assert.ok((await committed()).source.entries.some((row) => row.archive.id === archive.id));
  assert.equal((await local.listPendingCloudSyncSummaries({ userId: ownerA })).length, 1);
});

test("a disconnected SAF-managed cloud project cannot fall back to IDB-only success", async () => {
  await project();
  const pending = await local.createLocalArchive({ title: "Persisted", category: "system",
    local_owner_user_id: ownerA, sync_destination: "pending-cloud" });
  const revision = (await committed()).commit.revision;
  backing.connected = false;
  await assert.rejects(local.createLocalRecord({ archive_id: pending.id, note: "unsafe" }), /Reconnect/);
  assert.equal((await local.readLegacySafRows()).records.filter((row) => row.archive_id === pending.id).length, 0);
  backing.connected = true;
  assert.equal((await committed()).commit.revision, revision);
});

test("accounts A and B restore only their own cloud cache and pending operations", async () => {
  await project();
  const make = (owner, name) => local.createLocalArchive({ title: name, category: "system",
    local_owner_user_id: owner, sync_destination: "pending-cloud" });
  const a = await make(ownerA, "A pending");
  const b = await make(ownerB, "B pending");
  for (const [owner, label] of [[ownerA, "A"], [ownerB, "B"]]) {
    await local.replaceCloudOfflineCache({ cloud_archive_id: `${label}-cloud`,
      owner_context: { userId: owner }, title: `${label} cache`, category: "system",
      cycles: [], records: [], images: [] });
  }
  await local.clearCloudOfflineCachesForOwner({ userId: ownerA });
  const signedOut = await local.readLegacySafRows();
  assert.equal(signedOut.archives.some((row) => row.local_owner_user_id === ownerA &&
    row.saf_local_space_id && row.local_role === "cloud-offline-cache"), false);
  assert.equal(signedOut.archives.some((row) => row.id === a.id), false);
  assert.equal((await local.listVisibleLocalArchiveSummaries({ userId: ownerA },
    { includePendingCloud: false })).archives.some((row) => row.id === a.id), false);
  assert.equal((await local.listPendingCloudSyncSummaries({ userId: ownerB }))[0].local_archive_id, b.id);
  assert.equal((await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerB })).length, 1);
  freshMirror();
  assert.equal((await local.listPendingCloudSyncSummaries({ userId: ownerB }))[0].local_archive_id, b.id);
  assert.equal((await local.listPendingCloudSyncSummaries({ userId: ownerA }))[0].local_archive_id, a.id);
  assert.equal((await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerA })).length, 1);
  assert.equal((await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerB })).length, 1);
  const bLocal = await local.listVisibleLocalArchiveSummaries({ userId: ownerB });
  assert.equal(bLocal.archives.some((row) => row.id === a.id), false);
  assert.equal(bLocal.hiddenOwnedByOtherCount, 0);
  for (const online of [false, true]) {
    Object.defineProperty(globalThis.navigator ??= {}, "onLine", { configurable: true, value: online });
    assert.equal((await local.listPendingCloudSyncSummaries({ userId: ownerA }))[0].local_archive_id, a.id);
    assert.equal((await local.listPendingCloudSyncSummaries({ userId: ownerB }))[0].local_archive_id, b.id);
  }
  assert.equal((await committed()).source.entries.filter((row) => row.kind !== "local-project").length, 4);
});

test("switching the connected LifeSpace folder replaces only its cloud runtime partition", async () => {
  await project();
  const original = await local.replaceCloudOfflineCache({ cloud_archive_id: "folder-one-cloud",
    owner_context: { userId: ownerA }, title: "First folder", category: "system",
    cycles: [], records: [], images: [] });
  const firstFiles = backing.files;
  backing.files = new Map();
  core.invalidateSafVerifiedHead(storage);
  await core.initializeSafSpace(storage);
  await core.commitSafContent(storage, { entries: [], taxonomy: [], categoryDepths: {} }, null);
  assert.equal((await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerA })).length, 0);
  assert.equal((await local.readLegacySafRows()).archives.some((row) => row.id === original.id), false);
  backing.files = firstFiles;
  core.invalidateSafVerifiedHead(storage);
  assert.equal((await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerA }))[0].id, original.id);
});

test("a mapped pending create never becomes a cross-account independent local project", async () => {
  await project();
  const a = await local.createLocalArchive({ title: "mapped", category: "system",
    local_owner_user_id: ownerA, sync_destination: "pending-cloud" });
  await local.persistLocalCloudArchiveMapping(a.id, "remote-mapped",
    a.sync.client_operation_id, { userId: ownerA });
  const entry = (await committed()).source.entries.find((row) => row.archive.id === a.id);
  assert.equal(entry.kind, "pending-cloud-user-data");
  assert.equal(local.isLocalArchiveVisibleToOwner({ ...entry.archive,
    saf_local_space_id: (await committed()).manifest.localSpaceId }, { userId: ownerB }), false);
  assert.equal((await local.listVisibleLocalArchiveSummaries({ userId: ownerB })).archives
    .some((row) => row.id === a.id), false);
});

test("pending create and media sync transitions finish in the same account cache", async () => {
  await project();
  const archive = await local.createLocalArchive({ title: "Upload", category: "system",
    local_owner_user_id: ownerA, sync_destination: "pending-cloud" });
  const record = await local.createLocalRecord({ archive_id: archive.id, note: "photo",
    image_files: [new File([Uint8Array.of(5, 6, 7)], "image.jpg", { type: "image/jpeg" })] });
  const before = await local.getLocalArchiveDetail(archive.id, { userId: ownerA });
  const image = before.records[0].images[0];
  await local.persistLocalCloudArchiveMapping(archive.id, "remote-finish",
    archive.sync.client_operation_id, { userId: ownerA });
  await local.updateLocalRecordCloudSyncOperation(record.id, record.sync.client_operation_id,
    { status: "synced", cloud_archive_id: "remote-finish", cloud_record_id: "remote-record" });
  await local.updateLocalImageCloudSyncOperation(image.id, image.sync.client_operation_id,
    { status: "synced", cloud_archive_id: "remote-finish", cloud_record_id: "remote-record",
      cloud_media_id: "remote-image" });
  await local.convertPendingCloudProjectToOfflineCache(archive.id, "remote-finish", { userId: ownerA });
  const entries = (await committed()).source.entries.filter((row) => row.archive.id === archive.id);
  assert.deepEqual(entries.map((row) => row.kind), ["cloud-offline-cache"]);
  assert.equal(entries[0].records.length, 1);
  assert.equal(entries[0].images.length, 1);
  assert.equal((await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerA })).length, 1);
  assert.equal((await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerB })).length, 0);
});

test("interrupted legacy cloud adoption retries the same marker without duplicate entries", async () => {
  await project();
  backing.connected = false;
  const cache = await local.replaceCloudOfflineCache({ cloud_archive_id: "retry-cloud",
    owner_context: { userId: ownerA }, title: "retry", category: "system", cycles: [],
    records: [{ id: "retry-record", note: "baseline", record_time: stamp }],
    images: [{ id: "retry-image", record_id: "retry-record",
      blob: new Blob([Uint8Array.of(1, 4, 7)], { type: "image/jpeg" }) }] });
  backing.connected = true;
  backing.failMirrorAfterMarker = true;
  const previousError = console.error;
  console.error = () => {};
  try { await assert.rejects(local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerA }),
    /Injected mirror failure/); }
  finally { console.error = previousError; indexedDB.open = backing.restoreOpen; }
  const revision = (await committed()).commit.revision;
  assert.equal((await local.listVisibleCloudOfflineArchiveSummaries({ userId: ownerA })).length, 1);
  assert.equal((await committed()).commit.revision, revision);
  assert.equal((await local.getLocalArchiveDetail(cache.id, { userId: ownerA })).records[0].images.length, 1);
});

test("an unknown pending-cloud owner is not assigned to a later login", async () => {
  await project();
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("life-space-local-offline", 6);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const tx = db.transaction("archives", "readwrite");
  const finished = new Promise((resolve, reject) => {
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  tx.objectStore("archives").put({ id: "unknown-cloud", local_role: "local-project",
    title: "Unknown", category: "system", main_category: "system", status: "active",
    local_only: true, created_at: stamp, updated_at: stamp,
    sync: { status: "pending-cloud-sync", operation_kind: "create-archive" } });
  await finished; db.close();
  assert.equal(await local.markUnownedLocalArchivesForOwner({ userId: ownerA }), 0);
  assert.equal((await local.readLegacySafRows()).archives.find((row) => row.id === "unknown-cloud")
    .local_owner_user_id, undefined);
  await assert.rejects(local.listPendingCloudSyncSummaries({ userId: ownerA }), /Unknown cloud owner/);
});

test("legacy chooser cancellation leaves project, image and cloud rows in IDB", async () => {
  await seedLegacy();
  backing.cancel = true;
  await assert.rejects(project(), /cancelled/);
  const rows = await local.readLegacySafRows();
  assert.equal(rows.archives.length, 3);
  assert.equal(rows.images.length, 1);
  assert.equal(rows.archives.find((row) => row.id === "legacy-project").saf_local_space_id, undefined);
  assert.equal(backing.files.size, 0);
});

test("legacy migration is on demand, excludes cloud and pending, and preserves IDs and media", async () => {
  await seedLegacy();
  assert.equal(backing.files.size, 0); // Reading the list did not open the picker.
  await local.listVisibleLocalArchiveSummaries({ userId: ownerA });
  assert.equal(backing.files.size, 0);
  await local.updateLocalArchiveFields("legacy-project", { title: "edited" }, { userId: ownerB });
  const state = await committed();
  assert.deepEqual(state.source.entries.map((row) => row.id), ["legacy-project"]);
  assert.equal(state.source.entries[0].records[0].id, "legacy-record");
  assert.equal(state.source.entries[0].images[0].id, "legacy-photo");
  assert.deepEqual(new Uint8Array(await state.source.entries[0].images[0].blob.arrayBuffer()),
    Uint8Array.of(4, 8, 12));
  assert.deepEqual(state.source.categoryDepths.local, { system: 2 });
  assert.equal(state.source.taxonomy[0].id, "legacy-taxonomy");
  const rows = await local.readLegacySafRows();
  assert.equal(rows.archives.find((row) => row.id === "legacy-project").saf_local_space_id,
    state.manifest.localSpaceId);
  assert.equal(rows.archives.find((row) => row.id === "pending-cloud").saf_local_space_id, undefined);
  assert.equal(rows.archives.find((row) => row.id === "cloud_cache_archive_test").saf_local_space_id, undefined);
  assert.equal(count("migration/"), 1);
  assert.equal((await local.getLocalArchiveDetail("legacy-project", { userId: ownerB })).archive.title, "edited");
});

test("conflicting legacy depths refuse migration before directory selection", async () => {
  await seedLegacy({ conflictingDepths: true });
  await assert.rejects(project(), /Conflicting legacy local category depths/);
  assert.equal(backing.files.size, 0);
  assert.equal((await local.readLegacySafRows()).archives.find((row) => row.id === "legacy-project")
    .saf_local_space_id, undefined);
});

test("cloud cache or pending without a trusted owner never appears to a guest", async () => {
  assert.equal(local.isLocalArchiveVisibleToOwner({ id: "cloud_cache_archive_unknown",
    local_role: "cloud-offline-cache", sync: { status: "synced" } }), false);
  assert.equal(local.isLocalArchiveVisibleToOwner({ id: "pending_unknown", local_role: "local-project",
    sync: { status: "pending-cloud-sync", operation_kind: "create-archive" } }), false);
});

test("legacy handoff failure retries the same committed migration without duplicate commit", async () => {
  await seedLegacy();
  backing.failMirrorAfterMarker = true;
  await assert.rejects(project(), /Injected mirror failure/);
  indexedDB.open = backing.restoreOpen;
  const revision = (await committed()).commit.revision;
  assert.equal((await local.readLegacySafRows()).archives.find((row) => row.id === "legacy-project")
    .saf_local_space_id, undefined);
  await project();
  const state = await committed();
  assert.equal(state.source.entries.filter((row) => row.id === "legacy-project").length, 1);
  assert.equal(count("migration/"), 1);
  assert.equal(state.commit.sequence, 3); // empty directory, migration, requested new project
  assert.equal((await local.readLegacySafRows()).archives.find((row) => row.id === "legacy-project")
    .saf_local_space_id, state.manifest.localSpaceId);
  assert.ok(backing.files.has(`snapshots/${revision}.json`));
});

test("legacy handoff refuses an intervening IDB edit after the SAF marker", async () => {
  await seedLegacy();
  backing.afterMarker = async (path) => {
    if (!path.includes("000000000002-")) return;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("life-space-local-offline", 6);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("records", "readwrite");
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    tx.objectStore("records").put({ id: "legacy-record", archive_id: "legacy-project",
      note: "newer edit", local_only: true, created_at: stamp, updated_at: new Date().toISOString(),
      sync: { status: "local-only" } });
    await done; db.close();
  };
  await assert.rejects(project(), /Legacy data changed during SAF handoff/);
  const rows = await local.readLegacySafRows();
  assert.equal(rows.records.find((row) => row.id === "legacy-record").note, "newer edit");
  assert.equal(rows.archives.find((row) => row.id === "legacy-project").saf_local_space_id, undefined);
  assert.equal((await committed()).source.entries[0].records[0].note, "old");
});

test("unrelated projects already in the selected SAF directory stop legacy migration", async () => {
  const existing = await project();
  await seedLegacy();
  await assert.rejects(local.updateLocalArchiveFields("legacy-project", { title: "edited" }),
    /contains other data/);
  assert.deepEqual((await committed()).source.entries.map((row) => row.id), [existing.id]);
  assert.equal((await local.readLegacySafRows()).archives.find((row) => row.id === "legacy-project")
    .saf_local_space_id, undefined);
});

test("voluntary transfer commits stable target, then tombstone prevents hydrate resurrection", async () => {
  const archive = await project(ownerA);
  const prepared = await transfer.prepareSafLocalCloudTransfer(storage, archive.id, ownerB);
  assert.notEqual(prepared.targetCloudArchiveId, prepared.localTransferToken);
  assert.equal((await transfer.prepareSafLocalCloudTransfer(storage, archive.id, ownerB))
    .targetCloudArchiveId, prepared.targetCloudArchiveId);
  await assert.rejects(transfer.prepareSafLocalCloudTransfer(storage, archive.id, ownerA), /another cloud account/);
  await transfer.advanceSafLocalCloudTransfer(storage, archive.id, prepared, "cloud-created");
  await transfer.advanceSafLocalCloudTransfer(storage, archive.id, prepared, "complete");
  await local.completeLocalArchiveCloudTransfer(archive.id, prepared.targetCloudArchiveId, { userId: ownerB });
  freshMirror();
  assert.equal((await local.listVisibleLocalArchiveSummaries({ userId: ownerA })).archives.length, 0);
  assert.equal((await committed()).source.entries[0].archive.local_cloud_transfer.stage, "complete");
});
