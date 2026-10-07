import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function loadCapacitorConfig(overrides = {}) {
  const result = await build({
    entryPoints: [path.join(root, "capacitor.config.ts")],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  });
  const previous = {
    ANDROID_SINGLE_RUNTIME: process.env.ANDROID_SINGLE_RUNTIME,
    CAPACITOR_SERVER_URL: process.env.CAPACITOR_SERVER_URL,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  const file = path.join(
    root,
    `.capacitor-config-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(file, result.outputFiles[0].contents);
  try {
    return (await import(pathToFileURL(file).href)).default;
  } finally {
    fs.rmSync(file, { force: true });
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function runMobileShellBuild(env, outputRoot) {
  return spawnSync(process.execPath, ["scripts/build-mobile-offline.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ANDROID_SHELL_OUTPUT: outputRoot,
      ...env,
    },
  });
}

test("default Capacitor config still uses remote server.url and offline.html errorPath", async () => {
  const config = await loadCapacitorConfig({ ANDROID_SINGLE_RUNTIME: null });
  assert.equal(config.appId, "com.youshi.cultivation");
  assert.equal(config.server.url, "https://life-space.uk");
  assert.equal(config.server.errorPath, "offline.html");
  assert.equal(config.server.hostname, "life-space.uk");
  assert.equal(config.server.androidScheme, "https");
  assert.match(read("capacitor.config.ts"), /ANDROID_SINGLE_RUNTIME === "1"/);
  assert.match(read("capacitor.config.ts"), /url: cloudUrl\.origin/);
  assert.match(read("capacitor.config.ts"), /errorPath: "offline\.html"/);
});

test("acceptance Capacitor config has no remote server.url and is not a second errorPath app", async () => {
  const config = await loadCapacitorConfig({ ANDROID_SINGLE_RUNTIME: "1" });
  assert.equal(config.appId, "com.youshi.cultivation");
  assert.equal(config.server.url, undefined);
  assert.equal(config.server.errorPath, undefined);
  assert.equal(config.server.hostname, "life-space.uk");
  assert.equal(config.server.androidScheme, "https");
  assert.equal(config.server.cleartext, false);
});

test("acceptance index.html is the React runtime and does not depend on offline.html", () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lifespace-android-runtime-"));
  const result = runMobileShellBuild(
    {
      ANDROID_SINGLE_RUNTIME: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-test-key",
    },
    outputRoot,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const index = fs.readFileSync(path.join(outputRoot, "index.html"), "utf8");
  assert.match(index, /id="root"/);
  assert.match(index, /data-android-runtime="bundled"/);
  assert.match(index, /<script>/);
  assert.doesNotMatch(index, /process\.env\./);
  assert.equal(fs.existsSync(path.join(outputRoot, "offline.html")), false);
  assert.match(read("scripts/build-mobile-offline.mjs"), /data-android-runtime=\\"bundled\\"/);
  fs.rmSync(outputRoot, { recursive: true, force: true });
});

test("default mobile-shell build still writes placeholder index and offline React document", () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lifespace-android-default-"));
  const result = runMobileShellBuild(
    {
      ANDROID_SINGLE_RUNTIME: "",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    },
    outputRoot,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const index = fs.readFileSync(path.join(outputRoot, "index.html"), "utf8");
  const offline = fs.readFileSync(path.join(outputRoot, "offline.html"), "utf8");
  assert.doesNotMatch(index, /id="root"/);
  assert.doesNotMatch(index, /data-android-runtime="bundled"/);
  assert.match(index, /LifeSpace·自然/);
  assert.match(offline, /id="root"/);
  fs.rmSync(outputRoot, { recursive: true, force: true });
});

test("acceptance build fails fast without NEXT_PUBLIC_TURNSTILE_SITE_KEY", () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lifespace-android-turnstile-"));
  const result = runMobileShellBuild(
    {
      ANDROID_SINGLE_RUNTIME: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    },
    outputRoot,
  );
  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stderr}\n${result.stdout}`,
    /NEXT_PUBLIC_TURNSTILE_SITE_KEY is required for ANDROID_SINGLE_RUNTIME/,
  );
  fs.rmSync(outputRoot, { recursive: true, force: true });
});

test("workflow can dispatch single-runtime acceptance without publishing website APK", () => {
  const workflow = read(".github/workflows/android-apk.yml");
  assert.match(workflow, /single_runtime_acceptance:/);
  assert.match(workflow, /type: boolean/);
  assert.match(workflow, /ANDROID_SINGLE_RUNTIME:/);
  assert.match(workflow, /inputs\.single_runtime_acceptance == true && '1'/);
  assert.match(workflow, /Require Turnstile for single-runtime acceptance/);
  assert.match(workflow, /Verify single-runtime acceptance document/);
  assert.match(workflow, /data-android-runtime="bundled"/);
  assert.match(workflow, /Acceptance APK must not ship a second-document offline\.html/);
  assert.match(
    workflow,
    /github\.ref == 'refs\/heads\/main' && env\.ANDROID_KEYSTORE_BASE64 != '' && inputs\.single_runtime_acceptance != true/,
  );
  assert.match(
    workflow,
    /EXPECTED_SIGNER_SHA256: ccc03e33fed7ce95dd4d203aa3451a08cdc175874e4a6ae159b81c367164635d/,
  );
  assert.match(read("android/app/build.gradle"), /ANDROID_VERSION_NAME'\) \?: '1\.0\.4-rc21'/);
  assert.match(read("android/app/build.gradle"), /ANDROID_VERSION_CODE'\) \?: '28'/);
});

test("CloudArchiveDetailController, DeviceOwnedProjectDetail, and MobileProfileView stay shared", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(read("components/archive-ui/CloudArchiveDetailController.tsx"), /<ArchiveProjectDetailView/);
  assert.match(shell, /<CloudArchiveDetailController/);
  assert.match(shell, /function CloudProjectRuntime/);
  assert.match(shell, /<DeviceOwnedProjectDetail/);
  assert.match(read("app/local/archive/[id]/page.tsx"), /<DeviceOwnedProjectDetail/);
  assert.match(read("components/archive-ui/DeviceOwnedProjectDetail.tsx"), /view: View = ArchiveProjectDetailView/);
  assert.match(read("components/profile/MobileProfileView.tsx"), /data-mobile-profile-view="true"/);
  assert.match(read("components/profile/AndroidProfileController.tsx"), /<MobileProfileView/);
  assert.match(shell, /<AndroidProfileController/);
});

test("CapacitorHttp native transport, SW cleanup, pending sync, and Blob image regressions remain", () => {
  assert.match(read("lib/android-remote-api.ts"), /CapacitorHttp\.request/);
  assert.match(read("lib/android-remote-api.ts"), /No global fetch patch/);
  assert.match(read("lib/cloud-trash.ts"), /requestAndroidRemoteApi/);
  const serviceWorker = read("lib/android-service-worker.ts");
  assert.doesNotMatch(serviceWorker, /caches\.delete|indexedDB\.deleteDatabase|localStorage\.clear/);
  assert.match(serviceWorker, /unregister\(\)/);
  assert.match(read("lib/pending-cloud-sync.ts"), /syncAllPendingCloudArchives/);
  assert.match(read("lib/local-image-blob.ts"), /normalizeLocalImageBlob/);
  assert.match(read("components/local/LocalBlobImage.tsx"), /URL\.createObjectURL/);
});
