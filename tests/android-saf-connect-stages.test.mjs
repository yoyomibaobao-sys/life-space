import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual UI callback without mounting the app or opening native storage.
const source = await readFile(new URL("../mobile-offline-src/main.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("main.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "connectSaf") {
    declarations.push(node);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(declarations.length, 1, "expected one real connectSaf callback");
const initializer = declarations[0].initializer;
assert.ok(ts.isCallExpression(initializer));
assert.equal(initializer.expression.getText(tree), "useCallback");
assert.ok(ts.isArrowFunction(initializer.arguments[0]));
const callbackScript = ts.transpileModule(
  "globalThis.connectSafUnderTest = " + initializer.arguments[0].getText(tree) + ";",
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ connect, migrate, refresh, migrationWarning = true } = {}) {
  const state = {
    needed: true, missing: true, error: "previous error", migrationWarning, running: false,
  };
  const copy = {
    safRegrantCanceled: "authorization cancelled",
    safRegrantWrong: "original folder required",
    safRegrantFailed: "SAF verification failed",
    readFailed: "local data read failed",
  };
  const calls = [], toasts = [], warnings = [], forbidden = [];
  const started = { connect: deferred(), migrate: deferred(), refresh: deferred() };
  const running = { current: false }, attempted = { current: false };
  const storage = Object.fromEntries(["setItem", "removeItem", "clear"].map((method) => [
    method, () => { forbidden.push(method); throw new Error("Storage mutation is forbidden in this test"); },
  ]));
  const context = vm.createContext({
    Error, copy, safConnectRunning: running, safConnectAttempted: attempted,
    window: { localStorage: storage }, localStorage: storage,
    console: { warn: (...args) => warnings.push(args) },
    setSafRegrantRunning: (value) => { state.running = value; },
    setSafRegrantError: (value) => { state.error = value; },
    setSafRegrantNeeded: (value) => { state.needed = value; },
    setSafConnectionMissing: (value) => { state.missing = value; },
    setMigrationWarning: (value) => { state.migrationWarning = value; },
    showToast: (message) => toasts.push(message),
    connectLocalSafDirectory: async () => {
      calls.push("connect"); started.connect.resolve();
      return connect ? connect() : { localSpaceId: "verified-space", revision: "verified-revision" };
    },
    migrateLegacyLocalOrigin: async () => {
      calls.push("migrate"); started.migrate.resolve();
      return migrate ? migrate() : { status: "migrated", archiveCount: 0, recordCount: 0, imageCount: 0 };
    },
    loadList: async () => {
      calls.push("refresh"); started.refresh.resolve();
      return refresh?.();
    },
  });
  vm.runInContext(callbackScript, context, { timeout: 1000 });
  return { run: context.connectSafUnderTest, state, copy, calls, toasts, warnings, forbidden, started, running, attempted };
}

function assertReleased(h) {
  assert.equal(h.state.running, false);
  assert.equal(h.running.current, false);
  assert.equal(h.attempted.current, true);
  assert.deepEqual(h.forbidden, [], "the UI callback must not alter migration markers or data");
}

function assertVerified(h) {
  assert.equal(h.state.needed, false);
  assert.equal(h.state.missing, false);
  assert.equal(h.state.error, "");
}

for (const [name, message, expected] of [
  ["invalid committed data", "No valid SAF commit; data retained.", "safRegrantFailed"],
  ["expired directory permission", "Reconnect the LifeSpace data directory.", "safRegrantFailed"],
  ["cancelled authorization", "No LifeSpace data directory was selected.", "safRegrantCanceled"],
  ["a different selected directory", "Select the original LifeSpace data folder.", "safRegrantWrong"],
]) {
  test("SAF rejects " + name + " without starting migration or refresh", async () => {
    const h = harness({ connect: async () => { throw new Error(message); } });
    await h.run();
    assert.deepEqual(h.calls, ["connect"]);
    assert.equal(h.state.needed, true);
    assert.equal(h.state.missing, true);
    assert.equal(h.state.error, h.copy[expected]);
    assert.deepEqual(h.toasts, []);
    assertReleased(h);
  });
}

test("authorization warning remains during verification and concurrent clicks share one connection", async () => {
  const gate = deferred();
  const h = harness({ connect: () => gate.promise });
  const first = h.run();
  await h.started.connect.promise;
  try {
    await Promise.all([h.run(), h.run()]);
    assert.deepEqual(h.calls, ["connect"]);
    assert.equal(h.state.needed, true);
    assert.equal(h.state.missing, true);
    assert.equal(h.state.running, true);
  } finally {
    gate.resolve({ localSpaceId: "verified-space", revision: "verified-revision" });
    await first;
  }
  assertVerified(h);
  assert.deepEqual(h.calls, ["connect", "migrate", "refresh"]);
  assertReleased(h);
});

for (const [name, message] of [
  ["migration rejection", "private migration failure detail"],
  ["the 90-second migration timeout", "旧版本地数据迁移超时，请重新打开 App 后重试。"],
]) {
  test(name + " preserves verified SAF, shows only a migration warning and still refreshes", async () => {
    const h = harness({ migrationWarning: false, migrate: async () => { throw new Error(message); } });
    await h.run();
    assertVerified(h);
    assert.equal(h.state.migrationWarning, true);
    assert.deepEqual(h.calls, ["connect", "migrate", "refresh"]);
    assert.deepEqual(h.toasts, []);
    assert.equal(h.warnings.length, 1);
    assert.ok(h.warnings.every((args) =>
      args.length === 1 && typeof args[0] === "string" && !args[0].includes(message)));
    assertReleased(h);
  });
}

test("list refresh failure reports a read error without invalidating verified SAF", async () => {
  const h = harness({ refresh: async () => { throw new Error("private list read detail"); } });
  await h.run();
  assertVerified(h);
  assert.equal(h.state.migrationWarning, false);
  assert.deepEqual(h.toasts, [h.copy.readFailed]);
  assert.deepEqual(h.calls, ["connect", "migrate", "refresh"]);
  assertReleased(h);
});

test("all stages succeed in order and clear only their completed warnings", async () => {
  const h = harness();
  await h.run();
  assertVerified(h);
  assert.equal(h.state.migrationWarning, false);
  assert.deepEqual(h.calls, ["connect", "migrate", "refresh"]);
  assert.deepEqual(h.toasts, []);
  assert.deepEqual(h.warnings, []);
  assertReleased(h);
});

test("verified SAF is reflected before a pending migration ends and further clicks cannot reenter", async () => {
  const gate = deferred();
  const h = harness({ migrate: () => gate.promise });
  const first = h.run();
  await h.started.migrate.promise;
  try {
    assertVerified(h);
    assert.equal(h.state.running, true);
    await Promise.all([h.run(), h.run()]);
    assert.deepEqual(h.calls, ["connect", "migrate"]);
  } finally {
    gate.resolve({ status: "migrated", archiveCount: 0, recordCount: 0, imageCount: 0 });
    await first;
  }
  assert.deepEqual(h.calls, ["connect", "migrate", "refresh"]);
  assertReleased(h);
});

test("concurrent clicks cannot reconnect while the final list refresh is pending", async () => {
  const gate = deferred();
  const h = harness({ refresh: () => gate.promise });
  const first = h.run();
  await h.started.refresh.promise;
  try {
    assertVerified(h);
    assert.equal(h.state.running, true);
    await Promise.all([h.run(), h.run()]);
    assert.deepEqual(h.calls, ["connect", "migrate", "refresh"]);
  } finally {
    gate.resolve();
    await first;
  }
  assertReleased(h);
});

test("a failed connection releases the guard so an explicit safe retry can succeed", async () => {
  let attempt = 0;
  const h = harness({ connect: async () => {
    if (++attempt === 1) throw new Error("No LifeSpace data directory was selected.");
    return { localSpaceId: "verified-space", revision: "verified-revision" };
  } });
  await h.run();
  assert.equal(h.state.error, h.copy.safRegrantCanceled);
  assertReleased(h);
  await h.run();
  assertVerified(h);
  assert.deepEqual(h.calls, ["connect", "connect", "migrate", "refresh"]);
  assertReleased(h);
});

test("permission lost before verification resolves cannot clear the SAF guard", async () => {
  const gate = deferred();
  const h = harness({ connect: () => gate.promise });
  const first = h.run();
  await h.started.connect.promise;
  gate.reject(new Error("Reconnect the LifeSpace data directory."));
  await first;
  assert.equal(h.state.needed, true);
  assert.equal(h.state.missing, true);
  assert.equal(h.state.error, h.copy.safRegrantFailed);
  assert.deepEqual(h.calls, ["connect"]);
  assertReleased(h);
});

test("migration and list failures retain separate migration and read feedback", async () => {
  const h = harness({
    migrationWarning: false,
    migrate: async () => { throw new Error("migration rejected"); },
    refresh: async () => { throw new Error("list rejected"); },
  });
  await h.run();
  assertVerified(h);
  assert.equal(h.state.migrationWarning, true);
  assert.deepEqual(h.toasts, [h.copy.readFailed]);
  assert.deepEqual(h.calls, ["connect", "migrate", "refresh"]);
  assertReleased(h);
});
