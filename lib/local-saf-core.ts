import type { LocalImage, LocalTaxonomyItem } from "@/lib/local-offline-db";
import {
  SAF_FORMAT, SAF_SCHEMA, assertSafCommit, assertSafDocument, assertSafManifest,
  assertSafSnapshot, requireSafUuid, safeSafPath, safSha256,
  type SafCommit, type SafDocument, type SafEntry, type SafManifest,
  type SafMediaRef, type SafSnapshot,
} from "@/lib/local-saf-contract";

/** An adapter must create immutable files without replacement. Checkpoints may lag commits. */
export interface SafStorage {
  list(path: string): Promise<string[]>;
  read(path: string): Promise<Uint8Array | null>;
  /** Optional bounded transport optimization; every returned byte is still verified here. */
  readMany?(paths: string[]): Promise<Map<string, Uint8Array | null>>;
  create(path: string, bytes: Uint8Array): Promise<void>;
  checkpoint(path: "manifest.json", bytes: Uint8Array): Promise<void>;
}
export type SafContent = {
  entries: SafEntry[]; taxonomy: LocalTaxonomyItem[]; categoryDepths: Record<string, unknown>;
};
export type SafState = {
  manifest: SafManifest; commit: SafCommit; source: SafContent;
};
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value));
const parse = <T>(value: Uint8Array) => JSON.parse(decoder.decode(value)) as T;
let commitQueue: Promise<void> = Promise.resolve();
type VerifiedHead = { commit: SafCommit; snapshot: SafSnapshot; hash: string };
type HeadCache = { identity: { localSpaceId: string; createdAt: string };
  markers: string[]; checkpointSha256: string | null; head: VerifiedHead };
const verifiedHeads = new WeakMap<SafStorage, HeadCache>();
const pendingVerifications = new WeakMap<SafStorage, Promise<SafState | null>>();
const directoryEpochs = new WeakMap<SafStorage, number>();

/** A directory selection changes the native bridge's tree without changing its adapter object. */
export function invalidateSafVerifiedHead(storage: SafStorage) {
  verifiedHeads.delete(storage);
  pendingVerifications.delete(storage);
  directoryEpochs.set(storage, (directoryEpochs.get(storage) ?? 0) + 1);
}

async function required(storage: SafStorage, path: string, sha256?: string) {
  safeSafPath(path);
  const data = await storage.read(path);
  if (!data) throw Error(`Missing SAF file: ${path}`);
  if (sha256 && await safSha256(data) !== sha256) throw Error(`SAF hash mismatch: ${path}`);
  return data;
}
async function createVerified(storage: SafStorage, path: string, data: Uint8Array) {
  safeSafPath(path);
  const hash = await safSha256(data);
  const existing = await storage.read(path);
  if (existing) {
    if (await safSha256(existing) !== hash) throw Error(`SAF file conflict: ${path}`);
  } else {
    await storage.create(path, data);
  }
  await required(storage, path, hash);
  return hash;
}

async function readIdentity(storage: SafStorage): Promise<{ localSpaceId: string; createdAt: string } | null> {
  const raw = await storage.read("identity.json");
  if (!raw) return null;
  const identity = parse<{ format: string; schemaVersion: number; localSpaceId: string; createdAt: string }>(raw);
  if (identity.format !== SAF_FORMAT || identity.schemaVersion !== SAF_SCHEMA ||
      !Number.isFinite(Date.parse(identity.createdAt))) throw Error("Corrupt SAF identity.");
  requireSafUuid(identity.localSpaceId, "localSpaceId");
  return identity;
}

