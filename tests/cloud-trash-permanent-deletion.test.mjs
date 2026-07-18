import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("purge and retry routes accept only a trash entry id", async () => {
  const purge = await source("app/api/trash/purge/route.ts");
  const retry = await source("app/api/trash/retry/route.ts");

  for (const route of [purge, retry]) {
    assert.match(route, /key !== "trashEntryId"/);
    assert.match(route, /isUuid\(values\.trashEntryId\)/);
    assert.doesNotMatch(route, /ownerUserId|object_path|bucket_id|jobId|itemId/);
  }
});

test("all mutation routes validate origin and authenticated actor", async () => {
  const paths = [
    "app/api/trash/purge/route.ts",
    "app/api/trash/retry/route.ts",
    "app/api/trash/empty/route.ts",
  ];

  for (const path of paths) {
    const route = await source(path);
    assert.match(route, /hasValidMutationOrigin\(request\)/);
    assert.match(route, /getCloudTrashActor\(request\)/);
  }
});

test("service role orchestration uses the authenticated user id", async () => {
  const service = await source("lib/server/cloud-trash-purge.ts");

  assert.match(service, /getAuthenticatedRequestClient\(request\)/);
  assert.match(service, /p_owner_user_id: userId/);
  assert.match(service, /p_target_type: entry\.target_type/);
  assert.match(service, /p_target_id: entry\.target_id/);
  assert.doesNotMatch(service, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("purge and retry enforce separate safe state transitions", async () => {
  const service = await source("lib/server/cloud-trash-purge.ts");

  assert.match(service, /mode === "purge".*entry\.status !== "active".*entry\.status !== "purging"/s);
  assert.match(service, /mode === "retry".*entry\.status !== "failed".*entry\.status !== "purging"/s);
  assert.match(service, /capacity_reconciliation_required/);
});

test("empty trash considers only the current owner's active entries", async () => {
  const service = await source("lib/server/cloud-trash-purge.ts");

  assert.match(service, /\.eq\("owner_user_id", userId\)/);
  assert.match(service, /\.eq\("status", "active"\)/);
  assert.match(service, /EMPTY_TRASH_ENTRY_LIMIT = 200/);
  assert.match(service, /for \(const row of selectedRows\)/);
});

test("route responses do not expose deletion internals", async () => {
  const paths = [
    "app/api/trash/purge/route.ts",
    "app/api/trash/retry/route.ts",
    "app/api/trash/empty/route.ts",
  ];

  for (const path of paths) {
    const route = await source(path);
    assert.doesNotMatch(route, /deletion_job_id|object_path|bucket_id|service_role/);
  }
});

test("accepted mutations use bounded immediate worker processing", async () => {
  const service = await source("lib/server/cloud-trash-purge.ts");
  const worker = await source("lib/server/storage-deletion-worker.ts");

  assert.match(service, /maxBatches: 2/);
  assert.match(service, /maxDurationMs: 4_000/);
  assert.match(worker, /Math\.min\(Math\.max\(Math\.trunc\(options\.maxBatches/);
  assert.match(worker, /if \(summary\.claimed === 0\) break/);
});

test("cron worker remains secret protected and bounded", async () => {
  const route = await source("app/api/internal/storage-deletion-worker/route.ts");

  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /runStorageDeletionWorkerBatches/);
  assert.match(route, /maxBatches: 5/);
  assert.match(route, /maxDurationMs: 20_000/);
});

test("listing exposes only active, purging, and failed roots", async () => {
  const migration = await source(
    "supabase/migrations/20260718130000_extend_cloud_trash_processing_listing.sql",
  );
  const returnSignature =
    migration.match(/returns table \(([\s\S]*?)\)\nlanguage sql/)?.[1] || "";

  assert.match(migration, /te\.status in \('active', 'purging', 'failed'\)/g);
  assert.match(migration, /trash_entry_id uuid/);
  assert.match(migration, /can_retry boolean/);
  assert.doesNotMatch(returnSignature, /deletion_job_id/);
  assert.doesNotMatch(returnSignature, /object_path/);
});

test("listing stays owner-only and does not grant direct trash table access", async () => {
  const migration = await source(
    "supabase/migrations/20260718130000_extend_cloud_trash_processing_listing.sql",
  );

  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /te\.owner_user_id = cu\.id/g);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function public\.list_my_trash_entries\(\)/);
  assert.match(migration, /grant execute on function public\.list_my_trash_entries\(\)[\s\S]*to authenticated/);
});

test("trash UI renders the three user-visible states", async () => {
  const page = await source("app/profile/trash/page.tsx");

  assert.match(page, /item\.status === "active"/);
  assert.match(page, /item\.status === "purging"/);
  assert.match(page, /item\.status === "failed"/);
  assert.match(page, /正在永久删除/);
  assert.match(page, /永久删除失败/);
  assert.match(page, /删除未完成，请重试/);
});

test("trash UI uses the approved irreversible confirmation copy", async () => {
  const page = await source("app/profile/trash/page.tsx");

  assert.match(page, /项目中的记录和照片也会一起永久删除，删除后无法恢复。/);
  assert.match(page, /这条记录及其中的照片将被永久删除，删除后无法恢复。/);
  assert.match(page, /回收站中的所有内容将被永久删除，删除后无法恢复。/);
});

test("trash polling is low frequency, visibility aware, and conditional", async () => {
  const page = await source("app/profile/trash/page.tsx");

  assert.match(page, /if \(!hasPurgingItems\) return/);
  assert.match(page, /setInterval\(refresh, 4_000\)/);
  assert.match(page, /document\.visibilityState !== "visible"/);
  assert.match(page, /clearInterval\(interval\)/);
});

test("ordinary cloud deletes still move content to trash", async () => {
  const archive = await source("app/api/archives/[id]/route.ts");
  const record = await source("app/api/records/[id]/route.ts");
  const media = await source("app/api/media/[id]/route.ts");

  assert.match(archive, /handleMoveToTrashRequest/);
  assert.match(record, /handleMoveToTrashRequest/);
  assert.match(media, /handleMoveToTrashRequest/);
  for (const route of [archive, record, media]) {
    assert.doesNotMatch(route, /request_delete_|runStorageDeletionWorker|storage\.remove/);
  }
});
