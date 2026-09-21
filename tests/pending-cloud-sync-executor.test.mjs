import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pending cloud sync uses exact operation identities instead of fuzzy matching", async () => {
  const executor = await source("lib/pending-cloud-sync.ts");

  assert.match(executor, /const cloudRecordId = isCreate[\s\S]*?operationId/);
  assert.match(executor, /id: cloudRecordId/);
  assert.match(executor, /const mediaId = operationId/);
  assert.match(executor, /reservationId: operationId/);
  assert.match(executor, /\.eq\("id", recordId\)/);
  assert.doesNotMatch(executor, /findExistingCloudRecord|\.eq\("note"/);
});

test("pending image retries keep deterministic paths and never delete uncertain uploads", async () => {
  const executor = await source("lib/pending-cloud-sync.ts");

  assert.match(executor, /offline-\$\{params\.operationId\}/);
  assert.match(executor, /upsert: true/);
  assert.doesNotMatch(executor, /cancelStorageUploadReservation/);
  assert.doesNotMatch(executor, /storage\.from\("media"\)\.remove/);
});

test("reconnect prompt remains opt-in and manual entries are available", async () => {
  const [prompt, layout, localDetail, workspace] = await Promise.all([
    source("components/PendingCloudSyncPrompt.tsx"),
    source("app/layout.tsx"),
    source("app/local/archive/[id]/page.tsx"),
    source("app/archive/page.tsx"),
  ]);

  assert.match(prompt, /pending_sync_now/);
  assert.match(prompt, /pending_sync_later/);
  assert.match(prompt, /deferPendingCloudSyncPrompt/);
  assert.match(prompt, /window\.addEventListener\("online"/);
  assert.match(layout, /<PendingCloudSyncPrompt \/>/);
  assert.match(localDetail, /syncPendingCloudArchive/);
  assert.match(workspace, /\?sync=1/);
});
