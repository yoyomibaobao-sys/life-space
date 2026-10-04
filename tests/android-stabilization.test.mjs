import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import { getAndroidRouteCapability, parseAndroidShellPath } from "../lib/android-shell-app-routes.ts";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function loadModule(entry, stubs = {}) {
  const output = path.join(root, `.stabilization-test-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm", outfile: output,
    plugins: [{ name: "stubs", setup(ctx) {
      ctx.onResolve({ filter: /^@\// }, (args) => {
        if (Object.hasOwn(stubs, args.path)) return { path: args.path, namespace: "stub" };
        const base = path.join(root, args.path.slice(2));
        return { path: [base + ".ts", base + ".tsx", base + ".js"].find((candidate) => fs.existsSync(candidate)) || base };
      });
      ctx.onResolve({ filter: /^(react|@capacitor\/app|@capacitor\/core|@capacitor\/network)$/ }, (args) =>
        Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: "stub" } : undefined);
      ctx.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: stubs[args.path], loader: "js" }));
    } }],
  });
  fs.writeFileSync(output, result.outputFiles[0].contents);
  try { return await import(pathToFileURL(output).href); }
  finally { fs.rmSync(output, { force: true }); }
}

test("one native connectivity subscription handles hot toggle, missed event on resume and cleanup", async () => {
  const subscriptions = {};
  let status = true;
  globalThis.__connectivityTest = {
    subscribe: (kind, listener) => { subscriptions[kind] = listener; return { remove: async () => { delete subscriptions[kind]; } }; },
    status: () => ({ connected: status }),
  };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  document.visibilityState = "visible";
  const connectivity = await loadModule("lib/android-connectivity.ts", {
    "react": "export const useSyncExternalStore = () => {};",
    "@capacitor/core": "export const Capacitor = { isNativePlatform: () => true }; export const CapacitorHttp = { request: async () => ({ status: 200, data: { ok: true }, headers: {}, url: 'https://life-space.uk/api/health' }) };",
    "@capacitor/network": "export const Network = { getStatus: async () => globalThis.__connectivityTest.status(), addListener: async (_, listener) => globalThis.__connectivityTest.subscribe('network', listener) };",
    "@capacitor/app": "export const App = { addListener: async (_, listener) => globalThis.__connectivityTest.subscribe('resume', listener) };",
  });
  const changes = [];
  const unsubscribe = connectivity.subscribeAndroidConnectivity(() => changes.push(connectivity.isAndroidOnline()));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(connectivity.isAndroidOnline(), true);
  status = false;
  subscriptions.network({ connected: false });
  assert.equal(connectivity.isAndroidOnline(), false);
  status = true;
  subscriptions.resume();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(changes.includes(false));
  assert.equal(changes.at(-1), true);
  assert.equal(connectivity.isAndroidOnline(), true);
  unsubscribe();
  delete globalThis.__connectivityTest;
  delete globalThis.window;
  delete globalThis.document;
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
  assert.doesNotMatch(read("mobile-offline-src/main.tsx"), /navigator\.onLine/);
});

test("signed-out cloud links to one bundled login screen; remembered local content remains", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const auth = read("lib/android-auth-state.ts");
  assert.match(shell, /sourceFilter === "cloud" \? \([\s\S]*?openCloudLogin\("list-cloud"\)/);
  assert.match(shell, /sourceFilter !== "cloud" \? \(\s*filteredLocalArchives/);
  assert.match(auth, /preserveLocalOwner: true/);
  assert.match(shell, /auth\.status === "signed-out"/);
  assert.match(shell, /setCloudArchives\(\[\]\)/);
  assert.match(shell, /if \(online\) return;[\s\S]*setActivityItems\(\[\]\)/);
});

test("route registry handles all profile, user and membership destinations", () => {
  for (const route of ["/profile/recent", "/profile/trash", "/profile/project-categories", "/feedback", "/app-update",
    "/membership/payment", "/membership/refund"]) {
    assert.equal(getAndroidRouteCapability(route), "hybrid");
    assert.notEqual(parseAndroidShellPath(route)?.kind, "network-required");
  }
  for (const route of ["/membership/benefits", "/profile/data-security", "/legal", "/legal/privacy", "/legal/terms", "/legal/refunds", "/legal/contact"]) {
    assert.equal(getAndroidRouteCapability(route), "local");
    assert.notEqual(parseAndroidShellPath(route)?.kind, "network-required");
  }
  for (const route of ["/profile/helpful", "/profile/followers", "/membership",
    "/user/person/profile"]) {
    assert.equal(getAndroidRouteCapability(route), "online-web");
    assert.equal(parseAndroidShellPath(route)?.kind, "network-required");
  }
  assert.equal(getAndroidRouteCapability("/admin/memberships"), "online-controller");
  assert.equal(parseAndroidShellPath("/admin/memberships")?.kind, "admin-memberships");
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /Browser\.open\(\{ url: url\.href \}\)/);
  assert.match(shell, /data-android-shell-page="recent"/);
  assert.match(shell, /listLocalArchiveCycleTrash\(ownerContext\)/);
  assert.match(shell, /restoreLocalArchiveCycle\(item\.archive_id/);
  for (const page of ["app/follow/page.tsx", "app/market/page.tsx"]) {
    assert.match(read(page), /useAndroidConnectivity/);
    assert.doesNotMatch(read(page), /navigator\.onLine/);
  }
});

test("guide directory survives online-to-offline and cold offline lookup by aliases", async () => {
  const { findOfflineGuideEntry, loadOfflineGuideDirectory, rememberGuideDirectory } = await loadModule("lib/offline-guide-directory.ts");
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
  };
  rememberGuideDirectory([{ source: "public_guide", category: "plant", label: "Tomato", plantSlug: "tomato", aliases: ["西红柿"], overviewZh: "概要" }]);
  const cold = loadOfflineGuideDirectory();
  assert.equal(findOfflineGuideEntry(cold, "tomato")?.overviewZh, "概要");
  assert.equal(findOfflineGuideEntry(cold, "西红柿")?.label, "Tomato");
  assert.ok(cold.some((entry) => entry.source === "builtin"));
  delete globalThis.localStorage;
});

test("concurrent cache refreshes keep one owner/source and diagnosis preserves duplicate pending rows", async () => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.window = { indexedDB };
  const owner = { userId: "owner-1", email: "owner@example.test" };
  const db = await loadModule("lib/local-offline-db.ts");
  const input = { cloud_archive_id: "cloud-1", owner_context: owner, title: "Tomato", category: "plant",
    cycles: [], records: [], images: [] };
  await Promise.all(Array.from({ length: 8 }, () => db.replaceCloudOfflineCache(input)));
  assert.equal((await db.diagnoseCloudOfflineCache(owner)).rawCount, 1);
  assert.equal((await db.listVisibleCloudOfflineArchiveSummaries(owner)).length, 1);

  const request = (query) => new Promise((resolve, reject) => {
    query.onsuccess = () => resolve(query.result);
    query.onerror = () => reject(query.error);
  });
  const raw = await request(indexedDB.open("life-space-local-offline"));
  const transaction = raw.transaction(["archives", "records", "images"], "readwrite");
  const done = new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
  transaction.objectStore("archives").add({ id: "duplicate", local_role: "cloud-offline-cache", source_cloud_archive_id: "cloud-1",
    local_owner_user_id: owner.userId, title: "Tomato copy", category: "plant", status: "active", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), local_only: true, sync: { status: "synced" } });
  transaction.objectStore("records").add({ id: "pending-record", archive_id: "duplicate", note: "do not delete", record_time: new Date().toISOString(), local_only: true, sync: { status: "pending-cloud-sync" } });
  transaction.objectStore("records").add({ id: "synced-parent", archive_id: "duplicate", note: "keep parent", record_time: new Date().toISOString(), local_only: true, sync: { status: "synced" } });
  transaction.objectStore("images").add({ id: "pending-image", archive_id: "duplicate", record_id: "pending-record", blob: new Blob(["photo"]), local_only: true, sync: { status: "pending-cloud-sync" } });
  transaction.objectStore("images").add({ id: "pending-image-on-synced-parent", archive_id: "duplicate", record_id: "synced-parent", blob: new Blob(["photo"]), local_only: true, sync: { status: "pending-cloud-sync" } });
  await done;
  const diagnosis = await db.diagnoseCloudOfflineCache(owner);
  assert.equal(diagnosis.rawCount, 2);
  assert.equal(diagnosis.uniqueSourceCount, 1);
  assert.equal(diagnosis.sourceCounts[0].count, 2);
  assert.equal(diagnosis.rows.find((row) => row.cacheId === "duplicate").pendingImages, 2);
  assert.equal((await db.listVisibleCloudOfflineArchiveSummaries(owner)).length, 1);
  const verify = raw.transaction(["records", "images"], "readonly");
  assert.ok(await request(verify.objectStore("records").get("pending-record")));
  assert.ok(await request(verify.objectStore("images").get("pending-image")));
  const repair = await db.repairDiagnosedCloudCacheDuplicates({ ownerContext: owner, sourceId: "cloud-1",
    expectedCacheIds: diagnosis.rows.map((row) => row.cacheId) });
  assert.equal(repair.removedSyncedOnlyCopies, 1);
  assert.equal((await db.diagnoseCloudOfflineCache(owner)).rawCount, 1);
  const preserved = raw.transaction(["records", "images"], "readonly");
  assert.equal((await request(preserved.objectStore("records").get("pending-record"))).archive_id, repair.canonicalId);
  assert.equal((await request(preserved.objectStore("images").get("pending-image"))).archive_id, repair.canonicalId);
  assert.equal((await request(preserved.objectStore("records").get("synced-parent"))).archive_id, repair.canonicalId);
  assert.equal((await request(preserved.objectStore("images").get("pending-image-on-synced-parent"))).archive_id, repair.canonicalId);
  raw.close();
  delete globalThis.indexedDB;
  delete globalThis.window;
});

test("cache refresh, ended-source prune and explicit logout retain pending image's synced parent", async () => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.window = { indexedDB };
  const owner = { userId: "owner-2", email: "owner@example.test" };
  const db = await loadModule("lib/local-offline-db.ts");
  const input = { cloud_archive_id: "cloud-2", owner_context: owner, title: "Tomato", category: "plant",
    cycles: [], records: [], images: [] };
  await db.replaceCloudOfflineCache(input);
  const cache = (await db.diagnoseCloudOfflineCache(owner)).rows[0];
  const request = (query) => new Promise((resolve, reject) => {
    query.onsuccess = () => resolve(query.result);
    query.onerror = () => reject(query.error);
  });
  const raw = await request(indexedDB.open("life-space-local-offline"));
  const transaction = raw.transaction(["records", "images"], "readwrite");
  const done = new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
  transaction.objectStore("records").put({ id: "parent-2", archive_id: cache.cacheId, note: "parent", record_time: new Date().toISOString(), sync: { status: "synced" } });
  transaction.objectStore("images").put({ id: "photo-2", archive_id: cache.cacheId, record_id: "parent-2", blob: new Blob(["photo"]), sync: { status: "pending-cloud-sync" } });
  await done;
  const assertPreserved = async () => {
    const tx = raw.transaction(["records", "images"], "readonly");
    assert.ok(await request(tx.objectStore("records").get("parent-2")));
    assert.ok(await request(tx.objectStore("images").get("photo-2")));
  };
  await db.replaceCloudOfflineCache(input);
  await assertPreserved();
  await db.pruneCloudOfflineCacheForEndedSource("cloud-2", owner);
  await assertPreserved();
  await db.clearCloudOfflineCachesForOwner(owner);
  await assertPreserved();
  raw.close();
  delete globalThis.indexedDB;
  delete globalThis.window;
});

test("cloud taxonomy writes are owner scoped and delete clears project references first", async () => {
  const calls = [];
  const client = { from(table) { return {
    select() { return this; }, insert(value) { calls.push([table, "insert", value]); return Promise.resolve({ error: null }); },
    update(value) { calls.push([table, "update", value]); return this; },
    delete() { calls.push([table, "delete"]); return this; },
    eq(field, value) { calls.push([table, "eq", field, value]); return this; },
    then(resolve, reject) { return Promise.resolve({ data: table === "sub_tags" ? [{ id: "sub", name: "Herbs", category: "plant" }] : [], error: null }).then(resolve, reject); },
  }; } };
  const taxonomy = await loadModule("lib/android-project-taxonomy.ts", {
    "@/lib/local-offline-db": "export const unused = null;", "@/lib/supabase": "export const supabase = {};",
  });
  const entries = await taxonomy.loadCloudProjectTaxonomy("owner", client);
  assert.equal(entries[0].label, "Herbs");
  await taxonomy.createCloudProjectTaxonomy({ userId: "owner", category: "plant", label: "  New " }, client);
  await taxonomy.renameCloudProjectTaxonomy({ userId: "owner", entry: entries[0], label: "Newer" }, client);
  await taxonomy.deleteCloudProjectTaxonomy({ userId: "owner", entry: entries[0] }, client);
  assert.ok(calls.some(([table, op, value]) => table === "sub_tags" && op === "insert" && value.user_id === "owner"));
  assert.ok(calls.some(([table, op, field, value]) => table === "archives" && op === "eq" && field === "user_id" && value === "owner"));
  assert.ok(calls.findIndex(([table, op]) => table === "archives" && op === "update") < calls.findIndex(([table, op]) => table === "sub_tags" && op === "delete"));
});

test("offline local taxonomy create, rename and delete updates associated projects", async () => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.window = { indexedDB };
  const db = await loadModule("lib/local-offline-db.ts");
  const owner = { userId: "local-owner" };
  const project = await db.createLocalArchive({ title: "Bed", category: "system", system_name: "Compost",
    subcategory: "Herbs", group_name: "Raised", local_owner_user_id: owner.userId, sync_destination: "local-only" });
  await db.createLocalTaxonomyItem({ kind: "subcategory", label: "Herbs", category: "system" }, owner);
  await db.createLocalTaxonomyItem({ kind: "group", label: "Raised", category: "system", subcategory: "Herbs" }, owner);
  assert.ok((await db.listVisibleLocalTaxonomyItems(owner)).some((entry) => entry.label === "Raised"));
  await db.renameLocalTaxonomyItem({ kind: "subcategory", oldLabel: "Herbs", newLabel: "Vegetables", category: "system" }, owner);
  assert.equal((await db.getLocalArchiveDetail(project.id, owner)).archive.subcategory, "Vegetables");
  await db.renameLocalTaxonomyItem({ kind: "group", oldLabel: "Raised", newLabel: "Container", category: "system", subcategory: "Vegetables" }, owner);
  assert.equal((await db.getLocalArchiveDetail(project.id, owner)).archive.group_name, "Container");
  await db.deleteLocalTaxonomyItem({ kind: "subcategory", label: "Vegetables", category: "system" }, owner);
  const cleared = (await db.getLocalArchiveDetail(project.id, owner)).archive;
  assert.equal(cleared.subcategory, null);
  assert.equal(cleared.group_name, null);
  delete globalThis.indexedDB;
  delete globalThis.window;
});

test("local taxonomy and detail offer both levels; native header owns no duplicate top inset", () => {
  const settings = read("components/profile/ProjectCategorySettingsView.tsx");
  const shell = read("mobile-offline-src/main.tsx");
  const detail = read("components/archive-ui/DeviceOwnedProjectDetail.tsx");
  assert.match(settings, /data-taxonomy-level="1"/);
  assert.match(settings, /data-taxonomy-level="2"/);
  assert.match(shell, /createLocalTaxonomyItem/);
  assert.match(shell, /renameLocalTaxonomyItem/);
  assert.match(shell, /deleteLocalTaxonomyItem/);
  assert.match(shell, /subcategories=\{visibleSubcategories\}/);
  assert.match(detail, /subTags=\{subTags\}/);
  assert.match(detail, /maxDepth=\{maxDepth\}/);
  assert.match(read("mobile-offline-src/offline.css"), /--app-safe-area-top: 0px/);
  assert.match(read("capacitor.config.ts"), /overlaysWebView: false/);
  for (const source of ["components/archive-ui/CloudArchiveDetailController.tsx",
    "components/archive-ui/DeviceOwnedProjectDetail.tsx", "components/archive-ui/ReadonlyPublicProjectDetail.tsx"]) {
    assert.match(read(source), /ArchiveProjectDetailView/);
  }
});

test("local project card trash preserves records and can be restored for its owner", async () => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.window = { indexedDB };
  const db = await loadModule("lib/local-offline-db.ts");
  const owner = { userId: "trash-owner" };
  const project = await db.createLocalArchive({ title: "Recoverable", category: "system",
    system_name: "Compost", local_owner_user_id: owner.userId, sync_destination: "local-only" });
  await db.setLocalProjectTrashed(project.id, true, owner);
  assert.ok(!(await db.listVisibleLocalArchiveSummaries(owner)).archives.some((item) => item.id === project.id));
  assert.equal((await db.resolveLocalArchiveDetail(project.id, owner)).status, "not-found");
  assert.equal((await db.listLocalProjectTrash(owner)).some((item) => item.id === project.id), true);
  assert.equal((await db.listLocalProjectTrash({ userId: "another-owner" })).length, 0);
  await assert.rejects(db.setLocalProjectTrashed(project.id, false, { userId: "another-owner" }), /没有权限/);
  await db.setLocalProjectTrashed(project.id, false, owner);
  assert.equal((await db.resolveLocalArchiveDetail(project.id, owner)).status, "ready");
  assert.equal((await db.listLocalProjectTrash(owner)).length, 0);
  delete globalThis.indexedDB;
  delete globalThis.window;
});
