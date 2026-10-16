import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
import test from "node:test";

const defaultUri = "content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FLifeSpace";
const fixture = { files: new Map(), confirmations: 0, discards: 0, selections: 0, uri: defaultUri,
  savedUri: null, available: false, expectedId: null, canceled: false };
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
      ctx.onResolve({ filter: /^@\/lib\/local-saf-generation$/ }, () => ({ path: "generation", namespace: "candidate" }));
      ctx.onResolve({ filter: /^@\/lib\/local-saf-core$/ }, () => ({ path: path.resolve("lib/local-saf-core.ts") }));
      ctx.onLoad({ filter: /^candidate$/, namespace: "candidate" }, () => ({ loader: "js", contents: `
        import { invalidateSafVerifiedHead } from '@/lib/local-saf-core';
        export async function chooseLocalSafDirectory() { const f = globalThis.__safCandidate.fixture; f.selections++; if (f.canceled) throw Error('No LifeSpace data directory was selected.'); invalidateSafVerifiedHead(globalThis.__safCandidate.storage); return { uri: f.uri }; }
        export async function confirmLocalSafDirectory() { globalThis.__safCandidate.fixture.confirmations++; }
        export async function discardLocalSafDirectory() { globalThis.__safCandidate.fixture.discards++; }
        export async function getLocalSafDirectory() { const f = globalThis.__safCandidate.fixture; return { uri: f.savedUri, available: f.available }; }
        export function createNativeSafStorage() { return globalThis.__safCandidate.storage; }
      ` }));
      ctx.onLoad({ filter: /^generation$/, namespace: "candidate" }, () => ({ loader: "js", contents: `
        export async function readActiveSafGeneration() { const id = globalThis.__safCandidate.fixture.expectedId; return id ? { pointer: { localSpaceId: id } } : null; }
      ` }));
    },
  }] });
const directory = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
const reset = () => { fixture.files.clear(); fixture.confirmations = 0; fixture.discards = 0;
  fixture.selections = 0; fixture.uri = defaultUri; fixture.savedUri = null;
  fixture.available = false; fixture.expectedId = null; fixture.canceled = false; };
test.beforeEach(reset);

test("a surviving private identity prevents empty initialization after the saved URI is lost", async () => {
  fixture.expectedId = crypto.randomUUID();
  await assert.rejects(directory.chooseAndValidateSafDirectory(), /identity or committed data/);
  assert.equal(fixture.files.size, 0);
  assert.equal(fixture.confirmations, 0);
  assert.equal(fixture.discards, 1);
});

test("a candidate with another localSpaceId cannot replace a surviving private identity", async () => {
  await directory.chooseAndValidateSafDirectory();
  const original = new Map(fixture.files);
  fixture.confirmations = 0;
  fixture.expectedId = crypto.randomUUID();
  await assert.rejects(directory.chooseAndValidateSafDirectory(), /identity or committed data/);
  assert.equal(fixture.confirmations, 0);
  assert.deepEqual(fixture.files, original);
});

test("first connection cancellation creates no identity or commit", async () => {
  fixture.canceled = true;
  await assert.rejects(directory.chooseAndValidateSafDirectory(), /No LifeSpace data directory was selected/);
  assert.equal(fixture.files.size, 0);
  assert.equal(fixture.confirmations, 0);
});

test("a corrupted snapshot or missing media never initializes or confirms an existing candidate", async () => {
  await directory.chooseAndValidateSafDirectory();
  const manifest = JSON.parse(new TextDecoder().decode(fixture.files.get("manifest.json")));
  fixture.files.set("snapshots/" + manifest.committedRevision + ".json", Uint8Array.of(1));
  const original = new Map(fixture.files);
  fixture.confirmations = 0;
  await assert.rejects(directory.chooseAndValidateSafDirectory(), /No valid SAF commit/);
  assert.equal(fixture.confirmations, 0);
  assert.deepEqual(fixture.files, original);
});

