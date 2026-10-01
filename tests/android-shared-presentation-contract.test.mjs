import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

async function moduleFrom(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

const request = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const finished = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onabort = () => reject(tx.error);
});

test("cloud, local, and offline detail import ArchiveProjectDetailView", () => {
  const cloud = read("app/archive/[id]/page.tsx");
  const local = read("app/local/archive/[id]/page.tsx");
  const shell = read("mobile-offline-src/main.tsx");
  const owned = read("components/archive-ui/DeviceOwnedProjectDetail.tsx");
  assert.match(cloud, /<ArchiveProjectDetailView/);
  assert.match(local, /ArchiveProjectDetailView/);
  assert.match(shell, /ArchiveProjectDetailView/);
  assert.match(owned, /ArchiveProjectDetailView/);
  assert.doesNotMatch(local, /<ArchiveDetailHeaderView/);
  assert.doesNotMatch(owned, /<ArchiveDetailHeaderView/);
});

test("online and offline mobile profile share MobileProfileView", () => {
  const profile = read("app/profile/page.tsx");
  const offline = read("components/profile/OfflineAndroidProfilePage.tsx");
  const view = read("components/profile/MobileProfileView.tsx");
  assert.match(profile, /<MobileProfileView/);
  assert.match(offline, /<MobileProfileView/);
  assert.match(view, /project-categories/);
  assert.match(view, /group_settings_title/);
  const versionEntry = view.indexOf("showAndroidVersion ? <AndroidAppVersionEntry");
  const languageEntry = view.indexOf('id="language-settings"');
  assert.ok(versionEntry > view.indexOf("profileIdentityCardStyle"));
  assert.ok(languageEntry > versionEntry);
  assert.match(view, /profileBackOnlyHeaderStyle/);
  assert.match(view, /profileIdentityLogoutButtonStyle/);
  assert.match(view, /!androidIdentityLayout && onLogout/);
});

test("project category settings are shared and local-offline capable", () => {
  const page = read("app/profile/project-categories/page.tsx");
  const view = read("components/profile/ProjectCategorySettingsView.tsx");
  const routes = read("lib/android-shell-app-routes.ts");
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(page, /<ProjectCategorySettingsView/);
  assert.match(view, /data-project-category-settings-view/);
  assert.match(routes, /"project-categories"/);
  assert.match(routes, /path === "\/profile\/project-categories"/);
  assert.match(shell, /<ProjectCategorySettingsView/);
  assert.match(shell, /getLocalArchiveCategoryDepths/);
  assert.match(shell, /saveLocalArchiveCategoryDepths/);
  assert.match(shell, /cloudRequiresNetwork/);
});

test("offline detail never renders a blank ready-null screen", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /detailStatus/);
  assert.match(shell, /ArchiveProjectDetailStatus/);
  assert.match(shell, /ArchiveProjectDetailLoading/);
  assert.match(shell, /MobileShellErrorBoundary/);
  assert.match(shell, /InternalNavigationProvider/);
  assert.doesNotMatch(shell, /screen\.kind === "detail" && detail \?/);
});

test("legacy unowned, owner, pending, cache, and other-owner archive access", async () => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.window = { indexedDB };
  const dbModule = await moduleFrom("lib/local-offline-db.ts");
  const owner = { userId: "owner-a", email: "a@example.com" };
  const other = { userId: "owner-b", email: "b@example.com" };
  const stamp = "2026-09-28T08:00:00.000Z";
  const open = indexedDB.open("life-space-local-offline", 6);
  open.onupgradeneeded = () => {
    for (const name of ["archives", "records", "images", "taxonomy"]) {
      open.result.createObjectStore(name, { keyPath: "id" });
    }
  };
  const db = await request(open);
  const tx = db.transaction(["archives"], "readwrite");
  const done = finished(tx);
  const base = {
    category: "plant",
    status: "active",
    created_at: stamp,
    updated_at: stamp,
    local_only: true,
    sync: { status: "local-only" },
  };
  tx.objectStore("archives").add({ ...base, id: "legacy-unowned", title: "Legacy", local_owner_user_id: "" });
  tx.objectStore("archives").add({ ...base, id: "owner-bound", title: "Owned", local_owner_user_id: owner.userId });
  tx.objectStore("archives").add({
    ...base,
    id: "pending-cloud",
    title: "Pending",
    local_owner_user_id: owner.userId,
    sync: { status: "pending-cloud-sync", operation_kind: "create-archive" },
  });
  tx.objectStore("archives").add({
    ...base,
    id: "cloud-cache",
    title: "Cache",
    local_owner_user_id: owner.userId,
    local_role: "cloud-offline-cache",
    source_cloud_archive_id: "cloud-1",
  });
  tx.objectStore("archives").add({ ...base, id: "other-owner", title: "Secret", local_owner_user_id: other.userId });
  await done;
  db.close();

  const legacy = await dbModule.resolveLocalArchiveDetail("legacy-unowned", owner);
  const bound = await dbModule.resolveLocalArchiveDetail("owner-bound", owner);
  const pending = await dbModule.resolveLocalArchiveDetail("pending-cloud", owner);
  const cache = await dbModule.resolveLocalArchiveDetail("cloud-cache", owner);
  const hidden = await dbModule.resolveLocalArchiveDetail("other-owner", owner);
  const missing = await dbModule.resolveLocalArchiveDetail("missing-id", owner);

  assert.equal(legacy.status, "ready");
  assert.equal(bound.status, "ready");
  assert.equal(pending.status, "ready");
  assert.equal(cache.status, "ready");
  assert.equal(hidden.status, "forbidden");
  assert.equal(missing.status, "not-found");
  assert.ok(legacy.detail);
  assert.equal(hidden.detail, null);
});
