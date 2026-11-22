import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(path, "utf8");

test("new cloud project form omits unnecessary destination row without changing cloud creation", () => {
  const form = source("components/archive-ui/ArchiveNewProjectFormShell.tsx");
  const route = source("app/archive/new/page.tsx");
  assert.doesNotMatch(form, /copy\.storage_location|storageModeRowStyle|copy\.cloud_default/);
  assert.match(route, /storageMode="cloud"/);
  assert.match(route, /saveQuickCaptureAsFirstCloudRecord/);
});

test("after quick camera, only one New Project action preserves cloud capture URL", () => {
  const page = source("app/quick-record/page.tsx");
  assert.doesNotMatch(page, /create_local_project|\/local\/archive\/new\?quickCapture/);
  assert.doesNotMatch(page, /create_cloud_project/);
  assert.equal((page.match(/\{t\.archive\.new_project\}/g) || []).length, 2);
  assert.match(page, /href=\{\`\/archive\/new\?quickCapture=\$\{encodeURIComponent\(capture\.id\)\}\`\}/);
  assert.match(page, /href=\{\`\/archive\/new\?quickCapture=\$\{capture\.id\}\`\}/);
});

test("bundled Android camera project picker never offers a new independent local project", () => {
  const shell = source("mobile-offline-src/main.tsx");
  const start = shell.indexOf('screen.kind === "choose-project" ?');
  const end = shell.indexOf('ref={quickGallery}', start);
  assert.ok(start > 0 && end > start);
  const picker = shell.slice(start, end);
  assert.match(picker, /copy\.newProject/);
  assert.match(picker, /\.filter\(\(destination\) => destination !== "local-only"\)/);
  assert.match(picker, /destination === "pending-cloud"/);
  assert.doesNotMatch(picker, /"新建本地项目"|"新建云端项目"/);
  // Existing local project choices are not deleted, only its create action.
  assert.match(picker, /const localOptions =/);
});
