import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function requireText(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`Missing ${name}.`);
  return normalized;
}

export function createAndroidReleaseManifest({
  apkPath,
  versionName,
  versionCode,
  publishedAt = new Date().toISOString(),
  minimumAndroid = "7.0",
}) {
  const normalizedPath = path.resolve(requireText(apkPath, "APK path"));
  const normalizedVersionName = requireText(versionName, "Android version name");
  if (!/^[0-9A-Za-z._-]{1,48}$/.test(normalizedVersionName)) {
    throw new Error("Android version name contains unsupported characters.");
  }

  const normalizedVersionCode = Number(versionCode);
  if (!Number.isSafeInteger(normalizedVersionCode) || normalizedVersionCode < 1) {
    throw new Error("Android version code must be a positive integer.");
  }

  const bytes = fs.readFileSync(normalizedPath);
  const fileName = `youshi-cultivation-android-${normalizedVersionName}.apk`;

  return {
    version_name: normalizedVersionName,
    version_code: normalizedVersionCode,
    channel: /(?:^|[-_.])(?:rc|beta|alpha)[0-9._-]*$/i.test(
      normalizedVersionName,
    )
      ? "test"
      : "stable",
    file_name: fileName,
    object_key: `releases/android/${fileName}`,
    size_bytes: bytes.byteLength,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    published_at: new Date(publishedAt).toISOString(),
    minimum_android: requireText(minimumAndroid, "minimum Android version"),
  };
}

export function writeAndroidReleaseManifest({
  outputPath,
  githubOutputPath,
  ...options
}) {
  const manifest = createAndroidReleaseManifest(options);
  const normalizedOutputPath = path.resolve(
    requireText(outputPath, "release manifest output path"),
  );
  fs.mkdirSync(path.dirname(normalizedOutputPath), { recursive: true });
  fs.writeFileSync(normalizedOutputPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (githubOutputPath) {
    fs.appendFileSync(
      githubOutputPath,
      `file_name=${manifest.file_name}\nobject_key=${manifest.object_key}\nsha256=${manifest.sha256}\nsize_bytes=${manifest.size_bytes}\n`,
    );
  }

  return manifest;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    const manifest = writeAndroidReleaseManifest({
      apkPath: process.env.ANDROID_RELEASE_APK_PATH,
      outputPath: process.env.ANDROID_RELEASE_MANIFEST_PATH,
      versionName: process.env.ANDROID_VERSION_NAME,
      versionCode: process.env.ANDROID_VERSION_CODE,
      publishedAt: process.env.ANDROID_RELEASE_PUBLISHED_AT,
      minimumAndroid: process.env.ANDROID_MINIMUM_VERSION || "7.0",
      githubOutputPath: process.env.GITHUB_OUTPUT,
    });
    console.log(
      `Prepared Android ${manifest.channel} release ${manifest.version_name} (${manifest.size_bytes} bytes).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
