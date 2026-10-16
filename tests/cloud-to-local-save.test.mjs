import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("a cloud save is an owner-only copy, never a cloud move", async () => {
  const [workflow, page, membership] = await Promise.all([
    source("lib/cloud-to-local-save.ts"),
    source("app/archive/[id]/page.tsx"),
    source("lib/membership.ts"),
  ]);
  assert.match(workflow, /auth\.getUser\(\)/);
  assert.match(workflow, /assertCloudCopyEntitlement\(userId\)/);
  assert.match(workflow, /\.eq\("user_id", userId\)/);
  assert.doesNotMatch(workflow, /requestCloudTrash|restoreCloudTrashItem/);
  assert.match(membership, /getCloudToLocalMode[\s\S]*?return "copy"/);
  assert.match(page, /canSaveToLocal: canSaveCloudLocally/);
  assert.match(page, /mode: "copy"/);
});

test("Android copy commits complete bytes to SAF before an IDB mirror", async () => {
  const [workflow, db] = await Promise.all([
    source("lib/cloud-to-local-save.ts"),
    source("lib/local-offline-db.ts"),
  ]);
  assert.match(workflow, /isAndroidSafAvailable\(\)[\s\S]*?saveAndroidSafCloudCopy/);
  assert.match(workflow, /downloadMediaStorageObject\(item\)/);
  assert.match(workflow, /Cloud image byte size did not match/);
  assert.match(workflow, /commitCloudArchiveSafCopy\(\{[\s\S]*?images: localImages/);
  assert.match(workflow, /id: localId, local_role: "local-project"/);
  assert.match(workflow, /source_cloud_archive_id: archive\.id/);
  assert.match(db, /archive\.saf_local_space_id[\s\S]*?resolveLocalArchiveRole\(archive\) === "local-project"[\s\S]*?return true/);
  assert.match(db, /input\.archive\.local_role !== "local-project"/);
  const commit = db.slice(db.indexOf("export async function commitCloudArchiveSafCopy("));
  assert.match(commit, /commitSafContent\([\s\S]*?readSafCommitted\([\s\S]*?mirrorCommittedLocalSaf\(/);
  assert.match(commit, /entry\.records\.length === entry\.records\.length|row\.records\.length === entry\.records\.length/);
});

test("Android copy action is available only in allowed readonly periods and verifies cloud metadata", async () => {
  const [controller, workflow] = await Promise.all([
    source("components/archive-ui/CloudArchiveDetailController.tsx"),
    source("lib/cloud-to-local-save.ts"),
  ]);
  assert.match(controller, /mobileOwnerSettings=\{<>[\s\S]*?canCopy \? \(/);
  assert.match(controller, /onClick=\{\(\) => setCopyConfirmOpen\(true\)\}/);
  assert.match(controller, /offer\?\.lifecycle_status === "handling_period"/);
  assert.match(workflow, /const contentFields: Array<keyof CloudArchiveRow>/);
  assert.match(workflow, /currentArchive\[field\]/);
  assert.doesNotMatch(workflow, /select\("id,user_id,updated_at"\)/);
});

test("same-source copy cannot silently overwrite local edits or duplicate a project", async () => {
  const [workflow, db] = await Promise.all([
    source("lib/cloud-to-local-save.ts"),
    source("lib/local-offline-db.ts"),
  ]);
  assert.match(workflow, /if \(existing\)[\s\S]*?return \{ localArchiveId: existing\.id/);
  assert.match(workflow, /if \(existingWebCopy\)[\s\S]*?return \{ localArchiveId: existingWebCopy\.id/);
  const commit = db.slice(db.indexOf("export async function commitCloudArchiveSafCopy("));
  assert.match(commit, /entry\.archive\.source_cloud_archive_id === sourceId/);
  assert.match(commit, /if \(existing\) return \{ archive: existing\.archive, alreadySaved: true \}/);
  assert.match(commit, /Local project ID conflict/);
});

test("pending content and incomplete media fail closed before durable copy", async () => {
  const [workflow, db] = await Promise.all([
    source("lib/cloud-to-local-save.ts"),
    source("lib/local-offline-db.ts"),
  ]);
  assert.match(workflow, /listPendingCloudSyncSummaries\(input\.ownerContext\)/);
  assert.match(workflow, /pending local records or photos/);
  assert.match(workflow, /Unsupported cloud media/);
  assert.match(workflow, /Detached cloud media/);
  const commit = db.slice(db.indexOf("export async function commitCloudArchiveSafCopy("));
  assert.match(commit, /recordIds\.size !== input\.records\.length/);
  assert.match(commit, /!recordIds\.has\(image\.record_id\)/);
  assert.match(commit, /!image\.blob \|\| image\.blob\.size <= 0/);
});

test("independent cloud copy provenance never becomes a pending cloud upload", async () => {
  const db = await source("lib/local-offline-db.ts");
  const start = db.indexOf("function archiveParticipatesInPendingCloudSync(");
  const end = db.indexOf("\nfunction queueCloudSyncOperation(", start);
  assert.ok(start >= 0 && end > start);
  const eligibility = db.slice(start, end);
  assert.match(eligibility, /archive\.local_role === "local-project"/);
  assert.match(eligibility, /source_cloud_saved_at/);
  assert.match(eligibility, /return false/);
  assert.match(db, /preparePendingCloudSyncQueue[\s\S]*?archiveParticipatesInPendingCloudSync\(archive\)/);
});

test("web copy still stages to IDB and keeps the cloud source", async () => {
  const [workflow, db] = await Promise.all([
    source("lib/cloud-to-local-save.ts"),
    source("lib/local-offline-db.ts"),
  ]);
  assert.match(workflow, /beginCloudArchiveLocalImport[\s\S]*?stageCloudArchiveLocalRecord[\s\S]*?stageCloudArchiveLocalImage/);
  assert.match(workflow, /verifyCloudArchiveLocalImport[\s\S]*?retain_cloud_source: true/);
  assert.match(workflow, /abortCloudArchiveLocalImport\(session\)/);
  assert.match(db, /stagedRecords\.length !== input\.expected_record_count/);
});
