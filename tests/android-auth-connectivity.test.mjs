import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import { resolveAndroidArchiveScreen } from "../lib/android-shell-app-routes.ts";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function loadModule(entry, stubs = {}) {
  const output = path.join(
    root,
    `.android-state-test-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    outfile: output,
    plugins: [{
      name: "android-state-stubs",
      setup(ctx) {
        ctx.onResolve({ filter: /^@\// }, (args) => {
          if (Object.hasOwn(stubs, args.path)) {
            return { path: args.path, namespace: "stub" };
          }
          const base = path.join(root, args.path.slice(2));
          return {
            path: [base + ".ts", base + ".tsx", base + ".js"]
              .find((candidate) => fs.existsSync(candidate)) || base,
          };
        });
        ctx.onResolve(
          { filter: /^(react|@capacitor\/app|@capacitor\/core|@capacitor\/network)$/ },
          (args) => Object.hasOwn(stubs, args.path)
            ? { path: args.path, namespace: "stub" }
            : undefined,
        );
        ctx.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          contents: stubs[args.path],
          loader: "js",
        }));
      },
    }],
  });
  fs.writeFileSync(output, result.outputFiles[0].contents);
  try {
    return await import(`${pathToFileURL(output).href}?v=${Date.now()}`);
  } finally {
    fs.rmSync(output, { force: true });
  }
}

async function loadAuthModule() {
  return loadModule("lib/android-auth-state.ts", {
    react: "export const useSyncExternalStore = () => {};",
    "@/lib/supabase": "export const supabase = { auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }), signOut: async () => {}, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };",
    "@/lib/local-owner-context": "export const loadRememberedLocalOwnerContext = () => null; export const wasLocalOwnerExplicitlySignedOut = () => false; export const rememberLocalOwnerContext = () => {}; export const markLocalOwnerExplicitlySignedOut = () => {}; export const clearLocalOwnerExplicitSignOut = () => {};",
    "@/lib/cloud-offline-cache-session": "export const clearCloudOfflineCacheOnExplicitLogout = async () => {};",
    "@/lib/android-connectivity": "export const getAndroidConnectivitySnapshot = () => ({ status: 'offline' }); export const subscribeAndroidConnectivity = () => () => {};",
  });
}

function createAuthHarness(module, {
  user = null,
  rememberedOwner = null,
  explicit = false,
  online = false,
} = {}) {
  let sessionUser = user;
  let serviceOnline = online;
  let explicitlySignedOut = explicit;
  let remembered = rememberedOwner;
  let authListener = null;
  let getUserCalls = 0;
  let cacheClearCalls = 0;
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: sessionUser ? { user: sessionUser } : null },
        error: null,
      }),
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: sessionUser }, error: null };
      },
      signOut: async () => {
        sessionUser = null;
        authListener?.("SIGNED_OUT", null);
      },
      onAuthStateChange: (listener) => {
        authListener = listener;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  };
  const controller = module.createAndroidAuthController({
    client,
    isServiceOnline: () => serviceOnline,
    loadRememberedOwner: () => remembered,
    isExplicitlySignedOut: () => explicitlySignedOut,
    rememberOwner: (owner) => {
      remembered = owner;
      explicitlySignedOut = false;
    },
    markExplicitlySignedOut: () => {
      explicitlySignedOut = true;
    },
    clearExplicitSignOut: () => {
      explicitlySignedOut = false;
    },
    clearCloudCache: async () => {
      cacheClearCalls += 1;
    },
  });
  return {
    controller,
    emit: (event, session) => authListener?.(event, session),
    setOnline: (value) => { serviceOnline = value; },
    setSessionUser: (value) => { sessionUser = value; },
    getUserCalls: () => getUserCalls,
    cacheClearCalls: () => cacheClearCalls,
  };
}

test("remembered local owner is not an authenticated Android session", async () => {
  const module = await loadAuthModule();
  const rememberedOwner = { userId: "remembered", email: "old@example.test" };
  const harness = createAuthHarness(module, { rememberedOwner, online: true });
  await harness.controller.initialize();
  assert.equal(harness.controller.getSnapshot().status, "signed-out");
  assert.equal(harness.controller.getSnapshot().sessionUserId, null);
  assert.deepEqual(harness.controller.getSnapshot().rememberedOwner, rememberedOwner);
});

test("authenticated owner requires signed-in session and exact owner match", async () => {
  const module = await loadAuthModule();
  const ownerA = { userId: "owner-a", email: "a@example.test" };
  const ownerB = { userId: "owner-b", email: "b@example.test" };
  assert.equal(
    module.resolveAuthenticatedOwnerContext(
      { status: "signed-in", sessionUserId: "owner-a" },
      ownerA,
    ),
    ownerA,
  );
  assert.equal(
    module.resolveAuthenticatedOwnerContext(
      { status: "signed-out", sessionUserId: null },
      ownerA,
    ),
    null,
  );
  assert.equal(
    module.resolveAuthenticatedOwnerContext(
      { status: "signed-in", sessionUserId: "owner-b" },
      ownerA,
    ),
    null,
  );
  assert.equal(
    module.resolveAuthenticatedOwnerContext(
      { status: "signed-in", sessionUserId: "owner-b" },
      ownerB,
    ),
    ownerB,
  );
});

test("signed-in remains signed-in across offline and online revalidation", async () => {
  const module = await loadAuthModule();
  const user = { id: "owner", email: "owner@example.test" };
  const harness = createAuthHarness(module, { user, online: true });
  const statuses = [];
  const unsubscribe = harness.controller.subscribe(() => {
    statuses.push(harness.controller.getSnapshot().status);
  });
  await harness.controller.initialize();
  assert.equal(harness.controller.getSnapshot().status, "signed-in");

  harness.setOnline(false);
  harness.emit("SIGNED_OUT", null);
  assert.equal(harness.controller.getSnapshot().status, "signed-in");
  assert.equal(harness.controller.getSnapshot().sessionUserId, "owner");

  harness.setSessionUser(user);
  harness.setOnline(true);
  await harness.controller.revalidate();
  assert.equal(harness.controller.getSnapshot().status, "signed-in");
  assert.equal(harness.controller.getSnapshot().sessionUserId, "owner");
  assert.equal(statuses.includes("signed-out"), false);
  unsubscribe();
});

test("offline explicit logout survives reconnect and clears cache without restoring auth", async () => {
  const module = await loadAuthModule();
  const user = { id: "owner", email: "owner@example.test" };
  const harness = createAuthHarness(module, { user, online: false });
  await harness.controller.initialize();
  assert.equal(harness.controller.getSnapshot().status, "signed-in");
  await harness.controller.explicitLogout();
  assert.equal(harness.controller.getSnapshot().status, "signed-out");
  assert.equal(harness.controller.getSnapshot().explicitSignedOut, true);
  assert.equal(harness.cacheClearCalls(), 1);

  harness.setSessionUser(user);
  harness.setOnline(true);
  const callsBeforeReconnect = harness.getUserCalls();
  await harness.controller.revalidate();
  assert.equal(harness.controller.getSnapshot().status, "signed-out");
  assert.equal(harness.getUserCalls(), callsBeforeReconnect);
});

test("explicit signed-out startup ignores a persisted session and token refresh", async () => {
  const module = await loadAuthModule();
  const user = { id: "owner", email: "owner@example.test" };
  const harness = createAuthHarness(module, {
    user,
    explicit: true,
    online: false,
  });
  harness.controller.subscribe(() => undefined);
  await harness.controller.initialize();
  assert.equal(harness.controller.getSnapshot().status, "signed-out");
  harness.emit("TOKEN_REFRESHED", { user });
  assert.equal(harness.controller.getSnapshot().status, "signed-out");
  assert.equal(harness.controller.getSnapshot().sessionUserId, null);
});

test("pending queues stay owner scoped and local-only archives survive cache clearing", async () => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.window = { indexedDB };
  const db = await loadModule("lib/local-offline-db.ts");
  const ownerA = { userId: "owner-a", email: "a@example.test" };
  const ownerB = { userId: "owner-b", email: "b@example.test" };
  const local = await db.createLocalArchive({
    title: "Local",
    category: "other",
    local_owner_user_id: ownerA.userId,
    sync_destination: "local-only",
  });
  const pending = await db.createLocalArchive({
    title: "Pending",
    category: "other",
    local_owner_user_id: ownerA.userId,
    sync_destination: "pending-cloud",
  });
  await db.createLocalRecord({ archive_id: pending.id, note: "pending record" });

  assert.equal((await db.listPendingCloudSyncSummaries(ownerA)).length, 1);
  assert.equal((await db.listPendingCloudSyncSummaries(ownerB)).length, 0);
  assert.deepEqual(
    (await db.listVisibleLocalArchiveSummaries(ownerA, {
      includePendingCloud: false,
    })).archives.map((archive) => archive.id),
    [local.id],
  );
  assert.deepEqual(
    new Set((await db.listVisibleLocalArchiveSummaries(ownerA, {
      includePendingCloud: true,
    })).archives.map((archive) => archive.id)),
    new Set([local.id, pending.id]),
  );
  await db.clearCloudOfflineCachesForOwner(ownerA);
  assert.ok((await db.getLocalArchiveDetail(local.id, ownerA)).archive);
  assert.ok((await db.getLocalArchiveDetail(pending.id, ownerA)).archive);
  assert.equal((await db.listPendingCloudSyncSummaries(ownerA)).length, 1);
  assert.equal((await db.listPendingCloudSyncSummaries(ownerB)).length, 0);
  delete globalThis.indexedDB;
  delete globalThis.window;
});

test("transport and LifeSpace service reachability jointly determine online", async () => {
  const connectivity = await loadModule("lib/android-connectivity.ts", {
    react: "export const useSyncExternalStore = () => {};",
    "@capacitor/core": "export const Capacitor = { isNativePlatform: () => false }; export const CapacitorHttp = { request: async () => ({}) };",
    "@capacitor/network": "export const Network = {};",
    "@capacitor/app": "export const App = {};",
  });
  let reachable = false;
  const controller = connectivity.createAndroidConnectivityController({
    initialTransport: "disconnected",
    debounceMs: 5,
    probe: async () => reachable,
  });
  assert.equal(controller.getSnapshot().status, "offline");

  controller.setTransport("connected");
  assert.equal(controller.getSnapshot().status, "checking");
  assert.equal(await controller.probeNow(), false);
  assert.equal(controller.getSnapshot().status, "offline");

  reachable = true;
  assert.equal(await controller.probeNow(), true);
  assert.equal(controller.getSnapshot().status, "online");
  controller.setTransport("disconnected");
  assert.equal(controller.getSnapshot().status, "offline");
});

test("stale health result cannot overwrite a newer connectivity generation", async () => {
  const connectivity = await loadModule("lib/android-connectivity.ts", {
    react: "export const useSyncExternalStore = () => {};",
    "@capacitor/core": "export const Capacitor = { isNativePlatform: () => false }; export const CapacitorHttp = { request: async () => ({}) };",
    "@capacitor/network": "export const Network = {};",
    "@capacitor/app": "export const App = {};",
  });
  const resolvers = [];
  const controller = connectivity.createAndroidConnectivityController({
    initialTransport: "connected",
    debounceMs: 0,
    probe: () => new Promise((resolve) => resolvers.push(resolve)),
  });
  const first = controller.probeNow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.setTransport("disconnected");
  controller.setTransport("connected");
  resolvers.shift()(true);
  await first;
  assert.notEqual(controller.getSnapshot().status, "online");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resolvers.length, 1);
  resolvers.shift()(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getSnapshot().status, "offline");
});

test("health triggers are debounced and probes remain single flight", async () => {
  const connectivity = await loadModule("lib/android-connectivity.ts", {
    react: "export const useSyncExternalStore = () => {};",
    "@capacitor/core": "export const Capacitor = { isNativePlatform: () => false }; export const CapacitorHttp = { request: async () => ({}) };",
    "@capacitor/network": "export const Network = {};",
    "@capacitor/app": "export const App = {};",
  });
  let calls = 0;
  let resolveProbe;
  const controller = connectivity.createAndroidConnectivityController({
    initialTransport: "connected",
    debounceMs: 10,
    probe: () => {
      calls += 1;
      return new Promise((resolve) => { resolveProbe = resolve; });
    },
  });
  controller.scheduleProbe();
  controller.scheduleProbe();
  controller.scheduleProbe();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 1);
  void controller.probeNow();
  void controller.probeNow();
  assert.equal(calls, 1);
  resolveProbe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getSnapshot().status, "online");
});

test("native health probe uses the production endpoint and validates its contract", async () => {
  const connectivity = await loadModule("lib/android-connectivity.ts", {
    react: "export const useSyncExternalStore = () => {};",
    "@capacitor/core": "export const Capacitor = { isNativePlatform: () => true }; export const CapacitorHttp = { request: async () => ({}) };",
    "@capacitor/network": "export const Network = {};",
    "@capacitor/app": "export const App = {};",
  });
  let requestOptions = null;
  const reachable = await connectivity.probeLifeSpaceService({
    isNative: true,
    nativeRequest: async (options) => {
      requestOptions = options;
      return {
        status: 200,
        data: { ok: true },
        headers: {},
        url: connectivity.LIFESPACE_HEALTH_URL,
      };
    },
  });
  assert.equal(reachable, true);
  assert.equal(requestOptions.url, "https://life-space.uk/api/health");
  assert.equal(requestOptions.connectTimeout, 2500);
  assert.equal(requestOptions.readTimeout, 2500);
});

test("health endpoint is public, side-effect free and non-cacheable", async () => {
  const route = await loadModule("app/api/health/route.ts");
  const response = route.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(response.headers.get("cache-control"), /no-store/);
  const source = read("app/api/health/route.ts");
  assert.doesNotMatch(source, /supabase|cookies|session|insert|update|delete/i);
});

test("CloudLogin eligibility and screen stability follow auth and connectivity states", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(
    shell,
    /online && auth\.status === "signed-out" && sourceFilter === "cloud"/,
  );
  assert.match(shell, /auth\.status === "checking"[\s\S]*copy\.cloudLoading/);
  assert.doesNotMatch(shell, /online && !cloudUserId[\s\S]{0,120}<CloudLogin/);
  assert.match(shell, /const online = useAndroidConnectivity\(\)/);
  const networkEffect = shell.match(
    /useEffect\(\(\) => \{\s*if \(online\) return;([\s\S]*?)\n  \}, \[online\]\);/,
  )?.[1] || "";
  assert.doesNotMatch(
    networkEffect,
    /setScreen|goList|window\.location|location\.replace|signOut/,
  );
  assert.doesNotMatch(read("lib/android-connectivity.ts"), /signOut|VPN|vpn/);
});

test("authenticated owner hard-gates sync, pending creation and private cache routes", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(
    shell,
    /authenticatedOwnerContext\.userId !== cloudUserId[\s\S]*?return;/,
  );
  assert.match(
    shell,
    /preparePendingCloudSyncQueue\(authenticatedOwnerContext\)[\s\S]*?syncAllPendingCloudArchives\(\{ ownerContext: authenticatedOwnerContext \}\)/,
  );
  assert.match(
    shell,
    /projectCreationDestinations\(online, Boolean\(authenticatedOwnerContext\)\)/,
  );
  assert.match(
    shell,
    /\.\.\.\(authenticatedOwnerContext \? cloudCaches : \[\]\)/,
  );
  assert.match(
    shell,
    /if \(!authenticatedOwnerContext\) \{\s*showToast\(copy\.cloudSignIn\);[\s\S]*?getCloudOfflineCacheByCloudSource\(routed\.id, authenticatedOwnerContext\)/,
  );
  assert.match(
    shell,
    /function CloudProjectRuntime\(\{ archiveId, online, authenticatedOwnerContext/,
  );
  assert.match(
    shell,
    /if \(!authenticatedOwnerContext\?\.userId\) return <ArchiveProjectDetailStatus[\s\S]*?请登录后查看云端项目/,
  );
  assert.match(
    shell,
    /localArchiveHasPendingCloudWork\([\s\S]*?if \(requiresAuthenticatedOwner && !authenticatedOwnerContext\)/,
  );
});

test("signed-out archive routing keeps local-only detail but excludes private cache", () => {
  const local = {
    id: "local-a",
    local_role: "local-project",
    source_cloud_archive_id: null,
  };
  assert.deepEqual(
    resolveAndroidArchiveScreen({
      online: false,
      archiveId: local.id,
      cloudUserId: null,
      cloudArchives: [],
      activityOwnerUserId: null,
      hasPublicFeedItem: false,
      ownedLocalArchives: [local],
    }),
    { kind: "local-detail", archiveId: local.id },
  );
  assert.deepEqual(
    resolveAndroidArchiveScreen({
      online: false,
      archiveId: "cloud-a",
      cloudUserId: null,
      cloudArchives: [],
      activityOwnerUserId: null,
      hasPublicFeedItem: false,
      ownedLocalArchives: [local],
    }),
    { kind: "need-network" },
  );
});
