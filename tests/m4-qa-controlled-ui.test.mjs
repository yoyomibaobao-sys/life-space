import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  handleM4QaControlledUi,
  M4_QA_PAGE,
  M4_QA_CLIENT,
} from "../cloudflare/m4-qa-controlled-page.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const QA_ORIGIN = "https://lifespace-site-media-qa-20261028.lifespace-assets-isolated-lab.workers.dev";
const OWNER = "f99fd44d-820f-41f2-ad4e-85feb7c990a6";
const VIEWER = "867387ba-eb8a-4233-860b-86531533fd56";
const MEDIA = "ed4d0534-f686-42ff-82a6-1ab10e510063";
const RECORD = "b5baa3e2-68c9-45a3-ab9f-8a98cd4ef526";
const FULL_PATH = OWNER + "/" + RECORD + "/0cebadc6-f936-43d1-af45-eb9f9e720c7c-PR95-Cloud-Image-QA-Synthetic-20261018.jpg";
const THUMB_PATH = OWNER + "/" + RECORD + "/thumbs/0cebadc6-f936-43d1-af45-eb9f9e720c7c-thumb-PR95-Cloud-Image-QA-Synthetic-20261018.jpg";
const enabled = { R2_BUSINESS_MEDIA_MODE: "isolated", M4_QA_CONTROL_UI_ENABLED: "true" };

const clientPath = path.join(ROOT, "cloudflare", "m4-qa-controlled-client.ts");
const clientSource = fs.readFileSync(clientPath, "utf8");
const pageSource = fs.readFileSync(path.join(ROOT, "cloudflare", "m4-qa-controlled-page.mjs"), "utf8");
const buildScriptSource = fs.readFileSync(path.join(ROOT, "cloudflare", "m4-qa-ui-build.mjs"), "utf8");
const baseWorkerSource = fs.readFileSync(path.join(ROOT, "cloudflare", "worker-entry.mjs"), "utf8");
const productionConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf8"));
const qaConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "wrangler.m4-qa.jsonc"), "utf8"));

const compiled = await build({
  entryPoints: [clientPath],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  target: "es2022",
  logLevel: "silent",
  plugins: [{
    name: "stub-existing-supabase-client",
    setup(build) {
      build.onResolve({ filter: /lib\/supabase(?:\.ts)?$/ }, () => ({ path: "qa-supabase", namespace: "fake" }));
      build.onLoad({ filter: /.*/, namespace: "fake" }, () => ({
        contents: "export const supabase = globalThis.__qaClient;",
        loader: "js",
      }));
    },
  }],
});
const clientApp = compiled.outputFiles[0].text;

function jpeg(length, seed) {
  const bytes = new Uint8Array(length);
  bytes.set([0xff, 0xd8, 0xff, seed & 0xff, (seed + 1) & 0xff], 0);
  bytes.set([0xff, 0xd9], length - 2);
  return bytes;
}
const FULL_BYTES = jpeg(14663, 17);
const THUMB_BYTES = jpeg(10997, 41);
const FULL_SHA = createHash("sha256").update(FULL_BYTES).digest("hex");
const THUMB_SHA = createHash("sha256").update(THUMB_BYTES).digest("hex");
const FULL_PATH_SHA = createHash("sha256").update(FULL_PATH).digest("hex");
const THUMB_PATH_SHA = createHash("sha256").update(THUMB_PATH).digest("hex");

