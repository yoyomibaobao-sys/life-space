import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const release = {
  version_name: "1.0.4-rc5", version_code: 9, channel: "test",
  file_name: "youshi-cultivation-android-1.0.4-rc5.apk",
  object_key: "releases/android/youshi-cultivation-android-1.0.4-rc5.apk",
  size_bytes: 3169682, sha256: "a".repeat(64),
  published_at: "2026-09-10T01:38:00.176Z", minimum_android: "7.0",
};

function harness(overrides = {}) {
  const calls = { fetch: [], native: [], install: [], info: 0 };
  const storage = new Map();
  const app = {
    async getInfo() {
      calls.info++;
      if (overrides.infoError) throw new Error("App info unavailable");
      return { version: "1.0.4-rc4", build: "8", ...overrides.info };
    },
  };
  const native = {
    async getCurrentVersion() { return { versionName: "1.0.4-rc4", versionCode: 8 }; },
    async installUpdate(options) {
      calls.install.push(options);
      if (overrides.installError) throw overrides.installError;
      return { status: "permission_required" };
    },
  };
  const mocks = {
    "@capacitor/app": { App: app },
    "@capacitor/core": {
      Capacitor: {
        isNativePlatform: () => overrides.platform !== "web",
        getPlatform: () => overrides.platform || "android",
        isPluginAvailable: (name) => !overrides.unavailable?.includes(name),
      },
      registerPlugin: () => native,
      CapacitorHttp: { async get(options) {
        calls.native.push(options);
        if (overrides.nativeError) throw overrides.nativeError;
        return { status: 200, data: release, ...overrides.nativeResponse };
      } },
    },
  };
  const context = {
    fetch: async (...args) => {
      calls.fetch.push(args);
      if (overrides.fetch) return overrides.fetch(...args);
      return Response.json(release);
    },
    AbortController, setTimeout, clearTimeout, Date, console,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  function load(relative) {
    const file = path.resolve(relative);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const module = { exports: {} };
    const run = vm.runInNewContext(`(function(require, module, exports) {${code}\n})`, context);
    run((name) => mocks[name] || load(path.resolve(path.dirname(file), `${name}.ts`)), module, module.exports);
    return module.exports;
  }
  return { api: load("lib/android-app-update.ts"), calls, storage };
}

test("installed rc4 detects code9 without downloading or requesting install permissions", async () => {
  const { api, calls } = harness();
  const result = await api.checkAndroidUpdate();
  assert.equal(result.status, "available");
  assert.equal(result.currentVersion.versionCode, 8);
  assert.equal(result.release.version_code, 9);
  assert.equal(calls.install.length, 0);
  assert.equal(calls.native.length, 0);
  const [url, options] = calls.fetch[0];
  assert.equal(new URL(url).origin, "https://life-space.uk");
  assert.equal(new URL(url).pathname, "/downloads/android/release.json");
  assert.equal(options.headers.Accept, "application/json");
  assert.equal(options.credentials, "omit");
  assert.equal(options.cache, "no-store");
});

test("a failed WebView request recovers through the native HTTP already in rc4", async () => {
  const { api, calls } = harness({ fetch: () => { throw new TypeError("Failed to fetch"); } });
  const result = await api.checkAndroidUpdate();
  assert.equal(result.status, "available");
  assert.equal(calls.native.length, 1);
  assert.equal(calls.native[0].disableRedirects, true);
  assert.ok(calls.native[0].connectTimeout > 0);
  assert.ok(calls.native[0].readTimeout > 0);
  assert.equal(calls.install.length, 0);
});

test("an aborted WebView request retries and accepts a valid native JSON string", async () => {
  const { api } = harness({
    fetch: () => { throw new DOMException("Timed out", "AbortError"); },
    nativeResponse: { data: JSON.stringify(release) },
  });
  assert.equal((await api.checkAndroidUpdate()).status, "available");
});

test("HTTP errors or HTML never become a fake latest-version result", async () => {
  for (const nativeResponse of [{ status: 503 }, { data: "<html>Unavailable</html>" }, { data: { ...release, sha256: "bad" } }]) {
    const { api, calls } = harness({ fetch: () => new Response("Not found", { status: 404 }), nativeResponse });
    const result = await api.checkAndroidUpdate();
    assert.equal(result.status, "failed");
    assert.equal(result.currentVersion.versionName, "1.0.4-rc4");
    assert.equal(calls.install.length, 0);
  }
});

test("startup, settings and manual checks coalesce; an explicit retry bypasses the cache", async () => {
  const { api, calls } = harness();
  const a = api.checkAndroidUpdate();
  const b = api.checkAndroidUpdate(true);
  assert.equal(a, b);
  await a;
  await api.checkAndroidUpdate();
  assert.equal(calls.fetch.length, 1);
  await api.checkAndroidUpdate(true);
  assert.equal(calls.fetch.length, 2);
});

test("failed checks can retry immediately after connectivity returns", async () => {
  let fail = true;
  const { api, calls } = harness({
    fetch: () => { if (fail) throw new Error("offline"); return Response.json(release); },
    nativeError: new Error("offline"),
  });
  assert.equal((await api.checkAndroidUpdate()).status, "failed");
  fail = false;
  assert.equal((await api.checkAndroidUpdate(true)).status, "available");
  assert.equal(calls.fetch.length, 2);
});

test("equal/newer installs and iOS/browser clients never get an Android update offer", async () => {
  for (const build of ["9", "10"]) {
    const { api, calls } = harness({ info: { build } });
    assert.equal((await api.checkAndroidUpdate()).status, "latest");
    assert.equal(calls.install.length, 0);
  }
  for (const platform of ["web", "ios"]) {
    const { api, calls } = harness({ platform });
    assert.equal((await api.checkAndroidUpdate()).status, "android_only");
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.info, 0);
  }
});

