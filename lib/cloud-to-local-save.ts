import type { ArchiveCategory } from "@/lib/archive-categories";
import type { MediaItem } from "@/lib/domain-types";
import {
  abortCloudArchiveLocalImport,
  beginCloudArchiveLocalImport,
  completeCloudArchiveLocalImport,
  getLocalArchiveByCloudSource,
  stageCloudArchiveLocalImage,
  stageCloudArchiveLocalRecord,
  verifyCloudArchiveLocalImport,
  type CloudArchiveLocalCycleInput,
  type LocalArchiveOwnerContext,
} from "@/lib/local-offline-db";
import {
  requestCloudTrash,
  restoreCloudTrashItem,
} from "@/lib/cloud-trash";
import { downloadMediaStorageObject } from "@/lib/media-storage-download";
import { supabase } from "@/lib/supabase";

const LOCAL_SAVE_SPACE_BUFFER_BYTES = 5 * 1024 * 1024;
const CLOUD_READ_PAGE_SIZE = 500;
const CLOUD_MEDIA_RECORD_BATCH_SIZE = 100;

export type CloudToLocalSaveErrorCode =
  | "not_authenticated"
  | "not_owner"
  | "not_found"
  | "read_failed"
  | "not_enough_space"
  | "download_failed"
  | "cloud_move_failed"
  | "cloud_restore_failed"
  | "verification_failed";

export class CloudToLocalSaveError extends Error {
  code: CloudToLocalSaveErrorCode;

  constructor(code: CloudToLocalSaveErrorCode, message: string) {
    super(message);
    this.name = "CloudToLocalSaveError";
    this.code = code;
  }
}

export type CloudToLocalSaveProgress = {
  phase: "reading" | "downloading" | "moving" | "saving";
  completed: number;
  total: number;
};

export type CloudToLocalSaveResult = {
  localArchiveId: string;
  replacedExistingCopy: boolean;
  recordCount: number;
  imageCount: number;
  movedCloudOriginal: boolean;
};

export type CloudToLocalMode = "copy" | "move";

type CloudArchiveRow = {
  id: string;
  user_id: string;
  title?: string | null;
  category?: string | null;
  species_id?: string | null;
  species_name_snapshot?: string | null;
  system_name?: string | null;
  source?: string | null;
  note?: string | null;
  archive_summary?: string | null;
  cycle_enabled?: boolean | null;
  next_cycle_name?: string | null;
  status?: string | null;
  ended_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_public?: boolean | null;
  sub_tag_id?: string | null;
  group_tag_id?: string | null;
};