async function verifyMarker(storage: SafStorage, name: string,
  identity: { localSpaceId: string }, previous: { sequence: number; hash: string } | null): Promise<VerifiedHead> {
  const markerBytes = await required(storage, `commits/${name}`);
  const commit = parse<SafCommit>(markerBytes);
  assertSafCommit(commit);
  const hash = await safSha256(markerBytes);
  if (name !== `${String(commit.sequence).padStart(12, "0")}-${commit.revision}.json` ||
      commit.localSpaceId !== identity.localSpaceId ||
      commit.sequence !== (previous?.sequence ?? 0) + 1 ||
      commit.previousSha256 !== (previous?.hash ?? null)) throw Error("Broken SAF commit chain.");
  const snapshot = parse<SafSnapshot>(await required(storage, commit.snapshotPath, commit.snapshotSha256));
  assertSafSnapshot(snapshot);
  if (snapshot.localSpaceId !== identity.localSpaceId || snapshot.revision !== commit.revision) {
    throw Error("SAF snapshot identity mismatch.");
  }
  for (const ref of snapshot.entries) {
    const doc = parse<SafDocument>(await required(storage, ref.file, ref.sha256));
    await assertSafDocument(doc);
    if (doc.localSpaceId !== identity.localSpaceId || doc.id !== ref.id ||
        doc.kind !== ref.kind || doc.partition !== ref.partition ||
        doc.ownerUserId !== ref.ownerUserId || doc.records.length !== ref.recordCount ||
        doc.media.length !== ref.mediaCount) throw Error("SAF project reference mismatch.");
  }
  return { commit, snapshot, hash };
}

/** Prefetch only immutable JSON for one small window; validation remains in verifyMarker. */
async function prefetchVerificationWindow(storage: SafStorage, names: string[]): Promise<SafStorage> {
  if (!storage.readMany) return storage;
  const prefetched = new Map<string, Uint8Array | null>();
  const wrapped: SafStorage = { ...storage,
    read: (path) => prefetched.has(path) ? Promise.resolve(prefetched.get(path)!) : storage.read(path),
  };
  async function fetch(paths: string[]) {
    const unique = [...new Set(paths)].filter((path) => !prefetched.has(path));
    if (!unique.length) return;
    try {
      for (let offset = 0; offset < unique.length; offset += 16) {
        const batch = unique.slice(offset, offset + 16);
        const result = await storage.readMany!(batch);
        if (result.size !== batch.length || batch.some((path) => !result.has(path))) {
          throw Error("Incomplete SAF batch response.");
        }
        for (const path of batch) prefetched.set(path, result.get(path)!);
      }
    } catch (error) {
      // Large older documents remain readable by the original 64 MiB chunk path.
      if (error instanceof Error && /SAF batch byte limit exceeded/.test(error.message)) return false;
      throw error;
    }
    return true;
  }
  const markerPaths = names.map((name) => `commits/${name}`);
  if (!await fetch(markerPaths)) return storage;
  let snapshotPaths: string[];
  try {
    snapshotPaths = markerPaths.map((path) => {
      const raw = prefetched.get(path);
      if (!raw) throw Error("Missing marker; verify original recovery path.");
      const commit = parse<SafCommit>(raw);
      assertSafCommit(commit);
      safeSafPath(commit.snapshotPath);
      return commit.snapshotPath;
    });
  } catch { return wrapped; }
  if (!await fetch(snapshotPaths)) return storage;
  let projectPaths: string[];
  try {
    projectPaths = snapshotPaths.flatMap((path) => {
      const raw = prefetched.get(path);
      if (!raw) throw Error("Missing snapshot; verify original recovery path.");
      const snapshot = parse<SafSnapshot>(raw);
      assertSafSnapshot(snapshot);
      return snapshot.entries.map((entry) => { safeSafPath(entry.file); return entry.file; });
    });
  } catch { return wrapped; }
  if (!await fetch(projectPaths)) return storage;
  return wrapped;
}

/** Concurrent readers of one directory share the same complete verification. */
export async function readSafCommitted(storage: SafStorage): Promise<SafState | null> {
  const pending = pendingVerifications.get(storage);
  if (pending) return pending;
  const epoch = directoryEpochs.get(storage) ?? 0;
  const verification = readSafCommittedUnshared(storage, epoch);
  pendingVerifications.set(storage, verification);
  try { return await verification; }
  finally {
    if (pendingVerifications.get(storage) === verification) pendingVerifications.delete(storage);
  }
}

