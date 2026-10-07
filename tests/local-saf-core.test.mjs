import assert from "node:assert/strict";
import { build } from "esbuild";
import test from "node:test";
import { createHash, webcrypto } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";

globalThis.crypto ??= webcrypto;
const compiled = await build({ entryPoints: ["lib/local-saf-contract.ts",
  "lib/local-saf-core.ts", "lib/local-saf-migration.ts", "lib/local-saf-generation.ts",
  "lib/local-saf-cloud-partition.ts"],
  bundle: true, write: false, platform: "node", format: "esm", outdir: "out" });
const modules = await Promise.all(compiled.outputFiles.map(async (file) =>
  [file.path.split(/[\\/]/).at(-1), await import(`data:text/javascript;base64,${Buffer.from(file.contents).toString("base64")}`)]));
const get = (name) => modules.find(([file]) => file === `local-saf-${name}.js`)[1];
const format = get("contract");
const core = get("core");
const migration = get("migration");
const generation = get("generation");
const cloudPartition = get("cloud-partition");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const userA = "a28ce2ab-1300-4f1d-94f0-2d032b0a0901";
const userB = "b28ce2ab-1300-4f1d-94f0-2d032b0a0902";
const fresh = () => ({
  files: new Map(), fail: "", checkpointFails: false,
  async list(path) {
    const prefix = path ? `${path}/` : "";
    return [...new Set([...this.files.keys()].filter((file) => file.startsWith(prefix))
      .map((file) => file.slice(prefix.length).split("/")[0]))];
  },
  async read(path) { return this.files.has(path) ? new Uint8Array(this.files.get(path)) : null; },
  async create(path, bytes) {
    if (this.fail && path.includes(this.fail)) throw Error(`Injected crash: ${this.fail}`);
    if (this.files.has(path)) throw Error(`Immutable file collision: ${path}`);
    this.files.set(path, new Uint8Array(bytes));
  },
  async checkpoint(path, bytes) {
    if (this.checkpointFails) throw Error("Injected checkpoint crash");
    this.files.set(path, new Uint8Array(bytes));
  },
});
function item(kind = "local-project", owner = undefined) {
  const id = kind === "local-project" ? "project_1" : "cloud_1";
  const archive = { id, title: "番茄", local_role: kind === "local-project" ? "local-project" : "cloud-offline-cache",
    status: "active", sync: { status: "local-only" }, ...(owner ? { local_owner_user_id: owner } : {}) };
  const record = { id: `record_${kind}`, archive_id: id, note: "第一条", sync: { status: "local-only" } };
  const image = { id: `image_${kind}`, archive_id: id, record_id: record.id,
    mime_type: "image/jpeg", blob: new Blob([Uint8Array.from([4, 7, 9])], { type: "image/jpeg" }) };
  return { id: kind === "pending-cloud-user-data" ? `pending_${id}` : id,
    kind, partition: "local", ownerUserId: owner, archive, records: [record], images: [image] };
}
const content = (entries = [item()]) => ({ entries, taxonomy: [], categoryDepths: {} });
const make = async (storage, entries = [item()]) => {
  await core.initializeSafSpace(storage);
  await core.commitSafContent(storage, content(entries), null);
  return core.readSafCommitted(storage);
};
const names = (storage, prefix) => [...storage.files.keys()].filter((path) => path.startsWith(prefix));
const modify = (storage, path, fn) => storage.files.set(path, fn(storage.files.get(path)));
function legacy(archive = item().archive, records = item().records, images = item().images) {
  return { archives: [archive], records, images, taxonomy: [], categoryDepths: {} };
}

