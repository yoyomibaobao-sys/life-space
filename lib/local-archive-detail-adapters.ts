import type { ArchiveDetailArchive, RecordItem } from "@/lib/archive-detail-types";
import type { MediaItem } from "@/lib/domain-types";
import {
  isPendingCloudSyncStatus,
  type LocalArchive,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";

export function isCloudOfflineCacheArchive(archive: LocalArchive) {
  return archive.local_role === "cloud-offline-cache";
}

export function canEditLocalArchiveFields(archive: LocalArchive) {
  return archive.local_role !== "cloud-offline-cache";
}

export function canAddLocalArchiveRecord(archive: LocalArchive) {
  return archive.status === "active";
}

export function canEditLocalArchiveRecord(
  archive: LocalArchive,
  record: LocalRecordWithImages,
) {
  if (archive.local_role !== "cloud-offline-cache") return true;
  return isPendingCloudSyncStatus(record.sync?.status);
}

export function localArchiveToDetailArchive(
  archive: LocalArchive,
  recordCount: number,
  fallbackTitle: string,
): ArchiveDetailArchive {
  return {
    id: archive.id,
    user_id: archive.local_owner_user_id || "local",
    title: archive.title || fallbackTitle,
    category: archive.category,
    created_at: archive.created_at,
    ended_at: archive.ended_at,
    last_record_time: archive.updated_at,
    is_public: false,
    default_record_visibility: "private",
    record_count: recordCount,
    status: archive.status,
    species_id: archive.plant_id,
    species_name_snapshot: archive.species_name,
    system_name: archive.system_name,
    source: archive.source || "local",
    note: archive.note,
    archive_summary: archive.archive_summary,
    planting_region: archive.planting_region,
    cycle_enabled: archive.cycle_enabled,
    next_cycle_name: archive.next_cycle_name,
    help_status: null,
  };
}

export function localRecordToRecordItem(
  record: LocalRecordWithImages,
  imageUrls: string[],
): RecordItem {
  return {
    id: record.id,
    location: record.location || null,
    cycle_id: record.cycle_id || null,
    note: record.note,
    record_time: record.record_time,
    visibility: "private",
    status_tag:
      record.source_cloud_status_tag === "help" || record.source_cloud_status_tag === "resolved"
        ? record.source_cloud_status_tag
        : null,
    comment_count: 0,
    media: record.images.flatMap((image, index) => {
      const url = imageUrls[index] || "";
      if (!url) return [];
      return [{
        id: image.id,
        record_id: record.id,
        type: "image",
        url,
        display_url: url,
        thumb_url: url,
        display_thumb_url: url,
        mime_type: image.mime_type,
        original_filename: image.name,
        size_bytes: image.cached_size || image.original_size || null,
        width: image.width || null,
        height: image.height || null,
        sort_order: image.sort_order,
        created_at: image.created_at,
      } satisfies MediaItem];
    }),
  };
}
