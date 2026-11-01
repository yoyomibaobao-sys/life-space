import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const raw = fs.readFileSync(new URL("../components/PendingCloudSyncPrompt.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("PendingCloudSyncPrompt.tsx", raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let scanExpression;
let uploadFunction;
function find(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "scan")
    scanExpression = node.initializer.getText(parsed);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "upload")
    uploadFunction = node.getText(parsed);
  ts.forEachChild(node, find);
}
find(parsed);
assert.ok(scanExpression && uploadFunction);
const js = (s) => ts.transpileModule(s, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

test("F02: initial mount, reconnect and auth scan only prepare and list pending; no cloud upload", async () => {
  const calls = [];
  const owner = { userId: "account-a", email: "a@example.test" };
  const mockSupabase = { auth: { getSession: async () => {
    calls.push("session");
    return { data: { session: { user: { id: owner.userId, email: owner.email } } } };
  } } };
  const source = js("const scan = " + scanExpression + ";")
    .replace('import("@/lib/supabase")', "fakeImport()");
  const factory = new Function("useCallback", "scanningRef", "navigator", "fakeImport",
    "setOwnerContext", "setSummary", "setError", "setProgress",
    "preparePendingCloudSyncQueue", "listPendingCloudSyncSummaries", source + "\nreturn scan;");
  const scanningRef = { current: false };
  const scan = factory((f) => f, scanningRef, { onLine: true },
    async () => ({ supabase: mockSupabase }),
    () => calls.push("owner"), () => calls.push("summary"),
    () => calls.push("error"), () => calls.push("progress"),
    async (ctx) => { assert.equal(ctx.userId, owner.userId); calls.push("prepare"); },
    async (ctx) => { assert.equal(ctx.userId, owner.userId); calls.push("list"); return []; });
  await scan(); await scan(); await scan();
  assert.equal(calls.filter((x) => x === "prepare").length, 3);
  assert.equal(calls.filter((x) => x === "list").length, 3);
  assert.equal(calls.includes("upload"), false);
  assert.equal(scanningRef.current, false);
});

test("F02: explicitly pressing Upload still invokes the existing executor for the original owner", async () => {
  let count = 0;
  const owner = { userId: "account-a" };
  const source = js(uploadFunction).replace('import("@/lib/pending-cloud-sync")',
    "fakeSyncImport()");
  const upload = new Function("summary", "ownerContext", "running", "navigator",
    "setRunning", "setError", "setProgress", "fakeSyncImport", "showToast",
    "copy", "setSummary", "window", "listPendingCloudSyncSummaries",
    source + "\nreturn upload;")(
      { local_archive_id: "local-a" }, owner, false, { onLine: true },
      () => {}, () => {}, () => {},
      async () => ({ syncPendingCloudArchive: async ({ ownerContext, localArchiveId }) => {
        assert.equal(ownerContext.userId, owner.userId);
        assert.equal(localArchiveId, "local-a");
        count++;
        return { success: true };
      } }), () => {}, { pending_sync_success: "success" },
      () => {}, { setTimeout() {} }, async () => []);
  await upload();
  assert.equal(count, 1);
});

test("P0: an old upload snapshot cannot claim a canceled, replaced or finished operation", () => {
  const syncText = fs.readFileSync(new URL("../lib/pending-cloud-sync.ts", import.meta.url), "utf8");
  const source = ts.createSourceFile("sync.ts", syncText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let functionText;
  function findClaim(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "assertUploadClaim")
      functionText = node.getText(source);
    ts.forEachChild(node, findClaim);
  }
  findClaim(source);
  assert.ok(functionText);
  const check = new Function(js(functionText) + "\nreturn assertUploadClaim;")();
  assert.doesNotThrow(() => check({ sync: { client_operation_id: "op-1", status: "uploading" } }, "op-1"));
  assert.throws(() => check({ sync: { client_operation_id: "op-2", status: "uploading" } }, "op-1"));
  assert.throws(() => check({ sync: { client_operation_id: null, status: "synced" } }, "op-1"));
  assert.throws(() => check(null, "op-1"));
});