function fixture(options = {}) {
  const owner = options.owner || OWNER;
  const loggedIn = options.loggedIn !== false;
  const events = [];
  const fetches = [];
  const downloads = [];
  let sessionCalls = 0;

  class Element {
    constructor() {
      this.disabled = true;
      this.textContent = "";
      this.listeners = {};
    }
    addEventListener(name, callback) {
      this.listeners[name] = callback;
    }
  }

  const nodes = Object.fromEntries([
    "m4-account-status", "m4-run-once", "m4-receipt", "m4-review",
  ].map((id) => [id, new Element()]));

  const auth = {
    async getSession() {
      sessionCalls++;
      events.push({ type: "getSession", call: sessionCalls });
      const token = options.sessionProvider ? options.sessionProvider(sessionCalls) : "sdk-test-token";
      return {
        data: {
          session: loggedIn ? { user: { id: owner }, access_token: token } : null,
        },
        error: null,
      };
    },
    async getUser(token) {
      events.push({ type: "getUser", token });
      return {
        data: { user: loggedIn ? { id: owner } : null },
        error: loggedIn ? null : { message: "invalid" },
      };
    },
  };

  const storage = {
    from(bucket) {
      assert.equal(bucket, "media");
      return {
        async download(objectPath) {
          events.push({ type: "download", path: objectPath });
          downloads.push(objectPath);
          let bytes = objectPath === FULL_PATH ? FULL_BYTES : THUMB_BYTES;
          let type = "image/jpeg";
          if (options.sourceOverride && options.sourceOverride.path === objectPath) {
            bytes = options.sourceOverride.bytes;
            type = options.sourceOverride.type;
          }
          return { data: new Blob([bytes], { type }), error: null };
        },
      };
    },
  };

  const context = {
    document: { getElementById(id) { return nodes[id]; } },
    window: {
      location: {
        href: QA_ORIGIN + M4_QA_PAGE,
        pathname: M4_QA_PAGE,
        search: "",
        hash: options.initialHash || "",
      },
      history: {
        replaceState(_state, _title, url) {
          const next = new URL(url, QA_ORIGIN);
          Object.assign(context.window.location, {
            href: next.href,
            pathname: next.pathname,
            search: next.search,
            hash: next.hash,
          });
        },
      },
    },
    __qaClient: { auth, storage },
    fetch: async (url, requestOptions) => {
      const body = JSON.parse(requestOptions.body);
      const event = { type: "fetch", url, options: requestOptions, body };
      events.push(event);
      fetches.push(event);
      if (options.unknownVariant === body.variant) throw new TypeError("simulated_network_failure");
      if (options.invalidJsonVariant === body.variant) {
        return new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "application/json", "CF-Ray": "abc123-KUL" },
        });
      }
      if (options.failVariant === body.variant) {
        return new Response(JSON.stringify({ error: "media_unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json; charset=utf-8", "CF-Ray": "abc123-KUL" },
        });
      }
      const bytes = body.variant === "full" ? FULL_BYTES : THUMB_BYTES;
      const sha256 = body.variant === "full" ? FULL_SHA : THUMB_SHA;
      return new Response(JSON.stringify({
        status: "copied_verified",
        bytes: bytes.byteLength,
        sha256,
        contentType: "image/jpeg",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", "CF-Ray": "abc123-KUL" },
      });
    },
    crypto: webcrypto,
    TextEncoder,
    Blob,
    Response,
    URL,
  };

  vm.runInNewContext(clientApp, context);
  return {
    nodes,
    events,
    fetches,
    downloads,
    click: () => nodes["m4-run-once"].listeners.click(),
    location: context.window.location,
  };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("QA UI is exact-origin, isolated-mode, explicit-flag and GET-only; production bundle remains separate", async () => {
  const pageUrl = QA_ORIGIN + M4_QA_PAGE;
  assert.equal(handleM4QaControlledUi(new Request(pageUrl), enabled)?.status, 200);
  assert.equal(handleM4QaControlledUi(new Request(pageUrl), { ...enabled, M4_QA_CONTROL_UI_ENABLED: "false" })?.status, 404);
  assert.equal(handleM4QaControlledUi(new Request(pageUrl), { ...enabled, R2_BUSINESS_MEDIA_MODE: "production" })?.status, 404);
  assert.equal(handleM4QaControlledUi(new Request("https://life-space.uk" + M4_QA_PAGE), enabled)?.status, 404);
  assert.equal(handleM4QaControlledUi(new Request("https://lifespace-site-media-qa-20261028.evil.example" + M4_QA_PAGE), enabled)?.status, 404);
  assert.equal(handleM4QaControlledUi(new Request(pageUrl, { method: "POST" }), enabled)?.status, 405);
  assert.equal(handleM4QaControlledUi(new Request(QA_ORIGIN + "/api/health"), enabled), null);

  const page = handleM4QaControlledUi(new Request(pageUrl), enabled);
  const html = await page.text();
  assert.match(html, /m4-run-once/);
  assert.match(html, /m4-controlled-mirror\.js/);
  assert.doesNotMatch(html, /access_token|refresh_token|localStorage|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(page.headers.get("cache-control"), /no-store/);
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);

  assert.equal(handleM4QaControlledUi(new Request(QA_ORIGIN + M4_QA_CLIENT), enabled), null,
    "the JS client is served from the separate QA-only static assets directory");

  assert.match(baseWorkerSource, /handleM4QaControlledUi\(request, env\)/);
  assert.doesNotMatch(baseWorkerSource, /m4-qa-controlled-client\.generated|m4-qa-controlled-client\.ts/);
  assert.doesNotMatch(pageSource, /QA_CLIENT_BUNDLE|m4-qa-controlled-client\.generated/);
  assert.equal(productionConfig.main, "./cloudflare/worker-entry.mjs");
  assert.equal(productionConfig.assets?.directory, "dist/client");
  assert.equal(productionConfig.vars?.M4_QA_CONTROL_UI_ENABLED, undefined);
  assert.equal(qaConfig.main, "./dist/server/index.js");
  assert.equal(qaConfig.no_bundle, true);
  assert.equal(qaConfig.assets?.directory, "./dist/qa-client");
  assert.equal(qaConfig.vars?.M4_QA_CONTROL_UI_ENABLED, "true");
  assert.equal(qaConfig.vars?.R2_BUSINESS_MEDIA_MODE, "isolated");
  assert.equal(qaConfig.name, "lifespace-site-media-qa-20261028");
  assert.match(buildScriptSource, /dist\/qa-client/);
  assert.match(buildScriptSource, /dist\/client/);
  assert.match(buildScriptSource, /productionClientAsset/);
  assert.doesNotMatch(buildScriptSource, /m4-qa-controlled-client\.generated\.mjs/);
});

