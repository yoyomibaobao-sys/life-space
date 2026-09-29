import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { retireBundledLegacyServiceWorkers } from "../lib/android-service-worker.ts";
import { androidNextApiInventory } from "../lib/android-api-inventory.ts";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function loadModule(entry, stubs = {}) {
  const output = path.join(root, `.android-contract-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm", outfile: output,
    plugins: [{ name: "contract-stubs", setup(ctx) {
      ctx.onResolve({ filter: /^@\// }, (args) => Object.hasOwn(stubs, args.path)
        ? { path: args.path, namespace: "contract" }
        : { path: path.join(root, args.path.slice(2)) });
      ctx.onResolve({ filter: /^(server-only|@supabase\/supabase-js)$/ }, (args) =>
        Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: "contract" } : undefined);
      ctx.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: "@capacitor/core", namespace: "contract" }));
      ctx.onLoad({ filter: /.*/, namespace: "contract" }, (args) => ({
        contents: stubs[args.path] ?? "export const Capacitor = { isNativePlatform: () => true }; export const CapacitorHttp = { request: () => { throw Error('native request not injected') } };",
        loader: "js",
      }));
    } }],
  });
  fs.writeFileSync(output, result.outputFiles[0].contents);
  try { return await import(pathToFileURL(output).href); }
  finally { fs.rmSync(output, { force: true }); }
}

test("website and Android controllers share a live timeline loader with media and owner records", async () => {
  const source = read("app/archive/[id]/page.tsx");
  assert.match(source, /loadCloudArchiveTimeline\(archiveData\.id, isOwnerView\)/);
  const calls = [];
  const rows = {
    archives: [{ id: "cloud-1", user_id: "owner-1", title: "Cloud", category: "plant", is_public: false }],
    archive_cycles: [{ id: "cycle-1", archive_id: "cloud-1", cycle_no: 1, status: "active" }],
    records: [{ id: "record-1", archive_id: "cloud-1", record_time: "2026-01-01", note: "hello", record_tags: [
      { tag: "water", tag_type: "behavior", source: "user", is_active: true },
      { tag: "old", tag_type: "behavior", source: "user", is_active: false },
    ] }],
    media: [{ id: "photo-1", record_id: "record-1", storage_path: "owner-1/photo-1" }],
    public_profiles: [{ username: "Garden" }],
    sub_tags: [{ id: "sub-1", category: "plant", name: "Herbs" }],
    group_tags: [{ id: "group-1", sub_tag_id: "sub-1", name: "Bed" }],
  };
  const db = { from(table) {
    const query = {
      select() { calls.push(table); return this; }, eq() { return this; }, in() { return this; },
      order() { return this; }, maybeSingle() { return Promise.resolve({ data: rows[table]?.[0] || null, error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: rows[table] || [], error: null }).then(resolve, reject); },
    };
    return query;
  } };
  const module = await loadModule("lib/cloud-archive-detail.ts", {
    "@/lib/supabase": "export const supabase = {};",
    "@/lib/media-urls": "export const attachMediaDisplayUrls = async (_, rows) => rows; export const resolveMediaDisplayPairs = async (_, sources) => sources.map((source) => ({ display_url: source.url || null, display_thumb_url: source.thumb_path || null }));",
    "@/lib/archive-category-settings": "export const getCloudArchiveCategoryDepths = async () => ({ plant:3, system:3, insect_fish:3, other:3 });",
  });
  const live = await module.loadCloudArchiveDetail("cloud-1", "owner-1", db);
  assert.equal(live.archive.title, "Cloud");
  assert.equal(live.cycles[0].id, "cycle-1");
  assert.equal(live.records[0].media[0].id, "photo-1");
  assert.deepEqual(live.records[0].display_tags, ["water"]);
  assert.equal(live.subTags[0].name, "Herbs");
  assert.equal(live.groupTags[0].name, "Bed");
  assert.equal(live.username, "Garden");
  assert.equal(await module.loadCloudArchiveDetail("cloud-1", "other", db), null);
  assert.ok(calls.includes("records") && calls.includes("media"));
});

test("followed public project resolves by archive ID without treating another owner's project as mine", async () => {
  const module = await loadModule("lib/cloud-archive-detail.ts", {
    "@/lib/supabase": "export const supabase = {};",
    "@/lib/media-urls": "export const attachMediaDisplayUrls = async (_, rows) => rows; export const resolveMediaDisplayPairs = async (_, sources) => sources.map((source) => ({ display_url: source.url || null, display_thumb_url: source.thumb_path || null }));",
    "@/lib/archive-category-settings": "export const getCloudArchiveCategoryDepths = async () => ({});",
  });
  let archive = {
    id: "followed-1", user_id: "other-owner", title: "Followed project",
    is_public: true, trashed_at: null, system_name: "Basil", archive_summary: "Growing",
    cover_image_url: "https://cdn.example/cover.jpg",
  };
  const client = { from(table) {
    return { select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: table === "archives" ? archive : { username: "Grower" }, error: null }) };
  } };
  const route = await module.resolveCloudArchiveRoute("followed-1", client);
  assert.equal(route.ownerId, "other-owner");
  assert.equal(route.publicSummary.archive_title, "Followed project");
  assert.equal(route.publicSummary.profile_display_name, "Grower");
  assert.equal(route.publicSummary.display_image_url, "https://cdn.example/cover.jpg");
  archive = { ...archive, is_public: false };
  assert.equal((await module.resolveCloudArchiveRoute("followed-1", client)).publicSummary, null);
  archive = { ...archive, trashed_at: "2026-09-01" };
  assert.equal(await module.resolveCloudArchiveRoute("followed-1", client), null);
});

test("native API transport carries Bearer auth for all JSON methods and rejects redirects, HTML and network failure", async () => {
  const module = await loadModule("lib/android-remote-api.ts", { "@/lib/supabase": "export const supabase = {};" });
  const calls = [];
  for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
    const result = await module.requestAndroidRemoteApi("/api/trash?batch=1", {
      method, token: "session-token", isNative: true,
      ...(method === "POST" || method === "PATCH" || method === "PUT" ? { json: { value: 3 } } : {}),
      nativeRequest: async (request) => { calls.push(request); return { status: 200, url: request.url, data: { ok: true }, headers: {} }; },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, { ok: true });
  }
  assert.equal(calls.length, 5);
  assert.ok(calls.every((request) => request.url.startsWith("https://life-space.uk/api/") &&
    request.disableRedirects && request.headers.Authorization === "Bearer session-token" && !request.headers.Cookie));
  assert.equal(calls[1].data, '{"value":3}');
  const redirect = await module.requestAndroidRemoteApi("/api/trash", { token: "x", isNative: true,
    nativeRequest: async () => ({ status: 302, data: null, headers: {}, url: "https://evil.example/" }) });
  assert.equal(redirect.error, "remote_redirect_rejected");
  const html = await module.requestAndroidRemoteApi("/api/trash", { token: "x", isNative: true,
    nativeRequest: async () => ({ status: 200, data: "<html>local asset</html>", headers: {} }) });
  assert.equal(html.error, "network_or_response_error");
  const offline = await module.requestAndroidRemoteApi("/api/trash", { token: "x", isNative: true,
    nativeRequest: async () => { throw new Error("offline"); } });
  assert.equal(offline.status, 0);
  assert.equal((await module.requestAndroidRemoteApi("/api/trash", { token: null, isNative: true })).status, 401);
  assert.equal((await module.requestAndroidRemoteApi("/api/trash", { token: "x", isNative: false })).error, "native_transport_required");
  assert.throws(() => module.remoteApiUrl("https://life-space.uk/api/trash"));
});

test("server chooses explicit Bearer owner over a conflicting WebView cookie", async () => {
  const module = await loadModule("lib/server/authenticated-request.ts", {
    "server-only": "",
    "@supabase/supabase-js": `export const createClient = (_url, _key, options) => ({ auth: {
      getUser: async () => ({ data: { user: options.global.headers.Authorization === 'Bearer valid' ? { id: 'bearer-owner' } : null }, error: null })
    } });`,
    "@/lib/supabaseServer": "export const getSupabaseServer = async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'cookie-owner' } }, error: null }) } });",
  });
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test";
  try {
    const request = (token) => new Request("https://life-space.uk/api/trash", {
      headers: token ? { Authorization: `Bearer ${token}`, Cookie: "session=stale" } : { Cookie: "session=stale" },
    });
    assert.equal((await module.getAuthenticatedRequestClient(request("valid"))).userId, "bearer-owner");
    assert.equal(await module.getAuthenticatedRequestClient(request("invalid")), null);
    assert.equal((await module.getAuthenticatedRequestClient(request(null))).userId, "cookie-owner");
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});

test("live Profile reads membership, storage, orders and admin from authenticated user", async () => {
  const module = await loadModule("lib/android-profile-controller.ts", {
    "@/lib/supabase": "export const supabase = {};",
    "@/lib/user-profile-shared": "export const loadUserProfileData = async () => ({ profile: { username:'Garden', storage_used:42 }, stats: { receivedFlowerCount:2 } });",
    "@/lib/membership": "export const normalizeMembershipRpcResult = data => data;",
  });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } }, error: null }) },
    rpc: async (name) => ({ data: name === "is_app_admin" ? true : { plan: "plus" }, error: null }),
    from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; },
      limit: async () => ({ data: [{ id: "order-1", status: "confirmed" }], error: null }) }),
  };
  const live = await module.loadAndroidProfileLive("owner", client);
  assert.equal(live.profile.storage_used, 42);
  assert.equal(live.membership.plan, "plus");
  assert.equal(live.payments[0].status, "confirmed");
  assert.equal(live.isAdmin, true);
  await assert.rejects(module.loadAndroidProfileLive("other", client), /not_authenticated/);
});

test("bundled SW retirement affects only registrations on the same origin and leaves data stores untouched", async () => {
  let removed = 0;
  const serviceWorker = { getRegistrations: async () => [
    { scope: "https://life-space.uk/", unregister: async () => { removed++; return true; } },
    { scope: "https://other.example/", unregister: async () => { removed++; return true; } },
  ] };
  assert.deepEqual(await retireBundledLegacyServiceWorkers(serviceWorker, "https://life-space.uk"), { matched: 1, removed: 1 });
  assert.equal(removed, 1);
  assert.deepEqual(await retireBundledLegacyServiceWorkers(serviceWorker, "https://localhost"), { matched: 0, removed: 0 });
  assert.doesNotMatch(read("lib/android-service-worker.ts"), /caches\.delete|indexedDB\.deleteDatabase|localStorage\.clear/);
});

test("cloud and local group settings persist separately, including offline local writes", async () => {
  const saved = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value),
  } };
  const rows = [];
  const db = { from(name) {
    assert.equal(name, "archive_category_settings");
    return {
      select() { return this; }, eq() { return Promise.resolve({ data: [{ category: "plant", max_depth: 2 }], error: null }); },
      upsert(value) { rows.push(...value); return Promise.resolve({ error: null }); },
    };
  } };
  globalThis.__categoryClient = db;
  const live = await loadModule("lib/archive-category-settings.ts", {
    "@/lib/supabase": "export const supabase = globalThis.__categoryClient;",
  });
  assert.equal((await live.getCloudArchiveCategoryDepths("owner")).plant, 2);
  await live.saveCloudArchiveCategoryDepths("owner", { plant: 1, system: 2, insect_fish: 3, other: 3 });
  assert.equal(rows.length, 4);
  assert.equal(rows[0].user_id, "owner");
  live.saveLocalArchiveCategoryDepths({ plant: 3, system: 1, insect_fish: 2, other: 3 }, "owner");
  assert.equal(live.getLocalArchiveCategoryDepths("owner").system, 1);
  assert.equal(live.DEFAULT_ARCHIVE_CATEGORY_DEPTHS.plant, 3);
  delete globalThis.__categoryClient;
  delete globalThis.window;
});

test("bundled Auth restores a session and requires Turnstile for login", async () => {
  const module = await loadModule("lib/android-auth-session.ts", { "@/lib/supabase": "export const supabase = {};" });
  let loginInput = null;
  const client = { auth: {
    getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
    getUser: async () => ({ data: { user: { id: "owner" } }, error: null }),
    signInWithPassword: async (input) => { loginInput = input; return { data: { user: { id: "owner" }, session: {} }, error: null }; },
  } };
  assert.equal((await module.restoreBundledSession(client, false)).id, "owner");
  assert.equal((await module.restoreBundledSession(client, true)).id, "owner");
  await assert.rejects(module.loginBundledWithTurnstile({ email: "A@EXAMPLE.COM", password: "secret", captchaToken: null, siteKeyConfigured: true }, client), /turnstile_token_required/);
  await assert.rejects(module.loginBundledWithTurnstile({ email: "a@example.com", password: "secret", captchaToken: "x", siteKeyConfigured: false }, client), /turnstile_site_key_missing/);
  await module.loginBundledWithTurnstile({ email: "A@EXAMPLE.COM", password: "secret", captchaToken: "token", siteKeyConfigured: true }, client);
  assert.equal(loginInput.email, "a@example.com");
  assert.equal(loginInput.options.captchaToken, "token");
});

test("every Next route handler is classified and Android-native paths use the transport", () => {
  const handlers = fs.readdirSync(path.join(root, "app/api"), { recursive: true })
    .map((name) => String(name).replaceAll("\\", "/"))
    .filter((name) => name.endsWith("/route.ts") || name === "route.ts")
    .map((name) => `/api/${name.replace(/\/route\.ts$/, "")}`)
    .sort();
  assert.deepEqual(handlers, Object.keys(androidNextApiInventory).sort());
  assert.match(read("lib/cloud-trash.ts"), /requestAndroidRemoteApi/);
  assert.match(read("lib/server/authenticated-request.ts"), /getBearerToken\(request\)/);
  assert.ok(Object.entries(androidNextApiInventory).filter(([, kind]) => kind === "android-native")
    .every(([route]) => route.startsWith("/api/trash") || /^\/api\/(archives|records|media)\/\[id\]$/.test(route)));
});

test("Android route and shared presentation contract avoids Next navigation and duplicate local controller", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const cloud = read("components/archive-ui/CloudArchiveDetailController.tsx");
  const profile = read("components/profile/AndroidProfileController.tsx");
  const follow = read("app/follow/page.tsx");
  const market = read("app/market/page.tsx");
  assert.match(shell, /kind: "cloud-detail"/);
  assert.match(shell, /kind: "public-cloud-detail"/);
  assert.match(shell, /<PublicCloudArchiveRouteController/);
  assert.doesNotMatch(shell, /publicItem\?\.owner_user_id === cloudUserId \|\| !publicItem/);
  const handledLink = shell.match(/if \(applyShellPath\(url\.pathname, url\.search\)\) \{([\s\S]*?)\n      \}/)?.[1];
  assert.match(handledLink || "", /event\.preventDefault\(\)/);
  assert.doesNotMatch(handledLink || "", /event\.stopPropagation\(\)/);
  assert.match(shell, /anchor\.dataset\.shellHandled === "true"/);
  assert.match(read("components/discover/DiscoverProjectCard.tsx"), /data-shell-handled=\{onOpen/);
  assert.match(shell, /detailOwnsTopNav = \[[^\]]*"cloud-detail"/);
  assert.match(shell, /<CloudProjectRuntime/);
  assert.match(shell, /getCloudOfflineCacheByCloudSource/);
  assert.match(shell, /<DeviceOwnedProjectDetail/);
  assert.match(cloud, /<ArchiveProjectDetailView/);
  assert.match(profile, /<MobileProfileView/);
  assert.match(shell, /<AndroidProfileController/);
  assert.match(shell, /saveCloudArchiveCategoryDepths/);
  assert.match(shell, /saveLocalArchiveCategoryDepths/);
  assert.doesNotMatch(follow, /next\/navigation|router\.push/);
  assert.doesNotMatch(market, /next\/navigation|router\.push/);
  assert.match(follow, /useInternalNavigate/);
  assert.match(market, /InternalLink/);
  assert.doesNotMatch(read("app/archive/[id]/AddRecord.tsx"), /next\/navigation/);
  assert.doesNotMatch(read("components/EditRecord.tsx"), /next\/navigation/);
  assert.doesNotMatch(read("app/archive/[id]/DeleteRecordButton.tsx"), /next\/navigation/);
});
