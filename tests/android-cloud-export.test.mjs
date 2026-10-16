import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { build } from "esbuild";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
async function loadExport() {
  const calls = [];
  const result = await build({
    entryPoints: ["lib/android-cloud-export.ts"], bundle: true, write: false,
    platform: "node", format: "esm",
    plugins: [{ name: "native-test", setup(ctx) {
      ctx.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: "capacitor", namespace: "test" }));
      ctx.onLoad({ filter: /.*/, namespace: "test" }, () => ({
        contents: `export const Capacitor = { isNativePlatform: () => true };
          export const registerPlugin = () => ({
            estimate: async (value) => { globalThis.__cloudExportCalls.push(["estimate", value]); return globalThis.__cloudExportEstimate || { projects: 2, cycles: 3, records: 4, media: 5, sizeBytes: 6 }; },
            save: async (value) => { globalThis.__cloudExportCalls.push(["save", value]); return { cancelled: false, sizeBytes: 8, sha256: "abc" }; }
          });`, loader: "js",
      }));
    } }],
  });
  globalThis.__cloudExportCalls = calls;
  return { api: await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64")), calls };
}

test("QA token never targets production and requires a configured matching service", async () => {
  const { api } = await loadExport();
  const prevSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevExport = process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mablwxlipcgbmbnfdbkc.supabase.co";
    delete process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN;
    assert.throws(() => api.cloudExportRequest("qa-token", "UTC"), /matching_export_service_required/);
    process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN = "https://life-space.uk";
    assert.throws(() => api.cloudExportRequest("qa-token", "UTC"), /qa_export_to_production_rejected/);
    assert.throws(() => api.resolveMatchingCloudOrigin(), /qa_export_to_production_rejected/);
    process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN = "https://qa-export.example";
    assert.equal(api.resolveMatchingCloudOrigin().origin, "https://qa-export.example");
    assert.deepEqual(api.cloudExportRequest("qa-token", "Asia/Shanghai"), {
      origin: "https://qa-export.example",
      supabaseUrl: "https://mablwxlipcgbmbnfdbkc.supabase.co",
      accessToken: "qa-token", timeZone: "Asia/Shanghai",
    });
    process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN = "http://qa-export.example";
    assert.throws(() => api.cloudExportRequest("qa-token", "UTC"), /invalid_export_origin/);
  } finally {
    if (prevSupabase === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevSupabase;
    if (prevExport === undefined) delete process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN;
    else process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN = prevExport;
  }
});

test("estimate and save share the exact account-bound export request", async () => {
  const { api, calls } = await loadExport();
  const request = { origin: "https://qa-export.example", supabaseUrl: "https://qa.supabase.co", accessToken: "test", timeZone: "UTC" };
  assert.equal((await api.estimateAndroidCloudExport(request)).projects, 2);
  assert.equal((await api.saveAndroidCloudExport(request)).sizeBytes, 8);
  assert.deepEqual(calls, [["estimate", request], ["save", request]]);
});

test("invalid export estimate fails before the document picker", async () => {
  const { api, calls } = await loadExport();
  const request = { origin: "https://qa-export.example", supabaseUrl: "https://qa.supabase.co", accessToken: "test", timeZone: "UTC" };
  try {
    globalThis.__cloudExportEstimate = { projects: 1, cycles: 0, records: 0, media: 0, sizeBytes: -1 };
    await assert.rejects(api.estimateAndroidCloudExport(request), /invalid_export_estimate/);
    assert.deepEqual(calls.map(([operation]) => operation), ["estimate"]);
  } finally { delete globalThis.__cloudExportEstimate; }
});

