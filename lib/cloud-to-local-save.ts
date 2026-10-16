import { normalizePlantingRegion, type PlantingRegion } from "@/lib/planting-region";
import { readRecordLocations } from "@/lib/record-location-cloud";
import type { ArchiveCategory } from "@/lib/archive-categories";
import type { MediaItem } from "@/lib/domain-types";
import { isAndroidSafAvailable } from "@/lib/local-saf-native";
import { normalizeCloudTrialOfferRpcResult, normalizeMembershipRpcResult } from "@/lib/membership";
import type { LocalArchive, LocalRecord, LocalImage } from "@/lib/local-offline-db";
import {
  abortCloudArchiveLocalImport,
  beginCloudArchiveLocalImport,
  completeCloudArchiveLocalImport,
  getLocalArchiveByCloudSource,
  commitCloudArchiveSafCopy,
  listPendingCloudSyncSummaries,
  stageCloudArchiveLocalImage,
  stageCloudArchiveLocalRecord,
  verifyCloudArchiveLocalImport,
  type CloudArchiveLocalCycleInput,
  type LocalArchiveOwnerContext,
} from "@/lib/local-offline-db";
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

export type CloudToLocalMode = "copy";

type CloudArchiveRow = {
  id: string;
  user_id: string;
  title?: string | null;
  category?: string | null;
  species_id?: string | null;
  species_name_snapshot?: string | null;
  system_name?: string | null;
  source?: string | null;
  planting_region?: PlantingRegion | null;
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
  id?: string | null,
  requireComplete = false
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
  if (error || (requireComplete && !data)) {
    if (requireComplete) {
      throw new CloudToLocalSaveError("verification_failed", `Could not verify ${table} classification.`);
    }
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

  return rows;
}

function sameCloudRows<T extends { id: string }>(before: T[], after: T[]) {
  const canonical = (rows: T[]) => rows.map((row) => {
    const sorted = Object.entries(row).sort(([a], [b]) => a.localeCompare(b));
    return [row.id, JSON.stringify(sorted.map(([key, value]) =>
      [key, key === "record_tags" && Array.isArray(value)
        ? [...value].map((tag) => JSON.stringify(tag)).sort() : value]))] as const;
  }).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(canonical(before)) === JSON.stringify(canonical(after));
}

async function saveAndroidSafCloudCopy(input: {
  archive: CloudArchiveRow;
  cycles: CloudArchiveLocalCycleInput[];
  sourceCycles: CloudCycleRow[];
  records: CloudRecordRow[];
  media: MediaItem[];
  locations: Awaited<ReturnType<typeof readRecordLocations>>;
  subcategory: string | null;
  groupName: string | null;
  ownerContext: LocalArchiveOwnerContext;
  onProgress?: (progress: CloudToLocalSaveProgress) => void;
}): Promise<CloudToLocalSaveResult> {
  const { archive, records, media } = input;
  const existing = await getLocalArchiveByCloudSource(archive.id, input.ownerContext);
  if (existing) {
    // Never overwrite a local edit, or create another project for the same source.
    if (!existing.saf_local_space_id) {
      throw new CloudToLocalSaveError("verification_failed", "Existing legacy local copy is not yet SAF managed; it was not replaced.");
    }
    return { localArchiveId: existing.id, replacedExistingCopy: false,
      recordCount: records.length, imageCount: media.length, movedCloudOriginal: false };
  }
  const pending = await listPendingCloudSyncSummaries(input.ownerContext);
  if (pending.some((item) => item.cloud_archive_id === archive.id)) {
    throw new CloudToLocalSaveError("verification_failed",
      "This cloud project has pending local records or photos; resolve those before saving a cloud-only copy.");
  }
  const timestamp = new Date().toISOString();
  const localId = `local_archive_${crypto.randomUUID()}`;
  const cycleIds = new Map(input.cycles.map((cycle) =>
    [cycle.cloud_cycle_id, `local_cycle_${crypto.randomUUID()}`]));
  const localCycles = input.cycles.map((cycle) => ({
    id: cycleIds.get(cycle.cloud_cycle_id)!,
    archive_id: localId,
    cycle_no: cycle.cycle_no,
    source_cloud_cycle_id: cycle.cloud_cycle_id,
    display_name: cycle.display_name,
    status: cycle.status === "ended" ? "ended" as const : "active" as const,
    started_at: cycle.started_at,
    ended_at: cycle.status === "ended" ? cycle.ended_at || null : null,
    created_at: cycle.created_at || cycle.started_at,
    updated_at: cycle.updated_at || cycle.created_at || cycle.started_at,
  }));
  const ownerUserId = input.ownerContext.userId!;
  const localArchive: LocalArchive = {
    id: localId, local_role: "local-project",
    title: archive.title?.trim() || "未命名项目",
    category: normalizeCategory(archive.category),
    main_category: normalizeCategory(archive.category),
    subcategory: input.subcategory, group_name: input.groupName,
    plant_id: archive.species_id, plant_slug: null,
    species_name: archive.species_name_snapshot, system_name: archive.system_name,
    source: archive.source, planting_region: normalizePlantingRegion(archive.planting_region),
    local_owner_user_id: ownerUserId, local_owner_email: input.ownerContext.email,
    local_owner_marked_at: timestamp,
    source_cloud_archive_id: archive.id, source_cloud_saved_at: timestamp,
    source_cloud_updated_at: archive.updated_at, source_cloud_is_public: Boolean(archive.is_public),
    note: archive.note, archive_summary: archive.archive_summary,
    cycle_enabled: Boolean(archive.cycle_enabled || localCycles.length),
    next_cycle_name: archive.next_cycle_name, cycles: localCycles, trashed_cycles: [],
    status: archive.status === "ended" ? "ended" : "active",
    ended_at: archive.status === "ended" ? archive.ended_at : null,
    created_at: archive.created_at || timestamp, updated_at: timestamp,
    local_only: true, sync: { status: "local-only", cloud_archive_id: archive.id, last_sync_at: timestamp },
  };
  const recordIds = new Map(records.map((record) => [record.id, `local_record_${crypto.randomUUID()}`]));
  const localRecords: LocalRecord[] = records.map((record) => ({
    id: recordIds.get(record.id)!,
    archive_id: localId,
    cycle_id: record.cycle_id ? cycleIds.get(record.cycle_id) || null : null,
    location: input.locations.get(record.id) || null,
    note: record.note || "", record_time: record.record_time,
    created_at: record.created_at || timestamp, updated_at: record.created_at || timestamp,
    source_cloud_visibility: record.visibility,
    source_cloud_status_tag: record.status_tag,
    source_cloud_behavior_tags: (record.record_tags || [])
      .filter((tag) => tag.tag_type === "behavior" && tag.is_active !== false && Boolean(tag.tag))
      .map((tag) => String(tag.tag)),
    local_only: true,
    sync: { status: "local-only", cloud_archive_id: archive.id,
      cloud_record_id: record.id, last_sync_at: timestamp },
  }));
  const localImages: LocalImage[] = [];
  for (const item of media) {
    if (item.type && item.type !== "image") {
      throw new CloudToLocalSaveError("verification_failed", "Unsupported cloud media; project was not copied.");
    }
    const localRecordId = recordIds.get(String(item.record_id || ""));
    if (!localRecordId) throw new CloudToLocalSaveError("verification_failed", "Detached cloud media.");
    input.onProgress?.({ phase: "downloading", completed: localImages.length, total: media.length });
    const downloaded = await downloadMediaStorageObject(item);
    if (downloaded.error || !downloaded.data) {
      throw new CloudToLocalSaveError("download_failed", downloaded.error?.message || "Could not download an image");
    }
    const expectedSize = Number(item.size_bytes || 0);
    if (!downloaded.data.size || (expectedSize > 0 && downloaded.data.size !== expectedSize)) {
      throw new CloudToLocalSaveError("verification_failed", "Cloud image byte size did not match.");
    }
    localImages.push({
      id: `local_image_${crypto.randomUUID()}`,
      archive_id: localId, record_id: localRecordId, blob: downloaded.data,
      mime_type: item.mime_type || downloaded.data.type || "image/jpeg",
      name: fileNameFromMedia(item), original_size: downloaded.data.size,
      cached_size: downloaded.data.size, width: item.width ?? null, height: item.height ?? null,
      captured_at: item.captured_at, sort_order: Number(item.sort_order || 0),
      created_at: item.created_at || timestamp, local_only: true,
      sync: { status: "local-only", cloud_archive_id: archive.id,
        cloud_record_id: String(item.record_id), cloud_media_id: item.id,
        cloud_media_url: item.storage_path || item.url || item.file_url,
        last_sync_at: timestamp },
    });
  }
  const [currentCycles, currentRecords, currentMedia] = await Promise.all([
    readAllCloudCycles(archive.id), readAllCloudRecords(archive.id),
    records.length ? readAllCloudMedia(records.map((record) => record.id)) : Promise.resolve([]),
  ]);
  if (!sameCloudRows(input.sourceCycles, currentCycles) ||
      !sameCloudRows(records, currentRecords) ||
      !sameCloudRows(media, currentMedia)) {
    throw new CloudToLocalSaveError("verification_failed", "Cloud project content changed while downloading; retry.");
  }
  const { data: current, error: currentError } = await supabase.from("archives")
    .select("*").eq("id", archive.id).eq("user_id", ownerUserId).maybeSingle();
  // archives has no updated_at column. Compare the fields that determine the
  // saved snapshot; record, cycle and media rows are verified separately above.
  const contentFields: Array<keyof CloudArchiveRow> = [
    "id", "user_id", "title", "category", "species_id", "species_name_snapshot",
    "system_name", "source", "planting_region", "note", "archive_summary",
    "cycle_enabled", "next_cycle_name", "status", "ended_at", "created_at",
    "is_public", "sub_tag_id", "group_tag_id",
  ];
  const currentArchive = current as CloudArchiveRow | null;
  if (currentError || !currentArchive || contentFields.some((field) =>
    JSON.stringify(currentArchive[field] ?? null) !== JSON.stringify(archive[field] ?? null))) {
    throw new CloudToLocalSaveError("verification_failed", "Cloud project changed while downloading; retry.");
  }
  await assertCloudCopyEntitlement(ownerUserId);
  input.onProgress?.({ phase: "saving", completed: localImages.length, total: media.length });
  const result = await commitCloudArchiveSafCopy({
    archive: localArchive, records: localRecords, images: localImages,
  });
  return { localArchiveId: result.archive.id, replacedExistingCopy: false,
    recordCount: records.length, imageCount: media.length, movedCloudOriginal: false };
}

async function assertCloudCopyEntitlement(userId: string) {
  const identity = await supabase.auth.getUser();
  if (identity.error || identity.data.user?.id !== userId) {
    throw new CloudToLocalSaveError("not_authenticated", "Please sign in again.");
  }
  const [memberResult, offerResult] = await Promise.all([
    supabase.rpc("get_my_membership"),
    supabase.rpc("get_my_cloud_trial_offer"),
  ]);
  if (memberResult.error || offerResult.error) {
    throw new CloudToLocalSaveError("read_failed", "Cloud entitlement could not be verified.");
  }
  const member = normalizeMembershipRpcResult(memberResult.data);
  const offer = normalizeCloudTrialOfferRpcResult(offerResult.data);
  const endedTrial = member?.plan === "trial" && member.can_create_content === false &&
    offer?.claimed === true && offer.lifecycle_status === "handling_period";
  const endedPlus = (member?.plan === "basic" || member?.plan === "large" ||
    member?.plan === "seller") && member.status !== "active" &&
    member.can_create_content === false;
  if (!endedTrial && !endedPlus) {
    throw new CloudToLocalSaveError("verification_failed", "Saving a cloud project locally is only available after cloud access ends.");
  }
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
  await assertCloudCopyEntitlement(userId);

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
      readOptionalTagName("sub_tags", archive.sub_tag_id, isAndroidSafAvailable()),
      readOptionalTagName("group_tags", archive.group_tag_id, isAndroidSafAvailable()),
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
  const locations = await readRecordLocations(supabase, recordIds);

  const media = recordIds.length > 0
    ? await readAllCloudMedia(recordIds)
    : [];

  await assertEnoughLocalSpace(estimateMediaBytes(media));
  if (isAndroidSafAvailable()) {
    return saveAndroidSafCloudCopy({ archive, cycles, sourceCycles: cycleRows, records, media, locations,
      subcategory: subcategoryLabel, groupName: groupLabel,
      ownerContext: params.ownerContext, onProgress: params.onProgress });
  }
  const existingWebCopy = await getLocalArchiveByCloudSource(archive.id, params.ownerContext);
  if (existingWebCopy) {
    // Existing local edits are never replaced by a fresh cloud snapshot.
    return { localArchiveId: existingWebCopy.id, replacedExistingCopy: false,
      recordCount: records.length, imageCount: media.length, movedCloudOriginal: false };
  }
  if ((await listPendingCloudSyncSummaries(params.ownerContext))
      .some((item) => item.cloud_archive_id === archive.id)) {
    throw new CloudToLocalSaveError("verification_failed", "Cloud project has pending local content.");
  }
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
        location: locations.get(record.id) || null,
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
        if ((item.type && item.type !== "image") || !downloaded.data.size ||
            (Number(item.size_bytes || 0) > 0 && downloaded.data.size !== Number(item.size_bytes))) {
          throw new CloudToLocalSaveError("verification_failed", "Cloud media could not be verified.");
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


    params.onProgress?.({
      phase: "saving",
      completed: completedImages,
      total: media.length,
    });
    await assertCloudCopyEntitlement(userId);
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
      planting_region: normalizePlantingRegion(archive.planting_region),
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
      retain_cloud_source: true,
    });

    return {
      localArchiveId: localArchive.id,
      replacedExistingCopy: Boolean(session.previous_local_archive_id),
      recordCount: records.length,
      imageCount: media.length,
      movedCloudOriginal,
    };
  } catch (error) {
    await abortCloudArchiveLocalImport(session).catch(() => undefined);
    if (error instanceof CloudToLocalSaveError) throw error;
    throw new CloudToLocalSaveError(
      "verification_failed",
      error instanceof Error ? error.message : "Could not verify the local copy"
    );
  }
}
