"use client";

import type { ArchiveItem } from "@/lib/archive-page-types";
import type { MediaItem } from "@/lib/domain-types";
import type { PlantingRegion } from "@/lib/planting-region";
import { attachMediaDisplayUrls } from "@/lib/media-urls";
import { supabase } from "@/lib/supabase";
import {
  getCloudOfflineCacheByCloudSource,
  pruneCloudOfflineCacheForEndedSource,
  replaceCloudOfflineCache,
  type CloudOfflineCacheCycleInput,
  type CloudOfflineCacheImageInput,
  type CloudOfflineCacheRecordInput,
  type LocalArchiveOwnerContext,
} from "@/lib/local-offline-db";
import { logLifespaceStorageDiagnostic } from "@/lib/local-storage-diagnostic";

const CLOUD_CACHE_PAGE_SIZE = 500;
const CLOUD_CACHE_MEDIA_BATCH_SIZE = 100;
const THUMBNAIL_TIMEOUT_MS = 12_000;
const MAX_CLOUD_CACHE_THUMB_BYTES = 220 * 1024;

export type CloudOfflineCacheArchiveSource = ArchiveItem & {
  updated_at?: string | null;
  source?: string | null;
  archive_summary?: string | null;
  planting_region?: PlantingRegion | null;
  cycle_enabled?: boolean | null;
  next_cycle_name?: string | null;
};

type CloudCacheRecordRow = {
  id: string;
  archive_id: string;
  cycle_id?: string | null;
  note?: string | null;
  record_time: string;
  created_at?: string | null;
  visibility?: string | null;
  status_tag?: string | null;
  record_tags?: Array<{
    tag?: string | null;
    tag_type?: string | null;
    is_active?: boolean | null;
  }> | null;
};

type CloudCacheMediaRow = MediaItem & {
  id: string;
  record_id: string;
  type?: string | null;
  captured_at?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
};

function cacheRevision(archive: CloudOfflineCacheArchiveSource) {
  return [
    archive.created_at || "",
    archive.title || "",
    archive.category || "",
    archive.system_name || "",
    archive.species_name_snapshot || "",
    archive.source || "",
    archive.archive_summary || "",
    JSON.stringify(archive.planting_region || null),
    archive.cycle_enabled ? "1" : "0",
    archive.next_cycle_name || "",
    archive.is_public ? "1" : "0",
    archive.record_count || 0,
    archive.last_record_time || "",
    archive.status || "active",
  ].join("|");
}

