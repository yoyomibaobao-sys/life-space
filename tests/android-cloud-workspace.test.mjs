import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildAndroidCloudWorkspace, canOfferLocalCloudTransfer } from "../lib/android-cloud-workspace.ts";

const shell = () => fs.readFileSync("mobile-offline-src/main.tsx", "utf8");
const local = (id, extra = {}) => ({ id, title: id, category: "plant", sync: { status: "local-only" }, ...extra });
const pending = (id, cloudId, extra = {}) => ({
  local_archive_id: id, cloud_archive_id: cloudId, title: id,
  archive_create_pending: false, archive_failed: false, last_error: null,
  record_count: 0, image_count: 0, failed_record_count: 0, failed_image_count: 0,
  ...extra,
});

test("pending cloud creation belongs to cloud, never local, even offline", () => {
  const draft = local("draft", { sync: { status: "pending-cloud-sync", operation_kind: "create-archive" } });
  const view = buildAndroidCloudWorkspace({
    local: [draft, local("only-local")], caches: [], live: [],
    pending: [pending("draft", "client-operation-id", { archive_create_pending: true, record_count: 2, image_count: 3 })],
    preferLive: false,
  });
  assert.equal(view.pending.length, 1);
  assert.equal(view.pending[0].creating, true);
  assert.equal(view.pending[0].recordCount, 2);
  assert.equal(view.pending[0].imageCount, 3);
  assert.deepEqual(view.localOnly.map((row) => row.id), ["only-local"]);
  assert.deepEqual(view.counts, { cloud: 1, local: 1, all: 2 });
  assert.deepEqual(view.pendingCounts, { archive: 1, record: 2, image: 3 });
});

test("live, cache and multiple pending rows for one cloud project count once", () => {
  const view = buildAndroidCloudWorkspace({
    local: [local("offline-write", { source_cloud_archive_id: "cloud-1" }), local("local-only")],
    caches: [local("cache", { local_role: "cloud-offline-cache", source_cloud_archive_id: "cloud-1" })],
    live: [{ id: "cloud-1", category: "plant" }, { id: "cloud-2", category: "plant" }],
    pending: [pending("offline-write", "cloud-1", { record_count: 2 }), pending("cache", "cloud-1", { image_count: 4 })],
    preferLive: true,
  });
  assert.equal(view.pending.length, 1);
  assert.equal(view.pending[0].recordCount, 2);
  assert.equal(view.pending[0].imageCount, 4);
  assert.deepEqual(view.normalLive.map((row) => row.id), ["cloud-2"]);
  assert.deepEqual(view.localOnly.map((row) => row.id), ["local-only"]);
  assert.deepEqual(view.counts, { cloud: 2, local: 1, all: 3 });
  const offline = buildAndroidCloudWorkspace({
    local: [], caches: [local("cache", { local_role: "cloud-offline-cache", source_cloud_archive_id: "cloud-1" })],
    live: [], pending: [pending("cache", "cloud-1", { failed_image_count: 1, last_error: "retry" })],
    preferLive: false,
  });
  assert.equal(offline.pending.length, 1);
  assert.equal(offline.pending[0].failed, true);
  assert.equal(offline.normalCache.length, 0);
  assert.equal(offline.counts.local, 0);
});

test("successful sync moves one logical project into normal cloud without duplicate", () => {
  const view = buildAndroidCloudWorkspace({
    local: [], caches: [local("cache", { local_role: "cloud-offline-cache", source_cloud_archive_id: "cloud-1" })],
    live: [{ id: "cloud-1" }], pending: [], preferLive: true,
  });
  assert.equal(view.pending.length, 0);
  assert.deepEqual(view.normalLive.map((row) => row.id), ["cloud-1"]);
  assert.deepEqual(view.counts, { cloud: 1, local: 0, all: 1 });
});

test("independent saved local copy stays local; linked pending row does not", () => {
  const view = buildAndroidCloudWorkspace({
    local: [local("saved-copy", { local_role: "saved-local-copy", source_cloud_archive_id: "cloud-1" }),
      local("pending-copy", { source_cloud_archive_id: "cloud-1" })],
    caches: [], live: [{ id: "cloud-1" }],
    pending: [pending("pending-copy", "cloud-1")], preferLive: true,
  });
  assert.deepEqual(view.localOnly.map((row) => row.id), ["saved-copy"]);
  assert.equal(view.pending.length, 1);
  assert.equal(view.normalLive.length, 0);
});

test("local transfer is offered only for local intent, never cloud cache or pending create", () => {
  assert.equal(canOfferLocalCloudTransfer(local("pure-local")), true);
  assert.equal(canOfferLocalCloudTransfer(local("saved-copy", { local_role: "saved-local-copy", source_cloud_archive_id: "cloud" })), true);
  assert.equal(canOfferLocalCloudTransfer(local("cache", { local_role: "cloud-offline-cache", source_cloud_archive_id: "cloud" })), false);
  assert.equal(canOfferLocalCloudTransfer(local("pending", { sync: { status: "pending-cloud-sync", operation_kind: "create-archive" } })), false);
  assert.equal(canOfferLocalCloudTransfer(local("linked", { source_cloud_archive_id: "cloud" })), false);
});

test("pending UI stays visible offline and both upload paths require a user click", () => {
  const source = shell();
  const reconnectStart = source.indexOf("const recoveryKey =");
  const reconnectEnd = source.search(/useEffect\(\(\) => \{\r?\n\s+if \(screen\.kind !== "activity"/);
  assert.ok(reconnectStart >= 0 && reconnectEnd > reconnectStart);
  const reconnect = source.slice(reconnectStart, reconnectEnd);
  assert.doesNotMatch(reconnect, /syncAllPendingCloudArchives|syncPendingCloudArchive/);
  assert.match(source, /data-android-cloud-pending="true"/);
  assert.match(source, /sourceFilter === "cloud" \? <section data-android-cloud-pending="true">[\s\S]*待上传/);
  assert.match(source, /data-android-pending-cards="true"/);
  assert.match(source, /联网后可上传/);
  assert.match(source, /item\.creating[\s\S]*待创建云端/);
  assert.match(source, /item\.failed[\s\S]*待重试[\s\S]*待同步/);
  assert.match(source, /onClick=\{\(\) => void uploadAllPending\(\)\}/);
  assert.match(source, /onClick=\{\(\) => void uploadPendingProject\(item\)\}/);
  assert.match(source, /language === "zh" \? "上传" : "Upload"/);
  assert.match(source, /data-android-ended-projects="true"/);
  assert.match(source, /endedFilteredCloudArchives\.map\(renderCloudProjectCard\)[\s\S]*endedFilteredLocalArchives\.map\(renderLocalProjectCard\)/);
  assert.match(source, /async function uploadPendingProject[\s\S]*syncPendingCloudArchive/);
  assert.match(source, /async function uploadAllPending[\s\S]*syncAllPendingCloudArchives/);
  assert.match(source, /sourceFilter !== "local" && authenticatedOwnerContext && filteredPending\.length/);
});
