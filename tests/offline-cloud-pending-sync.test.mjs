import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";

async function moduleFrom(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
  );
}

const dbModule = await moduleFrom("lib/local-offline-db.ts");
const request = (value) =>
  new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
const finished = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });

const owner = { userId: "cloud-owner", email: "cloud@example.test" };
const timestamp = "2026-09-20T08:00:00.000Z";
const cloudArchiveId = "11111111-1111-4111-8111-111111111111";
const cloudRecordId = "22222222-2222-4222-8222-222222222222";
const cloudMediaId = "33333333-3333-4333-8333-333333333333";
const photoBytes = Uint8Array.from([71, 73, 70, 56, 57, 97, 0, 11, 45, 255]);

async function fixture() {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.indexedDB = new IDBFactory();
  globalThis.window = { indexedDB, localStorage };

  const open = indexedDB.open("life-space-local-offline", 6);
  open.onupgradeneeded = () => {
    for (const name of ["archives", "records", "images", "taxonomy"]) {
      open.result.createObjectStore(name, { keyPath: "id" });
    }
  };
  const database = await request(open);
  const transaction = database.transaction(
    ["archives", "records", "images"],
    "readwrite",
  );
  const done = finished(transaction);
  transaction.objectStore("archives").add({
    id: "cloud-local-copy",
    title: "云端项目的本地副本",
    category: "system",
    main_category: "system",
    system_name: "堆肥",
    source_cloud_archive_id: cloudArchiveId,
    source_cloud_saved_at: timestamp,
    local_owner_user_id: owner.userId,
    local_owner_email: owner.email,
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
    local_only: true,
    sync: {
      status: "local-only",
      cloud_archive_id: cloudArchiveId,
      last_sync_at: timestamp,
    },
  });
  transaction.objectStore("records").add({
    id: "imported-record",
    archive_id: "cloud-local-copy",
    note: "云端已有记录",
    record_time: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    local_only: true,
    sync: {
      status: "local-only",
      cloud_archive_id: cloudArchiveId,
      cloud_record_id: cloudRecordId,
      last_sync_at: timestamp,
    },
  });
  transaction.objectStore("images").add({
    id: "imported-image",
    archive_id: "cloud-local-copy",
    record_id: "imported-record",
    blob: new Blob([photoBytes], { type: "image/gif" }),
    mime_type: "image/gif",
    name: "cloud.gif",
    original_size: photoBytes.length,
    cached_size: photoBytes.length,
    sort_order: 0,
    created_at: timestamp,
    local_only: true,
    sync: {
      status: "local-only",
      cloud_archive_id: cloudArchiveId,
      cloud_record_id: cloudRecordId,
      cloud_media_id: cloudMediaId,
      last_sync_at: timestamp,
    },
  });
  await done;
  database.close();
}

function photo(name = "offline.gif") {
  return new File([photoBytes], name, { type: "image/gif" });
}

test("cloud snapshots are not pending and pure local work never enters the queue", async () => {
  await fixture();
  assert.deepEqual(await dbModule.listPendingCloudSyncSummaries(owner), []);

  const localArchive = await dbModule.createLocalArchive({
    title: "真正的纯本地项目",
    category: "system",
    system_name: "本地方法",
    local_owner_user_id: owner.userId,
    local_owner_email: owner.email,
  });
  const localRecord = await dbModule.createLocalRecord({
    archive_id: localArchive.id,
    note: "只留在本机",
    image_files: [photo("local.gif")],
  });
  const detail = await dbModule.getLocalArchiveDetail(localArchive.id, owner);

  assert.equal(localRecord.sync.status, "local-only");
  assert.equal(detail.records[0].images[0].sync.status, "local-only");
  assert.deepEqual(await dbModule.listPendingCloudSyncSummaries(owner), []);
  assert.equal((await indexedDB.databases())[0].version, 6);
});