async function readCloudRecords(archiveId: string) {
  const rows: CloudCacheRecordRow[] = [];
  for (let offset = 0; ; offset += CLOUD_CACHE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("records")
      .select(
        "id, archive_id, cycle_id, note, record_time, created_at, visibility, status_tag, record_tags(tag, tag_type, is_active)"
      )
      .eq("archive_id", archiveId)
      .order("record_time", { ascending: true })
      .range(offset, offset + CLOUD_CACHE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as CloudCacheRecordRow[];
    rows.push(...page);
    if (page.length < CLOUD_CACHE_PAGE_SIZE) break;
  }
  return rows;
}

async function readCloudMedia(recordIds: string[]) {
  const rows: CloudCacheMediaRow[] = [];
  for (let offset = 0; offset < recordIds.length; offset += CLOUD_CACHE_MEDIA_BATCH_SIZE) {
    const batch = recordIds.slice(offset, offset + CLOUD_CACHE_MEDIA_BATCH_SIZE);
    const { data, error } = await supabase
      .from("media")
      .select(
        "id, record_id, type, url, storage_path, thumb_url, thumb_path, captured_at, sort_order, created_at"
      )
      .in("record_id", batch)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    rows.push(...((data || []) as CloudCacheMediaRow[]));
  }
  if (rows.length === 0) return rows;
  return (await attachMediaDisplayUrls(supabase, rows)) as CloudCacheMediaRow[];
}

async function downloadThumbnail(
  media: CloudCacheMediaRow
): Promise<CloudOfflineCacheImageInput | null> {
  const thumbUrl = media.display_thumb_url || media.thumb_url || null;
  if (!thumbUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), THUMBNAIL_TIMEOUT_MS);
  try {
    const response = await fetch(thumbUrl, {
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.size || blob.size > MAX_CLOUD_CACHE_THUMB_BYTES) return null;
    return {
      id: media.id,
      record_id: media.record_id,
      blob,
      mime_type: blob.type || "image/jpeg",
      name: "cloud-thumb-" + media.id + ".jpg",
      captured_at: media.captured_at || null,
      sort_order: media.sort_order ?? 0,
      created_at: media.created_at || null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshOneCloudOfflineCache(
  archive: CloudOfflineCacheArchiveSource,
  ownerContext: LocalArchiveOwnerContext
) {
  const revision = cacheRevision(archive);
  if (archive.status === "ended") {
    await pruneCloudOfflineCacheForEndedSource(
      archive.id,
      ownerContext,
      archive.last_record_time || archive.created_at || null
    );
    return;
  }

  const existing = await getCloudOfflineCacheByCloudSource(
    archive.id,
    ownerContext
  );
  if (
    existing?.status === "active" &&
    existing.source_cloud_cache_revision === revision
  ) {
    return;
  }

  const [{ data: cycleRows, error: cycleError }, records] = await Promise.all([
    supabase
      .from("archive_cycles")
      .select(
        "id, archive_id, cycle_no, display_name, status, started_at, ended_at, created_at, updated_at"
      )
      .eq("archive_id", archive.id)
      .order("cycle_no", { ascending: true }),
    readCloudRecords(archive.id),
  ]);
  if (cycleError) throw cycleError;

  const media = await readCloudMedia(records.map((record) => record.id));
  const images: CloudOfflineCacheImageInput[] = [];
  for (let offset = 0; offset < media.length; offset += 6) {
    const batch = await Promise.all(
      media.slice(offset, offset + 6).map(downloadThumbnail)
    );
    images.push(
      ...batch.filter(
        (image): image is CloudOfflineCacheImageInput => Boolean(image)
      )
    );
  }

  const cacheRecords: CloudOfflineCacheRecordInput[] = records.map((record) => ({
    id: record.id,
    cycle_id: record.cycle_id || null,
    note: record.note || "",
    record_time: record.record_time,
    created_at: record.created_at || null,
    updated_at: record.created_at || record.record_time,
    visibility: record.visibility || null,
    status_tag: record.status_tag || null,
    behavior_tags: (record.record_tags || [])
      .filter(
        (tag) =>
          tag.tag_type === "behavior" &&
          tag.is_active !== false &&
          typeof tag.tag === "string"
      )
      .map((tag) => String(tag.tag)),
  }));

  await replaceCloudOfflineCache({
    cloud_archive_id: archive.id,
    owner_context: ownerContext,
    title: archive.title || "未命名项目",
    category: archive.category,
    plant_id: archive.species_id || null,
    system_name: archive.system_name || null,
    species_name: archive.species_name_snapshot || null,
    source: archive.source || null,
    planting_region: archive.planting_region || null,
    archive_summary: archive.archive_summary || null,
    cycle_enabled: Boolean(archive.cycle_enabled),
    next_cycle_name: archive.next_cycle_name || null,
    created_at: archive.created_at || null,
    updated_at: archive.last_record_time || archive.created_at || null,
    is_public: Boolean(archive.is_public),
    cache_revision: revision,
    cycles: (cycleRows || []) as CloudOfflineCacheCycleInput[],
    records: cacheRecords,
    images,
  });
}

export async function refreshCloudOfflineCaches(
  archives: CloudOfflineCacheArchiveSource[],
  ownerContext: LocalArchiveOwnerContext | null
) {
  const endedArchives = archives.filter((archive) => archive.status === "ended").length;
  const activeArchives = archives.length - endedArchives;
  const userId = ownerContext?.userId || null;

  console.info("[lifespace-cloud-cache]", "refresh start", {
    userId,
    cloudArchives: archives.length,
    activeArchives,
    endedArchives,
  });
  await logLifespaceStorageDiagnostic(ownerContext);

  if (!ownerContext?.userId) return;

  let successCount = 0;
  let failedCount = 0;
  for (const archive of archives) {
    try {
      await refreshOneCloudOfflineCache(archive, ownerContext);
      successCount += 1;
      console.info("[lifespace-cloud-cache]", "archive success", {
        id: archive.id,
        status: archive.status || null,
      });
    } catch (error) {
      failedCount += 1;
      console.warn("[lifespace-cloud-cache]", "archive failed", {
        id: archive.id,
        status: archive.status || null,
        error,
      });
    }
  }

  const diagnosis = await logLifespaceStorageDiagnostic(ownerContext);
  console.info("[lifespace-cloud-cache]", "refresh done", {
    userId,
    cloudArchives: archives.length,
    activeArchives,
    endedArchives,
    successCount,
    failedCount,
    cloudOfflineCacheCount: diagnosis.counts.cloudOfflineCache,
    visibleCloudCacheCount: diagnosis.counts.visibleCloudCache,
  });
}
