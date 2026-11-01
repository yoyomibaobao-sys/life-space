import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/pending-cloud-sync.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("pending-cloud-sync.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let fnText = "";
function find(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "inspectUnknownPendingReceipt")
    fnText = node.getText(ast).replace(/^export /, "");
  ts.forEachChild(node, find);
}
find(ast);
assert.ok(fnText, "must use the actual production receipt checker");
const js = ts.transpileModule(fnText, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const owner = { userId: "owner-qa" };
const projectId = "11111111-1111-4111-8111-111111111111";
const recordId = "22222222-2222-4222-8222-222222222222";
const mediaId = "33333333-3333-4333-8333-333333333333";

async function run(type, opts = {}) {
  let reads = 0;
  let mutations = 0;
  const localRecord = { id: "local-record", sync: { client_operation_id: recordId,
    cloud_record_id: recordId }, images: [{ id: "local-media",
      sync: { client_operation_id: mediaId, cloud_record_id: recordId } }] };
  const detail = { archive: { id: "local-project", local_owner_user_id: owner.userId,
    sync: { client_operation_id: projectId } }, records: [localRecord] };
  const rows = {
    archives: { id: projectId, user_id: owner.userId },
    records: { id: recordId, archive_id: projectId, user_id: owner.userId },
    media: { id: mediaId, record_id: recordId, user_id: owner.userId,
      storage_path: "owner-qa/record-id/original.jpg" }
  };
  const mock = {
    auth: { getUser: async () => ({ data: { user: { id: opts.authUser || owner.userId } },
      error: null }) },
    from(table) {
      reads++;
      const q = { select() { return q; }, eq() { return q; },
        async maybeSingle() { return {
          data: opts.missing ? null : opts.wrongParent ?
            { ...rows[table], archive_id: "another-project", record_id: "another-record" }
            : rows[table],
          error: opts.error ? { message: "network failed" } : null,
        }; },
        insert() { mutations++; throw Error("must not write"); },
        update() { mutations++; throw Error("must not write"); },
        delete() { mutations++; throw Error("must not write"); }
      };
      return q;
    }
  };
  const env = {
    isAndroidOnline: () => opts.online !== false,
    supabase: mock,
    getLocalArchiveDetail: async () => detail,
    cleanText: value => typeof value === "string" ? value.trim() : null,
    isStableCloudOperationId: v => typeof v === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  };
  const fn = new Function(...Object.keys(env), js + "\nreturn inspectUnknownPendingReceipt;")(...Object.values(env));
  const result = await fn({ localArchiveId: "local-project", ownerContext: owner,
    type, localItemId: type === "image" ? "local-media" : type === "record" ? "local-record" : undefined });
  return { result, reads, mutations };
}

test("unknown project, record and media receipts can confirm matching stable ID and owner without deletion", async () => {
  for (const type of ["archive", "record", "image"]) {
    const x = await run(type);
    assert.deepEqual(x.result, { status: "confirmed", canDelete: false });
    assert.equal(x.reads, 1);
    assert.equal(x.mutations, 0);
  }
});
test("missing rows, query failure and offline state never establish safe deletion", async () => {
  for (const opts of [{ missing: true }, { error: true }, { online: false }]) {
    const x = await run("record", opts);
    assert.deepEqual(x.result, { status: "unconfirmed", canDelete: false });
    assert.equal(x.mutations, 0);
  }
});
test("wrong current account or mismatched remote parent rejects receipt and never mutates data", async () => {
  for (const opts of [{ authUser: "another-user" }, { wrongParent: true }]) {
    const x = await run("record", opts);
    assert.deepEqual(x.result, { status: "conflict", canDelete: false });
    assert.equal(x.mutations, 0);
  }
});
