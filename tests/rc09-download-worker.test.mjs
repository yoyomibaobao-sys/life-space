import assert from "node:assert/strict";
import test from "node:test";
import worker from "../cloudflare/rc09-download-worker.mjs";

function objectFrom(bytes) {
  const body = Buffer.from(bytes);
  return {
    size: body.byteLength,
    body: new Response(body).body,
    httpEtag: '"test-etag"',
    writeHttpMetadata(headers) {
      headers.set("Content-Type", "application/vnd.android.package-archive");
    },
  };
}

test("rc09 download Worker redirects root and serves only the isolated signed APK key", async () => {
  let requestedKey = null;
  const env = {
    R2_MEDIA_CANARY: {
      async get(key) {
        requestedKey = key;
        return objectFrom([1, 2, 3, 4]);
      },
    },
  };

  const redirect = await worker.fetch(new Request("https://download.invalid/"), env);
  assert.equal(redirect.status, 302);
  assert.equal(
    new URL(redirect.headers.get("location")).pathname,
    "/rc09-r1.apk",
  );

  const response = await worker.fetch(
    new Request("https://download.invalid/rc09-r1.apk"),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(
    requestedKey,
    "releases/android/test/youshi-cultivation-android-1.0.4-rc9-r1.apk",
  );
  assert.equal(response.headers.get("x-android-version"), "1.0.4-rc9-r1");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="youshi-cultivation-android-1.0.4-rc9-r1.apk"',
  );
  assert.equal((await response.arrayBuffer()).byteLength, 4);

  const missing = await worker.fetch(
    new Request("https://download.invalid/anything-else"),
    env,
  );
  assert.equal(missing.status, 404);
});
