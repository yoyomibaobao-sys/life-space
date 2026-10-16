import assert from "node:assert/strict";
import { build } from "esbuild";
import test from "node:test";

const output = await build({ entryPoints: ["lib/local-saf-contract.ts"], bundle: true,
  write: false, platform: "node", format: "esm" });
const format = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
const id = "12345678-1234-4234-8234-123456789abc";
const hash = "ab".repeat(32);
const manifest = { format: "LifeSpaceSAF", schemaVersion: 1, minReaderVersion: 1,
  minWriterVersion: 1, localSpaceId: id, createdAt: "2026-10-06T00:00:00Z",
  updatedAt: "2026-10-06T00:00:00Z", committedSequence: 1,
  committedRevision: id, snapshotSha256: hash, commitSha256: hash };

test("format declares stable identity and compatible version", () => {
  assert.doesNotThrow(() => format.assertSafManifest(manifest));
  assert.throws(() => format.assertSafManifest({ ...manifest, schemaVersion: 2 }), /schemaVersion/);
  assert.throws(() => format.assertSafManifest({ ...manifest, minWriterVersion: 2 }), /version/);
});
test("manifest cannot use a cloud account as localSpaceId", () => {
  assert.throws(() => format.assertSafManifest({ ...manifest, localSpaceId: hash }), /UUID/);
});
test("snapshot rejects duplicate IDs and path escapes", () => {
  const ref = { id: "project_1", kind: "local-project", partition: "local",
    file: `local/projects/project_1/${id}.json`, sha256: hash, recordCount: 0, mediaCount: 0 };
  const snapshot = { schemaVersion: 1, localSpaceId: id, revision: id,
    entries: [ref], taxonomy: [], categoryDepths: {} };
  assert.doesNotThrow(() => format.assertSafSnapshot(snapshot));
  assert.throws(() => format.assertSafSnapshot({ ...snapshot, entries: [ref, ref] }), /Duplicate/);
  assert.throws(() => format.assertSafSnapshot({ ...snapshot,
    entries: [{ ...ref, file: "../private" }] }), /Unsafe/);
});
test("a marker requires a valid snapshot and predecessor hash", () => {
  const commit = { schemaVersion: 1, localSpaceId: id, sequence: 1,
    revision: id, previousSha256: null, snapshotPath: `snapshots/${id}.json`,
    snapshotSha256: hash, createdAt: "2026-10-06T00:00:00Z" };
  assert.doesNotThrow(() => format.assertSafCommit(commit));
  assert.throws(() => format.assertSafCommit({ ...commit, previousSha256: hash }), /chain/);
});