test("base Worker dispatches the media mirror route before existing canary/app routes", () => {
  assert.match(baseWorkerSource, /R2_BUSINESS_MIRROR_PATH/);
  assert.match(baseWorkerSource, /handleR2BusinessUserMirrorRequest\(request, env\)/);
  assert.ok(baseWorkerSource.indexOf("if (qaUi) return qaUi;") <
    baseWorkerSource.indexOf("if (url.pathname === R2_BUSINESS_MIRROR_PATH)"));
  assert.ok(baseWorkerSource.indexOf("if (url.pathname === R2_BUSINESS_MIRROR_PATH)") <
    baseWorkerSource.indexOf("if (url.pathname === R2_CANARY_PATH)"));
});

test("each full/thumb POST uses mediaId, separate online Owner verification, exact same token, and source SHA/MIME", async () => {
  const fx = fixture();
  await flush();
  assert.equal(fx.nodes["m4-run-once"].disabled, false);
  assert.equal(fx.fetches.length, 0);

  await fx.click();
  assert.equal(fx.fetches.length, 2);
  assert.deepEqual(fx.fetches.map((call) => call.body), [
    { businessType: "media", businessId: MEDIA, variant: "full" },
    { businessType: "media", businessId: MEDIA, variant: "thumb" },
  ]);
  assert.deepEqual(fx.downloads, [FULL_PATH, THUMB_PATH, FULL_PATH, THUMB_PATH]);

  const firstPost = fx.events.findIndex((event) => event.type === "fetch");
  const thumbBefore = fx.events.findIndex((event) => event.type === "download" && event.path === THUMB_PATH);
  assert.ok(firstPost > thumbBefore, "both sourceBefore reads must finish before the first POST");

  for (const call of fx.fetches) {
    assert.equal(call.url, "/__internal/r2/business-media/mirror");
    assert.equal(call.options.mode, "same-origin");
    assert.equal(call.options.credentials, "omit");
    assert.equal(call.options.redirect, "error");
    assert.equal(call.options.cache, "no-store");
    assert.equal(call.options.headers.Authorization, "Bearer sdk-test-token");
  }
  for (const call of fx.fetches) {
    const index = fx.events.indexOf(call);
    assert.deepEqual(fx.events.slice(index - 3, index).map((event) => event.type),
      ["getSession", "getUser", "getSession"], "each POST must be preceded by a fresh online getUser(token) and same-session check");
    assert.equal(fx.events[index - 2].token, "sdk-test-token");
  }

  const receipt = JSON.parse(fx.nodes["m4-receipt"].textContent);
  assert.equal(receipt.status, "MIRROR_HTTP_RESPONSES_VERIFIED_SOURCE_STABLE_PENDING_INDEPENDENT_R2_READBACK");
  assert.equal(receipt.r2Readback, "NOT_PERFORMED_BY_CLIENT");
  assert.equal(receipt.sourceAfterStatus, "VERIFIED");
  assert.deepEqual(receipt.entries.map((entry) => entry.sourceBefore.sha256), [FULL_SHA, THUMB_SHA]);
  assert.deepEqual(receipt.entries.map((entry) => entry.sourceAfter.sha256), [FULL_SHA, THUMB_SHA]);
  assert.deepEqual(receipt.entries.map((entry) => entry.expectedR2KeyFingerprint), [FULL_PATH_SHA, THUMB_PATH_SHA]);
  assert.deepEqual(receipt.entries.map((entry) => entry.sourceBefore.pathFingerprint), [FULL_PATH_SHA, THUMB_PATH_SHA]);
  assert.deepEqual(receipt.entries.map((entry) => entry.sourceAfter.pathFingerprint), [FULL_PATH_SHA, THUMB_PATH_SHA]);
  assert.deepEqual(receipt.entries.map((entry) => entry.request.bytes), [14663, 10997]);
  assert.deepEqual(receipt.entries.map((entry) => entry.request.contentType), ["image/jpeg", "image/jpeg"]);
  assert.deepEqual(receipt.entries.map((entry) => entry.request.responseContentType), ["application/json", "application/json"]);
  assert.deepEqual(receipt.entries.map((entry) => entry.request.cfRay), ["abc123-KUL", "abc123-KUL"]);
  assert.ok(receipt.entries.every((entry) => entry.identity.ownerVerified === true && entry.request.verified));
  assert.equal(receipt.expectedOwnerRole, "QA_OWNER_A");
  assert.equal(receipt.recordId, undefined);
  assert.equal(receipt.expectedOwner, undefined);
  const redactedReceipt = JSON.stringify(receipt);
  for (const privateValue of [OWNER, RECORD, FULL_PATH, THUMB_PATH]) assert.equal(redactedReceipt.includes(privateValue), false);
  assert.match(JSON.stringify(receipt), /SDK_DEFAULT_UNVERIFIED/);
  assert.doesNotMatch(JSON.stringify(receipt), /sdk-test-token|Authorization|Cookie|refresh_token|SUPABASE_SERVICE_ROLE_KEY/);
  assert.equal(fx.nodes["m4-run-once"].disabled, true);
  assert.equal(fx.location.hash, "#m4-used");
});

