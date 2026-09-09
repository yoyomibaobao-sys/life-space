import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";

// Real IndexedDB API in memory. This exercises storage compatibility, not APK installation.
async function moduleFrom(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}
const dbModule = await moduleFrom("lib/local-offline-db.ts");
const locations = await moduleFrom("lib/record-location.ts");
const guides = await moduleFrom("lib/offline-guide-directory.ts");
const request = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const finished = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
const owner = { userId: "previous-owner", email: "owner@example.test" };
const stamp = "2026-09-06T08:00:00.000Z";
const photoBytes = Uint8Array.from([71, 73, 70, 56, 57, 97, 0, 11, 45, 255]);
const legacyArchive = { id: "old-project", title: "旧版测试项目", category: "plant", main_category: "plant", system_name: "番茄", plant_id: null, cycle_enabled: true,
  cycles: [{ id: "old-cycle", archive_id: "old-project", cycle_no: 1, status: "active", started_at: stamp, created_at: stamp, updated_at: stamp }],
  status: "active", local_owner_user_id: owner.userId, local_owner_email: owner.email, local_only: true, created_at: stamp, updated_at: stamp, sync: { status: "local-only" } };
const legacyRecord = { id: "old-record", archive_id: "old-project", cycle_id: "old-cycle", note: "原有文字", record_time: stamp, created_at: stamp, updated_at: stamp, local_only: true, sync: { status: "local-only" } };

async function fixture() {
  const store = new Map();
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
  globalThis.indexedDB = new IDBFactory();
  globalThis.window = { indexedDB, localStorage };
  localStorage.setItem("lifespace:last-local-owner-context:v1", JSON.stringify(owner));
  const open = indexedDB.open("life-space-local-offline", 6);
  open.onupgradeneeded = () => {
    for (const name of ["archives", "records", "images", "taxonomy"]) open.result.createObjectStore(name, { keyPath: "id" });
  };
  const db = await request(open);
  const tx = db.transaction(["archives", "records", "images", "taxonomy"], "readwrite");
  const done = finished(tx);
  tx.objectStore("archives").add(legacyArchive);
  tx.objectStore("records").add(legacyRecord);
  tx.objectStore("images").add({ id: "old-photo", record_id: legacyRecord.id, archive_id: legacyArchive.id, blob: new Blob([photoBytes], { type: "image/gif" }), name: "original.gif", mime_type: "image/gif", cached_size: photoBytes.length, original_size: photoBytes.length, sort_order: 0, created_at: stamp, local_only: true, sync: { status: "local-only" } });
  tx.objectStore("taxonomy").add({ id: "old-category", kind: "group", category: "plant", label: "旧分组", local_owner_user_id: owner.userId, created_at: stamp, updated_at: stamp, local_only: true });
  await done;
  db.close();
}
async function rawRows(name) {
  const db = await request(indexedDB.open("life-space-local-offline"));
  try { return await request(db.transaction(name).objectStore(name).getAll()); } finally { db.close(); }
}
async function assertOriginalPhoto(detail) {
  const image = detail.records.find((row) => row.id === "old-record").images.find((row) => row.id === "old-photo");
  assert.deepEqual(new Uint8Array(await image.blob.arrayBuffer()), photoBytes);
  assert.equal(image.name, "original.gif");
}

test("version 6 projects, periods, records and photo bytes survive opening the updated app", async () => {
  await fixture();
  const before = await Promise.all([rawRows("archives"), rawRows("records"), rawRows("taxonomy")]);
  const detail = await dbModule.getLocalArchiveDetail("old-project", owner);
  assert.equal(detail.archive.title, legacyArchive.title);
  assert.equal(detail.archive.cycles[0].id, "old-cycle");
  assert.equal(detail.records[0].location, undefined);
  await assertOriginalPhoto(detail);
  assert.deepEqual(await Promise.all([rawRows("archives"), rawRows("records"), rawRows("taxonomy")]), before, "opening is read-only");
  assert.equal(await dbModule.getLocalArchiveDetail("old-project", { userId: "different-account" }), null);
  assert.equal((await indexedDB.databases())[0].version, 6);
});

test("editing optional location and adding photos preserves old photo and period identity", async () => {
  await fixture();
  await dbModule.updateLocalRecordFields("old-record", { note: "更新文字", location: { label: "后院", source: "manual" }, image_files: [new File([photoBytes], "new.gif", { type: "image/gif" })] });
  const detail = await dbModule.getLocalArchiveDetail("old-project", owner);
  assert.equal(detail.records[0].id, "old-record");
  assert.equal(detail.records[0].cycle_id, "old-cycle");
  assert.equal(detail.records[0].location.label, "后院");
  assert.equal(detail.records[0].images.length, 2);
  assert.deepEqual(detail.records[0].images.map((i) => i.sort_order), [0, 1]);
  await assertOriginalPhoto(detail);
  await dbModule.updateLocalRecordFields("old-record", { note: "再编辑" });
  assert.equal((await rawRows("records"))[0].location.label, "后院", "unrelated edit retains location");
});

