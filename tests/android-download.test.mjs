import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("Android download keeps environment overrides and assembles its bundled test APK", () => {
  const route = read("app/api/download/android/route.ts");
  const zh = read("lib/i18n/zh.ts");
  const checksum = read(
    "public/downloads/youshi-cultivation-android-test.apk.sha256",
  );

  const environmentOverride = route.indexOf(
    "process.env.ANDROID_APK_DOWNLOAD_URL",
  );
  const bundledFallback = route.indexOf(
    "return serveBundledAndroidApk(request)",
    environmentOverride,
  );

  assert.ok(environmentOverride >= 0);
  assert.ok(bundledFallback > environmentOverride);
  assert.match(route, /\{ length: 8 \}/);
  assert.match(route, /\/downloads\/android-test-parts\/part-/);
  assert.match(route, /BUNDLED_ANDROID_APK_VERSION = "1\.0\.1"/);
  assert.match(route, /searchParams\.set\("v", BUNDLED_ANDROID_APK_VERSION\)/);
  assert.match(route, /totalSize !== BUNDLED_ANDROID_APK_SIZE/);
  assert.match(route, /application\/vnd\.android\.package-archive/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /event_name: "apk_download"/);
  assert.match(route, /NextResponse\.redirect/);
  assert.match(route, /serveBundledAndroidApk\(request\)/);
  assert.match(zh, /download_android: "下载 Android 测试版"/);
  assert.match(checksum, /^[a-f0-9]{64}\s+youshi-cultivation-android-test\.apk\s*$/);

  const apk = Buffer.concat(
    Array.from({ length: 8 }, (_, index) =>
      fs.readFileSync(
        path.join(
          root,
          "public/downloads/android-test-parts",
          `part-${String(index).padStart(2, "0")}`,
        ),
      ),
    ),
  );
  const expectedHash = checksum.trim().split(/\s+/)[0];
  const actualHash = crypto.createHash("sha256").update(apk).digest("hex");

  assert.equal(apk.byteLength, 4_108_758);
  assert.equal(actualHash, expectedHash);
});
