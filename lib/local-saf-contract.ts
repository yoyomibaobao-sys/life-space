import type { LocalArchive, LocalImage, LocalRecord, LocalTaxonomyItem } from "@/lib/local-offline-db";

export const SAF_SCHEMA = 1;
export const SAF_FORMAT = "LifeSpaceSAF";
export type SafKind = "local-project" | "cloud-offline-cache" | "pending-cloud-user-data";
export type SafPartition = "local" | `cloud/${string}/cache` | `cloud/${string}/pending`;
export type SafMediaRef = Omit<LocalImage, "blob"> & {
  file: string; sha256: string; byteLength: number;
};
export type SafEntry = {
  id: string; kind: SafKind; partition: SafPartition; ownerUserId?: string;
  archive: LocalArchive; records: LocalRecord[]; images: LocalImage[];
};
export type SafDocument = Omit<SafEntry, "images"> & {
  schemaVersion: number; localSpaceId: string; media: SafMediaRef[];
};
export type SafReference = {
  id: string; kind: SafKind; partition: SafPartition; ownerUserId?: string;
  file: string; sha256: string; recordCount: number; mediaCount: number;
};
export type SafSnapshot = {
  schemaVersion: number; localSpaceId: string; revision: string;
  entries: SafReference[]; taxonomy: LocalTaxonomyItem[];
  categoryDepths: Record<string, unknown>;
};
export type SafCommit = {
  schemaVersion: number; localSpaceId: string; sequence: number; revision: string;
  previousSha256: string | null; snapshotPath: string; snapshotSha256: string;
  createdAt: string;
};
export type SafManifest = {
  format: typeof SAF_FORMAT; schemaVersion: number; minReaderVersion: number;
  minWriterVersion: number; localSpaceId: string; createdAt: string; updatedAt: string;
  committedSequence: number; committedRevision: string;
  snapshotSha256: string; commitSha256: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,180}$/;