/** Manifest is only a hint. A complete, hash-linked marker chain is authoritative. */
async function readSafCommittedUnshared(storage: SafStorage, epoch: number): Promise<SafState | null> {
  const identity = await readIdentity(storage);
  const root = await storage.list("");
  if (!identity && root.length) throw Error("Nonempty unknown LifeSpace directory; initialization refused.");
  if (!identity) return null;
  let checkpointHint: SafManifest | null = null;
  let checkpointSha256: string | null = null;
  try {
    const checkpointBytes = await storage.read("manifest.json");
    if (checkpointBytes) {
      checkpointHint = parse<SafManifest>(checkpointBytes);
      checkpointSha256 = await safSha256(checkpointBytes);
    }
  } catch { /* A damaged checkpoint is not a commit; inspect the immutable chain. */ }
  if (checkpointHint?.localSpaceId && checkpointHint.localSpaceId !== identity.localSpaceId) {
    throw Error("SAF identity.json / manifest.json localSpaceId mismatch; connection refused.");
  }
  const markers = (await storage.list("commits"))
    .filter((name) => /^\d{12}-[0-9a-f-]{36}\.json$/.test(name)).sort();
  if (new Set(markers.map((name) => name.slice(0, 12))).size !== markers.length) {
    throw Error("Conflicting SAF commit sequence; data retained.");
  }
  const cached = verifiedHeads.get(storage);
  const sameDirectory = cached?.identity.localSpaceId === identity.localSpaceId &&
    cached.identity.createdAt === identity.createdAt;
  const validCheckpoint = checkpointHint && (() => {
    try { assertSafManifest(checkpointHint); return true; } catch { return false; }
  })();
  const knownPrefix = sameDirectory && markers.length >= cached.markers.length &&
    cached.markers.every((name, index) => markers[index] === name);
  const checkpointUnchanged = checkpointSha256 === cached?.checkpointSha256;
  // A changed/damaged checkpoint or marker list requires the authoritative full recovery scan.
  const append = knownPrefix && validCheckpoint && checkpointUnchanged &&
    markers.length > cached.markers.length;
  const sameHead = knownPrefix && validCheckpoint && checkpointUnchanged &&
    markers.length === cached.markers.length;
  let head: VerifiedHead | null = null;
  if (sameHead) {
    try {
      const previous = cached.head.commit.sequence === 1 ? null : {
        sequence: cached.head.commit.sequence - 1, hash: cached.head.commit.previousSha256!,
      };
      const verified = await verifyMarker(storage, markers.at(-1)!, identity, previous);
      if (verified.hash === cached.head.hash) head = verified;
    } catch { /* Recover from immutable markers if the cached head changed. */ }
  } else if (append) {
    head = cached.head;
    for (const name of markers.slice(cached.markers.length)) {
      try { head = await verifyMarker(storage, name, identity,
        { sequence: head.commit.sequence, hash: head.hash }); }
      catch { head = null; break; }
    }
  }
  if (!head) {
    recovery: for (let offset = 0; offset < markers.length; offset += 16) {
      const window = markers.slice(offset, offset + 16);
      const reads = await prefetchVerificationWindow(storage, window);
      for (const name of window) {
        try {
          head = await verifyMarker(reads, name, identity,
            head ? { sequence: head.commit.sequence, hash: head.hash } : null);
        } catch (error) {
          // Only an invalid trailing commit may be ignored. Never skip a gap to accept a later marker.
          // A corrupt first marker is not an empty space; report recovery failure.
          if (!head) throw Error("No valid SAF commit; data retained.", { cause: error });
          break recovery;
        }
      }
    }
  }
  if (!head) {
    verifiedHeads.delete(storage);
    if (markers.length || root.includes("manifest.json")) throw Error("No valid SAF commit; data retained.");
    return null; // Valid identity, but initial commit has not completed.
  }
  // The root checkpoint is accepted only if its marker and snapshot match. It never advances head.
  try {
    if (checkpointHint) {
      const hint = checkpointHint;
      assertSafManifest(hint);
      if (hint.localSpaceId !== identity.localSpaceId || hint.committedRevision !== head.commit.revision ||
          hint.commitSha256 !== head.hash || hint.snapshotSha256 !== head.commit.snapshotSha256) {
        // A stale or half-written checkpoint is ignored in favor of the commit chain.
      }
    }
  } catch { /* The immutable chain remains authoritative. */ }
  const entries: SafEntry[] = [];
  const allRecords = new Set<string>(); const allMedia = new Set<string>();
  for (const ref of head.snapshot.entries) {
    const doc = parse<SafDocument>(await required(storage, ref.file, ref.sha256));
    const images: LocalImage[] = [];
    for (const media of doc.media) {
      if (allMedia.has(media.id)) throw Error("Duplicate SAF media ID.");
      allMedia.add(media.id);
      const content = await required(storage, media.file, media.sha256);
      if (content.byteLength !== media.byteLength) throw Error("SAF media size mismatch.");
      const { file: _file, sha256: _sha, byteLength: _bytes, ...metadata } = media;
      images.push({ ...metadata, blob: new Blob([content as BlobPart], { type: media.mime_type }) });
    }
    for (const record of doc.records) {
      if (allRecords.has(record.id)) throw Error("Duplicate SAF record ID.");
      allRecords.add(record.id);
    }
    entries.push({ id: doc.id, kind: doc.kind, partition: doc.partition, ownerUserId: doc.ownerUserId,
      archive: doc.archive, records: doc.records, images });
  }
  const manifest: SafManifest = {
    format: SAF_FORMAT, schemaVersion: SAF_SCHEMA, minReaderVersion: 1, minWriterVersion: 1,
    localSpaceId: identity.localSpaceId, createdAt: identity.createdAt,
    updatedAt: head.commit.createdAt, committedSequence: head.commit.sequence,
    committedRevision: head.commit.revision, snapshotSha256: head.commit.snapshotSha256,
    commitSha256: head.hash,
  };
  if ((directoryEpochs.get(storage) ?? 0) !== epoch) {
    throw Error("SAF directory changed during verification; reconnect and retry.");
  }
  verifiedHeads.set(storage, { identity, markers, checkpointSha256, head });
  return { manifest, commit: head.commit, source: {
    entries, taxonomy: head.snapshot.taxonomy, categoryDepths: head.snapshot.categoryDepths,
  } };
}

