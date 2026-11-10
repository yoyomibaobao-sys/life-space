import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the actual TSX controller with isolated hook/API boundaries. This
// tests the C architecture adaptation; it is not browser, RLS, or React DOM E2E.
const source = fs.readFileSync(path.join(import.meta.dirname, "../components/market/MarketDetailController.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const own = () => ({ currentUserId: "owner-a", item: { id: "post-a", user_id: "owner-a", status: "ended", published_at: "old-publish", updated_at: "old-edit" } });
const tick = () => new Promise((resolve) => setImmediate(resolve));

function harness({ writeError = null, readError = null, readData = null, readPromise = null } = {}) {
  const states = [own(), false, false], calls = [], alerts = [], errors = [];
  let index = 0;
  const query = {
    update(value) { calls.push(["update", value]); return this; },
    select(value) { calls.push(["select", value]); return this; },
    eq(key, value) { calls.push(["eq", key, value]); return this; },
    async single() { return { data: { id: "post-a" }, error: writeError }; },
    maybeSingle() { calls.push(["readback"]); return readPromise || Promise.resolve({ data: readData, error: readError }); },
  };
  const module = { exports: {} };
  const mocks = {
    react: {
      useEffect() {},
      useState(initial) {
        const at = index++;
        if (states[at] === undefined) states[at] = initial;
        return [states[at], (next) => { states[at] = typeof next === "function" ? next(states[at]) : next; }];
      },
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    "@/components/market/MarketDetailView": { __esModule: true, default: () => null },
    "@/lib/market-detail-loader": { loadMarketPostDetail() { throw Error("unexpected load"); } },
    "@/lib/market-media-storage": { requestMarketPostDeletion() { throw Error("unexpected delete"); } },
    "@/lib/supabase": { supabase: { from: () => query, rpc: async () => ({ data: true, error: writeError }) } },
    "@/lib/i18n/useLanguage": { useLanguage: () => ({ t: { market: { post_limit_alert: "limit", status_update_failed: "failed" } } }) },
  };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require(name) { assert.ok(name in mocks, "unexpected dependency " + name); return mocks[name]; },
    window: { alert: (message) => alerts.push(message) }, console: { error: (...args) => errors.push(args) },
  });
  const view = module.exports.default({ id: "post-a", online: true, onBack() {}, onDeleted() {} });
  return { states, calls, alerts, errors, status: view.props.onStatus };
}

test("R33 re-publish reads server publication and edit timestamps with the original Owner filters", async () => {
  const h = harness({ readData: { status: "active", published_at: "server-publish", updated_at: "server-edit", ended_at: null } });
  h.status("active"); await tick();
  assert.equal(h.states[0].item.published_at, "server-publish");
  assert.equal(h.states[0].item.updated_at, "server-edit");
  assert.equal(h.states[0].item.status, "active");
  assert.equal(h.states[2], false);
  assert.ok(h.calls.some((x) => x[0] === "eq" && x[1] === "user_id" && x[2] === "owner-a"));
  assert.equal(h.calls.filter((x) => x[0] === "update").length, 1);
});

test("R33 quota refusal performs no readback and preserves previous publication timestamps", async () => {
  const h = harness({ writeError: { message: "market_post_limit_reached" } });
  h.status("active"); await tick();
  assert.equal(h.states[0].item.status, "ended");
  assert.equal(h.states[0].item.published_at, "old-publish");
  assert.equal(h.calls.some((x) => x[0] === "readback"), false);
  assert.equal(h.alerts[0], "limit");
});

test("R33 readback failure never fabricates a publication time or retries the write", async () => {
  const h = harness({ readError: { message: "temporary unavailable" } });
  h.status("active"); await tick();
  assert.equal(h.states[0].item.status, "active");
  assert.equal(h.states[0].item.published_at, "old-publish");
  assert.equal(h.calls.filter((x) => x[0] === "update").length, 1);
  assert.equal(h.errors.length, 1);
});

test("R33 delayed readback cannot overwrite another loaded post or Owner", async () => {
  let resolve;
  const h = harness({ readPromise: new Promise((r) => { resolve = r; }) });
  h.status("active"); await tick();
  h.states[0] = { currentUserId: "owner-b", item: { id: "post-b", user_id: "owner-b", status: "ended" } };
  resolve({ data: { status: "active", published_at: "old-result" }, error: null });
  await tick();
  assert.equal(h.states[0].item.id, "post-b");
  assert.equal(h.states[0].item.status, "ended");
  assert.equal(h.states[0].item.published_at, undefined);
});
