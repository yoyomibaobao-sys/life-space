import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/api/trash/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const owner = "f99fd44d-820f-41f2-ad4e-85feb7c990a6";
const row = { trash_entry_id: "entry-fixture", target_type: "record", target_id: "record-fixture", deleted_at: "2026-10-29T08:28:59Z", status: "active", display_title: "synthetic record", parent_title: "synthetic project", child_record_count: 1, child_media_count: 1, can_retry: false };

function load({ signedIn = true, rows = [row], rpcError = null, adminThrows = false, queryError = false } = {}) {
  const calls = { rpc: 0, admin: 0, filters: [], warnings: [] };
  const admin = { from(table) {
    const query = { select() { return query; }, eq(key, value) { calls.filters.push({ table, key, value }); return query; }, in() { return query; }, order() { return query; }, then(resolve, reject) {
      const data = table === "trash_entries" ? [{ id: row.trash_entry_id, restore_snapshot: null }] : [{ id: "image-fixture", trash_entry_id: row.trash_entry_id, url: "https://qa.invalid/source.jpg" }];
      return Promise.resolve({ data, error: queryError ? { message: "preview unavailable" } : null }).then(resolve, reject);
    } };
    return query;
  } };
  const auth = signedIn ? { userId: owner, supabase: { async rpc(name) { calls.rpc++; assert.equal(name, "list_my_trash_entries"); return { data: rows, error: rpcError }; } } } : null;
  const modules = {
    "@/lib/server/authenticated-request": { getAuthenticatedRequestClient: async () => auth },
    "@/lib/supabaseAdmin": { getSupabaseAdmin() { calls.admin++; if (adminThrows) throw new Error("synthetic-config-error"); return admin; } },
    "@/lib/media-urls": { resolveMediaDisplayPairs: async () => [{ display_thumb_url: "https://qa.invalid/preview.jpg" }] },
  };
  const module = { exports: {} };
  new Function("require", "exports", "module", "Response", "console", compiled)((name) => { assert.ok(modules[name], name); return modules[name]; }, module.exports, module, Response, { warn: (...args) => calls.warnings.push(args), error() {} });
  return { GET: module.exports.GET, calls };
}
const request = () => new Request("https://qa.invalid/api/trash");

test("trash listing rejects unauthenticated requests before RPC or admin lookup", async () => {
  const { GET, calls } = load({ signedIn: false });
  const response = await GET(request());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.equal(calls.rpc, 0); assert.equal(calls.admin, 0);
});
test("trash listing RPC failure remains an error and never returns a success list", async () => {
  const { GET, calls } = load({ rpcError: { message: "synthetic RPC failure" } });
  const response = await GET(request());
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "trash_list_failed" });
  assert.equal(calls.admin, 0);
});
test("an empty authorized trash list does not require preview admin configuration", async () => {
  const { GET, calls } = load({ rows: [], adminThrows: true });
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, items: [] });
  assert.equal(calls.admin, 0);
});
test("missing optional preview configuration preserves the real authorized list without leaking the exception", async () => {
  const { GET, calls } = load({ adminThrows: true });
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.equal(body.ok, true); assert.equal(body.items.length, 1);
  assert.equal(body.items[0].id, row.target_id);
  assert.equal(body.items[0].trashEntryId, row.trash_entry_id);
  assert.equal(body.items[0].previewUrl, null);
  assert.equal(body.items[0].title, row.display_title);
  assert.ok(!JSON.stringify(body).includes("synthetic-config-error"));
  assert.equal(calls.rpc, 1); assert.equal(calls.admin, 1);
  assert.equal(calls.warnings[0][1].errorCode, "preview_admin_unavailable");
});
test("configured previews still work and both privileged queries remain scoped to the authenticated owner", async () => {
  const { GET, calls } = load();
  const response = await GET(request());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.items[0].previewUrl, "https://qa.invalid/preview.jpg");
  assert.ok(calls.filters.some(x => x.table === "trash_entries" && x.key === "owner_user_id" && x.value === owner));
  assert.ok(calls.filters.some(x => x.table === "media" && x.key === "user_id" && x.value === owner));
});
test("existing preview query failure fallback remains a usable authorized list", async () => {
  const { GET } = load({ queryError: true });
  const response = await GET(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items[0].id, row.target_id);
  assert.equal(body.items[0].previewUrl, null);
});
