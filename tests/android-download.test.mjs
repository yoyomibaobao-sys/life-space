import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ANDROID_RELEASE_APK_PATH,
  ANDROID_RELEASE_MANIFEST_PATH,
  handleAndroidReleaseDownload,
  isAndroidReleaseDownloadPath,
} from "../cloudflare/android-release-download.mjs";
import {
  createAndroidReleaseManifest,
  writeAndroidReleaseManifest,
} from "../scripts/write-android-release-manifest.mjs";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const releaseManifest = {
  version_name: "1.0.4-rc3",
  version_code: 7,
  channel: "test",
  file_name: "youshi-cultivation-android-1.0.4-rc3.apk",
  object_key: "releases/android/youshi-cultivation-android-1.0.4-rc3.apk",
  size_bytes: 12,
  sha256: "a".repeat(64),
  published_at: "2026-09-06T00:00:00.000Z",
  minimum_android: "7.0",
};

function createR2Object(value, contentType) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return {
    size: bytes.byteLength,
    body: new Response(bytes).body,
    httpEtag: '"test-etag"',
    async text() {
      return bytes.toString("utf8");
    },
    writeHttpMetadata(headers) {
      if (contentType) headers.set("Content-Type", contentType);
    },
  };
}

function createR2Bucket({ manifest = releaseManifest, apk = Buffer.alloc(12, 7) } = {}) {
  return {
    async get(key) {
      if (key === "releases/android/release.json") {
        return createR2Object(JSON.stringify(manifest), "application/json");
      }
      if (key === manifest.object_key) {
        return createR2Object(apk, "application/vnd.android.package-archive");
      }
      return null;
    },
  };
}

test("Android release routes are served from the private R2 binding", async () => {
  assert.equal(isAndroidReleaseDownloadPath(ANDROID_RELEASE_APK_PATH), true);
  assert.equal(isAndroidReleaseDownloadPath(ANDROID_RELEASE_MANIFEST_PATH), true);
  assert.equal(isAndroidReleaseDownloadPath("/download/android"), false);

  const env = { R2_MEDIA_CANARY: createR2Bucket() };
  const manifestResponse = await handleAndroidReleaseDownload(
    new Request(`https://life-space.uk${ANDROID_RELEASE_MANIFEST_PATH}`),
    env,
  );
  assert.equal(manifestResponse.status, 200);
  assert.deepEqual(await manifestResponse.json(), releaseManifest);
  assert.equal(manifestResponse.headers.get("cache-control"), "no-store");

  const apkResponse = await handleAndroidReleaseDownload(
    new Request(`https://life-space.uk${ANDROID_RELEASE_APK_PATH}`),
    env,
  );
  assert.equal(apkResponse.status, 200);
  assert.equal(
    apkResponse.headers.get("content-type"),
    "application/vnd.android.package-archive",
  );
  assert.equal(
    apkResponse.headers.get("content-disposition"),
    `attachment; filename="${releaseManifest.file_name}"`,
  );
  assert.equal(apkResponse.headers.get("x-checksum-sha256"), releaseManifest.sha256);
  assert.equal((await apkResponse.arrayBuffer()).byteLength, 12);

  const headResponse = await handleAndroidReleaseDownload(
    new Request(`https://life-space.uk${ANDROID_RELEASE_APK_PATH}`, {
      method: "HEAD",
    }),
    env,
  );
  assert.equal(headResponse.status, 200);
  assert.equal(headResponse.body, null);

  const methodResponse = await handleAndroidReleaseDownload(
    new Request(`https://life-space.uk${ANDROID_RELEASE_APK_PATH}`, {
      method: "POST",
    }),
    env,
  );
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get("allow"), "GET, HEAD");
});

test("Android release serving fails closed for missing or inconsistent R2 data", async () => {
  const missingBinding = await handleAndroidReleaseDownload(
    new Request(`https://life-space.uk${ANDROID_RELEASE_APK_PATH}`),
    {},
  );
  assert.equal(missingBinding.status, 503);

  const missingObject = await handleAndroidReleaseDownload(
    new Request(`https://life-space.uk${ANDROID_RELEASE_APK_PATH}`),
    { R2_MEDIA_CANARY: { get: async () => null } },
  );
  assert.equal(missingObject.status, 503);

  const wrongSize = await handleAndroidReleaseDownload(
    new Request(`https://life-space.uk${ANDROID_RELEASE_APK_PATH}`),
    { R2_MEDIA_CANARY: createR2Bucket({ apk: Buffer.alloc(11) }) },
  );
  assert.equal(wrongSize.status, 503);

  const unsafeManifest = await handleAndroidReleaseDownload(
    new Request(`https://life-space.uk${ANDROID_RELEASE_APK_PATH}`),
    {
      R2_MEDIA_CANARY: createR2Bucket({
        manifest: {
          ...releaseManifest,
          object_key: "../../private.apk",
        },
      }),
    },
  );
  assert.equal(unsafeManifest.status, 503);
});

