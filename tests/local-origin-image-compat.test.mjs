import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";

async function loadModule(entry) {
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

const db = await loadModule("lib/local-offline-db.ts");
const images = await loadModule("lib/local-image-blob.ts");
const owner = { userId: "owner", email: "owner@example.test" };
const date = "2026-09-28T08:00:00.000Z";
const bytes = Uint8Array.from([71, 73, 70, 56, 57, 97]);

function resetStorage() {
  const entries = new Map();
  globalThis.localStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
  };
  globalThis.indexedDB = new IDBFactory();
  globalThis.window = { indexedDB, localStorage };
}

async function migrate(imageBlob) {
  await db.mergeLocalOriginBaseSnapshot({
    archives: [{
      id: "legacy-archive", title: "Older local project", category: "plant",
      main_category: "plant", status: "active", created_at: date, updated_at: date,
      local_owner_user_id: owner.userId, local_owner_email: owner.email,
      local_only: true, sync: { status: "local-only" },
    }],
    records: [{
      id: "legacy-record", archive_id: "legacy-archive", note: "Original note",
      record_time: date, created_at: date, updated_at: date,
      local_only: true, sync: { status: "local-only" },
    }],
    taxonomy: [],
  });
  await db.mergeLocalOriginImage({
    id: "legacy-image", archive_id: "legacy-archive", record_id: "legacy-record",
    blob: imageBlob, mime_type: "image/gif", name: "old.gif",
    original_size: bytes.length, cached_size: bytes.length,
    sort_order: 0, created_at: date, local_only: true, sync: { status: "local-only" },
  });
  await db.finalizeLocalOriginMigration();
  return db.resolveLocalArchiveDetail("legacy-archive", owner);
}

test("origin migration retains structured-cloned Blob bytes and record identity", async () => {
  resetStorage();
  const result = await migrate(new Blob([bytes], { type: "image/gif" }));
  assert.equal(result.status, "ready");
  assert.equal(result.detail.records.length, 1);
  const image = result.detail.records[0].images[0];
  assert.equal(image.archive_id, "legacy-archive");
  assert.equal(image.record_id, "legacy-record");
  assert.equal(image.mime_type, "image/gif");
  assert.ok(image.blob instanceof Blob);
  assert.ok(image.blob.size > 0);
  assert.deepEqual(new Uint8Array(await image.blob.arrayBuffer()), bytes);
});

test("legacy image byte arrays become Blobs; broken images cannot block detail", async () => {
  resetStorage();
  const result = await migrate({ data: Array.from(bytes), type: "image/gif" });
  assert.equal(result.status, "ready");
  assert.ok(result.detail.records[0].images[0].blob instanceof Blob);
  assert.deepEqual(
    new Uint8Array(await result.detail.records[0].images[0].blob.arrayBuffer()),
    bytes,
  );
  assert.equal(images.normalizeLocalImageBlob({ data: "invalid" }, "image/gif"), null);
  assert.equal(images.normalizeLocalImageBlob(new Blob([]), "image/gif"), null);
  assert.equal(images.normalizeLocalImageBlob({ data: [1, -2] }, "image/gif"), null);
  await assert.rejects(
    db.mergeLocalOriginImage({
      id: "broken", archive_id: "legacy-archive", record_id: "legacy-record",
      blob: { data: "invalid" }, mime_type: "image/gif",
    }),
    /could not decode image bytes/,
  );
  assert.equal((await db.resolveLocalArchiveDetail("legacy-archive", owner)).status, "ready");
});
