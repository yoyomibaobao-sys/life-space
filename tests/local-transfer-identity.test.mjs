import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../lib/local-transfer-identity.ts", import.meta.url))],
  bundle: true, platform: "node", format: "esm", write: false,
});
const { stableTransferRecordId, uniqueCloudArchiveTitle } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("same transfer record retries use one stable UUID, distinct records never share it", async () => {
  const target = "11111111-1111-4111-8111-111111111111";
  const first = await stableTransferRecordId(target, "local_record_a");
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(await stableTransferRecordId(target, "local_record_a"), first);
  assert.notEqual(await stableTransferRecordId(target, "local_record_b"), first);
  assert.notEqual(await stableTransferRecordId("22222222-2222-4222-8222-222222222222", "local_record_a"), first);
});

test("new upload only numbers a conflicting cloud title without changing the local title", () => {
  const existing = new Set(["番茄种植", "番茄种植（2）", "另一项目"]);
  assert.equal(uniqueCloudArchiveTitle("番茄种植", existing), "番茄种植（3）");
  assert.equal(uniqueCloudArchiveTitle("黄瓜", existing), "黄瓜");
  assert.equal(existing.has("番茄种植（3）"), false);
});