type CloudRecordRow = {
  id: string;
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

type CloudCycleRow = {
  id: string;
  cycle_no: number;
  display_name?: string | null;
  status?: string | null;
  started_at: string;
  ended_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type NamedTagRow = { name?: string | null };

function normalizeCategory(value?: string | null): ArchiveCategory {
  if (
    value === "plant" ||
    value === "system" ||
    value === "insect_fish" ||
    value === "other"
  ) {
    return value;
  }
  return "other";
}

function estimateMediaBytes(media: MediaItem[]) {
  return media.reduce((total, item) => {
    const exact = Number(item.size_bytes || 0);
    if (Number.isFinite(exact) && exact > 0) return total + exact;
    const legacyMb = Number(item.size_mb || 0);
    return total + (Number.isFinite(legacyMb) && legacyMb > 0
      ? Math.ceil(legacyMb * 1024 * 1024)
      : 0);
  }, 0);
}

async function assertEnoughLocalSpace(requiredBytes: number) {
  if (
    requiredBytes <= 0 ||
    typeof navigator === "undefined" ||
    !navigator.storage?.estimate
  ) {
    return;
  }

  const estimate = await navigator.storage.estimate();
  if (
    typeof estimate.quota !== "number" ||
    typeof estimate.usage !== "number"
  ) {
    return;
  }

  const availableBytes = Math.max(0, estimate.quota - estimate.usage);
  if (availableBytes < requiredBytes + LOCAL_SAVE_SPACE_BUFFER_BYTES) {
    throw new CloudToLocalSaveError(
      "not_enough_space",
      "There is not enough local storage for this project"
    );
  }
}

function fileNameFromMedia(media: MediaItem) {
  const explicit = String(media.original_filename || "").trim();
  if (explicit) return explicit;
  const path = String(media.storage_path || media.path || "");
  const last = path.split("/").filter(Boolean).pop();
  return last || `${media.id}.jpg`;
}

async function readOptionalTagName(
  table: "sub_tags" | "group_tags",
  id?: string | null
) {
  if (!id) return null;
  const { data, error } = await supabase
    .from(table)
    .select("name")
    .eq("id", id)
    .maybeSingle();
  // Classification labels are helpful metadata, but they must never prevent
  // an owner from rescuing the project, records, and photos to this device.
  // This also keeps older projects downloadable when a legacy tag has already
  // been removed or its policy is temporarily unavailable.
  if (error) {
    console.warn(`Could not read optional ${table} label`, error);
    return null;
  }
  return String((data as NamedTagRow | null)?.name || "").trim() || null;
}

async function readAllCloudCycles(archiveId: string) {
  const rows: CloudCycleRow[] = [];

  for (let offset = 0; ; offset += CLOUD_READ_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("archive_cycles")
      .select(
        "id, cycle_no, display_name, status, started_at, ended_at, created_at, updated_at"
      )
      .eq("archive_id", archiveId)
      .order("cycle_no", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + CLOUD_READ_PAGE_SIZE - 1);

    if (error) {
      throw new CloudToLocalSaveError("read_failed", error.message);
    }

    const page = (data || []) as CloudCycleRow[];
    rows.push(...page);
    if (page.length < CLOUD_READ_PAGE_SIZE) break;
  }

  return rows;
}

async function readAllCloudRecords(archiveId: string) {
  const rows: CloudRecordRow[] = [];

  for (let offset = 0; ; offset += CLOUD_READ_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("records")
      .select(
        "id, cycle_id, note, record_time, created_at, visibility, status_tag, record_tags(tag, tag_type, is_active)"
      )
      .eq("archive_id", archiveId)
      .order("record_time", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + CLOUD_READ_PAGE_SIZE - 1);

    if (error) {
      throw new CloudToLocalSaveError("read_failed", error.message);
    }

    const page = (data || []) as CloudRecordRow[];
    rows.push(...page);
    if (page.length < CLOUD_READ_PAGE_SIZE) break;
  }

  return rows;
}

async function readAllCloudMedia(recordIds: string[]) {
  const rows: MediaItem[] = [];

  for (
    let batchStart = 0;
    batchStart < recordIds.length;
    batchStart += CLOUD_MEDIA_RECORD_BATCH_SIZE
  ) {
    const recordIdBatch = recordIds.slice(
      batchStart,
      batchStart + CLOUD_MEDIA_RECORD_BATCH_SIZE
    );

    for (let offset = 0; ; offset += CLOUD_READ_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("media")
        .select("*")
        .in("record_id", recordIdBatch)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + CLOUD_READ_PAGE_SIZE - 1);

      if (error) {
        throw new CloudToLocalSaveError("read_failed", error.message);
      }

      const page = (data || []) as MediaItem[];
      rows.push(...page);
      if (page.length < CLOUD_READ_PAGE_SIZE) break;
    }
  }

  return rows.filter((item) => !item.type || item.type === "image");
}

export async function findSavedLocalCopy(
  cloudArchiveId: string,
  ownerContext: LocalArchiveOwnerContext
) {
  return getLocalArchiveByCloudSource(cloudArchiveId, ownerContext);
}

export async function saveCloudArchiveToLocal(params: {
  cloudArchiveId: string;
  ownerContext: LocalArchiveOwnerContext;
  mode?: CloudToLocalMode;
  onProgress?: (progress: CloudToLocalSaveProgress) => void;
}): Promise<CloudToLocalSaveResult> {
  const userId = String(params.ownerContext.userId || "").trim();
  if (!userId) {
    throw new CloudToLocalSaveError(
      "not_authenticated",
      "Authentication is required"
    );
  }

  params.onProgress?.({ phase: "reading", completed: 0, total: 0 });
  const { data: archiveData, error: archiveError } = await supabase
    .from("archives")
    .select("*")
    .eq("id", params.cloudArchiveId)
    .eq("user_id", userId)
    .maybeSingle();

  if (archiveError) {
    throw new CloudToLocalSaveError("read_failed", archiveError.message);
  }
  if (!archiveData) {
    throw new CloudToLocalSaveError("not_found", "Cloud project was not found");
  }

  const archive = archiveData as CloudArchiveRow;
  if (archive.user_id !== userId) {
    throw new CloudToLocalSaveError("not_owner", "Only the owner can save this project locally");
  }

  const [cycleRows, records, subcategoryLabel, groupLabel] =
    await Promise.all([
      readAllCloudCycles(archive.id),
      readAllCloudRecords(archive.id),
      readOptionalTagName("sub_tags", archive.sub_tag_id),
      readOptionalTagName("group_tags", archive.group_tag_id),
    ]);

  const cycles = cycleRows.map((cycle) => ({
    cloud_cycle_id: String(cycle.id),
    cycle_no: Number(cycle.cycle_no),
    display_name: cycle.display_name,
    status: cycle.status === "ended" ? "ended" as const : "active" as const,
    started_at: cycle.started_at,
    ended_at: cycle.ended_at,
    created_at: cycle.created_at,
    updated_at: cycle.updated_at,
  })) satisfies CloudArchiveLocalCycleInput[];
  const recordIds = records.map((record) => record.id);

  const media = recordIds.length > 0
    ? await readAllCloudMedia(recordIds)
    : [];

  await assertEnoughLocalSpace(estimateMediaBytes(media));
  const session = await beginCloudArchiveLocalImport({
    cloud_archive_id: archive.id,
    cycles,
    owner_context: params.ownerContext,
  });
  const mediaByRecord = new Map<string, MediaItem[]>();
  for (const item of media) {
    const recordId = String(item.record_id || "");
    if (!recordId) continue;
    const list = mediaByRecord.get(recordId) || [];
    list.push(item);
    mediaByRecord.set(recordId, list);
  }

  let completedImages = 0;
  let movedCloudOriginal = false;
  try {
    for (const record of records) {
      const localRecord = await stageCloudArchiveLocalRecord({
        session,
        cloud_record_id: record.id,
        cloud_cycle_id: record.cycle_id,
        note: record.note,
        record_time: record.record_time,
        created_at: record.created_at,
        updated_at: record.created_at,
        visibility: record.visibility,
        status_tag: record.status_tag,
        behavior_tags: (record.record_tags || [])
          .filter(
            (tag) =>
              tag.tag_type === "behavior" &&
              tag.is_active !== false &&
              Boolean(tag.tag)
          )
          .map((tag) => String(tag.tag)),
      });

      const recordMedia = [...(mediaByRecord.get(record.id) || [])].sort(
        (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)
      );
      for (const item of recordMedia) {
        params.onProgress?.({
          phase: "downloading",
          completed: completedImages,
          total: media.length,
        });
        const downloaded = await downloadMediaStorageObject(item);
        if (downloaded.error || !downloaded.data) {
          throw new CloudToLocalSaveError(
            "download_failed",
            downloaded.error?.message || "Could not download an image"
          );
        }

        await stageCloudArchiveLocalImage({
          session,
          local_record_id: localRecord.id,
          cloud_record_id: record.id,
          cloud_media_id: item.id,
          blob: downloaded.data,
          mime_type: item.mime_type,
          name: fileNameFromMedia(item),
          original_size: item.size_bytes,
          width: item.width,
          height: item.height,
          captured_at: item.captured_at,
          sort_order: item.sort_order,
          created_at: item.created_at,
          cloud_media_url: item.storage_path || item.url || item.file_url,
        });
        completedImages += 1;
      }
    }

    await verifyCloudArchiveLocalImport({
      session,
      expected_record_count: records.length,
      expected_image_count: media.length,
    });

    if (params.mode === "move") {
      params.onProgress?.({
        phase: "moving",
        completed: completedImages,
        total: media.length,
      });
      const moved = await requestCloudTrash("archives", archive.id);
      if (!moved) {
        throw new CloudToLocalSaveError(
          "cloud_move_failed",
          "The cloud project could not be moved out of cloud space"
        );
      }
      movedCloudOriginal = true;
    }

    params.onProgress?.({
      phase: "saving",
      completed: completedImages,
      total: media.length,
    });
    const localArchive = await completeCloudArchiveLocalImport({
      session,
      cloud_archive_id: archive.id,
      title: archive.title || "",
      category: normalizeCategory(archive.category),
      subcategory: subcategoryLabel,
      group_name: groupLabel,
      plant_id: archive.species_id,
      plant_slug: null,
      system_name: archive.system_name,
      species_name: archive.species_name_snapshot,
      source: archive.source,
      note: archive.note,
      archive_summary: archive.archive_summary,
      cycle_enabled: Boolean(archive.cycle_enabled),
      next_cycle_name: archive.next_cycle_name,
      status: archive.status === "ended" ? "ended" : "active",
      ended_at: archive.ended_at,
      created_at: archive.created_at,
      updated_at: archive.updated_at,
      is_public: Boolean(archive.is_public),
      owner_context: params.ownerContext,
      expected_record_count: records.length,
      expected_image_count: media.length,
      retain_cloud_source: params.mode !== "move",
    });

    return {
      localArchiveId: localArchive.id,
      replacedExistingCopy: Boolean(session.previous_local_archive_id),
      recordCount: records.length,
      imageCount: media.length,
      movedCloudOriginal,
    };
  } catch (error) {
    let cloudRestoreFailed = false;
    if (movedCloudOriginal) {
      const restored = await restoreCloudTrashItem("archive", archive.id);
      cloudRestoreFailed = !restored;
    }
    await abortCloudArchiveLocalImport(session).catch(() => undefined);
    if (cloudRestoreFailed) {
      throw new CloudToLocalSaveError(
        "cloud_restore_failed",
        "The cloud project needs to be restored from Trash"
      );
    }
    if (error instanceof CloudToLocalSaveError) throw error;
    throw new CloudToLocalSaveError(
      "verification_failed",
      error instanceof Error ? error.message : "Could not verify the local copy"
    );
  }
}
