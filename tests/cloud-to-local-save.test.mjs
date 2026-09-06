import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("cloud projects are staged through authenticated storage before their final location changes", async () => {
  const [download, workflow] = await Promise.all([
    source("lib/media-storage-download.ts"),
    source("lib/cloud-to-local-save.ts"),
  ]);

  assert.match(
    download,
    /supabase\.storage[\s\S]*?\.from\("media"\)[\s\S]*?\.download\(storagePath\)/
  );
  assert.match(workflow, /\.from\("archives"\)[\s\S]*?\.eq\("user_id", userId\)/);
  assert.match(workflow, /\.from\("archive_cycles"\)/);
  assert.match(workflow, /\.from\("records"\)/);
  assert.match(workflow, /\.from\("media"\)/);
  assert.match(workflow, /CLOUD_READ_PAGE_SIZE = 500/);
  assert.match(workflow, /CLOUD_MEDIA_RECORD_BATCH_SIZE = 100/);
  assert.match(workflow, /\.range\(offset, offset \+ CLOUD_READ_PAGE_SIZE - 1\)/);
  assert.match(workflow, /recordIds\.slice\(/);
  assert.match(workflow, /downloadMediaStorageObject\(item\)/);
  assert.match(
    workflow,
    /"id, cycle_id, note, record_time, created_at, visibility, status_tag, record_tags\(tag, tag_type, is_active\)"/
  );
  assert.doesNotMatch(
    workflow,
    /"id, cycle_id, note, record_time, created_at, updated_at, visibility/
  );
  assert.match(
    workflow,
    /verifyCloudArchiveLocalImport\([\s\S]*?if \(params\.mode === "move"\)[\s\S]*?requestCloudTrash\("archives", archive\.id\)[\s\S]*?completeCloudArchiveLocalImport/
  );
  assert.match(
    workflow,
    /if \(movedCloudOriginal\)[\s\S]*?restoreCloudTrashItem\("archive", archive\.id\)[\s\S]*?abortCloudArchiveLocalImport/
  );
  assert.doesNotMatch(workflow, /\.from\("archives"\)[\s\S]*?\.delete\(\)/);
});

test("an interrupted cloud download cannot replace an existing local copy", async () => {
  const [workflow, localDb] = await Promise.all([
    source("lib/cloud-to-local-save.ts"),
    source("lib/local-offline-db.ts"),
  ]);

  assert.match(
    workflow,
    /beginCloudArchiveLocalImport[\s\S]*?stageCloudArchiveLocalRecord[\s\S]*?stageCloudArchiveLocalImage[\s\S]*?completeCloudArchiveLocalImport/
  );
  assert.match(
    workflow,
    /catch \(error\) \{[\s\S]*?abortCloudArchiveLocalImport\(session\)/
  );
  assert.match(
    localDb,
    /removeAbandonedCloudArchiveLocalImportRows[\s\S]*?!archiveIds\.has\(record\.archive_id\)[\s\S]*?!archiveIds\.has\(image\.archive_id\)/
  );
  assert.match(
    localDb,
    /verifyCloudArchiveLocalImport[\s\S]*?stagedRecords\.length !== input\.expected_record_count[\s\S]*?stagedImages\.length !== input\.expected_image_count/
  );
  assert.match(
    localDb,
    /if \(previous\) \{[\s\S]*?archiveStore\.delete\(previous\.id\)[\s\S]*?archiveStore\.add\(archive\)/
  );
  assert.match(localDb, /source_cloud_archive_id/);
  assert.match(localDb, /previous_local_archive_id/);
  assert.match(workflow, /retain_cloud_source: params\.mode !== "move"/);
  assert.match(
    localDb,
    /if \(!retainCloudSource\)[\s\S]*?recordStore\.put[\s\S]*?imageStore\.put/
  );
});

test("the owner gets move or copy behavior from membership state without two editable versions", async () => {
  const [page, header, membership, zhCopy, enCopy, localMode, rules] = await Promise.all([
    source("app/archive/[id]/page.tsx"),
    source("components/archive-detail/ArchiveDetailHeader.tsx"),
    source("lib/membership.ts"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
    source("app/local/page.tsx"),
    source("AGENTS.md"),
  ]);

  assert.match(page, /saveCloudArchiveToLocal/);
  assert.match(page, /mode: cloudToLocalMode/);
  assert.match(page, /movesCloudToLocal[\s\S]*?transfer_to_device/);
  assert.match(page, /localCopyId[\s\S]*?update_device_copy/);
  assert.match(page, /onSaveToLocal=\{openSaveToLocalPrompt\}/);
  assert.match(header, /mode === "owner"[\s\S]*?onSaveToLocal/);
  assert.match(
    membership,
    /if \(membership\?\.plan === "trial"\) return "move";[\s\S]*?canCreateMembershipContent\(membership\) \? "move" : "copy"/
  );
  assert.match(zhCopy, /transfer_to_device: "转到本地"/);
  assert.match(zhCopy, /save_to_device: "保存到本机"/);
  assert.match(zhCopy, /本地成为唯一可编辑版本/);
  assert.match(enCopy, /save_to_device: "Save to this device"/);
  assert.match(enCopy, /transfer_to_device: "Move to this device"/);
  assert.match(zhCopy, /付费会员到期后仍是“保存到本机”/);
  assert.match(localMode, /t\.local_mode\.backup_notice/);
  assert.match(rules, /不增加“启用本地”的总开关/);
  assert.match(rules, /同一项目始终只允许一个可编辑主版本/);
  assert.match(rules, /付费会员到期未续费时，项目操作仍叫“保存到本机”/);
  assert.match(rules, /任何状态都不增加“是否删除云端”的询问/);
});

test("optional cloud classification cannot block a complete local rescue", async () => {
  const [workflow, localDb] = await Promise.all([
    source("lib/cloud-to-local-save.ts"),
    source("lib/local-offline-db.ts"),
  ]);

  assert.match(
    workflow,
    /async function readOptionalTagName[\s\S]*?if \(error\) \{[\s\S]*?return null;/
  );
  assert.match(
    localDb,
    /stagedImages\.some\(\(image\) => !image\.blob \|\| image\.blob\.size <= 0\)/
  );
});

test("a cloud-derived local copy cannot accidentally create a duplicate cloud project", async () => {
  const sync = await source("lib/local-to-cloud-sync.ts");

  assert.match(sync, /sourceCloudArchiveId = cleanText\(archive\.source_cloud_archive_id\)/);
  assert.match(
    sync,
    /\.from\("archives"\)[\s\S]*?\.eq\("id", sourceCloudArchiveId\)[\s\S]*?\.eq\("user_id", userId\)/
  );
  assert.match(sync, /为避免重复，本机副本不会再次新建云端项目/);
});
