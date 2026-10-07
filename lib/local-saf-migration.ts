import type { LocalArchive, LocalImage, LocalRecord, LocalTaxonomyItem } from "@/lib/local-offline-db";
import {
  classifyLegacySafArchive, safAccountKey, safPartition, safSha256,
  type SafEntry,
} from "@/lib/local-saf-contract";
import {
  commitSafContent, readSafCommitted, type SafContent, type SafStorage,
} from "@/lib/local-saf-core";
import { splitCloudMaterialization } from "@/lib/local-saf-cloud-partition";

export type LegacySafRows = {
  archives: LocalArchive[]; records: LocalRecord[]; images: LocalImage[];
  taxonomy: LocalTaxonomyItem[]; categoryDepths: Record<string, unknown>;
};
export type SafMigrationPlan = {
  source: SafContent;
  inventory: { local: number; cache: number; pending: number; records: number; media: number };
  fingerprint: string;
};

async function recordVerifiedMigration(storage: SafStorage, plan: SafMigrationPlan,
  localSpaceId: string, revision: string) {
  const file = `migration/${plan.fingerprint}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, localSpaceId,
    revision, fingerprint: plan.fingerprint, inventory: plan.inventory }));
  const existing = await storage.read(file);
  if (existing) {
    if (await safSha256(existing) !== await safSha256(bytes)) {
      throw Error("SAF migration completion marker conflict.");
    }
  } else {
    await storage.create(file, bytes);
  }
  const verified = await storage.read(file);
  if (!verified || verified.byteLength !== bytes.byteLength ||
      await safSha256(verified) !== await safSha256(bytes)) {
    throw Error("SAF migration completion marker verification failed.");
  }
}

export async function safContentFingerprint(source: SafContent) {
  const entries = [];
  for (const entry of [...source.entries].sort((a, b) => a.id.localeCompare(b.id))) {
    const images = [];
    for (const image of [...entry.images].sort((a, b) => a.id.localeCompare(b.id))) {
      const { blob, ...metadata } = image;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      images.push({ ...metadata, byteLength: bytes.length, sha256: await safSha256(bytes) });
    }
    entries.push({ id: entry.id, kind: entry.kind, partition: entry.partition,
      ownerUserId: entry.ownerUserId, archive: entry.archive,
      records: [...entry.records].sort((a, b) => a.id.localeCompare(b.id)), images });
  }
  return safSha256(new TextEncoder().encode(JSON.stringify({ entries,
    taxonomy: [...source.taxonomy].sort((a, b) => a.id.localeCompare(b.id)),
    categoryDepths: source.categoryDepths })));
}

/** Read-only inventory/plan. Never infer an account from a remembered guest owner. */
export async function planLegacySafMigration(rows: LegacySafRows): Promise<SafMigrationPlan> {
  const entries: SafEntry[] = [];
  const archiveIds = new Set<string>();
  for (const archive of rows.archives) {
    if (archiveIds.has(archive.id)) throw Error("Duplicate legacy project ID.");
    archiveIds.add(archive.id);
    const records = rows.records.filter((row) => row.archive_id === archive.id);
    const images = rows.images.filter((row) => row.archive_id === archive.id);
    const pendingSavedCopy = archive.local_role === "saved-local-copy" &&
      Boolean(archive.source_cloud_archive_id) &&
      (records.some((row) => ["pending-cloud-sync", "uploading", "failed"].includes(row.sync?.status)) ||
       images.some((row) => ["pending-cloud-sync", "uploading", "failed"].includes(row.sync?.status)));
    const kind = pendingSavedCopy ? "pending-cloud-user-data" : classifyLegacySafArchive(archive);
    const ownerUserId = kind === "local-project" ? undefined : archive.local_owner_user_id || undefined;
    if (kind !== "local-project" && !ownerUserId) throw Error("Unknown cloud owner; migration stopped.");
    const partition = safPartition(kind, ownerUserId ? await safAccountKey(ownerUserId) : undefined);
    if (kind === "local-project") entries.push({ id: archive.id, kind, partition,
      archive, records, images });
    else entries.push(...await splitCloudMaterialization({ archive: pendingSavedCopy &&
      classifyLegacySafArchive(archive) === "local-project"
      ? { ...archive, pending_sync_first_detected_at: archive.updated_at } : archive, records, images }));
  }
  const recordIds = new Set<string>();
  for (const row of rows.records) {
    if (!archiveIds.has(row.archive_id)) throw Error("Orphan legacy record.");
    if (recordIds.has(row.id)) throw Error("Duplicate legacy record ID.");
    recordIds.add(row.id);
  }
  const mediaIds = new Set<string>();
  for (const row of rows.images) {
    if (!archiveIds.has(row.archive_id) || !rows.records.some((record) =>
      record.id === row.record_id && record.archive_id === row.archive_id)) {
      throw Error("Orphan legacy media.");
    }
    if (mediaIds.has(row.id)) throw Error("Duplicate legacy media ID.");
    mediaIds.add(row.id);
  }
  const source = { entries, taxonomy: rows.taxonomy.filter((row) => row.local_only),
    categoryDepths: rows.categoryDepths };
  return { source, inventory: {
    local: entries.filter((row) => row.kind === "local-project").length,
    cache: entries.filter((row) => row.kind === "cloud-offline-cache").length,
    pending: entries.filter((row) => row.kind === "pending-cloud-user-data").length,
    records: entries.reduce((sum, row) => sum + row.records.length, 0),
    media: entries.reduce((sum, row) => sum + row.images.length, 0),
  }, fingerprint: await safContentFingerprint(source) };
}

/** Explicit migration engine; no app startup or page invokes this in this phase. */
export async function executeSafMigration(storage: SafStorage, plan: SafMigrationPlan,
  markComplete: (result: { localSpaceId: string; revision: string; fingerprint: string }) => Promise<void>) {
  const previous = await readSafCommitted(storage);
  if (previous) {
    const old = previous.source;
    const byId = new Map(old.entries.map((entry) => [entry.id, entry]));
    for (const next of plan.source.entries) {
      const existing = byId.get(next.id);
      if (existing && await safContentFingerprint({ entries: [existing], taxonomy: [], categoryDepths: {} }) !==
        await safContentFingerprint({ entries: [next], taxonomy: [], categoryDepths: {} })) {
        throw Error(`SAF same-ID content conflict: ${next.id}`);
      }
    }
    if (await safContentFingerprint(old) === plan.fingerprint) {
      await recordVerifiedMigration(storage, plan, previous.manifest.localSpaceId,
        previous.commit.revision);
      await markComplete({ localSpaceId: previous.manifest.localSpaceId,
        revision: previous.commit.revision, fingerprint: plan.fingerprint });
      return { kind: "already-migrated" as const, revision: previous.commit.revision };
    }
    if (old.entries.length) throw Error("SAF directory contains other data; migration needs explicit reconciliation.");
  }
  const manifest = await commitSafContent(storage, plan.source, previous?.commit.revision ?? null);
  const verified = await readSafCommitted(storage);
  if (!verified || verified.commit.revision !== manifest.committedRevision ||
      await safContentFingerprint(verified.source) !== plan.fingerprint ||
      verified.source.entries.reduce((n, entry) => n + entry.records.length, 0) !== plan.inventory.records ||
      verified.source.entries.reduce((n, entry) => n + entry.images.length, 0) !== plan.inventory.media) {
    throw Error("SAF migration verification failed; legacy IndexedDB retained.");
  }
  await recordVerifiedMigration(storage, plan, verified.manifest.localSpaceId,
    verified.commit.revision);
  await markComplete({ localSpaceId: verified.manifest.localSpaceId,
    revision: verified.commit.revision, fingerprint: plan.fingerprint });
  return { kind: "migrated" as const, revision: verified.commit.revision };
}
