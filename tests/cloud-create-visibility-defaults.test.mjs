import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("cloud project visibility defaults and transitions stay unified", async () => {
  const [
    newProject,
    addRecord,
    quickCapture,
    archiveList,
    archiveDetail,
    migration,
    sync,
    localProject,
    zhCopy,
    enCopy,
  ] =
    await Promise.all([
      source("app/archive/new/page.tsx"),
      source("app/archive/[id]/AddRecord.tsx"),
      source("lib/cloud-quick-capture-record.ts"),
      source("app/archive/page.tsx"),
      source("app/archive/[id]/page.tsx"),
      source("supabase/migrations/20260905232113_unify_archive_visibility.sql"),
      source("lib/local-to-cloud-sync.ts"),
      source("app/local/archive/new/page.tsx"),
      source("lib/i18n/zh.ts"),
      source("lib/i18n/en.ts"),
    ]);

  assert.match(newProject, /const DEFAULT_ARCHIVE_IS_PUBLIC = true/);
  assert.match(newProject, /const DEFAULT_RECORD_VISIBILITY = "public"/);
  assert.match(newProject, /is_public: DEFAULT_ARCHIVE_IS_PUBLIC/);
  assert.match(newProject, /default_record_visibility: DEFAULT_RECORD_VISIBILITY/);
  assert.match(addRecord, /useState<RecordVisibility>\(archiveIsPublic \? "public" : "private"\)/);
  assert.match(addRecord, /visibility: finalVisibility/);
  assert.match(quickCapture, /visibility: "public"/);
  assert.match(archiveList, /newValue \? "make_my_archive_public" : "make_my_archive_private"/);
  assert.match(archiveDetail, /nextValue \? "make_my_archive_public" : "make_my_archive_private"/);
  assert.match(migration, /create or replace function public\.make_my_archive_public/);
  assert.match(migration, /set[\s\S]*?is_public = true,[\s\S]*?default_record_visibility = 'public'/);
  assert.match(migration, /set visibility = 'public'/);
  assert.match(migration, /set[\s\S]*?is_public = false,[\s\S]*?default_record_visibility = 'private'/);
  assert.match(migration, /set visibility = 'private'/);
  assert.match(sync, /default_record_visibility: params\.visibility/);
  assert.match(sync, /visibility: params\.visibility/);
  assert.doesNotMatch(localProject, /is_public|default_record_visibility|RecordVisibility/);
  assert.match(zhCopy, /此云端项目及今后新增记录默认公开/);
  assert.match(enCopy, /future records are public by default/);
});
