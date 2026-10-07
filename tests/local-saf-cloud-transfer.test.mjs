import assert from "node:assert/strict";
import { build } from "esbuild";
import test from "node:test";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;
const output = await build({ entryPoints: ["lib/local-saf-cloud-transfer.ts", "lib/local-saf-core.ts"],
  bundle: true, write: false, platform: "node", format: "esm", outdir: "out" });
const modules = await Promise.all(output.outputFiles.map(async (file) =>
  [file.path.split(/[\\/]/).at(-1), await import(`data:text/javascript;base64,${Buffer.from(file.contents).toString("base64")}`)]));
const moduleFor = (name) => modules.find(([file]) => file === `local-saf-${name}.js`)[1];
const transfer = moduleFor("cloud-transfer"), core = moduleFor("core");
const userA = "a28ce2ab-1300-4f1d-94f0-2d032b0a0901";
const userB = "b28ce2ab-1300-4f1d-94f0-2d032b0a0902";
const archiveId = "local_project_1";
function storage() {
  const files = new Map();
  return { files, failMarker: false,
    async list(path) { const prefix = path ? `${path}/` : "";
      return [...new Set([...files.keys()].filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length).split("/")[0]))]; },
    async read(path) { return files.has(path) ? new Uint8Array(files.get(path)) : null; },
    async create(path, bytes) {
      if (this.failMarker && path.startsWith("commits/")) throw Error("injected marker crash");
      if (files.has(path)) throw Error("immutable conflict");
      files.set(path, new Uint8Array(bytes));
    },
    async checkpoint(path, bytes) { files.set(path, new Uint8Array(bytes)); },
  };
}
async function fixture() {
  const saf = storage();
  await core.initializeSafSpace(saf);
  await core.commitSafContent(saf, { entries: [{ id: archiveId, kind: "local-project",
    partition: "local", archive: { id: archiveId, local_role: "local-project", title: "Test",
      sync: { status: "local-only" } }, records: [], images: [] }],
    taxonomy: [], categoryDepths: {} }, null);
  return saf;
}
function remote() {
  const rows = new Map(); let insertCalls = 0;
  return { rows, get insertCalls() { return insertCalls; },
    async findById(id) { return rows.get(id) || null; },
    async insert(payload) {
      insertCalls++;
      if ([...rows.values()].some((row) => row.id === payload.id ||
          (row.user_id === payload.user_id && row.local_transfer_token === payload.local_transfer_token))) {
        throw Error("unique violation");
      }
      rows.set(payload.id, payload);
    },
  };
}
const create = (gateway, prepared, user = userA) =>
  transfer.ensurePreparedCloudArchive(gateway, prepared, user, { title: "Test" })
    .then((result) => result.id);