test("localSpaceId is generated exactly once and reconnect retains it", async () => {
  const storage = fresh(); const id = await core.initializeSafSpace(storage);
  assert.match(id, /^[0-9a-f-]{36}$/);
  await assert.rejects(core.initializeSafSpace(storage), /nonempty/);
  const committed = await core.commitSafContent(storage, content(), null);
  assert.equal(committed.localSpaceId, id);
  assert.equal((await core.readSafCommitted(storage)).manifest.localSpaceId, id);
});
test("accountKey is deterministic and separates users", async () => {
  assert.equal(await format.safAccountKey(userA), await format.safAccountKey(userA.toUpperCase()));
  assert.notEqual(await format.safAccountKey(userA), await format.safAccountKey(userB));
});
test("guest, login, logout and account switch never hide local projects", async () => {
  const storage = fresh(); const state = await make(storage);
  for (const user of [null, userA, null, userB])
    assert.deepEqual(core.visibleSafEntries(state.source, user).map((entry) => entry.id), ["project_1"]);
});
test("historic create-archive remains pending despite local-project role", () => {
  assert.equal(format.classifyLegacySafArchive({ ...item().archive,
    sync: { status: "pending-cloud-sync", operation_kind: "create-archive" } }),
    "pending-cloud-user-data");
});
test("cache and pending have distinct cloud partitions, never local", async () => {
  const key = await format.safAccountKey(userA);
  assert.equal(format.safPartition("cloud-offline-cache", key), `cloud/${key}/cache`);
  assert.equal(format.safPartition("pending-cloud-user-data", key), `cloud/${key}/pending`);
  assert.throws(() => format.assertSafIdentity("pending-cloud-user-data", "local", userA), /namespace/);
  assert.throws(() => format.assertSafIdentity("cloud-offline-cache", "local", userA), /namespace/);
});
test("archive-only pending update materializes with its synced cache baseline exactly once", async () => {
  const archive = { ...item("cloud-offline-cache", userA).archive,
    source_cloud_archive_id: "remote-1", title: "new title",
    sync: { status: "pending-cloud-sync", operation_kind: "update-archive",
      pending_fields: ["title"] } };
  const source = item("cloud-offline-cache", userA);
  const entries = await cloudPartition.splitCloudMaterialization({ archive,
    records: source.records, images: source.images });
  assert.deepEqual(entries.map((entry) => entry.kind), ["cloud-offline-cache", "pending-cloud-user-data"]);
  assert.equal(entries[0].records.length, 1);
  assert.equal(entries[0].images.length, 1);
  assert.equal(entries[1].records.length, 0);
  const merged = cloudPartition.materializeCloudEntries(entries, userA);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].archive.title, "new title");
  assert.equal(merged[0].records.length, 1);
  assert.equal(merged[0].images.length, 1);
  assert.throws(() => cloudPartition.materializeCloudEntries(entries, userB), /owner mismatch/);
});
for (const unsafe of ["../private", "/tmp/file", "cloud/../local", "content://escape", "local/%2e%2e", "local\\media"]) {
  test(`unsafe SAF path rejected: ${unsafe}`, () => assert.throws(() => format.safeSafPath(unsafe), /Unsafe/));
}
test("duplicate project, record and media IDs are rejected before marker", async () => {
  const storage = fresh(); await core.initializeSafSpace(storage);
  await assert.rejects(core.commitSafContent(storage, content([item(), item()]), null), /Duplicate SAF project/);
  const other = { ...item(), id: "other", archive: { ...item().archive, id: "other" },
    records: [{ ...item().records[0], archive_id: "other" }],
    images: [{ ...item().images[0], archive_id: "other" }] };
  await assert.rejects(core.commitSafContent(storage, content([item(), other]), null), /Duplicate SAF record/);
  other.records[0].id = "other_record"; other.images[0].record_id = "other_record";
  await assert.rejects(core.commitSafContent(storage, content([item(), other]), null), /Duplicate SAF media/);
  assert.equal(names(storage, "commits/").length, 0);
});
test("hash, size and missing media each reject restore", async (t) => {
  for (const failure of ["hash", "size", "missing"]) await t.test(failure, async () => {
    const storage = fresh(); await make(storage);
    const path = names(storage, "local/media/")[0];
    if (failure === "missing") storage.files.delete(path);
    else if (failure === "hash") modify(storage, path, () => Uint8Array.from([1, 2, 3]));
    else modify(storage, path, (value) => new Uint8Array([...value, 9]));
    await assert.rejects(core.readSafCommitted(storage), /Missing SAF|hash mismatch|size mismatch/);
  });
});
test("corrupt root checkpoint falls back to valid marker chain", async () => {
  const storage = fresh(); const first = await make(storage);
  storage.files.set("manifest.json", new TextEncoder().encode("{incomplete"));
  assert.equal((await core.readSafCommitted(storage)).commit.revision, first.commit.revision);
});
test("manifest and immutable identity use exactly the same localSpaceId", async () => {
  const storage = fresh(); const first = await make(storage);
  const identity = JSON.parse(new TextDecoder().decode(storage.files.get("identity.json")));
  const checkpoint = JSON.parse(new TextDecoder().decode(storage.files.get("manifest.json")));
  assert.equal(identity.localSpaceId, first.commit.localSpaceId);
  assert.equal(checkpoint.localSpaceId, identity.localSpaceId);
  assert.equal((await core.readSafCommitted(storage)).manifest.localSpaceId, identity.localSpaceId);
});
test("valid manifest with a different localSpaceId refuses connection without changing either identity file", async () => {
  const storage = fresh(); await make(storage);
  const originalIdentity = new Uint8Array(storage.files.get("identity.json"));
  const checkpoint = JSON.parse(new TextDecoder().decode(storage.files.get("manifest.json")));
  const wrongManifest = new TextEncoder().encode(JSON.stringify({
    ...checkpoint, localSpaceId: crypto.randomUUID(),
  }));
  storage.files.set("manifest.json", wrongManifest);
  await assert.rejects(core.readSafCommitted(storage), /localSpaceId mismatch/);
  assert.deepEqual(storage.files.get("identity.json"), originalIdentity);
  assert.deepEqual(storage.files.get("manifest.json"), wrongManifest);
});
test("unsupported identity schema refuses restore without replacing data", async () => {
  const storage = fresh(); await make(storage);
  const identity = JSON.parse(new TextDecoder().decode(storage.files.get("identity.json")));
  storage.files.set("identity.json", new TextEncoder().encode(JSON.stringify({ ...identity, schemaVersion: 2 })));
  await assert.rejects(core.readSafCommitted(storage), /Corrupt SAF identity/);
  assert.equal(names(storage, "commits/").length, 1);
});
test("root checkpoint pointing to a revision with no marker is ignored", async () => {
  const storage = fresh(); const first = await make(storage);
  const fake = { ...first.manifest, committedRevision: crypto.randomUUID() };
  storage.files.set("manifest.json", new TextEncoder().encode(JSON.stringify(fake)));
  assert.equal((await core.readSafCommitted(storage)).commit.revision, first.commit.revision);
});
test("corrupt trailing commit and snapshot recover last valid revision", async () => {
  for (const target of ["commit", "snapshot"]) {
    const storage = fresh(); const first = await make(storage);
    const second = await core.commitSafContent(storage, content([{ ...item(),
      records: [{ ...item().records[0], note: "修改" }] }]), first.commit.revision);
    const path = target === "commit" ? names(storage, "commits/").at(-1) :
      `snapshots/${second.committedRevision}.json`;
    storage.files.set(path, new TextEncoder().encode("broken"));
    const recovered = await core.readSafCommitted(storage);
    assert.equal(recovered.commit.revision, first.commit.revision);
  }
});
for (const [phase, path] of [["media", "/media/"], ["snapshot", "snapshots/"],
  ["marker", "commits/"]]) {
  test(`crash before ${phase} completes never commits revision`, async () => {
    const storage = fresh(); const first = await make(storage);
    storage.fail = path;
    await assert.rejects(core.commitSafContent(storage, content([{ ...item(),
      records: [{ ...item().records[0], note: "新内容" }],
      images: [{ ...item().images[0], blob: new Blob([Uint8Array.of(3, 8, 11)]) }] }]),
    first.commit.revision), /Injected crash/);
    assert.equal((await core.readSafCommitted(storage)).commit.revision, first.commit.revision);
  });
}
test("marker success with checkpoint failure is durable and recoverable", async () => {
  const storage = fresh(); await core.initializeSafSpace(storage);
  storage.checkpointFails = true;
  const committed = await core.commitSafContent(storage, content(), null);
  assert.equal((await core.readSafCommitted(storage)).commit.revision, committed.committedRevision);
});
test("no marker on initial write is never reported as empty committed data", async () => {
  const storage = fresh(); await core.initializeSafSpace(storage);
  storage.fail = "commits/";
  await assert.rejects(core.commitSafContent(storage, content(), null));
  assert.equal(await core.readSafCommitted(storage), null);
  assert.notEqual((await storage.list("")).length, 0);
});
test("nonempty unknown directory and corrupt identity refuse initialization", async () => {
  const storage = fresh(); storage.files.set("stranger.txt", Uint8Array.of(1));
  await assert.rejects(core.initializeSafSpace(storage), /nonempty/);
  await assert.rejects(core.readSafCommitted(storage), /Nonempty unknown/);
  storage.files.clear(); await core.initializeSafSpace(storage);
  storage.files.set("identity.json", Uint8Array.of(3));
  await assert.rejects(core.readSafCommitted(storage));
});
test("hydrate validation failure retains current generation", async () => {
  globalThis.indexedDB = new IDBFactory();
  const storage = fresh(); const first = await make(storage);
  await generation.hydrateSafGeneration(storage);
  const media = names(storage, "local/media/")[0];
  storage.files.delete(media);
  await assert.rejects(generation.hydrateSafGeneration(storage), /Missing SAF/);
  assert.equal((await generation.readActiveSafGeneration()).pointer.revision, first.commit.revision);
});
test("hydrate build abort retains old generation and its data", async () => {
  globalThis.indexedDB = new IDBFactory();
  const storage = fresh(); const first = await make(storage);
  await generation.hydrateSafGeneration(storage);
  await assert.rejects(generation.hydrateSafGeneration(storage, { failBuildAt: 0 }));
  assert.equal((await generation.readActiveSafGeneration()).pointer.revision, first.commit.revision);
  assert.equal((await generation.readActiveSafGeneration()).entries.length, 1);
});
test("activeGeneration switches atomically after build; old generation remains", async () => {
  globalThis.indexedDB = new IDBFactory();
  const storage = fresh(); const first = await make(storage);
  const old = await generation.hydrateSafGeneration(storage);
  const second = await core.commitSafContent(storage, content([{ ...item(),
    records: [{ ...item().records[0], note: "新版本" }] }]), first.commit.revision);
  await assert.rejects(generation.hydrateSafGeneration(storage, { beforeActivate: () => { throw Error("stop"); } }), /stop/);
  assert.equal((await generation.readActiveSafGeneration()).pointer.generation, old);
  await generation.hydrateSafGeneration(storage);
  assert.equal((await generation.readActiveSafGeneration()).pointer.revision, second.committedRevision);
  assert.equal((await generation.readActiveSafGeneration()).entries[0].records[0].note, "新版本");
});
test("no validated generation shows recovery error, not local 0", async () => {
  globalThis.indexedDB = new IDBFactory();
  await assert.rejects(generation.readVisibleSafGeneration(null), /No validated SAF mirror/);
});
test("migration partitions pending create-archive and cache pending records", async () => {
  const pendingArchive = { ...item().archive, local_owner_user_id: userA,
    sync: { status: "pending-cloud-sync", operation_kind: "create-archive" } };
  const plan = await migration.planLegacySafMigration(legacy(pendingArchive));
  assert.equal(plan.source.entries[0].kind, "pending-cloud-user-data");
  assert.match(plan.source.entries[0].partition, /\/pending$/);
  const cache = { ...item().archive, id: "cloud_1", local_owner_user_id: userA,
    local_role: "cloud-offline-cache" };
  const pending = { ...item().records[0], archive_id: cache.id, sync: { status: "pending-cloud-sync" } };
  const cachePlan = await migration.planLegacySafMigration(legacy(cache, [pending],
    [{ ...item().images[0], archive_id: cache.id, record_id: pending.id,
      sync: { status: "pending-cloud-sync" } }]));
  assert.deepEqual(cachePlan.source.entries.map((entry) => entry.kind),
    ["cloud-offline-cache", "pending-cloud-user-data"]);
  assert.equal(cachePlan.source.entries[0].partition.endsWith("/cache"), true);
  assert.equal(cachePlan.source.entries[1].partition.endsWith("/pending"), true);
  const storage = fresh(); await core.initializeSafSpace(storage);
  await migration.executeSafMigration(storage, cachePlan, async () => {});
  const restored = await core.readSafCommitted(storage);
  assert.deepEqual(restored.source.entries.map((entry) => entry.kind),
    ["cloud-offline-cache", "pending-cloud-user-data"]);
});
test("synced cache record with a pending image retains its synced image", async () => {
  const cache = { ...item().archive, id: "cloud_mixed", local_owner_user_id: userA,
    local_role: "cloud-offline-cache" };
  const record = { ...item().records[0], archive_id: cache.id, sync: { status: "synced" } };
  const syncedImage = { ...item().images[0], archive_id: cache.id, record_id: record.id,
    sync: { status: "synced" } };
  const pendingImage = { ...syncedImage, id: "pending_image", sync: { status: "pending-cloud-sync" } };
  const plan = await migration.planLegacySafMigration(legacy(cache, [record], [syncedImage, pendingImage]));
  assert.equal(plan.inventory.media, 2);
  assert.deepEqual(plan.source.entries[1].images.map((row) => row.id), [syncedImage.id, pendingImage.id]);
  const storage = fresh(); await core.initializeSafSpace(storage);
  await migration.executeSafMigration(storage, plan, async () => {});
  const restored = await core.readSafCommitted(storage);
  assert.equal(restored.source.entries.flatMap((entry) => entry.images).length, 2);
});
test("cloud owner and accountKey mismatch reject an immutable document", async () => {
  const storage = fresh(); await core.initializeSafSpace(storage);
  const cloud = item("cloud-offline-cache", userA);
  cloud.partition = format.safPartition(cloud.kind, await format.safAccountKey(userB));
  await assert.rejects(core.commitSafContent(storage, content([cloud]), null), /accountKey/);
  assert.equal(names(storage, "commits/").length, 0);
});
test("concurrent stale writer is rejected without creating a second marker", async () => {
  const storage = fresh(); const first = await make(storage);
  const results = await Promise.allSettled([
    core.commitSafContent(storage, content(), first.commit.revision),
    core.commitSafContent(storage, content(), first.commit.revision),
  ]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(results.filter((row) => row.status === "rejected").length, 1);
  assert.equal(names(storage, "commits/").length, 2);
});
test("migration rerun is idempotent; same ID and content is already migrated", async () => {
  const storage = fresh(); await core.initializeSafSpace(storage);
  const plan = await migration.planLegacySafMigration(legacy());
  const markers = [];
  const first = await migration.executeSafMigration(storage, plan, async (result) => markers.push(result));
  const second = await migration.executeSafMigration(storage, plan, async (result) => markers.push(result));
  assert.equal(first.kind, "migrated"); assert.equal(second.kind, "already-migrated");
  assert.equal(names(storage, "commits/").length, 1); assert.equal(markers.length, 2);
  assert.equal(names(storage, "migration/").length, 1);
  assert.equal(markers[0].fingerprint, plan.fingerprint);
});
test("interrupted migration writes no completion marker and resumes without duplicates", async () => {
  const storage = fresh(); await core.initializeSafSpace(storage);
  const plan = await migration.planLegacySafMigration(legacy());
  const completed = [];
  storage.fail = "commits/";
  await assert.rejects(migration.executeSafMigration(storage, plan,
    async (result) => completed.push(result)), /Injected crash/);
  assert.equal(completed.length, 0);
  assert.equal(names(storage, "migration/").length, 0);
  storage.fail = "";
  await migration.executeSafMigration(storage, plan, async (result) => completed.push(result));
  assert.equal(completed.length, 1);
  assert.equal(names(storage, "migration/").length, 1);
  assert.equal((await core.readSafCommitted(storage)).source.entries.length, 1);
  assert.equal(names(storage, "commits/").length, 1);
});
test("same ID different content reports conflict without another marker", async () => {
  const storage = fresh(); await core.initializeSafSpace(storage);
  await migration.executeSafMigration(storage, await migration.planLegacySafMigration(legacy()), async () => {});
  const altered = legacy(); altered.records[0] = { ...altered.records[0], note: "不同内容" };
  await assert.rejects(migration.executeSafMigration(storage,
    await migration.planLegacySafMigration(altered), async () => {}), /same-ID content conflict/);
  assert.equal(names(storage, "commits/").length, 1);
});
test("unknown cloud owner stops dry-run before any write", async () => {
  const cloud = { ...item().archive, local_role: "cloud-offline-cache" };
  await assert.rejects(migration.planLegacySafMigration(legacy(cloud)), /Unknown cloud owner/);
});
test("dry-run catches detached media before creating a migration plan", async () => {
  const rows = legacy();
  rows.images[0] = { ...rows.images[0], record_id: "missing_record" };
  await assert.rejects(migration.planLegacySafMigration(rows), /Orphan legacy media/);
});
test("logout keeps cloud files; relogin A restores only A partition", async () => {
  const storage = fresh(); const cloud = item("cloud-offline-cache", userA);
  cloud.partition = format.safPartition(cloud.kind, await format.safAccountKey(userA));
  const local = item();
  const state = await make(storage, [local, cloud]);
  const before = storage.files.size;
  assert.deepEqual(core.visibleSafEntries(state.source, null).map((row) => row.id), [local.id]);
  assert.deepEqual(core.visibleSafEntries(state.source, userB).map((row) => row.id), [local.id]);
  assert.deepEqual(core.visibleSafEntries(state.source, userA).map((row) => row.id), [local.id, cloud.id]);
  assert.equal(storage.files.size, before);
});
test("account A and B cache remain isolated in the same LifeSpace directory", async () => {
  const storage = fresh();
  const a = item("cloud-offline-cache", userA);
  a.id = "a_cache";
  a.partition = format.safPartition(a.kind, await format.safAccountKey(userA));
  const b = item("cloud-offline-cache", userB);
  b.id = "b_cache";
  b.partition = format.safPartition(b.kind, await format.safAccountKey(userB));
  b.archive = { ...b.archive, id: "b_cloud" };
  b.records = [{ ...b.records[0], id: "b_record", archive_id: "b_cloud" }];
  b.images = [{ ...b.images[0], id: "b_image", archive_id: "b_cloud", record_id: "b_record" }];
  const state = await make(storage, [item(), a, b]);
  assert.deepEqual(core.visibleSafEntries(state.source, userA).map((row) => row.id), ["project_1", "a_cache"]);
  assert.deepEqual(core.visibleSafEntries(state.source, userB).map((row) => row.id), ["project_1", "b_cache"]);
  assert.equal(names(storage, `cloud/${await format.safAccountKey(userA)}/cache/`).length > 0, true);
  assert.equal(names(storage, `cloud/${await format.safAccountKey(userB)}/cache/`).length > 0, true);
});