test("version reading falls back to the native updater if the App plugin fails", async () => {
  const { api } = harness({ infoError: true });
  assert.equal((await api.checkAndroidUpdate()).status, "available");
});

test("legacy shells keep the transition notice, including when version reading is unavailable", async () => {
  for (const infoError of [false, true]) {
    const { api, calls } = harness({ unavailable: ["NativeAppUpdate"], infoError });
    const result = await api.checkAndroidUpdate();
    assert.equal(result.status, "unsupported");
    assert.equal(calls.install.length, 0);
    assert.equal(calls.fetch.length, 0);
    await assert.rejects(api.installAndroidUpdate(release));
  }
});

test("reminders honor the dismissal already saved by the rc6 notifier", () => {
  const { api, storage } = harness();
  storage.set("lifespace.android-update.dismissed", `release-10|${Date.now()}`);
  assert.equal(api.shouldRemindAndroidUpdate(10), false);
  assert.equal(api.shouldRemindAndroidUpdate(11), true);
  api.snoozeAndroidUpdate("legacy");
  assert.equal(api.shouldRemindAndroidUpdate("legacy"), false);
});

test("only an explicit install passes the exact validated bytes to the official installer", async () => {
  const { api, calls } = harness();
  const checked = await api.checkAndroidUpdate();
  assert.equal((await api.installAndroidUpdate(checked.release)).status, "permission_required");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.install[0])), {
    downloadUrl: "https://life-space.uk/downloads/android/latest.apk",
    versionCode: 9, sizeBytes: release.size_bytes, sha256: release.sha256,
  });
  await assert.rejects(api.installAndroidUpdate({ ...release, sha256: "bad" }));
  assert.equal(calls.install.length, 1);
});

test("install failures are distinguishable from metadata failures on legacy shells", () => {
  const { api } = harness();
  assert.equal(api.androidInstallFailure({ message: "Android could not open the install permission setting." }), "permission");
  assert.equal(api.androidInstallFailure({ message: "Android could not open the package installer." }), "installer");
  assert.equal(api.androidInstallFailure({ message: "The Android update could not be verified or opened." }), "download");
});

test("Later suppresses only this release for a day, without touching local records", () => {
  const { api, storage } = harness();
  storage.set("unrelated-local-projects", "keep");
  assert.equal(api.shouldRemindAndroidUpdate(9), true);
  api.snoozeAndroidUpdate(9);
  assert.equal(api.shouldRemindAndroidUpdate(9), false);
  assert.equal(api.shouldRemindAndroidUpdate(10), true);
  assert.equal(api.shouldRemindAndroidUpdate(9, Date.now() + 86_400_001), true);
  assert.equal(storage.get("unrelated-local-projects"), "keep");
});