test("SAF marker precedes the remote insert and restart reuses ID/token/user", async () => {
  const saf = await fixture(), gateway = remote();
  const prepared = await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA);
  assert.notEqual(prepared.targetCloudArchiveId, prepared.localTransferToken);
  assert.equal((await core.readSafCommitted(saf)).source.entries[0].archive.local_cloud_transfer.targetUserId, userA);
  const first = await transfer.ensurePreparedCloudArchive(gateway, prepared, userA, { title: "Test" });
  assert.deepEqual(first, { id: prepared.targetCloudArchiveId, wasExisting: false });
  assert.deepEqual(await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA), prepared);
  const retry = await transfer.ensurePreparedCloudArchive(gateway, prepared, userA, { title: "Test" });
  assert.deepEqual(retry, { id: prepared.targetCloudArchiveId, wasExisting: true });
  assert.equal(gateway.insertCalls, 1);
});
test("crash before marker never sends a remote request", async () => {
  const saf = await fixture(), gateway = remote(); saf.failMarker = true;
  await assert.rejects(transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA), /marker crash/);
  assert.equal((await core.readSafCommitted(saf)).source.entries[0].archive.local_cloud_transfer, undefined);
  assert.equal(gateway.insertCalls, 0);
});
test("lost insert response and restart reuse exactly one remote project", async () => {
  const saf = await fixture(), gateway = remote();
  const prepared = await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA);
  const lostResponse = { findById: gateway.findById.bind(gateway),
    async insert(payload) { await gateway.insert(payload); throw Error("response lost"); } };
  assert.deepEqual(await transfer.ensurePreparedCloudArchive(lostResponse, prepared, userA, { title: "Test" }),
    { id: prepared.targetCloudArchiveId, wasExisting: true });
  const recovered = await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA);
  assert.equal(await create(gateway, recovered), prepared.targetCloudArchiveId);
  assert.equal(gateway.insertCalls, 1);
  assert.equal(gateway.rows.size, 1);
});
test("cloud created before stage marker and later upload failure both reuse the same target", async () => {
  const saf = await fixture(), gateway = remote();
  const prepared = await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA);
  await create(gateway, prepared); // crash before recording cloud-created
  const restarted = await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA);
  assert.equal(restarted.stage, "prepared");
  assert.equal(await create(gateway, restarted), prepared.targetCloudArchiveId);
  await transfer.advanceSafLocalCloudTransfer(saf, archiveId, prepared, "cloud-created");
  const afterUploadFailure = await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA);
  assert.equal(afterUploadFailure.stage, "cloud-created");
  assert.equal(await create(gateway, afterUploadFailure), prepared.targetCloudArchiveId);
  assert.equal(gateway.insertCalls, 1);
});
test("same ID with wrong owner or token fails closed", async () => {
  for (const field of ["user_id", "local_transfer_token"]) {
    const saf = await fixture(), gateway = remote();
    const prepared = await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA);
    gateway.rows.set(prepared.targetCloudArchiveId, { id: prepared.targetCloudArchiveId,
      user_id: userA, local_transfer_token: prepared.localTransferToken,
      [field]: field === "user_id" ? userB : crypto.randomUUID() });
    await assert.rejects(create(gateway, prepared), /conflict/);
    assert.equal(gateway.insertCalls, 0);
  }
});
test("same token on another ID fails unique check without changing target", async () => {
  const saf = await fixture(), gateway = remote();
  const prepared = await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA);
  const otherId = crypto.randomUUID();
  gateway.rows.set(otherId, { id: otherId, user_id: userA,
    local_transfer_token: prepared.localTransferToken });
  await assert.rejects(create(gateway, prepared), /unique violation/);
  assert.equal(gateway.rows.size, 1);
});
test("account switch pauses, original account resumes same transfer", async () => {
  const saf = await fixture(), gateway = remote();
  const prepared = await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA);
  await assert.rejects(transfer.prepareSafLocalCloudTransfer(saf, archiveId, userB), /another cloud account/);
  await assert.rejects(create(gateway, prepared, userB), /Cloud account changed/);
  assert.equal(gateway.insertCalls, 0);
  assert.equal(await create(gateway, await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA)),
    prepared.targetCloudArchiveId);
});
test("completed transfer leaves a durable tombstone; old revision never becomes visible", async () => {
  const saf = await fixture(), gateway = remote();
  const prepared = await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA);
  await create(gateway, prepared);
  await transfer.advanceSafLocalCloudTransfer(saf, archiveId, prepared, "cloud-created");
  await transfer.advanceSafLocalCloudTransfer(saf, archiveId, prepared, "complete");
  const recovered = await core.readSafCommitted(saf);
  assert.equal(recovered.source.entries[0].archive.local_cloud_transfer.stage, "complete");
  assert.deepEqual(core.visibleSafEntries(recovered.source, userA), []);
  assert.equal([...saf.files.keys()].filter((path) => path.startsWith("commits/")).length, 4);
  await assert.rejects(transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA), /already been transferred/);
});
test("cloud failure leaves the committed target identity intact for retry", async () => {
  const saf = await fixture();
  const prepared = await transfer.prepareSafLocalCloudTransfer(saf, archiveId, userA);
  await assert.rejects(create({ async findById() { return null; },
    async insert() { throw Error("offline"); } }, prepared), /offline/);
  assert.deepEqual((await core.readSafCommitted(saf)).source.entries[0].archive.local_cloud_transfer, prepared);
});
