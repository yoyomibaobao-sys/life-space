import type { LocalArchive, LocalImage, LocalRecord } from "@/lib/local-offline-db";
import { safAccountKey, safPartition, type SafEntry } from "@/lib/local-saf-contract";

const isPending = (status?: string) =>
  status === "pending-cloud-sync" || status === "uploading" || status === "failed";

export type CloudMaterialization = {
  archive: LocalArchive; records: LocalRecord[]; images: LocalImage[];
};

/** A pending image carries its parent and all sibling images as one unit. */
export async function splitCloudMaterialization(input: CloudMaterialization): Promise<SafEntry[]> {
  const { archive, records, images } = input;
  const ownerUserId = archive.local_owner_user_id;
  if (!ownerUserId) throw Error("Unknown cloud owner; SAF partition refused.");
  const key = await safAccountKey(ownerUserId);
  const pendingCreate = archive.saf_cloud_pending_origin === "create-archive" ||
    (archive.local_role === "local-project" && archive.migration_status === "migrating" &&
      Boolean(archive.source_cloud_archive_id) && Boolean(archive.migration_cloud_archive_id) &&
      archive.sync?.status === "synced") ||
    (archive.sync?.operation_kind === "create-archive" &&
      (isPending(archive.sync.status) ||
        (archive.migration_status === "migrating" && Boolean(archive.source_cloud_archive_id))));
  const pendingCopy = archive.local_role === "saved-local-copy" && Boolean(archive.source_cloud_archive_id) &&
    (isPending(archive.sync?.status) || Boolean(archive.pending_sync_first_detected_at) ||
     Boolean(archive.saf_cloud_adoption_sha256));
  const pendingRecordIds = new Set(records.filter((record) => isPending(record.sync?.status) ||
    images.some((image) => image.record_id === record.id && isPending(image.sync?.status)))
    .map((record) => record.id));
  const recordIds = new Set(records.map((record) => record.id));
  if (records.some((record) => record.archive_id !== archive.id) ||
      images.some((image) => image.archive_id !== archive.id || !recordIds.has(image.record_id))) {
    throw Error("Detached cloud record or media; SAF partition refused.");
  }
  if (pendingCreate || pendingCopy) return [{ id: `pending_${archive.id}`, kind: "pending-cloud-user-data",
    partition: safPartition("pending-cloud-user-data", key), ownerUserId,
    archive, records, images }];
  if (archive.local_role !== "cloud-offline-cache") {
    throw Error("Cloud cache has wrong identity; SAF partition refused.");
  }
  const cache: SafEntry = { id: archive.id, kind: "cloud-offline-cache",
    partition: safPartition("cloud-offline-cache", key), ownerUserId, archive,
    records: records.filter((record) => !pendingRecordIds.has(record.id)),
    images: images.filter((image) => !pendingRecordIds.has(image.record_id)) };
  const hasPending = pendingRecordIds.size > 0 || isPending(archive.sync.status);
  if (!hasPending) return [cache];
  return [cache, { id: `pending_${archive.id}`, kind: "pending-cloud-user-data",
    partition: safPartition("pending-cloud-user-data", key), ownerUserId, archive,
    records: records.filter((record) => pendingRecordIds.has(record.id)),
    images: images.filter((image) => pendingRecordIds.has(image.record_id)) }];
}

/** Exactly one runtime archive per cloud identity; IDs and ownership must agree. */
export function materializeCloudEntries(entries: SafEntry[], ownerUserId: string): CloudMaterialization[] {
  const groups = new Map<string, SafEntry[]>();
  for (const entry of entries) {
    if (entry.kind === "local-project") continue;
    if (entry.ownerUserId !== ownerUserId || entry.archive.local_owner_user_id !== ownerUserId) {
      throw Error("Cloud partition owner mismatch; hydrate refused.");
    }
    const group = groups.get(entry.archive.id) || [];
    group.push(entry); groups.set(entry.archive.id, group);
  }
  return [...groups.values()].map((group) => {
    const cache = group.find((entry) => entry.kind === "cloud-offline-cache");
    const pending = group.find((entry) => entry.kind === "pending-cloud-user-data");
    if (group.length !== Number(Boolean(cache)) + Number(Boolean(pending))) {
      throw Error("Duplicate cloud partition entry; hydrate refused.");
    }
    if (cache && pending && cache.archive.source_cloud_archive_id !== pending.archive.source_cloud_archive_id) {
      throw Error("Cloud cache/pending archive identity conflict; hydrate refused.");
    }
    const records = new Map<string, LocalRecord>();
    const images = new Map<string, LocalImage>();
    for (const entry of [cache, pending]) {
      if (!entry) continue;
      for (const record of entry.records) {
        if (records.has(record.id)) throw Error("Duplicate cloud record across partitions.");
        records.set(record.id, record);
      }
      for (const image of entry.images) {
        if (images.has(image.id)) throw Error("Duplicate cloud image across partitions.");
        images.set(image.id, image);
      }
    }
    if ([...images.values()].some((image) => !records.has(image.record_id))) {
      throw Error("Detached cloud image across partitions.");
    }
    // Pending metadata represents the user's latest unsynced overlay. The
    // cache contributes all unaffected records and images, never a second row.
    return { archive: (pending || cache)!.archive,
      records: [...records.values()], images: [...images.values()] };
  });
}
