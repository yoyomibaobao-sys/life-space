import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync(
  new URL("../lib/storage-upload-maintenance.ts", import.meta.url),
  "utf8"
);

const addRecord = readFileSync(
  new URL("../app/archive/[id]/AddRecord.tsx", import.meta.url),
  "utf8"
);

const archiveDetail = readFileSync(
  new URL("../app/archive/[id]/page.tsx", import.meta.url),
  "utf8"
);

const localSync = readFileSync(
  new URL("../lib/local-to-cloud-sync.ts", import.meta.url),
  "utf8"
);

const marketNew = readFileSync(
  new URL("../app/market/new/page.tsx", import.meta.url),
  "utf8"
);

const marketEdit = readFileSync(
  new URL("../app/market/[id]/edit/page.tsx", import.meta.url),
  "utf8"
);

const zhCopy = readFileSync(
  new URL("../lib/i18n/zh.ts", import.meta.url),
  "utf8"
);

const enCopy = readFileSync(
  new URL("../lib/i18n/en.ts", import.meta.url),
  "utf8"
);

test("maintenance check remains safe before the compatibility RPC exists", () => {
  assert.match(helper, /is_storage_upload_accepting/);
  assert.match(helper, /PGRST202/);
  assert.match(helper, /error\.code === "42883"/);
  assert.match(helper, /return false;/);
});

test("record uploads distinguish saved text from unavailable images", () => {
  assert.match(addRecord, /upload_maintenance/);
  assert.match(addRecord, /copy\.maintenance_record_not_saved/);
  assert.match(addRecord, /copy\.maintenance_text_saved/);
  assert.match(archiveDetail, /recordCopy\.maintenance_upload/);
  assert.match(localSync, /STORAGE_UPLOAD_MAINTENANCE_SYNC_NOT_STARTED_MESSAGE/);
  assert.match(localSync, /STORAGE_UPLOAD_MAINTENANCE_SYNC_MESSAGE/);
});

test("market uploads preflight maintenance before writing a new post", () => {
  const checkIndex = marketNew.indexOf("await isStorageUploadMaintenance()");
  const insertIndex = marketNew.indexOf('.from("market_posts")');

  assert.ok(checkIndex >= 0);
  assert.ok(insertIndex >= 0);
  assert.ok(checkIndex < insertIndex);
  assert.match(marketNew, /t\.market\.upload_maintenance/);
  assert.match(marketEdit, /t\.market\.image_upload_maintenance/);
  assert.match(zhCopy, /upload_maintenance: "图片上传功能正在维护，本次集市发布尚未保存，请稍后再试。"/);
  assert.match(enCopy, /upload_maintenance: "Image uploads are under maintenance, so this Market post was not saved/);
});

test("storage upload races recheck the maintenance switch", () => {
  for (const callSite of [
    addRecord,
    archiveDetail,
    localSync,
    marketNew,
    marketEdit,
  ]) {
    assert.match(callSite, /isStorageUploadMaintenance/);
  }
});