test("Android bridge verifies environment before bearer and uses separate temporary ZIP and system save picker", () => {
  const java = source("android/app/src/main/java/com/youshi/cultivation/CloudExportPlugin.java");
  assert.ok(java.indexOf("verifyEnvironment(base, expected)") < java.indexOf('request(base + "/api/export/my-records?estimate=1", token'));
  assert.match(java, /ACTION_CREATE_DOCUMENT/);
  assert.ok(java.includes('zip.getEntry("未能下载的图片清单.txt") != null'));
  assert.match(java, /File\.createTempFile\("cloud-export-"/);
  assert.match(java, /MessageDigest\.isEqual/);
  assert.match(java, /setInstanceFollowRedirects\(false\)/);
  assert.doesNotMatch(java, /LocalSafPlugin|ACTION_OPEN_DOCUMENT_TREE|life-space-saf/);
  const route = source("app/api/export/my-records/route.ts");
  assert.ok(route.indexOf('searchParams.get("environment")') < route.indexOf("getAuthenticatedRequestClient(request)"));
});

test("backup reminder opens the real App module; original web export endpoint remains the packer", () => {
  assert.match(source("mobile-offline-src/main.tsx"), /onOpenBackup=\{\(\) => setScreen\(\{ kind: "profile", module: "backup" \}\)\}/);
  const profile = source("components/profile/AndroidProfileController.tsx");
  assert.match(profile, /estimateAndroidCloudExport\(request\)/);
  assert.match(profile, /saveAndroidCloudExport\(request\)/);
  assert.doesNotMatch(profile, /Browser\.open\(\{ url: "https:\/\/life-space\.uk\/profile" \}\)/);
  assert.match(source("app/api/export/my-records/route.ts"), /const zip = new SimpleZipBuilder\(\)/);
});
test("standalone cover download failure marks the ZIP incomplete; a successful cover is included", async () => {
  const dependencies = {
    "planting-region": "export const formatPlantingRegion = () => '';",
    "account-number": "export const formatAccountNumber = () => null;",
    "record-location-cloud": "export const readRecordLocations = async () => new Map();",
    "authenticated-request": "export const getAuthenticatedRequestClient = async () => ({ supabase: globalThis.__exportDb, userId: 'qa-user' });",
    "archive-categories": "export const getArchiveCategoryLabel = () => '植物';",
    "export-zip": `export class SimpleZipBuilder {
      constructor() { globalThis.__exportFiles = new Map(); }
      addFile(path, contents) { globalThis.__exportFiles.set(path, contents); }
      generate() { return new Uint8Array([80, 75, 3, 4]); }
    }`,
    "media-urls": "export const getMediaStoragePathFromUrl = () => null;",
    "supabase-schema-compat": "export const isMissingDatabaseColumn = () => false;",
    "date-time": "export const normalizeTimeZone = () => 'UTC'; export const formatPreciseDateTime = () => '2026/10/11 12:00';",
  };
  const result = await build({
    entryPoints: ["app/api/export/my-records/route.ts"], bundle: true, write: false,
    platform: "node", format: "esm",
    plugins: [{ name: "export-route-test", setup(ctx) {
      ctx.onResolve({ filter: /^@\/lib\// }, (args) => ({
        path: args.path.split("/").at(-1), namespace: "export-route-test",
      }));
      ctx.onLoad({ filter: /.*/, namespace: "export-route-test" }, (args) => ({
        contents: dependencies[args.path], loader: "js",
      }));
    } }],
  });
  const { GET } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
  const archive = {
    id: "archive-1", title: "QA项目", category: "plant", cover_image_path: "qa/cover.png",
    cover_image_url: null, is_public: false, status: "active", created_at: "2026-10-11T00:00:00Z",
  };
  let downloadFails = true;
  globalThis.__exportDb = {
    from(table) {
      const rows = table === "archives" ? [archive] : [];
      const query = {
        select() { return this; }, eq() { return this; }, in() { return this; },
        order() { return Promise.resolve({ data: rows, error: null }); },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      };
      return query;
    },
    storage: { from() { return {
      async download() { return downloadFails
        ? { data: null, error: { message: "test missing cover" } }
        : { data: new Blob(["original-cover"], { type: "image/png" }), error: null };
      },
    }; } },
  };
  try {
    const request = new Request("https://qa-export.example/api/export/my-records");
    assert.equal((await GET(request)).status, 200);
    assert.match(globalThis.__exportFiles.get("未能下载的图片清单.txt"), /QA项目 \/ 封面/);
    downloadFails = false;
    assert.equal((await GET(request)).status, 200);
    assert.equal(globalThis.__exportFiles.has("未能下载的图片清单.txt"), false);
    const cover = [...globalThis.__exportFiles.entries()].find(([path]) => path.endsWith("/images/cover.png"));
    assert.ok(cover);
    assert.equal(new TextDecoder().decode(cover[1]), "original-cover");
  } finally {
    delete globalThis.__exportDb;
    delete globalThis.__exportFiles;
  }
});