test("new cloud-origin records and photos receive stable pending operation identities", async () => {
  await fixture();
  const record = await dbModule.createLocalRecord({
    archive_id: "cloud-local-copy",
    note: "断网新增记录",
    image_files: [photo()],
  });
  const detail = await dbModule.getLocalArchiveDetail("cloud-local-copy", owner);
  const storedRecord = detail.records.find((item) => item.id === record.id);
  const storedImage = storedRecord.images[0];
  const summaries = await dbModule.listPendingCloudSyncSummaries(owner);

  assert.equal(storedRecord.sync.status, "pending-cloud-sync");
  assert.equal(storedRecord.sync.operation_kind, "create-record");
  assert.match(storedRecord.sync.client_operation_id, /^[0-9a-f-]{36}$/i);
  assert.equal(storedImage.sync.status, "pending-cloud-sync");
  assert.equal(storedImage.sync.operation_kind, "upload-image");
  assert.match(storedImage.sync.client_operation_id, /^[0-9a-f-]{36}$/i);
  assert.equal(
    storedImage.sync.depends_on_operation_id,
    storedRecord.sync.client_operation_id,
  );
  assert.deepEqual(
    {
      records: summaries[0].record_count,
      images: summaries[0].image_count,
      bytes: summaries[0].estimated_media_bytes,
      prompt: summaries[0].should_prompt,
    },
    {
      records: 1,
      images: 1,
      bytes: storedImage.cached_size,
      prompt: true,
    },
  );
});

test("deferring is persistent and later pending work stays in manual mode", async () => {
  await fixture();
  await dbModule.createLocalRecord({
    archive_id: "cloud-local-copy",
    note: "第一条离线记录",
  });
  await dbModule.deferPendingCloudSyncPrompt("cloud-local-copy", owner);
  const firstRead = await dbModule.listPendingCloudSyncSummaries(owner);

  assert.equal(firstRead[0].prompt_mode, "manual");
  assert.equal(firstRead[0].should_prompt, false);
  assert.ok(firstRead[0].deferred_at);

  await dbModule.createLocalRecord({
    archive_id: "cloud-local-copy",
    note: "稍后新增的第二条记录",
  });
  const reopened = await dbModule.listPendingCloudSyncSummaries(owner);
  assert.equal(reopened[0].record_count, 2);
  assert.equal(reopened[0].prompt_mode, "manual");
  assert.equal(reopened[0].should_prompt, false);
  assert.equal(reopened[0].deferred_at, firstRead[0].deferred_at);
});

test("editing an imported cloud record queues only its changed fields and new photo", async () => {
  await fixture();
  const updated = await dbModule.updateLocalRecordFields("imported-record", {
    note: "离线修改后的文字",
    image_files: [photo("added.gif")],
  });
  const firstOperationId = updated.sync.client_operation_id;
  const detail = await dbModule.getLocalArchiveDetail("cloud-local-copy", owner);
  const imported = detail.records.find((record) => record.id === "imported-record");
  const addedImage = imported.images.find((image) => image.id !== "imported-image");
  const summaries = await dbModule.listPendingCloudSyncSummaries(owner);

  assert.equal(imported.sync.operation_kind, "update-record");
  assert.equal(imported.sync.cloud_record_id, cloudRecordId);
  assert.deepEqual(imported.sync.pending_fields, ["note"]);
  assert.equal(addedImage.sync.operation_kind, "upload-image");
  assert.equal(addedImage.sync.cloud_record_id, cloudRecordId);
  assert.equal(addedImage.sync.depends_on_operation_id, null);
  assert.equal(summaries[0].record_count, 1);
  assert.equal(summaries[0].image_count, 1);

  const updatedAgain = await dbModule.updateLocalRecordFields("imported-record", {
    location: { label: "后院", source: "manual" },
  });
  assert.equal(updatedAgain.sync.client_operation_id, firstOperationId);
  assert.deepEqual(updatedAgain.sync.pending_fields, ["note", "location"]);
});

test("cloud project edits track only cloud-backed fields while local grouping stays local", async () => {
  await fixture();
  await dbModule.updateLocalArchiveFields(
    "cloud-local-copy",
    { subcategory: "只在本机的分组" },
    owner,
  );
  assert.deepEqual(await dbModule.listPendingCloudSyncSummaries(owner), []);

  const updated = await dbModule.updateLocalArchiveFields(
    "cloud-local-copy",
    { title: "离线修改后的项目名" },
    owner,
  );
  const summaries = await dbModule.listPendingCloudSyncSummaries(owner);

  assert.equal(updated.sync.status, "pending-cloud-sync");
  assert.equal(updated.sync.operation_kind, "update-archive");
  assert.deepEqual(updated.sync.pending_fields, ["title"]);
  assert.equal(summaries[0].archive_update_pending, true);
  assert.equal(summaries[0].record_count, 0);
  assert.equal(summaries[0].image_count, 0);
});