test("refreshing a used one-shot URL does not grant another execution", async () => {
  const fx = fixture({ initialHash: "#m4-used" });
  await flush();
  assert.equal(fx.nodes["m4-run-once"].disabled, true);
  assert.equal(fx.fetches.length, 0);
  assert.equal(fx.events.some((event) => event.type === "getUser"), false);
});

test("full HTTP failure stops before thumb and performs source-only after reads", async () => {
  const fx = fixture({ failVariant: "full" });
  await flush();
  await fx.click();
  assert.equal(fx.fetches.length, 1);
  assert.equal(fx.fetches[0].body.variant, "full");
  const receipt = JSON.parse(fx.nodes["m4-receipt"].textContent);
  assert.equal(receipt.entries[0].request.status, "RESPONSE_RECEIVED");
  assert.equal(receipt.entries[0].request.http, 503);
  assert.equal(receipt.entries[0].request.errorCode, "media_unavailable");
  assert.equal(receipt.entries[1].request.status, "NOT_SENT");
  assert.equal(receipt.sourceAfterStatus, "VERIFIED");
  assert.match(receipt.status, /^STOP_FULL_FAILURE/);
  assert.equal(receipt.nextStep, "D_READ_ONLY_RECONCILIATION_REQUIRED");
  assert.doesNotMatch(JSON.stringify(receipt), /sdk-test-token/);
});

