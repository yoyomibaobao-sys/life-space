import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transformSync } from "esbuild";

const helperSource = readFileSync(
  new URL("../lib/supabase-session-cookie.ts", import.meta.url),
  "utf8",
);
const helperCode = transformSync(helperSource, { loader: "ts", format: "esm" }).code;
const { createSupabaseSessionCookieSync, installSupabaseSessionCookieSync } = await import(
  "data:text/javascript;base64," + Buffer.from(helperCode).toString("base64")
);

const session = {
  access_token: "access-token-for-cookie-sync-test-0001",
  refresh_token: "refresh-token-for-cookie-sync-test-0001",
};

test("desktop session is mirrored by a same-origin no-store POST", async () => {
  const calls = [];
  const sync = createSupabaseSessionCookieSync(async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  });

  assert.equal(await sync.sync(session), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/auth/session");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), session);
});

test("logout clears the server cookie copy with DELETE", async () => {
  const calls = [];
  const sync = createSupabaseSessionCookieSync(async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  });

  assert.equal(await sync.clear(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/auth/session");
  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.body, undefined);
});

test("only the latest queued auth state is written", async () => {
  const calls = [];
  const sync = createSupabaseSessionCookieSync(async (url, init) => {
    calls.push(JSON.parse(init.body));
    return { ok: true };
  });

  const older = sync.sync(session);
  const newerSession = {
    access_token: "access-token-for-cookie-sync-test-0002",
    refresh_token: "refresh-token-for-cookie-sync-test-0002",
  };
  const newer = sync.sync(newerSession);

  assert.equal(await older, false);
  assert.equal(await newer, true);
  assert.deepEqual(calls, [newerSession]);
});

test("incomplete sessions and network failures fail closed without throwing", async () => {
  let calls = 0;
  const sync = createSupabaseSessionCookieSync(async () => {
    calls++;
    throw new Error("offline");
  });

  assert.equal(await sync.sync({ access_token: session.access_token }), false);
  assert.equal(calls, 0);
  assert.equal(await sync.sync(session), false);
  assert.equal(calls, 1);
});

test("session bridge verifies tokens, restricts origin, sets SSR cookies and clears them on logout", () => {
  const route = readFileSync(
    new URL("../app/api/auth/session/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotThrow(() => transformSync(route, { loader: "ts", format: "esm" }));
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /sec-fetch-site/);
  assert.match(route, /verifier\.auth\.getUser/);
  assert.match(route, /cookieClient\.auth\.setSession/);
  assert.match(route, /cookieClient\.auth\.getUser/);
  assert.match(route, /response\.cookies\.set/);
  assert.match(route, /httpOnly: true/);

  const gateway = readFileSync(
    new URL("../cloudflare/r2-media-user-gateway.mjs", import.meta.url),
    "utf8",
  );
  assert.match(gateway, /httpOnly: true/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /sb-\$\{projectRef\}-auth-token/);
});

test("SSR session bridge accepts Supabase 12-character refresh tokens", () => {
  const route = readFileSync(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");
  const match = route.match(/input\\.refresh_token\\.length\\s*<\\s*(\\d+)/);
  assert.ok(match, "Refresh token minimum length guard should exist");
  const minLength = Number(match[1]);
  assert.ok(minLength <= 12, "The 12-character GoTrue refresh token must not be rejected");
  assert.ok(minLength >= 1, "Malformed empty refresh tokens must still be rejected");
  assert.match(route, /input\\.refresh_token\\.length\\s*>\\s*8_192/);
  assert.match(route, /verifier\\.auth\\.getUser/);
  assert.match(route, /cookieClient\\.auth\\.setSession/);
});

test("persisted desktop session is mirrored even if INITIAL_SESSION is missed", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  const calls = [];
  let listener;
  const client = {
    auth: {
      onAuthStateChange(callback) {
        listener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async getSession() {
        return { data: { session } };
      },
    },
  };

  try {
    const cleanup = installSupabaseSessionCookieSync(client, {
      async sync(value) { calls.push({ action: "sync", value }); return true; },
      async clear() { calls.push({ action: "clear" }); return true; },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [{ action: "sync", value: session }]);
    cleanup();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("a later auth event takes precedence over a stale getSession result", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  const calls = [];
  let listener;
  let resolveSession;
  const client = {
    auth: {
      onAuthStateChange(callback) {
        listener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession() {
        return new Promise((resolve) => { resolveSession = resolve; });
      },
    },
  };

  try {
    const cleanup = installSupabaseSessionCookieSync(client, {
      async sync(value) { calls.push({ action: "sync", value }); return true; },
      async clear() { calls.push({ action: "clear" }); return true; },
    });
    listener("SIGNED_OUT", null);
    resolveSession({ data: { session } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [{ action: "clear" }]);
    cleanup();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("desktop sync is installed without changing Android protected auth storage", () => {
  const source = readFileSync(
    new URL("../lib/supabase.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /installSupabaseSessionCookieSync\(supabase\)/);
  assert.match(source, /typeof window !== "undefined" && !androidStartupStorage/);
  assert.match(source, /createAndroidSafeStartupStorage/);
});
