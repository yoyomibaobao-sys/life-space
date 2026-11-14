import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { fetchGuardedRecordImage } from "../lib/guarded-record-image.mjs";

test("only the exact same-origin record image route receives the active bearer", async () => {
  const body = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
  const fetch = mock.method(globalThis, "fetch", async () => new Response(body));
  const route = "/api/media/record-image?id=sample&variant=thumb";
  try {
    const controller = new AbortController();
    assert.equal(await fetchGuardedRecordImage("https://example.invalid" + route, "active-session"), null);
    assert.equal(await fetchGuardedRecordImage("//example.invalid" + route, "active-session"), null);
    assert.equal(await fetchGuardedRecordImage("/api/media/record-image-copy?id=sample", "active-session"), null);
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal((await fetchGuardedRecordImage(route, "active-session", controller.signal)).size, 3);
    const [url, init] = fetch.mock.calls[0].arguments;
    assert.equal(url, route);
    assert.equal(init.headers.Authorization, "Bearer active-session");
    assert.equal(init.cache, "no-store");
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.equal(init.signal, controller.signal);
    await fetchGuardedRecordImage(route);
    assert.deepEqual(fetch.mock.calls[1].arguments[1].headers, {});
    fetch.mock.mockImplementationOnce(async () => new Response("denied", { status: 404 }));
    assert.equal(await fetchGuardedRecordImage(route, "other-session"), null);
    fetch.mock.mockImplementationOnce(async () => Response.json({ error: "invalid_image" }));
    assert.equal(await fetchGuardedRecordImage(route, "active-session"), null);
  } finally {
    fetch.mock.restore();
  }
});