test("full UNKNOWN response halts immediately and skips all further POSTs and source-after probes", async () => {
  const fx = fixture({ unknownVariant: "full" });
  await flush();
  await fx.click();
  assert.equal(fx.fetches.length, 1);
  const receipt = JSON.parse(fx.nodes["m4-receipt"].textContent);
  assert.equal(receipt.entries[0].request.status, "UNKNOWN");
  assert.equal(receipt.entries[0].request.http, null);
  assert.equal(receipt.entries[1].request.status, "NOT_SENT");
  assert.equal(receipt.sourceAfterStatus, "SKIPPED_UNKNOWN");
  assert.equal(receipt.nextStep, "D_READ_ONLY_RECONCILIATION_REQUIRED_BEFORE_ANY_FURTHER_POST");
  assert.match(receipt.status, /^STOP_FULL_UNKNOWN/);
  assert.doesNotMatch(JSON.stringify(receipt), /simulated_network_failure|sdk-test-token/);
});

test("invalid JSON keeps known HTTP and CF-Ray but marks business result UNKNOWN", async () => {
  const fx = fixture({ invalidJsonVariant: "full" });
  await flush();
  await fx.click();
  assert.equal(fx.fetches.length, 1);
  const receipt = JSON.parse(fx.nodes["m4-receipt"].textContent);
  assert.equal(receipt.entries[0].request.status, "UNKNOWN");
  assert.equal(receipt.entries[0].request.http, 200);
  assert.equal(receipt.entries[0].request.cfRay, "abc123-KUL");
  assert.equal(receipt.entries[0].request.errorCode, "response_json_invalid");
  assert.equal(receipt.entries[1].request.status, "NOT_SENT");
  assert.equal(receipt.sourceAfterStatus, "SKIPPED_UNKNOWN");
});

test("bad thumb source baseline prevents every mirror POST; no full-to-thumb fallback", async () => {
  const fx = fixture({ sourceOverride: { path: THUMB_PATH, bytes: FULL_BYTES, type: "image/jpeg" } });
  await flush();
  await fx.click();
  assert.equal(fx.fetches.length, 0);
  const receipt = JSON.parse(fx.nodes["m4-receipt"].textContent);
  assert.equal(receipt.status, "STOP_SOURCE_BASELINE_NOT_VERIFIED_NO_POSTS");
  assert.equal(receipt.entries[0].request.status, "NOT_SENT");
  assert.equal(receipt.entries[1].sourceBefore.status, "NOT_VERIFIED");
  assert.equal(receipt.entries[1].sourceBefore.errorCode, "source_integrity_mismatch");
});

test("session change between full and thumb validation leaves thumb NOT_SENT", async () => {
  const fx = fixture({
    sessionProvider(call) {
      return call >= 12 ? "sdk-test-token-B" : "sdk-test-token-A";
    },
  });
  await flush();
  await fx.click();
  assert.equal(fx.fetches.length, 1);
  const receipt = JSON.parse(fx.nodes["m4-receipt"].textContent);
  assert.equal(receipt.entries[0].request.verified, true);
  assert.equal(receipt.entries[1].identity.status, "NOT_VERIFIED");
  assert.equal(receipt.entries[1].identity.reasonCode, "session_changed");
  assert.equal(receipt.entries[1].request.status, "NOT_SENT");
  assert.match(receipt.status, /^STOP_THUMB_NOT_SENT_SESSION_CHANGED/);
  assert.equal(receipt.sourceAfterStatus, "VERIFIED");
  assert.doesNotMatch(JSON.stringify(receipt), /sdk-test-token/);
});

test("wrong or absent Owner is blocked before source reads and POSTs", async () => {
  for (const options of [{ owner: VIEWER }, { loggedIn: false }]) {
    const fx = fixture(options);
    await flush();
    assert.equal(fx.nodes["m4-run-once"].disabled, true);
    await fx.click();
    assert.equal(fx.fetches.length, 0);
    assert.equal(fx.downloads.length, 0);
  }
});

test("source client uses online getUser(accessToken), exact mediaId and no credential storage or logging", () => {
  assert.match(clientSource, /supabase\.auth\.getUser\(accessToken\)/);
  assert.match(clientSource, /businessType: "media"/);
  assert.match(clientSource, /businessId: MEDIA/);
  assert.match(clientSource, /variant: item\.variant/);
  assert.match(clientSource, /getSession\(\)/);
  assert.doesNotMatch(clientSource, /\blocalStorage\.|\bsessionStorage\.|refresh_token|document\.cookie|console\.log\(/);
  assert.match(pageSource, /url\.origin !== QA_ORIGIN/);
});