test("empty directory gets one identity and committed empty revision before connection", async () => {
  const first = await directory.chooseAndValidateSafDirectory();
  assert.equal(first.kind, "new");
  assert.equal(fixture.confirmations, 1);
  assert.equal([...fixture.files.keys()].filter((path) => path.startsWith("commits/")).length, 1);
  const again = await directory.chooseAndValidateSafDirectory();
  assert.equal(again.kind, "existing");
  assert.equal(again.localSpaceId, first.localSpaceId);
});
test("an empty folder outside Documents/LifeSpace is refused before any write", async () => {
  fixture.uri = "content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FOther";
  await assert.rejects(directory.chooseAndValidateSafDirectory(), /Documents\/LifeSpace/);
  assert.equal(fixture.files.size, 0);
  assert.equal(fixture.confirmations, 0);
  assert.equal(fixture.discards, 1);
});
test("a previously committed LifeSpace directory reconnects without moving its data", async () => {
  const first = await directory.chooseAndValidateSafDirectory();
  fixture.uri = "content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FLegacyLifeSpace";
  const second = await directory.chooseAndValidateSafDirectory();
  assert.equal(second.kind, "existing");
  assert.equal(second.localSpaceId, first.localSpaceId);
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

test("a saved but unavailable tree blocks the general chooser before it can initialize another space", async () => {
  fixture.savedUri = defaultUri;
  fixture.uri = "content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FOther";
  await assert.rejects(directory.chooseAndValidateSafDirectory(), /Reauthorize the original/);
  assert.equal(fixture.selections, 0);
  assert.equal(fixture.files.size, 0);
});

test("lost grant reconnects only the same validated tree and identity without writing", async () => {
  const first = await directory.chooseAndValidateSafDirectory();
  const original = new Map(fixture.files);
  fixture.expectedId = first.localSpaceId;
  fixture.savedUri = defaultUri;
  fixture.confirmations = 0;
  const result = await directory.regrantSavedSafDirectory();
  assert.equal(result.localSpaceId, first.localSpaceId);
  assert.equal(fixture.confirmations, 1);
  assert.deepEqual(fixture.files, original);
});

test("regrant refuses a different tree, even when it holds a valid copy", async () => {
  const first = await directory.chooseAndValidateSafDirectory();
  const original = new Map(fixture.files);
  fixture.expectedId = first.localSpaceId;
  fixture.savedUri = defaultUri;
  fixture.confirmations = 0;
  fixture.uri = `${defaultUri}-copy`;
  await assert.rejects(directory.regrantSavedSafDirectory(), /original LifeSpace data folder/);
  assert.equal(fixture.confirmations, 0);
  assert.equal(fixture.discards, 1);
  assert.deepEqual(fixture.files, original);
});

test("regrant fails closed if the saved mirror identity is unknown or different", async () => {
  const first = await directory.chooseAndValidateSafDirectory();
  const original = new Map(fixture.files);
  fixture.confirmations = 0;
  fixture.savedUri = defaultUri;
  await assert.rejects(directory.regrantSavedSafDirectory(), /identity cannot be verified/);
  assert.equal(fixture.selections, 1);
  fixture.expectedId = crypto.randomUUID();
  await assert.rejects(directory.regrantSavedSafDirectory(), /identity or committed data/);
  assert.notEqual(fixture.expectedId, first.localSpaceId);
  assert.equal(fixture.confirmations, 0);
  assert.deepEqual(fixture.files, original);
});

test("cancel and unreadable committed tree leave the saved connection unchanged", async () => {
  const first = await directory.chooseAndValidateSafDirectory();
  fixture.expectedId = first.localSpaceId;
  fixture.savedUri = defaultUri;
  fixture.confirmations = 0;
  fixture.canceled = true;
  await assert.rejects(directory.regrantSavedSafDirectory(), /No LifeSpace data directory was selected/);
  assert.equal(fixture.confirmations, 0);
  fixture.canceled = false;
  const original = new Map(fixture.files);
  fixture.files.delete("identity.json");
  await assert.rejects(directory.regrantSavedSafDirectory());
  assert.equal(fixture.confirmations, 0);
  assert.equal(fixture.discards, 1);
  assert.deepEqual(fixture.files, new Map([...original].filter(([path]) => path !== "identity.json")));
});

test("a usable grant cannot accidentally enter the regrant picker", async () => {
  fixture.available = true;
  fixture.savedUri = defaultUri;
  await assert.rejects(directory.regrantSavedSafDirectory(), /needs reauthorization/);
  assert.equal(fixture.selections, 0);
});
