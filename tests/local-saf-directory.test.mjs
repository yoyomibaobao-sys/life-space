import assert from "node:assert/strict";
import { build } from "esbuild";
import test from "node:test";

const fixture = { files: new Map(), confirmations: 0, discards: 0, selections: 0 };
const storage = {
  async list(path) { const prefix = path ? `${path}/` : "";
    return [...new Set([...fixture.files.keys()].filter((name) => name.startsWith(prefix))
      .map((name) => name.slice(prefix.length).split("/")[0]))]; },
  async read(path) { return fixture.files.get(path) ?? null; },
  async create(path, bytes) { fixture.files.set(path, bytes); },
  async checkpoint(path, bytes) { fixture.files.set(path, bytes); },
};
globalThis.__safCandidate = { storage, fixture };
const output = await build({ entryPoints: ["lib/local-saf-directory.ts"], bundle: true,
  write: false, platform: "node", format: "esm", plugins: [{
    name: "candidate-saf-adapter", setup(ctx) {
      ctx.onResolve({ filter: /^@\/lib\/local-saf-native$/ }, () => ({ path: "candidate", namespace: "candidate" }));
      ctx.onLoad({ filter: /.*/, namespace: "candidate" }, () => ({ loader: "js", contents: `
        export async function chooseLocalSafDirectory() { globalThis.__safCandidate.fixture.selections++; }
        export async function confirmLocalSafDirectory() { globalThis.__safCandidate.fixture.confirmations++; }
        export async function discardLocalSafDirectory() { globalThis.__safCandidate.fixture.discards++; }
        export function createNativeSafStorage() { return globalThis.__safCandidate.storage; }
      ` }));
    },
  }] });
const directory = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
const reset = () => { fixture.files.clear(); fixture.confirmations = 0; fixture.discards = 0; fixture.selections = 0; };
test.beforeEach(reset);

test("empty directory gets one identity and committed empty revision before connection", async () => {
  const first = await directory.chooseAndValidateSafDirectory();
  assert.equal(first.kind, "new");
  assert.equal(fixture.confirmations, 1);
  assert.equal([...fixture.files.keys()].filter((path) => path.startsWith("commits/")).length, 1);
  const again = await directory.chooseAndValidateSafDirectory();
  assert.equal(again.kind, "existing");
  assert.equal(again.localSpaceId, first.localSpaceId);
});
test("unknown nonempty folder is refused without initialization or connection", async () => {
  fixture.files.set("other.txt", Uint8Array.of(1));
  await assert.rejects(directory.chooseAndValidateSafDirectory(), /Nonempty unknown/);
  assert.equal(fixture.confirmations, 0);
  assert.equal(fixture.discards, 1);
  assert.equal(fixture.files.has("identity.json"), false);
});
test("incomplete identity without a commit is refused, not silently reset", async () => {
  fixture.files.set("identity.json", new TextEncoder().encode(JSON.stringify({
    format: "LifeSpaceSAF", schemaVersion: 1,
    localSpaceId: crypto.randomUUID(), createdAt: new Date().toISOString() })));
  await assert.rejects(directory.chooseAndValidateSafDirectory(), /no complete commit/);
  assert.equal(fixture.confirmations, 0);
  assert.equal(fixture.files.size, 1);
});
test("damaged checkpoint reconnects through marker without changing original files", async () => {
  const first = await directory.chooseAndValidateSafDirectory();
  fixture.files.set("manifest.json", Uint8Array.from([12, 22]));
  const count = fixture.files.size;
  const second = await directory.chooseAndValidateSafDirectory();
  assert.equal(second.localSpaceId, first.localSpaceId);
  assert.equal(fixture.files.size, count);
});
test("identity and manifest mismatch never confirms a candidate directory", async () => {
  await directory.chooseAndValidateSafDirectory();
  fixture.confirmations = 0;
  const manifest = JSON.parse(new TextDecoder().decode(fixture.files.get("manifest.json")));
  const mismatched = new TextEncoder().encode(JSON.stringify({
    ...manifest, localSpaceId: crypto.randomUUID(),
  }));
  fixture.files.set("manifest.json", mismatched);
  await assert.rejects(directory.chooseAndValidateSafDirectory(), /localSpaceId mismatch/);
  assert.equal(fixture.confirmations, 0);
  assert.equal(fixture.discards, 1);
  assert.deepEqual(fixture.files.get("manifest.json"), mismatched);
});
