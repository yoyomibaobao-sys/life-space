import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";

const result = await build({ entryPoints: ["lib/local-offline-db.ts", "lib/local-saf-migration.ts"], bundle: true,
  write: false, platform: "node", format: "esm", outdir: "out" });
const load = async (file) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles.find((row) =>
  row.path.endsWith(file)).contents).toString("base64")}`);
const local = await load("local-offline-db.js");
const migration = await load("local-saf-migration.js");
const request = (value) => new Promise((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error);
});
const finished = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onabort = () => reject(tx.error);
});
const stamp = "2026-10-06T00:00:00.000Z";
const localArchive = { id: "local-1", local_role: "local-project", title: "番茄",
  category: "plant", main_category: "plant", status: "active", local_only: true,
  cycles: [{ id: "cycle-1", archive_id: "local-1", cycle_no: 1,
    started_at: stamp, created_at: stamp, updated_at: stamp, status: "active" }],
  created_at: stamp, updated_at: stamp, sync: { status: "local-only" } };
const photo = Uint8Array.from([4, 12, 6]);
const record = { id: "record-1", archive_id: "local-1", note: "原始内容",
  local_only: true, created_at: stamp, updated_at: stamp, sync: { status: "local-only" } };
const image = { id: "image-1", archive_id: "local-1", record_id: "record-1",
  blob: new Blob([photo], { type: "image/jpeg" }), mime_type: "image/jpeg", name: "photo.jpg",
  cached_size: photo.length, original_size: photo.length, sort_order: 0,
  local_only: true, created_at: stamp, sync: { status: "local-only" } };
const cloudArchive = { ...localArchive, id: "cache-1", local_role: "cloud-offline-cache",
  source_cloud_archive_id: "cloud-id" };
const cloudRecord = { ...record, id: "cache-record", archive_id: "cache-1", sync: { status: "synced" } };
const pendingRecord = { ...record, id: "pending-record", archive_id: "cache-1",
  sync: { status: "pending-cloud-sync" } };

async function fixture() {
  globalThis.indexedDB = new IDBFactory();
  const storage = new Map();
  globalThis.window = { indexedDB, localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  } };
  window.localStorage.setItem("lifespace:archive-category-depths:local:v1:device",
    JSON.stringify({ plant: 2, system: 3, insect_fish: 1, other: 3 }));
  const open = indexedDB.open("life-space-local-offline", 6);
  open.onupgradeneeded = () => {
    for (const name of ["archives", "records", "images", "taxonomy"])
      open.result.createObjectStore(name, { keyPath: "id" });
  };
  const db = await request(open);
  const tx = db.transaction(["archives", "records", "images", "taxonomy"], "readwrite");
  const done = finished(tx);
  for (const row of [localArchive, cloudArchive]) tx.objectStore("archives").put(row);
  for (const row of [record, cloudRecord, pendingRecord]) tx.objectStore("records").put(row);
  tx.objectStore("images").put(image);
  tx.objectStore("taxonomy").put({ id: "group-1", kind: "group", label: "菜园", local_only: true });
  await done;
  db.close();
}

test("read-only legacy inventory retains local, cache and pending records without changing IndexedDB", async () => {
  await fixture();
  const rows = await local.readLegacySafRows();
  assert.deepEqual([rows.archives.length, rows.records.length, rows.images.length], [2, 3, 1]);
  assert.deepEqual(new Uint8Array(await rows.images[0].blob.arrayBuffer()), photo);
  assert.equal(rows.archives[0].cycles[0].id, "cycle-1");
  assert.equal(rows.categoryDepths.device.plant, 2);
  assert.equal((await local.readLegacySafRows()).archives.length, 2);
});

test("migration dry-run refuses cache without trusted owner and leaves legacy rows untouched", async () => {
  await fixture();
  await assert.rejects(migration.planLegacySafMigration(await local.readLegacySafRows()), /Unknown cloud owner/);
  assert.equal((await local.readLegacySafRows()).records.length, 3);
});
