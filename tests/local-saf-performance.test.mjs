import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { build } from "esbuild";

globalThis.crypto ??= webcrypto;
const output = await build({ entryPoints: ["lib/local-saf-core.ts"], bundle: true,
  write: false, platform: "node", format: "esm" });
const core = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
const utf8 = new TextEncoder();
const decode = (data) => JSON.parse(new TextDecoder().decode(data));
const encode = (value) => utf8.encode(JSON.stringify(value));

function storage(files = new Map()) {
  return {
    files, markerReads: 0, markerNames: [],
    async list(path) {
      const prefix = path ? `${path}/` : "";
      return [...new Set([...files.keys()].filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length).split("/")[0]))];
    },
    async read(path) {
      if (path.startsWith("commits/")) { this.markerReads++; this.markerNames.push(path); }
      return files.has(path) ? new Uint8Array(files.get(path)) : null;
    },
    async create(path, data) {
      if (files.has(path)) throw Error(`Immutable collision: ${path}`);
      files.set(path, new Uint8Array(data));
    },
    async checkpoint(path, data) { files.set(path, new Uint8Array(data)); },
    resetReads() { this.markerReads = 0; this.markerNames = []; },
  };
}
const source = (note) => ({ entries: [{ id: "project_1", kind: "local-project", partition: "local",
  archive: { id: "project_1", title: note, local_role: "local-project",
    status: "active", sync: { status: "local-only" } },
  records: [{ id: "record_1", archive_id: "project_1", note,
    sync: { status: "local-only" } }], images: [{ id: "image_1", archive_id: "project_1",
    record_id: "record_1", mime_type: "image/jpeg",
    blob: new Blob([Uint8Array.of(1, 2, 3)], { type: "image/jpeg" }) }] }],
  taxonomy: [], categoryDepths: {} });
async function revisions(count) {
  const saf = storage();
  await core.initializeSafSpace(saf);
  let previous = null;
  for (let n = 1; n <= count; n++) {
    previous = (await core.commitSafContent(saf, source(`revision ${n}`), previous)).committedRevision;
  }
  saf.resetReads();
  return saf;
}
const commitNames = (saf) => [...saf.files.keys()].filter((path) => path.startsWith("commits/")).sort();
function restartedWithBatch(saf) {
  const restarted = storage(saf.files);
  restarted.batches = [];
  restarted.readMany = async (paths) => {
    restarted.batches.push([...paths]);
    return new Map([...paths].reverse().map((path) =>
      [path, restarted.files.has(path) ? new Uint8Array(restarted.files.get(path)) : null]));
  };
  return restarted;
}

test("cold restart batches immutable JSON but still validates every revision", async () => {
  const saf = await revisions(22);
  const restarted = restartedWithBatch(saf);
  const state = await core.readSafCommitted(restarted);
  assert.equal(state.commit.sequence, 22);
  assert.equal(state.source.entries[0].records[0].note, "revision 22");
  assert.ok(restarted.batches.every((batch) => batch.length <= 16));
  const paths = restarted.batches.flat();
  assert.equal(new Set(paths.filter((path) => path.startsWith("commits/"))).size, 22);
  assert.equal(new Set(paths.filter((path) => path.startsWith("snapshots/"))).size, 22);
  assert.equal(new Set(paths.filter((path) => path.startsWith("local/projects/"))).size, 22);
  assert.ok(restarted.batches.length <= 6, `Expected six bounded batches, got ${restarted.batches.length}`);
  assert.equal(restarted.markerReads, 0, "Markers were provided by batch rather than skipped");
});

test("cold recovery bounds project paths from one verification window", async () => {
  const saf = storage();
  await core.initializeSafSpace(saf);
  const original = source("window").entries[0];
  const entries = Array.from({ length: 17 }, (_, index) => {
    const id = `project_${index + 1}`;
    const recordId = `record_${index + 1}`;
    return { ...original, id, archive: { ...original.archive, id },
      records: original.records.map((record) => ({ ...record, id: recordId, archive_id: id })),
      images: original.images.map((image) => ({ ...image,
        id: `image_${index + 1}`, archive_id: id, record_id: recordId })) };
  });
  await core.commitSafContent(saf, { entries, taxonomy: [], categoryDepths: {} }, null);
  const restarted = restartedWithBatch(saf);
  const readMany = restarted.readMany;
  restarted.readMany = async (paths) => {
    if (paths.length > 16) throw Error("Invalid SAF batch paths.");
    return readMany(paths);
  };
  const state = await core.readSafCommitted(restarted);
  assert.equal(state.commit.sequence, 1);
  assert.deepEqual(state.source.entries.map((entry) => entry.id), entries.map((entry) => entry.id));
  const projectBatches = restarted.batches.filter((batch) =>
    batch.some((path) => path.startsWith("local/projects/")));
  assert.deepEqual(projectBatches.map((batch) => batch.length), [16, 1]);
});

test("batch partial response refuses cold recovery instead of accepting missing validation", async () => {
  const restarted = restartedWithBatch(await revisions(3));
  restarted.readMany = async (paths) => new Map(paths.slice(1).map((path) =>
    [path, restarted.files.get(path)]));
  await assert.rejects(core.readSafCommitted(restarted), /Incomplete SAF batch response/);
});