test("a fresh cloud snapshot cannot overwrite a local copy with pending work", async () => {
  await fixture();
  await dbModule.createLocalRecord({
    archive_id: "cloud-local-copy",
    note: "必须保留的离线记录",
  });

  await assert.rejects(
    dbModule.beginCloudArchiveLocalImport({
      cloud_archive_id: cloudArchiveId,
      cycles: [],
      owner_context: owner,
    }),
    /不能用云端快照覆盖/,
  );
  const detail = await dbModule.getLocalArchiveDetail("cloud-local-copy", owner);
  assert.ok(detail.records.some((record) => record.note === "必须保留的离线记录"));
});

test("legacy unmarked cloud-origin work is safely adopted into the pending queue", async () => {
  await fixture();
  const database = await request(indexedDB.open("life-space-local-offline"));
  const transaction = database.transaction(["records", "images"], "readwrite");
  const done = finished(transaction);
  transaction.objectStore("records").add({
    id: "legacy-offline-record",
    archive_id: "cloud-local-copy",
    note: "旧版本离线新增",
    record_time: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    local_only: true,
    sync: { status: "local-only" },
  });
  transaction.objectStore("images").add({
    id: "legacy-offline-image",
    archive_id: "cloud-local-copy",
    record_id: "legacy-offline-record",
    blob: new Blob([photoBytes], { type: "image/gif" }),
    mime_type: "image/gif",
    name: "legacy.gif",
    original_size: photoBytes.length,
    cached_size: photoBytes.length,
    sort_order: 0,
    created_at: timestamp,
    local_only: true,
    sync: { status: "local-only" },
  });
  await done;
  database.close();

  const prepared = await dbModule.preparePendingCloudSyncQueue(owner);
  const detail = await dbModule.getLocalArchiveDetail("cloud-local-copy", owner);
  const record = detail.records.find((item) => item.id === "legacy-offline-record");
  const summaries = await dbModule.listPendingCloudSyncSummaries(owner);

  assert.deepEqual(prepared, { queuedRecordCount: 1, queuedImageCount: 1 });
  assert.equal(record.sync.operation_kind, "create-record");
  assert.equal(
    record.images[0].sync.depends_on_operation_id,
    record.sync.client_operation_id,
  );
  assert.equal(summaries[0].record_count, 1);
  assert.equal(summaries[0].image_count, 1);
  assert.deepEqual(await dbModule.preparePendingCloudSyncQueue(owner), {
    queuedRecordCount: 0,
    queuedImageCount: 0,
  });
});

test("failed media keeps its operation identity and remains resumable", async () => {
  await fixture();
  const created = await dbModule.createLocalRecord({
    archive_id: "cloud-local-copy",
    note: "带照片的离线记录",
    image_files: [photo("retry.gif")],
  });
  const detail = await dbModule.getLocalArchiveDetail("cloud-local-copy", owner);
  const image = detail.records.find((record) => record.id === created.id).images[0];
  const operationId = image.sync.client_operation_id;

  const failed = await dbModule.updateLocalImageSyncMeta(image.id, {
    status: "failed",
    attempt_count: 1,
    last_error: "network interrupted",
  });
  const failedSummary = await dbModule.listPendingCloudSyncSummaries(owner);
  assert.equal(failed.sync.client_operation_id, operationId);
  assert.equal(failedSummary[0].failed_image_count, 1);

  const retrying = await dbModule.updateLocalImageSyncMeta(image.id, {
    status: "pending-cloud-sync",
    last_error: null,
  });
  assert.equal(retrying.sync.client_operation_id, operationId);
  assert.equal(retrying.sync.attempt_count, 1);
  assert.equal(retrying.sync.last_error, null);
});
