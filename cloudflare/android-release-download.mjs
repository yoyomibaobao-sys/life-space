export const ANDROID_RELEASE_APK_PATH = "/downloads/android/latest.apk";
export const ANDROID_RELEASE_MANIFEST_PATH =
  "/downloads/android/release.json";

const ANDROID_RELEASE_MANIFEST_KEY = "releases/android/release.json";

function jsonError(message, status) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function isSafeManifest(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.version_name === "string" &&
      Number.isSafeInteger(value.version_code) &&
      (value.channel === "test" || value.channel === "stable") &&
      typeof value.file_name === "string" &&
      /^[A-Za-z0-9._-]+\.apk$/.test(value.file_name) &&
      typeof value.object_key === "string" &&
      /^releases\/android\/[A-Za-z0-9._-]+\.apk$/.test(value.object_key) &&
      Number.isSafeInteger(value.size_bytes) &&
      value.size_bytes > 0 &&
      typeof value.sha256 === "string" &&
      /^[a-f0-9]{64}$/.test(value.sha256) &&
      typeof value.published_at === "string" &&
      typeof value.minimum_android === "string",
  );
}

async function loadManifest(bucket) {
  const object = await bucket.get(ANDROID_RELEASE_MANIFEST_KEY);
  if (!object) return null;

  try {
    const manifest = JSON.parse(await object.text());
    return isSafeManifest(manifest) ? manifest : null;
  } catch {
    return null;
  }
}

export function isAndroidReleaseDownloadPath(pathname) {
  return (
    pathname === ANDROID_RELEASE_APK_PATH ||
    pathname === ANDROID_RELEASE_MANIFEST_PATH
  );
}

export async function handleAndroidReleaseDownload(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const bucket = env?.R2_MEDIA_CANARY;
  if (!bucket) {
    return jsonError("Android download storage is unavailable.", 503);
  }

  const pathname = new URL(request.url).pathname;
  if (pathname === ANDROID_RELEASE_MANIFEST_PATH) {
    const object = await bucket.get(ANDROID_RELEASE_MANIFEST_KEY);
    if (!object) return jsonError("Android release is not published.", 404);

    const headers = new Headers();
    object.writeHttpMetadata?.(headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Content-Length", String(object.size));
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("X-Content-Type-Options", "nosniff");
    if (object.httpEtag) headers.set("ETag", object.httpEtag);

    return new Response(request.method === "HEAD" ? null : object.body, {
      status: 200,
      headers,
    });
  }

  if (pathname !== ANDROID_RELEASE_APK_PATH) {
    return jsonError("Android release was not found.", 404);
  }

  const manifest = await loadManifest(bucket);
  if (!manifest) {
    return jsonError("Android release metadata is unavailable.", 503);
  }

  const object = await bucket.get(manifest.object_key);
  if (!object) return jsonError("Android release is not published.", 404);
  if (object.size !== manifest.size_bytes) {
    return jsonError("Android release validation failed.", 503);
  }

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("Cache-Control", "no-store");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${manifest.file_name}"`,
  );
  headers.set("Content-Length", String(object.size));
  headers.set("Content-Type", "application/vnd.android.package-archive");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Android-Version", manifest.version_name);
  headers.set("X-Checksum-SHA256", manifest.sha256);
  if (object.httpEtag) headers.set("ETag", object.httpEtag);

  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers,
  });
}
