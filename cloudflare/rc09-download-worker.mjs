const APK_PATH = "/rc09-r3.apk";
const APK_KEY =
  "releases/android/test/youshi-cultivation-android-1.0.4-rc9-r3.apk";
const APK_NAME = "youshi-cultivation-android-1.0.4-rc9-r3.apk";

function errorResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.redirect(new URL(APK_PATH, url.origin).toString(), 302);
    }

    if (url.pathname !== APK_PATH) {
      return errorResponse("Not found.", 404);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const bucket = env?.R2_MEDIA_CANARY;
    if (!bucket) {
      return errorResponse("Download storage unavailable.", 503);
    }

    const object = await bucket.get(APK_KEY);
    if (!object) {
      return errorResponse("Test APK is not ready yet.", 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata?.(headers);
    headers.set("Cache-Control", "no-store");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${APK_NAME}"`,
    );
    headers.set("Content-Length", String(object.size));
    headers.set("Content-Type", "application/vnd.android.package-archive");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Android-Version", "1.0.4-rc9-r3");
    if (object.httpEtag) headers.set("ETag", object.httpEtag);

    return new Response(request.method === "HEAD" ? null : object.body, {
      status: 200,
      headers,
    });
  },
};