/** Explicit initialization; never use on a nonempty directory. No application call site yet. */
export async function initializeSafSpace(storage: SafStorage) {
  if ((await storage.list("")).length) throw Error("Cannot initialize a nonempty SAF directory.");
  const identity = { format: SAF_FORMAT, schemaVersion: SAF_SCHEMA,
    localSpaceId: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await createVerified(storage, "identity.json", bytes(identity));
  return identity.localSpaceId;
}

async function commitSafContentUnlocked(storage: SafStorage, source: SafContent,
  expectedRevision: string | null) {
  const identity = await readIdentity(storage);
  if (!identity) throw Error("Initialize or reconnect a LifeSpace directory first.");
  const current = await readSafCommitted(storage);
  if ((current?.commit.revision ?? null) !== expectedRevision) throw Error("SAF revision conflict.");
  const revision = crypto.randomUUID();
  const references: SafSnapshot["entries"] = [];
  const ids = new Set<string>();
  const recordIds = new Set<string>();
  const mediaIds = new Set<string>();
  for (const entry of source.entries) {
    if (ids.has(entry.id)) throw Error("Duplicate SAF project ID.");
    ids.add(entry.id);
    for (const record of entry.records) {
      if (recordIds.has(record.id)) throw Error("Duplicate SAF record ID.");
      recordIds.add(record.id);
    }
    for (const image of entry.images) {
      if (mediaIds.has(image.id)) throw Error("Duplicate SAF media ID.");
      mediaIds.add(image.id);
    }
    const media: SafMediaRef[] = [];
    for (const image of entry.images) {
      const content = new Uint8Array(await image.blob.arrayBuffer());
      const hash = await safSha256(content);
      const file = `${entry.partition}/media/${image.id}/${hash}.bin`;
      const { blob: _blob, ...metadata } = image;
      media.push({ ...metadata, file, sha256: hash, byteLength: content.byteLength });
      await createVerified(storage, file, content);
    }
    const doc: SafDocument = { id: entry.id, schemaVersion: SAF_SCHEMA, localSpaceId: identity.localSpaceId,
      kind: entry.kind, partition: entry.partition, ownerUserId: entry.ownerUserId,
      archive: entry.archive, records: entry.records, media };
    await assertSafDocument(doc);
    const file = `${entry.partition}/projects/${entry.id}/${revision}.json`;
    const hash = await createVerified(storage, file, bytes(doc));
    references.push({ id: entry.id, kind: entry.kind, partition: entry.partition,
      ownerUserId: entry.ownerUserId, file, sha256: hash,
      recordCount: entry.records.length, mediaCount: media.length });
  }
  const snapshot: SafSnapshot = { schemaVersion: SAF_SCHEMA, localSpaceId: identity.localSpaceId,
    revision, entries: references, taxonomy: source.taxonomy, categoryDepths: source.categoryDepths };
  assertSafSnapshot(snapshot);
  const snapshotPath = `snapshots/${revision}.json`;
  const snapshotSha256 = await createVerified(storage, snapshotPath, bytes(snapshot));
  const createdAt = new Date().toISOString();
  const marker: SafCommit = { schemaVersion: SAF_SCHEMA, localSpaceId: identity.localSpaceId,
    sequence: (current?.commit.sequence ?? 0) + 1, revision,
    previousSha256: current?.manifest.commitSha256 ?? null,
    snapshotPath, snapshotSha256, createdAt };
  assertSafCommit(marker);
  // Recheck before the marker; the bridge serializes this directory's writers.
  if ((await readSafCommittedUnshared(storage, directoryEpochs.get(storage) ?? 0))?.commit.revision !==
      (current?.commit.revision)) {
    throw Error("SAF concurrent revision conflict.");
  }
  const markerPath = `commits/${String(marker.sequence).padStart(12, "0")}-${revision}.json`;
  const markerHash = await createVerified(storage, markerPath, bytes(marker));
  const manifest: SafManifest = { format: SAF_FORMAT, schemaVersion: SAF_SCHEMA,
    minReaderVersion: 1, minWriterVersion: 1, localSpaceId: identity.localSpaceId,
    createdAt: identity.createdAt, updatedAt: createdAt,
    committedSequence: marker.sequence, committedRevision: revision,
    snapshotSha256, commitSha256: markerHash };
  assertSafManifest(manifest);
  // A failed checkpoint cannot undo the verified commit. Recovery scans commits.
  let checkpointSha256 = verifiedHeads.get(storage)?.checkpointSha256 ?? null;
  try {
    const checkpointBytes = bytes(manifest);
    await storage.checkpoint("manifest.json", checkpointBytes);
    checkpointSha256 = await safSha256(checkpointBytes);
  } catch { /* recoverable */ }
  const prior = verifiedHeads.get(storage);
  if ((!current && !prior) || (prior?.identity.localSpaceId === identity.localSpaceId &&
      prior.head.commit.revision === current?.commit.revision)) {
    verifiedHeads.set(storage, { identity, checkpointSha256,
      markers: [...(prior?.markers ?? []), markerPath.slice("commits/".length)],
      head: { commit: marker, snapshot, hash: markerHash } });
  }
  return manifest;
}

/** Serialize this runtime's writers; revision checking still rejects stale callers. */
export async function commitSafContent(storage: SafStorage, source: SafContent,
  expectedRevision: string | null) {
  const previous = commitQueue;
  let release!: () => void;
  commitQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await commitSafContentUnlocked(storage, source, expectedRevision); }
  finally { release(); }
}

/** Cloud visibility is a read projection; no file is deleted when auth changes. */
export function visibleSafEntries(source: SafContent, verifiedUserId: string | null) {
  return source.entries.filter((entry) =>
    (entry.kind === "local-project" && entry.archive.local_cloud_transfer?.stage !== "complete") ||
    Boolean(verifiedUserId && entry.ownerUserId === verifiedUserId));
}
