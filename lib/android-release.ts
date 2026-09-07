export const ANDROID_RELEASE_MANIFEST_PATH =
  "/downloads/android/release.json";
export const ANDROID_RELEASE_APK_PATH = "/downloads/android/latest.apk";
export const ANDROID_RELEASE_APK_URL =
  `https://life-space.uk${ANDROID_RELEASE_APK_PATH}`;

export type AndroidReleaseManifest = {
  version_name: string;
  version_code: number;
  channel: "test" | "stable";
  file_name: string;
  object_key: string;
  size_bytes: number;
  sha256: string;
  published_at: string;
  minimum_android: string;
};

export const ANDROID_RELEASE_FALLBACK: AndroidReleaseManifest = {
  version_name: "1.0.4-rc3",
  version_code: 7,
  channel: "test",
  file_name: "youshi-cultivation-android-1.0.4-rc3.apk",
  object_key: "releases/android/youshi-cultivation-android-1.0.4-rc3.apk",
  size_bytes: 3_124_710,
  sha256: "1284493bebbaf7eb4f62a0a7958697fbb2eca66bd7d6a5ca631d5e49d653dc3f",
  published_at: "2026-09-06T00:00:00.000Z",
  minimum_android: "7.0",
};

export function isAndroidReleaseManifest(
  value: unknown,
): value is AndroidReleaseManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<AndroidReleaseManifest>;

  return Boolean(
    typeof manifest.version_name === "string" &&
      manifest.version_name.length > 0 &&
      Number.isSafeInteger(manifest.version_code) &&
      Number(manifest.version_code) > 0 &&
      (manifest.channel === "test" || manifest.channel === "stable") &&
      typeof manifest.file_name === "string" &&
      /^[A-Za-z0-9._-]+\.apk$/.test(manifest.file_name) &&
      typeof manifest.object_key === "string" &&
      /^releases\/android\/[A-Za-z0-9._-]+\.apk$/.test(manifest.object_key) &&
      Number.isSafeInteger(manifest.size_bytes) &&
      Number(manifest.size_bytes) > 0 &&
      typeof manifest.sha256 === "string" &&
      /^[a-f0-9]{64}$/.test(manifest.sha256) &&
      typeof manifest.published_at === "string" &&
      !Number.isNaN(Date.parse(manifest.published_at)) &&
      typeof manifest.minimum_android === "string" &&
      manifest.minimum_android.length > 0,
  );
}
