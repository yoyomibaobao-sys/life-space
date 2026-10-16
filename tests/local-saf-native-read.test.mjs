import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { build } from "esbuild";

globalThis.crypto ??= webcrypto;
const bytes = (value) => new TextEncoder().encode(value);
const base64 = (data) => Buffer.from(data).toString("base64");
const calls = [];
let readChunk;
let readFiles;
globalThis.__safReadBridge = {
  async readChunk(options) { calls.push(options); return readChunk(options); },
  async readFiles(options) { calls.push(options); return readFiles(options); },
};
const output = await build({ entryPoints: ["lib/local-saf-native.ts"], bundle: true,
  write: false, platform: "node", format: "esm", plugins: [{
    name: "native-saf-read-bridge", setup(ctx) {
      ctx.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: "capacitor", namespace: "mock" }));
      ctx.onResolve({ filter: /^@\/lib\/local-saf-core$/ }, () => ({ path: "core", namespace: "mock" }));
      ctx.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({ loader: "js", contents:
        args.path === "core" ? "export function invalidateSafVerifiedHead() {}" : `
          export const Capacitor = { isNativePlatform: () => true, getPlatform: () => "android" };
          export function registerPlugin() { return globalThis.__safReadBridge; }
        ` }));
    },
  }] });
const adapter = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
test.beforeEach(() => { calls.length = 0; });

test("one native read resolves a small present file without a metadata request", async () => {
  const content = bytes("committed marker");
  readChunk = async () => ({ exists: true, base64: base64(content), done: true });
  assert.deepEqual(await adapter.createNativeSafStorage().read("commits/marker.json"), content);
  assert.deepEqual(calls, [{ path: "commits/marker.json", offset: 0 }]);
});

test("missing optional file returns null, while an explicit read fails", async () => {
  readChunk = async () => ({ exists: false, base64: "", done: true });
  assert.equal(await adapter.createNativeSafStorage().read("manifest.json"), null);
  await assert.rejects(adapter.readLocalSafFile("manifest.json"), /Missing LifeSpace file/);
  assert.equal(calls.length, 2);
});

test("a later missing chunk and native read errors cannot become an empty file", async () => {
  readChunk = async ({ offset }) => offset === 0
    ? { exists: true, base64: base64(bytes("first")), done: false }
    : { exists: false, base64: "", done: true };
  await assert.rejects(adapter.createNativeSafStorage().read("snapshots/data"), /disappeared/);
  readChunk = async () => { throw Error("SAF permission lost"); };
  await assert.rejects(adapter.createNativeSafStorage().read("snapshots/data"), /permission lost/);
});

test("native chunks are assembled and the expected SHA-256 is checked", async () => {
  const content = bytes("two chunks");
  readChunk = async ({ offset }) => offset === 0
    ? { exists: true, base64: base64(content.subarray(0, 4)), done: false }
    : { exists: true, base64: base64(content.subarray(4)), done: true };
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", content)).toString("hex");
  assert.deepEqual(await adapter.readLocalSafFile("local/project.json", hash), content);
  assert.deepEqual(calls.map(({ offset }) => offset), [0, 4]);
  await assert.rejects(adapter.readLocalSafFile("local/project.json", "bad-hash"), /hash does not match/);
});

test("bounded batch maps reordered files by path and preserves missing files", async () => {
  const paths = ["commits/a.json", "snapshots/b.json", "local/projects/c/d.json"];
  readFiles = async () => ({ files: [
    { path: paths[2], exists: false, base64: "" },
    { path: paths[1], exists: true, base64: base64(bytes("snapshot")) },
    { path: paths[0], exists: true, base64: base64(bytes("commit")) },
  ] });
  const result = await adapter.createNativeSafStorage().readMany(paths);
  assert.deepEqual([...result.keys()], [paths[2], paths[1], paths[0]]);
  assert.deepEqual(result.get(paths[0]), bytes("commit"));
  assert.deepEqual(result.get(paths[1]), bytes("snapshot"));
  assert.equal(result.get(paths[2]), null);
  assert.deepEqual(calls, [{ paths }]);
});

test("batch rejects missing responses, duplicate paths and unmatched paths", async () => {
  const saf = adapter.createNativeSafStorage();
  await assert.rejects(saf.readMany(["x", "x"]), /Invalid SAF batch paths/);
  await assert.rejects(saf.readMany(Array.from({ length: 17 }, (_, n) => String(n))), /Invalid SAF batch paths/);
  assert.equal(calls.length, 0);
  readFiles = async () => ({ files: [{ path: "x", exists: true, base64: "" }] });
  await assert.rejects(saf.readMany(["x", "y"]), /Incomplete SAF batch response/);
  readFiles = async () => ({ files: [
    { path: "x", exists: true, base64: "" }, { path: "x", exists: true, base64: "" },
  ] });
  await assert.rejects(saf.readMany(["x", "y"]), /Invalid SAF batch response/);
  readFiles = async () => ({ files: [{ path: "other", exists: true, base64: "" }] });
  await assert.rejects(saf.readMany(["x"]), /Invalid SAF batch response/);
  readFiles = async () => ({ files: [{ path: "x", exists: false, base64: base64(bytes("hidden")) }] });
  await assert.rejects(saf.readMany(["x"]), /Invalid SAF missing file response/);
});

test("batch total byte limit and partial native failure never return success", async () => {
  const saf = adapter.createNativeSafStorage();
  readFiles = async () => ({ files: [{ path: "x", exists: true,
    base64: base64(new Uint8Array(512 * 1024 + 1)) }] });
  await assert.rejects(saf.readMany(["x"]), /batch byte limit exceeded/);
  readFiles = async () => { throw Error("SAF batch read failed after one file"); };
  await assert.rejects(saf.readMany(["x", "y"]), /failed after one file/);
});