export function requireSafId(value: unknown, label: string) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw Error(`Invalid SAF ${label} ID.`);
  return value;
}
export function requireSafUuid(value: unknown, label: string) {
  if (typeof value !== "string" || !UUID.test(value)) throw Error(`Invalid SAF ${label} UUID.`);
  return value;
}
export function requireSafHash(value: unknown, label: string) {
  if (typeof value !== "string" || !HASH.test(value)) throw Error(`Invalid SAF ${label} SHA-256.`);
  return value;
}
export function safeSafPath(path: unknown): asserts path is string {
  if (typeof path !== "string" || path.length > 512 || path.startsWith("/") ||
      path.includes("\\") || path.includes(":") || path.includes("%") ||
      !/^[A-Za-z0-9._/-]+$/.test(path) ||
      path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw Error("Unsafe SAF relative path.");
  }
}
export function assertSafVersion(value: { schemaVersion: number; minReaderVersion?: number; minWriterVersion?: number }) {
  if (value?.schemaVersion !== SAF_SCHEMA ||
      (value.minReaderVersion != null && value.minReaderVersion > SAF_SCHEMA) ||
      (value.minWriterVersion != null && value.minWriterVersion > SAF_SCHEMA)) {
    throw Error("Unsupported SAF schemaVersion or compatible reader/writer version.");
  }
}
export async function safSha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function safAccountKey(userId: string) {
  requireSafUuid(userId, "cloud user");
  return safSha256(new TextEncoder().encode(`LifeSpace/cloud-account/v1\0${userId.toLowerCase()}`));
}
export function classifyLegacySafArchive(archive: LocalArchive): SafKind {
  if (archive.saf_cloud_pending_origin === "create-archive") return "pending-cloud-user-data";
  if (archive.local_role === "local-project" && archive.migration_status === "migrating" &&
      archive.source_cloud_archive_id && archive.migration_cloud_archive_id &&
      archive.sync?.status === "synced") return "pending-cloud-user-data";
  if (archive.sync?.operation_kind === "create-archive" &&
      (["pending-cloud-sync", "uploading", "failed"].includes(archive.sync.status) ||
       (archive.migration_status === "migrating" && Boolean(archive.source_cloud_archive_id)))) {
    return "pending-cloud-user-data";
  }
  if (archive.local_role === "cloud-offline-cache") return "cloud-offline-cache";
  if (archive.local_role === "saved-local-copy" && archive.source_cloud_archive_id &&
      (["pending-cloud-sync", "uploading", "failed"].includes(archive.sync?.status) ||
       Boolean(archive.pending_sync_first_detected_at) ||
       Boolean(archive.saf_cloud_adoption_sha256))) return "pending-cloud-user-data";
  return "local-project";
}
export function safPartition(kind: SafKind, accountKey?: string): SafPartition {
  if (kind === "local-project") return "local";
  requireSafHash(accountKey, "accountKey");
  return `cloud/${accountKey}/${kind === "cloud-offline-cache" ? "cache" : "pending"}`;
}
export function assertSafManifest(value: SafManifest) {
  if (value?.format !== SAF_FORMAT) throw Error("Invalid LifeSpace SAF manifest.");
  assertSafVersion(value);
  requireSafUuid(value.localSpaceId, "localSpaceId");
  requireSafUuid(value.committedRevision, "committed revision");
  requireSafHash(value.snapshotSha256, "snapshot");
  requireSafHash(value.commitSha256, "commit");
  if (!Number.isSafeInteger(value.committedSequence) || value.committedSequence < 1 ||
      !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw Error("Invalid SAF manifest checkpoint.");
  }
}
export function assertSafCommit(value: SafCommit) {
  assertSafVersion(value);
  requireSafUuid(value.localSpaceId, "localSpaceId");
  requireSafUuid(value.revision, "revision");
  requireSafHash(value.snapshotSha256, "snapshot");
  if (value.previousSha256 !== null) requireSafHash(value.previousSha256, "previous commit");
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1 ||
      (value.sequence === 1) !== (value.previousSha256 === null) ||
      value.snapshotPath !== `snapshots/${value.revision}.json` ||
      !Number.isFinite(Date.parse(value.createdAt))) throw Error("Invalid SAF commit chain.");
}
export function assertSafSnapshot(value: SafSnapshot) {
  assertSafVersion(value);
  requireSafUuid(value.localSpaceId, "localSpaceId");
  requireSafUuid(value.revision, "snapshot revision");
  if (!Array.isArray(value.entries) || !Array.isArray(value.taxonomy) ||
      !value.categoryDepths || typeof value.categoryDepths !== "object") throw Error("Invalid SAF snapshot.");
  const ids = new Set<string>(); const paths = new Set<string>();
  for (const ref of value.entries) {
    requireSafId(ref.id, "project"); requireSafHash(ref.sha256, "document");
    assertSafIdentity(ref.kind, ref.partition, ref.ownerUserId);
    safeSafPath(ref.file);
    if (ref.file !== `${ref.partition}/projects/${ref.id}/${value.revision}.json` ||
        ids.has(ref.id) || paths.has(ref.file) ||
        !Number.isSafeInteger(ref.recordCount) || ref.recordCount < 0 ||
        !Number.isSafeInteger(ref.mediaCount) || ref.mediaCount < 0) {
      throw Error("Duplicate or unsafe SAF project reference.");
    }
    ids.add(ref.id); paths.add(ref.file);
  }
  const taxonomyIds = new Set<string>();
  for (const row of value.taxonomy) {
    requireSafId(row.id, "taxonomy");
    if (taxonomyIds.has(row.id)) throw Error("Duplicate SAF taxonomy ID.");
    taxonomyIds.add(row.id);
  }
}
export function assertSafIdentity(kind: SafKind, partition: SafPartition, ownerUserId?: string) {
  if (!["local-project", "cloud-offline-cache", "pending-cloud-user-data"].includes(kind)) {
    throw Error("Invalid SAF data kind.");
  }
  if (kind === "local-project") {
    if (partition !== "local" || ownerUserId) throw Error("Local SAF data cannot have cloud ownership.");
  } else {
    requireSafUuid(ownerUserId, "cloud owner");
    if (!/^cloud\/[0-9a-f]{64}\/(cache|pending)$/.test(partition) ||
        !partition.endsWith(kind === "cloud-offline-cache" ? "/cache" : "/pending")) {
      throw Error("Cloud SAF data is in the wrong namespace.");
    }
  }
}
export function assertSafLocalCloudTransfer(archive: LocalArchive, kind: SafKind) {
  const transfer = archive.local_cloud_transfer;
  if (transfer == null) return;
  if (kind !== "local-project" || archive.local_role === "cloud-offline-cache" ||
      classifyLegacySafArchive(archive) !== "local-project" ||
      !["prepared", "cloud-created", "complete"].includes(transfer.stage)) {
    throw Error("Invalid local-project cloud transfer state.");
  }
  requireSafUuid(transfer.targetCloudArchiveId, "target cloud archive");
  requireSafUuid(transfer.localTransferToken, "local transfer token");
  requireSafUuid(transfer.targetUserId, "target user");
  if (transfer.targetCloudArchiveId === transfer.localTransferToken) {
    throw Error("Cloud archive ID and transfer token must be independent.");
  }
}
export async function assertSafDocument(value: SafDocument) {
  assertSafVersion(value); requireSafUuid(value.localSpaceId, "localSpaceId");
  assertSafIdentity(value.kind, value.partition, value.ownerUserId);
  requireSafId(value.id, "entry");
  requireSafId(value.archive?.id, "project");
  if (value.archive.saf_local_space_id && value.archive.saf_local_space_id !== value.localSpaceId) {
    throw Error("SAF localSpaceId mismatch.");
  }
  assertSafLocalCloudTransfer(value.archive, value.kind);
  if (value.archive.saf_cloud_pending_origin &&
      (value.archive.saf_cloud_pending_origin !== "create-archive" ||
       value.archive.local_role === "cloud-offline-cache" ||
       value.kind !== "pending-cloud-user-data")) {
    throw Error("Invalid pending cloud create identity.");
  }
  if (value.kind === "local-project" && (value.archive.local_role === "cloud-offline-cache" ||
      classifyLegacySafArchive(value.archive) !== "local-project")) throw Error("Cloud data cannot enter local namespace.");
  if (value.kind === "cloud-offline-cache" && value.archive.local_role !== "cloud-offline-cache") {
    throw Error("Cloud cache has wrong identity.");
  }
  if (value.kind === "pending-cloud-user-data" &&
      value.archive.local_role !== "cloud-offline-cache" &&
      classifyLegacySafArchive(value.archive) !== "pending-cloud-user-data") {
    throw Error("Pending data has wrong identity.");
  }
  if (value.ownerUserId && value.archive.local_owner_user_id !== value.ownerUserId) {
    throw Error("Cloud ownerUserId does not match archive ownership.");
  }
  if (value.ownerUserId && value.partition !== safPartition(value.kind, await safAccountKey(value.ownerUserId))) {
    throw Error("Cloud accountKey does not match ownerUserId.");
  }
  if (!Array.isArray(value.records) || !Array.isArray(value.media)) throw Error("Invalid SAF relations.");
  const records = new Set<string>(); const media = new Set<string>();
  for (const row of value.records) {
    requireSafId(row?.id, "record");
    if (row.archive_id !== value.archive.id || records.has(row.id)) throw Error("Duplicate or detached SAF record.");
    records.add(row.id);
  }
  for (const row of value.media) {
    requireSafId(row?.id, "media"); requireSafHash(row.sha256, "media");
    safeSafPath(row.file);
    if (row.file !== `${value.partition}/media/${row.id}/${row.sha256}.bin` ||
        !Number.isSafeInteger(row.byteLength) || row.byteLength < 0 ||
        row.archive_id !== value.archive.id || !records.has(row.record_id) || media.has(row.id)) {
      throw Error("Duplicate, detached or unsafe SAF media.");
    }
    media.add(row.id);
  }
}
