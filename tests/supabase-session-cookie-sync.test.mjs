import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transformSync } from "esbuild";

const helperSource = readFileSync(
  new URL("../lib/supabase-session-cookie.ts", import.meta.url),
  "utf8",
);
const helperCode = transformSync(helperSource, { loader: "ts", format: "esm" }).code;
const { createSupabaseSessionCookieSync } = await import(
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
  assert.match(route, /export async function DELETE/);
  assert.match(route, /sb-\$\{projectRef\}-auth-token/);
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