test("a transaction failure after adding a photo rolls back every part of the edit", async () => {
  await fixture();
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) { if (this.name === "records") throw new DOMException("Simulated storage full", "QuotaExceededError"); return originalPut.apply(this, args); };
  try {
    await assert.rejects(dbModule.updateLocalRecordFields("old-record", { note: "不能保存的文字", location: { label: "不能保存的地点" }, image_files: [new File([photoBytes], "new.gif", { type: "image/gif" })] }), { name: "QuotaExceededError" });
  } finally { IDBObjectStore.prototype.put = originalPut; }
  assert.deepEqual((await rawRows("records"))[0], legacyRecord);
  assert.equal((await rawRows("images")).length, 1);
  await assertOriginalPhoto(await dbModule.getLocalArchiveDetail("old-project", owner));
});

test("invalid attachments and a foreign period leave existing data unchanged", async () => {
  await fixture();
  await assert.rejects(dbModule.updateLocalRecordFields("old-record", { note: "bad edit", image_files: [new File(["text"], "text.txt", { type: "text/plain" })] }), /图片/);
  await assert.rejects(dbModule.updateLocalRecordFields("old-record", { note: "bad edit", cycle_id: "another-project-cycle" }), /不属于/);
  assert.deepEqual((await rawRows("records"))[0], legacyRecord);
});

test("profile address defaults are account scoped and explicit empty location stays empty", async () => {
  await fixture();
  locations.rememberDefaultRecordLocation(owner.userId, "宁波");
  assert.equal(locations.loadDefaultRecordLocation().label, "宁波");
  assert.equal(locations.loadDefaultRecordLocation("different-account"), null);
  const record = await dbModule.createLocalRecord({ archive_id: "old-project", note: "新建记录" });
  assert.equal(record.location.source, "profile");
  const cleared = await dbModule.createLocalRecord({ archive_id: "old-project", note: "不保存地点", location: null });
  assert.equal(cleared.location, null);
  assert.equal(locations.normalizeRecordLocation({ latitude: 91, longitude: 1 }), null);
  assert.equal(locations.normalizeRecordLocation({ label: "  花园  ", latitude: Infinity, longitude: 1 }).label, "花园");
});

test("a full optional preference cache does not report a committed record as failed", async () => {
  await fixture();
  localStorage.setItem = () => { throw new DOMException("Preference cache full", "QuotaExceededError"); };
  const result = await dbModule.createLocalRecord({ archive_id: "old-project", note: "仍然可以保存", location: null });
  assert.ok((await rawRows("records")).some((row) => row.id === result.id));
  await assertOriginalPhoto(await dbModule.getLocalArchiveDetail("old-project", owner));
});

test("guide directory starts offline, excludes private project names and tolerates cache corruption", async () => {
  await fixture();
  assert.ok(guides.loadOfflineGuideDirectory().some((row) => row.label === "番茄"));
  guides.rememberGuideDirectory([{ label: "私密项目", category: "plant", source: "local_archive" }, { label: "新的公开指引", category: "plant", source: "public_guide", id: "guide-id" }]);
  assert.ok(!guides.loadOfflineGuideDirectory().some((row) => row.label === "私密项目"));
  assert.equal(guides.loadOfflineGuideDirectory().find((row) => row.label === "新的公开指引").id, "guide-id");
  localStorage.setItem("lifespace:guide-directory:v1", "invalid-json");
  assert.ok(guides.loadOfflineGuideDirectory().length > 40);
});


test("adding a planting region to a legacy project preserves all records and original photo bytes", async () => {
  await fixture();
  const region = {country_code:"CN",country_name:"中国",region_name:"浙江",city_name:"宁波"};
  const beforeRecords = await rawRows("records");
  await dbModule.updateLocalArchiveFields("old-project", {planting_region:region}, owner);
  const detail = await dbModule.getLocalArchiveDetail("old-project", owner);
  assert.deepEqual(detail.archive.planting_region, region);
  assert.equal(detail.archive.id, "old-project");
  assert.equal(detail.archive.local_owner_user_id, owner.userId);
  assert.equal(detail.archive.cycles[0].id, "old-cycle");
  assert.deepEqual(await rawRows("records"), beforeRecords);
  await assertOriginalPhoto(detail);
  await assert.rejects(dbModule.updateLocalArchiveFields("old-project", {planting_region:{...region,city_name:""}}, owner), /Invalid planting region/);
  assert.deepEqual((await dbModule.getLocalArchiveDetail("old-project", owner)).archive.planting_region, region);
});

test("new local planting projects require a region without changing legacy projects", async () => {
  await fixture();
  await assert.rejects(dbModule.createLocalArchive({title:"new",category:"plant"}), /Enter the planting region/);
  const region = {country_code:"CN",country_name:"中国",region_name:"浙江",city_name:"宁波"};
  const created = await dbModule.createLocalArchive({title:"new",category:"plant",planting_region:region});
  assert.deepEqual(created.planting_region, region);
  const legacy = await dbModule.getLocalArchiveDetail("old-project", owner);
  assert.equal(legacy.archive.planting_region, undefined);
  await assertOriginalPhoto(legacy);
});
