import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { buildAndroidCloudWorkspace } from "../lib/android-cloud-workspace.ts";

const shell = fs.readFileSync("mobile-offline-src/main.tsx", "utf8");
const web = fs.readFileSync("app/archive/page.tsx", "utf8");
const ast = ts.createSourceFile("main.tsx", shell, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let sourceHelper;
function find(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "w5WorkspaceSources") sourceHelper = node.getText(ast);
  ts.forEachChild(node, find);
}
find(ast);
assert.ok(sourceHelper);
const transpiled = ts.transpileModule(sourceHelper, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const w5Sources = new Function("workspaceSourceOptions",
  transpiled + "\nreturn w5WorkspaceSources;")(
  (auth, local, readable) => auth === "checking" ?
    (local ? ["local"] : []) :
    auth !== "signed-in" ?
      (local ? ["cloud", "local"] : ["cloud"]) :
      (local ? (readable ? ["all", "cloud", "local"] : ["cloud", "local"]) : ["cloud"])
);

const local = (id, ownerId, extra = {}) => ({
  id, title: id, category: "system", local_owner_user_id: ownerId,
  sync: { status: "pending-cloud-sync" }, ...extra,
});
const summary = (id, cloudId, extra = {}) => ({
  local_archive_id: id, cloud_archive_id: cloudId, title: id,
  archive_create_pending: !cloudId, archive_failed: false,
  archive_update_pending: false, record_count: 1, image_count: 1,
  failed_record_count: 0, failed_image_count: 0, last_error: null, ...extra,
});

test("W5 Android exposes only cloud and temporary views without deleting local data", () => {
  assert.deepEqual(w5Sources("signed-in", true, true), ["cloud", "pending"]);
  assert.deepEqual(w5Sources("signed-in", false, true), ["cloud", "pending"]);
  assert.deepEqual(w5Sources("signed-in", true, false), ["cloud", "pending"]);
  assert.deepEqual(w5Sources("signed-out", true, true), ["cloud"]);
  assert.deepEqual(w5Sources("checking", true, true), []);
});

test("W5 pending and cloud views share one logical project and original local identity", () => {
  const pending = summary("same-local", "cloud-1", { record_count: 2, image_count: 3 });
  const view = buildAndroidCloudWorkspace({
    local: [local("same-local", "account-a", { source_cloud_archive_id: "cloud-1" }), local("legacy-local", null, { sync: { status: "local-only" } })],
    caches: [local("cache-1", "account-a", { local_role: "cloud-offline-cache", source_cloud_archive_id: "cloud-1" })],
    live: [{ id: "cloud-1", title: "Cloud original" }],
    pending: [pending],
    preferLive: true
  });
  assert.equal(view.pending.length, 1);
  assert.equal(view.pending[0].summaries[0], pending);
  assert.equal(view.pending[0].local.id, "same-local");
  assert.equal(view.pending[0].cloud.id, "cloud-1");
  assert.equal(view.normalLive.length, 0);
  assert.deepEqual(view.localOnly.map(x => x.id), ["legacy-local"]);
  assert.equal(view.pendingCounts.record, 2);
  assert.equal(view.pendingCounts.image, 3);
});

test("W5 completed upload removes temporary entry but retains the synced cloud project", () => {
  const view = buildAndroidCloudWorkspace({
    local: [], caches: [local("cache", "account-a", {
      local_role: "cloud-offline-cache", source_cloud_archive_id: "cloud-1"
    })],
    live: [{ id: "cloud-1" }], pending: [], preferLive: true,
  });
  assert.equal(view.pending.length, 0);
  assert.deepEqual(view.normalLive.map(x => x.id), ["cloud-1"]);
});

test("W5 temporary listing has no independent creation route and invokes the existing upload and safe cancel functions", () => {
  assert.match(web, /data-w5-temporary-space="true"/);
  assert.match(web, /activeSource !== "pending" \? \(/);
  assert.match(web, /syncPendingCloudArchive\(\{/);
  assert.match(web, /cancelNeverUploadedCloudArchive\(/);
  assert.match(web, /discardUnattemptedPendingArchiveEdit\(/);
  assert.match(shell, /data-android-temporary-space=\{sourceFilter === "pending"\}/);
  assert.match(shell, /sourceTrailingSlot=\{sourceFilter === "pending" \? null/);
  assert.match(shell, /cancelNeverUploadedCloudArchive\(/);
  assert.match(shell, /syncPendingCloudArchive\(\{/);
});

test("W5 account ownership is checked before showing pending items or destructive action", () => {
  assert.match(web, /archive\.local_owner_user_id === currentOwnerContext\.userId/);
  assert.match(web, /data\.user\?\.id !== currentOwnerContext\.userId/);
  assert.match(shell, /privateContext\?\.userId \|\| null/);
  assert.match(web, /t\.archive_workspace\.pending_cancel_blocked/);
});
