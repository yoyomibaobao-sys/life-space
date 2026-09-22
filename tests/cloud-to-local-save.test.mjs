import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("cloud projects are staged and verified locally without changing the cloud original", async () => {
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
    /verifyCloudArchiveLocalImport\([\s\S]*?completeCloudArchiveLocalImport/
  );
  assert.match(workflow, /retain_cloud_source: true/);
  assert.doesNotMatch(workflow, /requestCloudTrash|restoreCloudTrashItem|mode === "move"/);
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
  assert.match(workflow, /retain_cloud_source: true/);
  assert.match(
    localDb,
    /if \(!retainCloudSource\)[\s\S]*?recordStore\.put[\s\S]*?imageStore\.put/
  );
});

test("the owner always saves a local copy without automatically removing the cloud original", async () => {
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
  assert.doesNotMatch(page, /getCloudToLocalMode|movesCloudToLocal|mode: cloudToLocalMode/);
  assert.match(page, /localCopyId[\s\S]*?update_device_copy/);
  assert.match(page, /onSaveToLocal=\{openSaveToLocalPrompt\}/);
  assert.match(header, /mode === "owner"[\s\S]*?onSaveToLocal/);
  assert.doesNotMatch(membership, /getCloudToLocalMode|CloudToLocalMode/);
  assert.match(zhCopy, /save_to_device: "保存到本机"/);
  assert.doesNotMatch(zhCopy, /transfer_to_device:/);
  assert.match(enCopy, /save_to_device: "Save to this device"/);
  assert.doesNotMatch(enCopy, /transfer_to_device:/);
  assert.match(localMode, /t\.local_mode\.backup_notice/);
  assert.match(rules, /保存到本机不会自动删除、移入回收站或修改云端原件/);
  assert.match(rules, /永远不做自动双向同步/);
  assert.match(rules, /重命名并另存为新的云端项目/);
});

test("local-to-cloud uploads stay behind explicit user actions and never run on reconnect", async () => {
  const [localPage, workspace, zhCopy, enCopy] = await Promise.all([
    source("app/local/archive/[id]/page.tsx"),
    source("components/archive-ui/ArchiveWorkspaceTemplate.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.equal((localPage.match(/syncLocalArchiveToCloud\(/g) || []).length, 2);
  assert.match(localPage, /confirmTransferToCloud[\s\S]*?syncLocalArchiveToCloud/);
  assert.match(localPage, /saveConflictAsNewCloudProject[\s\S]*?syncLocalArchiveToCloud/);
  assert.doesNotMatch(localPage, /addEventListener\("online"[\s\S]*?syncLocalArchiveToCloud/);
  assert.doesNotMatch(workspace, /syncLocalArchiveToCloud/);
  assert.match(zhCopy, /开通云会员不会自动上传本地记录/);
  assert.match(enCopy, /does not upload local records automatically/);
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

test("a cloud-derived local copy never overwrites the original and can be renamed into a new cloud project", async () => {
  const [sync, page, localDb] = await Promise.all([
    source("lib/local-to-cloud-sync.ts"),
    source("app/local/archive/[id]/page.tsx"),
    source("lib/local-offline-db.ts"),
  ]);

  assert.match(sync, /sourceCloudArchiveId = cleanText\(archive\.source_cloud_archive_id\)/);
  assert.match(
    sync,
    /\.from\("archives"\)[\s\S]*?\.eq\("id", sourceCloudArchiveId\)[\s\S]*?\.eq\("user_id", userId\)/
  );
  assert.match(sync, /conflict: "source-cloud-exists"/);
  assert.match(sync, /自动合并/);
  assert.match(page, /saveConflictAsNewCloudProject/);
  assert.match(page, /source_cloud_archive_id: null/);
  assert.match(page, /transfer_conflict_save_new/);
  assert.match(localDb, /source_cloud_archive_id\?: string \| null/);
});