test("batch cold recovery still checks manifest, marker, snapshot and project hashes", async (t) => {
  for (const damage of ["manifest", "marker", "snapshot", "project"]) {
    await t.test(damage, async () => {
      const saf = await revisions(3);
      const last = commitNames(saf).at(-1);
      const marker = decode(saf.files.get(last));
      const snapshot = decode(saf.files.get(marker.snapshotPath));
      const project = snapshot.entries[0].file;
      if (damage === "manifest") saf.files.set("manifest.json", utf8.encode("{broken"));
      else saf.files.set(damage === "marker" ? last : damage === "snapshot"
        ? marker.snapshotPath : project, utf8.encode("{broken"));
      const restarted = restartedWithBatch(saf);
      const result = await core.readSafCommitted(restarted);
      assert.equal(result.commit.sequence, damage === "manifest" ? 3 : 2);
      assert.ok(restarted.batches.flat().some((path) => path.startsWith("commits/")));
    });
  }
});

test("a missing snapshot and a truncated project cannot pass a batch", async () => {
  for (const damage of ["missing-snapshot", "truncated-project"]) {
    const saf = await revisions(3);
    const marker = decode(saf.files.get(commitNames(saf).at(-1)));
    const snapshot = decode(saf.files.get(marker.snapshotPath));
    if (damage === "missing-snapshot") saf.files.delete(marker.snapshotPath);
    else saf.files.set(snapshot.entries[0].file, saf.files.get(snapshot.entries[0].file).subarray(0, 9));
    assert.equal((await core.readSafCommitted(restartedWithBatch(saf))).commit.sequence, 2);
  }
});

test("warm verified head reads current marker and data, not every historical marker", async () => {
  const saf = await revisions(22);
  const state = await core.readSafCommitted(saf);
  assert.equal(state.commit.sequence, 22);
  assert.deepEqual(saf.markerNames, [commitNames(saf).at(-1)]);
  assert.equal(state.source.entries[0].records[0].note, "revision 22");
});

test("new commit advances verified head and subsequent reads verify its marker", async () => {
  const saf = await revisions(5);
  const prior = await core.readSafCommitted(saf);
  saf.resetReads();
  await core.commitSafContent(saf, source("six"), prior.commit.revision);
  assert.ok(saf.markerReads <= 4, `commit rechecked ${saf.markerReads} markers`);
  assert.ok(saf.markerNames.every((name) => commitNames(saf).slice(-2).includes(name)));
  saf.resetReads();
  assert.equal((await core.readSafCommitted(saf)).commit.sequence, 6);
  assert.deepEqual(saf.markerNames, [commitNames(saf).at(-1)]);
});

test("cache invalidation and new storage instance require full chain validation", async () => {
  const saf = await revisions(5);
  core.invalidateSafVerifiedHead(saf);
  saf.resetReads();
  await core.readSafCommitted(saf);
  assert.equal(saf.markerReads, 5);
  const restarted = storage(saf.files);
  await core.readSafCommitted(restarted);
  assert.equal(restarted.markerReads, 5);
});

test("concurrent cold readers share one complete validation", async () => {
  const saf = await revisions(22);
  const restarted = storage(saf.files);
  const [a, b, c] = await Promise.all(Array.from({ length: 3 },
    () => core.readSafCommitted(restarted)));
  assert.deepEqual([a.commit.sequence, b.commit.sequence, c.commit.sequence], [22, 22, 22]);
  assert.equal(restarted.markerReads, 22);
});

test("directory invalidation rejects an in-flight cold verification", async () => {
  const saf = await revisions(5);
  const restarted = storage(saf.files);
  const first = commitNames(restarted)[0];
  const originalRead = restarted.read.bind(restarted);
  let release, entered;
  const blocked = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  restarted.read = async (path) => {
    if (path === first) { entered(); await blocked; }
    return originalRead(path);
  };
  const pending = core.readSafCommitted(restarted);
  await started;
  core.invalidateSafVerifiedHead(restarted);
  release();
  await assert.rejects(pending, /directory changed during verification/);
  restarted.read = originalRead;
  restarted.resetReads();
  assert.equal((await core.readSafCommitted(restarted)).commit.sequence, 5);
  assert.equal(restarted.markerReads, 5);
});

test("changed checkpoint, missing marker and corrupt latest commit trigger recovery", async () => {
  const saf = await revisions(5);
  saf.files.set("manifest.json", encode({ ...decode(saf.files.get("manifest.json")),
    committedRevision: crypto.randomUUID() }));
  saf.resetReads();
  assert.equal((await core.readSafCommitted(saf)).commit.sequence, 5);
  assert.equal(saf.markerReads, 5);
  const last = commitNames(saf).at(-1);
  saf.files.delete(last);
  saf.resetReads();
  assert.equal((await core.readSafCommitted(saf)).commit.sequence, 4);
  assert.equal(saf.markerReads, 4);
  const fourth = commitNames(saf).at(-1);
  saf.files.set(fourth, utf8.encode("corrupt"));
  saf.resetReads();
  assert.equal((await core.readSafCommitted(saf)).commit.sequence, 3);
  assert.ok(saf.markerReads >= 4);
});

test("warm cache still rejects corrupt media and identity, including unchanged checkpoint", async () => {
  const saf = await revisions(5);
  const media = [...saf.files.keys()].find((path) => path.includes("/media/"));
  saf.files.set(media, Uint8Array.of(9, 9, 9));
  await assert.rejects(core.readSafCommitted(saf), /hash mismatch/);
  saf.files.set("identity.json", encode({ ...decode(saf.files.get("identity.json")),
    localSpaceId: crypto.randomUUID() }));
  await assert.rejects(core.readSafCommitted(saf), /localSpaceId mismatch/);
});

test("unmarked staged revision cannot advance a cached committed head", async () => {
  const saf = await revisions(3);
  const staged = crypto.randomUUID();
  saf.files.set(`snapshots/${staged}.json`, utf8.encode("incomplete"));
  assert.equal((await core.readSafCommitted(saf)).commit.sequence, 3);
  assert.deepEqual(saf.markerNames, [commitNames(saf).at(-1)]);
});