test("release metadata is computed from the exact signed APK bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifespace-apk-"));
  try {
    const apkPath = path.join(directory, "app-release.apk");
    const outputPath = path.join(directory, "release.json");
    const githubOutputPath = path.join(directory, "github-output.txt");
    const bytes = Buffer.from("verified-signed-apk-test");
    fs.writeFileSync(apkPath, bytes);

    const manifest = createAndroidReleaseManifest({
      apkPath,
      versionName: "1.0.4-rc3",
      versionCode: "7",
      publishedAt: "2026-09-06T08:30:00.000Z",
    });
    assert.equal(manifest.channel, "test");
    assert.equal(manifest.size_bytes, bytes.byteLength);
    assert.equal(
      manifest.sha256,
      crypto.createHash("sha256").update(bytes).digest("hex"),
    );
    assert.equal(
      manifest.object_key,
      "releases/android/youshi-cultivation-android-1.0.4-rc3.apk",
    );

    writeAndroidReleaseManifest({
      apkPath,
      outputPath,
      githubOutputPath,
      versionName: "1.0.4",
      versionCode: 8,
      publishedAt: "2026-09-06T08:30:00.000Z",
      minimumAndroid: "7.0",
    });
    const stable = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(stable.channel, "stable");
    assert.match(
      fs.readFileSync(githubOutputPath, "utf8"),
      /object_key=releases\/android\/youshi-cultivation-android-1\.0\.4\.apk/,
    );

    assert.throws(
      () =>
        createAndroidReleaseManifest({
          apkPath,
          versionName: "../unsafe",
          versionCode: 7,
        }),
      /unsupported characters/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("website exposes one download page before and after login", () => {
  const route = read("app/api/download/android/route.ts");
  const page = read("app/download/android/page.tsx");
  const home = read("app/page.tsx");
  const login = read("app/login/page.tsx");
  const profile = read("app/profile/page.tsx");
  const footer = read("components/SiteFooter.tsx");
  const experience = read("app/experience-cards/[id]/page.tsx");

  assert.match(route, /ANDROID_RELEASE_APK_PATH/);
  assert.match(route, /event_name: "apk_download"/);
  assert.match(route, /metadata: source \? \{ source \} : \{\}/);
  assert.match(route, /NextResponse\.redirect/);
  assert.match(page, /ANDROID_RELEASE_MANIFEST_PATH/);
  assert.match(page, /href="\/api\/download\/android\?source=download_page"/);
  assert.match(home, /href="\/download\/android"/);
  assert.match(login, /href="\/download\/android"/);
  assert.match(profile, /href: "\/download\/android"/);
  assert.match(profile, /href: "\/"/);
  assert.match(profile, /isNativeApp === true[\s\S]*\? \[\]/);
  assert.match(footer, /href="\/download\/android"/);
  assert.match(experience, /<AndroidAppDownloadPrompt \/>/);
});

test("main-branch signed builds publish and verify the R2 release", () => {
  const workflow = read(".github/workflows/android-apk.yml");
  const worker = read("cloudflare/worker-entry.mjs");

  assert.match(workflow, /Verify permanent release signature/);
  assert.match(workflow, /ccc03e33fed7ce95dd4d203aa3451a08cdc175874e4a6ae159b81c367164635d/);
  assert.match(workflow, /write-android-release-manifest\.mjs/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /wrangler r2 object put/);
  assert.match(workflow, /life-space-media-canary\/releases\/android\/release\.json/);
  assert.match(workflow, /wrangler r2 object get/);
  assert.match(workflow, /cmp android\/app\/build\/outputs\/apk\/release\/app-release\.apk/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(worker, /handleAndroidReleaseDownload/);
  assert.match(worker, /isAndroidReleaseDownloadPath/);
});
