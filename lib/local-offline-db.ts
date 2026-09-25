import { normalizePlantingRegion, type PlantingRegion } from "@/lib/planting-region";
import { loadDefaultRecordLocation, normalizeRecordLocation, type RecordLocation } from "@/lib/record-location";
import type { ArchiveCategory } from "@/lib/archive-categories";
import { isLocalDateBefore, toLocalDateEndIso } from "@/lib/archive-cycle-dates";
import { standardizeRecordPhotoFile } from "@/lib/image-compression";
import {
  loadRememberedLocalOwnerContext,
  wasLocalOwnerExplicitlySignedOut,
} from "@/lib/local-owner-context";

const DB_NAME = "life-space-local-offline";
const DB_VERSION = 6;
const ARCHIVE_STORE = "archives";
const RECORD_STORE = "records";
const IMAGE_STORE = "images";
const TAXONOMY_STORE = "taxonomy";
const MAX_LOCAL_IMAGE_BYTES = 25 * 1024 * 1024;
const DEFAULT_LOCAL_ARCHIVE_CATEGORY: ArchiveCategory = "plant";
const LOCAL_ARCHIVE_CATEGORIES: ArchiveCategory[] = [
  "plant",
  "system",
  "insect_fish",
  "other",
];

export type LocalSyncStatus =
  | "local-only"
  | "pending-cloud-sync"
  | "uploading"
  | "failed"
  | "synced";

export type LocalSyncOperationKind =
  | "create-record"
  | "update-record"
  | "upload-image"
  | "update-archive";

export type LocalArchiveRole =
  | "local-project"
  | "saved-local-copy"
  | "cloud-offline-cache";

export type LocalSyncMeta = {
  status: LocalSyncStatus;
  cloud_archive_id?: string | null;
  cloud_record_id?: string | null;
  cloud_media_id?: string | null;
  cloud_media_url?: string | null;
  last_sync_at?: string | null;
  client_operation_id?: string | null;
  depends_on_operation_id?: string | null;
  operation_kind?: LocalSyncOperationKind | null;
  queued_at?: string | null;
  attempt_count?: number;
  last_error?: string | null;
  pending_fields?: string[];
};

export type LocalPendingSyncPromptMode = "ask" | "manual";

export type LocalCloudMigrationStatus = "migrating" | "failed" | "migrated";

export type LocalArchiveCycle = {
  id: string;
  archive_id: string;
  cycle_no: number;
  source_cloud_cycle_id?: string | null;
  display_name?: string | null;
  status: "active" | "ended";
  started_at: string;
  ended_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type LocalArchiveCycleTrash = {
  id: string;
  archive_id: string;
  cycle: LocalArchiveCycle;
  record_ids: string[];
  deleted_at: string;
};

export type LocalArchiveCycleTrashListItem = {
  archive_id: string;
  archive_title: string;
  trash: LocalArchiveCycleTrash;
};

export type LocalArchive = {
  id: string;
  local_role?: LocalArchiveRole;
  title: string;
  category: ArchiveCategory;
  main_category: ArchiveCategory;
  // Local-only classification labels. They are never written to Supabase
  // sub_tags/group_tags; future sync must ask before mapping or copying them.
  subcategory?: string | null;
  group_name?: string | null;
  plant_id?: string | null;
  plant_slug?: string | null;
  system_name?: string | null;
  species_name?: string | null;
  source?: string | null;
  planting_region?: PlantingRegion | null;
  local_owner_user_id?: string | null;
  local_owner_email?: string | null;
  local_owner_marked_at?: string | null;
  source_cloud_archive_id?: string | null;
  source_cloud_saved_at?: string | null;
  source_cloud_updated_at?: string | null;
  source_cloud_cache_revision?: string | null;
  source_cloud_is_public?: boolean | null;
  pending_sync_prompt_mode?: LocalPendingSyncPromptMode | null;
  pending_sync_first_detected_at?: string | null;
  pending_sync_deferred_at?: string | null;
  migration_status?: LocalCloudMigrationStatus | null;
  migration_cloud_archive_id?: string | null;
  migration_started_at?: string | null;
  migration_error?: string | null;
  migration_visibility?: "private" | "public" | null;
  migrated_at?: string | null;
  note?: string | null;
  archive_summary?: string | null;
  cycle_enabled?: boolean;
  next_cycle_name?: string | null;
  cycles?: LocalArchiveCycle[];
  trashed_cycles?: LocalArchiveCycleTrash[];
  status: "active" | "ended";
  ended_at?: string | null;
  created_at: string;
  updated_at: string;
  local_only: true;
  sync: LocalSyncMeta;
};

export type LocalRecord = {
  location?: RecordLocation | null;
  id: string;
  archive_id: string;
  cycle_id?: string | null;
  note: string;
  record_time: string;
  created_at: string;
  updated_at: string;
  source_cloud_visibility?: string | null;
  source_cloud_status_tag?: string | null;
  source_cloud_behavior_tags?: string[];
  local_only: true;
  sync: LocalSyncMeta;
};

export type LocalImage = {
  id: string;
  archive_id: string;
  record_id: string;
  blob: Blob;
  mime_type: string;
  name: string;
  original_size: number;
  metadata_stripped?: boolean;
  cached_size: number;
  width?: number | null;
  height?: number | null;
  captured_at?: string | null;
  sort_order: number;
  created_at: string;
  local_only: true;
  sync: LocalSyncMeta;
};

export type LocalArchiveSummary = LocalArchive & {
  record_count: number;
  image_count: number;
  pending_record_count: number;
  latest_record_time?: string | null;
  latest_record_note?: string | null;
  cover_image?: LocalImage | null;
};

export type LocalTaxonomyKind = "subcategory" | "group";

export type LocalTaxonomyItem = {
  id: string;
  kind: LocalTaxonomyKind;
  label: string;
  category?: ArchiveCategory | null;
  subcategory?: string | null;
  local_owner_user_id?: string | null;
  local_owner_email?: string | null;
  created_at: string;
  updated_at: string;
  local_only: true;
};

export type LocalRecordWithImages = LocalRecord & {
  images: LocalImage[];
};

export type LocalArchiveDetail = {
  archive: LocalArchive;
  records: LocalRecordWithImages[];
};

export type CloudOfflineCacheCycleInput = {
  id: string;
  cycle_no: number;
  display_name?: string | null;
  status: "active" | "ended";
  started_at: string;
  ended_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CloudOfflineCacheRecordInput = {
  id: string;
  cycle_id?: string | null;
  note?: string | null;
  record_time: string;
  created_at?: string | null;
  updated_at?: string | null;
  visibility?: string | null;
  status_tag?: string | null;
  behavior_tags?: string[];
};

export type CloudOfflineCacheImageInput = {
  id: string;
  record_id: string;
  blob: Blob;
  mime_type?: string | null;
  name?: string | null;
  width?: number | null;
  height?: number | null;
  captured_at?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
  cloud_media_url?: string | null;
};

export type LocalOriginBaseSnapshot = {
  archives: LocalArchive[];
  records: LocalRecord[];
  taxonomy: LocalTaxonomyItem[];
};

export type LocalArchiveOwnerContext = {
  userId?: string | null;
  email?: string | null;
};

export type LocalArchiveVisibilityResult = {
  archives: LocalArchiveSummary[];
  totalCount: number;
  unownedCount: number;
  ownedByCurrentCount: number;
  hiddenOwnedByOtherCount: number;
};

export type PendingCloudSyncSummary = {
  local_archive_id: string;
  cloud_archive_id: string;
  title: string;
  record_count: number;
  image_count: number;
  estimated_media_bytes: number;
  failed_record_count: number;
  failed_image_count: number;
  archive_update_pending: boolean;
  prompt_mode: LocalPendingSyncPromptMode;
  should_prompt: boolean;
  first_detected_at: string | null;
  deferred_at: string | null;
};

export type LocalCloudSyncOperationUpdate = {
  status: "uploading" | "failed" | "synced";
  cloud_archive_id?: string | null;
  cloud_record_id?: string | null;
  cloud_media_id?: string | null;
  cloud_media_url?: string | null;
  last_error?: string | null;
};

export type CloudArchiveLocalCycleInput = {
  cloud_cycle_id: string;
  cycle_no: number;
  display_name?: string | null;
  status: "active" | "ended";
  started_at: string;
  ended_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CloudArchiveLocalImportSession = {
  staging_archive_id: string;
  cloud_archive_id: string;
  previous_local_archive_id: string | null;
  started_at: string;
  cycles: LocalArchiveCycle[];
  cloud_cycle_id_map: Record<string, string>;
};

export function assertLocalOfflineAvailable() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw new Error("当前浏览器无法保存本地数据。");
  }
}

function createId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${random}`;
}

export function isCloudOfflineCacheArchiveId(archiveId?: string | null) {
  return Boolean(archiveId && archiveId.startsWith("cloud_cache_archive_"));
}

function createOperationId() {
  const cryptoApi =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoApi) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeLocalArchiveCategory(value?: string | null): ArchiveCategory {
  return LOCAL_ARCHIVE_CATEGORIES.includes(value as ArchiveCategory)
    ? (value as ArchiveCategory)
    : DEFAULT_LOCAL_ARCHIVE_CATEGORY;
}

function normalizeLocalArchiveCycle(
  cycle: LocalArchiveCycle,
  archiveId: string
): LocalArchiveCycle | null {
  const cycleNo = Number(cycle?.cycle_no);
  if (!cycle?.id || !Number.isInteger(cycleNo) || cycleNo <= 0) return null;

  const status = cycle.status === "ended" ? "ended" : "active";
  const startedAt = normalizeOptionalText(cycle.started_at) || nowIso();
  const endedAt = status === "ended" ? normalizeOptionalText(cycle.ended_at) : null;
  if (status === "ended" && !endedAt) return null;

  return {
    ...cycle,
    archive_id: archiveId,
    cycle_no: cycleNo,
    source_cloud_cycle_id: normalizeOptionalText(cycle.source_cloud_cycle_id),
    display_name: normalizeOptionalText(cycle.display_name),
    status,
    started_at: startedAt,
    ended_at: endedAt,
    created_at: normalizeOptionalText(cycle.created_at) || startedAt,
    updated_at: normalizeOptionalText(cycle.updated_at) || startedAt,
  };
}

function normalizeLocalArchiveCycleTrash(
  item: LocalArchiveCycleTrash,
  archiveId: string
): LocalArchiveCycleTrash | null {
  const cycle = item?.cycle
    ? normalizeLocalArchiveCycle(item.cycle, archiveId)
    : null;
  if (!item?.id || !cycle) return null;

  return {
    id: item.id,
    archive_id: archiveId,
    cycle,
    record_ids: Array.isArray(item.record_ids)
      ? [...new Set(item.record_ids.filter((id): id is string => Boolean(id)))]
      : [],
    deleted_at: normalizeOptionalText(item.deleted_at) || nowIso(),
  };
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeLocalSyncMeta(sync?: Partial<LocalSyncMeta> | null): LocalSyncMeta {
  const validStatuses: LocalSyncStatus[] = [
    "local-only",
    "pending-cloud-sync",
    "uploading",
    "failed",
    "synced",
  ];
  const validOperationKinds: LocalSyncOperationKind[] = [
    "create-record",
    "update-record",
    "upload-image",
    "update-archive",
  ];

  return {
    status: validStatuses.includes(sync?.status as LocalSyncStatus)
      ? (sync?.status as LocalSyncStatus)
      : "local-only",
    cloud_archive_id: normalizeOptionalText(sync?.cloud_archive_id),
    cloud_record_id: normalizeOptionalText(sync?.cloud_record_id),
    cloud_media_id: normalizeOptionalText(sync?.cloud_media_id),
    cloud_media_url: normalizeOptionalText(sync?.cloud_media_url),
    last_sync_at: normalizeOptionalText(sync?.last_sync_at),
    client_operation_id: normalizeOptionalText(sync?.client_operation_id),
    depends_on_operation_id: normalizeOptionalText(sync?.depends_on_operation_id),
    operation_kind: validOperationKinds.includes(
      sync?.operation_kind as LocalSyncOperationKind
    )
      ? (sync?.operation_kind as LocalSyncOperationKind)
      : null,
    queued_at: normalizeOptionalText(sync?.queued_at),
    attempt_count: Math.max(0, Math.floor(Number(sync?.attempt_count) || 0)),
    last_error: normalizeOptionalText(sync?.last_error),
    pending_fields: Array.from(
      new Set(
        (Array.isArray(sync?.pending_fields) ? sync.pending_fields : [])
          .map((field) => normalizeOptionalText(field))
          .filter((field): field is string => Boolean(field))
      )
    ),
  };
}

export function resolveLocalArchiveRole(
  archive: Pick<
    LocalArchive,
    "id" | "local_role" | "source_cloud_archive_id" | "source_cloud_cache_revision"
  >
): LocalArchiveRole {
  if (isCloudOfflineCacheArchiveId(archive.id) || archive.local_role === "cloud-offline-cache") {
    return "cloud-offline-cache";
  }

  if (normalizeOptionalText(archive.source_cloud_cache_revision)) {
    return "cloud-offline-cache";
  }

  if (archive.local_role === "local-project" || archive.local_role === "saved-local-copy") {
    return archive.local_role;
  }

  return normalizeOptionalText(archive.source_cloud_archive_id)
    ? "saved-local-copy"
    : "local-project";
}

function normalizeLocalArchiveRole(archive: LocalArchive): LocalArchiveRole {
  return resolveLocalArchiveRole(archive);
}

async function persistRepairedLocalArchiveRoles(
  rawArchives: LocalArchive[],
  normalizedArchives: LocalArchive[]
) {
  const repairs = normalizedArchives.filter((archive, index) => {
    const raw = rawArchives[index];
    return raw && raw.local_role !== archive.local_role;
  });
  if (repairs.length === 0) return;

  try {
    const db = await openLocalDb();
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const store = transaction.objectStore(ARCHIVE_STORE);
    const done = transactionDone(transaction);
    for (const archive of repairs) {
      const current = await requestToPromise<LocalArchive | undefined>(store.get(archive.id));
      if (!current) continue;
      store.put({
        ...current,
        local_role: archive.local_role,
      });
    }
    await done;
  } catch {
    // Identity repair is best-effort; listing still uses the inferred role.
  }
}

function isUserLocalArchive(archive: LocalArchive) {
  return normalizeLocalArchiveRole(archive) !== "cloud-offline-cache";
}

function normalizeLocalArchive(archive: LocalArchive): LocalArchive {
  const category = normalizeLocalArchiveCategory(
    archive.category || archive.main_category
  );
  const cycles = Array.isArray(archive.cycles)
    ? archive.cycles
        .map((cycle) => normalizeLocalArchiveCycle(cycle, archive.id))
        .filter((cycle): cycle is LocalArchiveCycle => Boolean(cycle))
        .sort((a, b) => a.cycle_no - b.cycle_no)
    : [];
  const trashedCycles = Array.isArray(archive.trashed_cycles)
    ? archive.trashed_cycles
        .map((item) => normalizeLocalArchiveCycleTrash(item, archive.id))
        .filter((item): item is LocalArchiveCycleTrash => Boolean(item))
        .sort(
          (a, b) =>
            new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()
        )
    : [];

  return {
    ...archive,
    local_role: normalizeLocalArchiveRole(archive),
    category,
    main_category: normalizeLocalArchiveCategory(
      archive.main_category || category
    ),
    subcategory: normalizeOptionalText(archive.subcategory),
    group_name: normalizeOptionalText(archive.group_name),
    plant_id: normalizeOptionalText(archive.plant_id),
    plant_slug: normalizeOptionalText(archive.plant_slug),
    system_name: normalizeOptionalText(archive.system_name),
    species_name: normalizeOptionalText(archive.species_name),
    source: normalizeOptionalText(archive.source),
    local_owner_user_id: normalizeOptionalText(archive.local_owner_user_id),
    local_owner_email: normalizeOptionalText(archive.local_owner_email),
    local_owner_marked_at: normalizeOptionalText(archive.local_owner_marked_at),
    source_cloud_archive_id: normalizeOptionalText(
      archive.source_cloud_archive_id
    ),
    source_cloud_saved_at: normalizeOptionalText(archive.source_cloud_saved_at),
    source_cloud_updated_at: normalizeOptionalText(
      archive.source_cloud_updated_at
    ),
    source_cloud_cache_revision: normalizeOptionalText(
      archive.source_cloud_cache_revision
    ),
    source_cloud_is_public:
      typeof archive.source_cloud_is_public === "boolean"
        ? archive.source_cloud_is_public
        : null,
    pending_sync_prompt_mode:
      archive.pending_sync_prompt_mode === "manual"
        ? "manual"
        : archive.pending_sync_prompt_mode === "ask"
          ? "ask"
          : null,
    pending_sync_first_detected_at: normalizeOptionalText(
      archive.pending_sync_first_detected_at
    ),
    pending_sync_deferred_at: normalizeOptionalText(
      archive.pending_sync_deferred_at
    ),
    migration_status: archive.migration_status || null,
    migration_cloud_archive_id: normalizeOptionalText(
      archive.migration_cloud_archive_id
    ),
    migration_started_at: normalizeOptionalText(archive.migration_started_at),
    migration_error: normalizeOptionalText(archive.migration_error),
    migration_visibility:
      archive.migration_visibility === "public" ? "public" :
      archive.migration_visibility === "private" ? "private" :
      null,
    migrated_at: normalizeOptionalText(archive.migrated_at),
    archive_summary: normalizeOptionalText(archive.archive_summary),
    cycle_enabled:
      typeof archive.cycle_enabled === "boolean"
        ? archive.cycle_enabled
        : cycles.length > 0,
    next_cycle_name: normalizeOptionalText(archive.next_cycle_name),
    cycles,
    trashed_cycles: trashedCycles,
    sync: normalizeLocalSyncMeta(archive.sync),
  };
}

function getTrashedLocalCycleIds(archive: LocalArchive) {
  return new Set(
    (archive.trashed_cycles || []).map((item) => item.cycle.id)
  );
}

function getVisibleLocalRecordsForArchive(
  archive: LocalArchive,
  records: LocalRecord[]
) {
  const trashedCycleIds = getTrashedLocalCycleIds(archive);
  return records.filter(
    (record) =>
      record.archive_id === archive.id &&
      (!record.cycle_id || !trashedCycleIds.has(record.cycle_id))
  );
}

function normalizeLocalTaxonomyItem(item: LocalTaxonomyItem): LocalTaxonomyItem {
  return {
    ...item,
    kind: item.kind === "group" ? "group" : "subcategory",
    label: normalizeOptionalText(item.label) || "",
    category: item.category ? normalizeLocalArchiveCategory(item.category) : null,
    subcategory: normalizeOptionalText(item.subcategory),
    local_owner_user_id: normalizeOptionalText(item.local_owner_user_id),
    local_owner_email: normalizeOptionalText(item.local_owner_email),
    local_only: true,
  };
}

function getOwnerUserId(ownerContext?: LocalArchiveOwnerContext | null) {
  return normalizeOptionalText(ownerContext?.userId);
}

function ownerContextForVisibleCaches(
  ownerContext?: LocalArchiveOwnerContext | null
): LocalArchiveOwnerContext | null {
  if (getOwnerUserId(ownerContext)) return ownerContext || null;
  const remembered = loadRememberedLocalOwnerContext();
  if (remembered?.userId) {
    return { userId: remembered.userId, email: remembered.email || null };
  }
  if (wasLocalOwnerExplicitlySignedOut()) {
    return ownerContext ?? null;
  }
  return ownerContext ?? null;
}

export function isLocalArchiveVisibleToOwner(
  archive: LocalArchive,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const ownerUserId = normalizeOptionalText(archive.local_owner_user_id);
  if (!ownerUserId) return true;

  return ownerUserId === getOwnerUserId(ownerContext);
}

function isLocalTaxonomyVisibleToOwner(
  item: LocalTaxonomyItem,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const ownerUserId = normalizeOptionalText(item.local_owner_user_id);
  if (!ownerUserId) return true;

  return ownerUserId === getOwnerUserId(ownerContext);
}

function localSyncMeta(extra?: Partial<LocalSyncMeta>): LocalSyncMeta {
  return {
    status: "local-only",
    cloud_archive_id: null,
    cloud_record_id: null,
    cloud_media_id: null,
    cloud_media_url: null,
    last_sync_at: null,
    client_operation_id: null,
    depends_on_operation_id: null,
    operation_kind: null,
    queued_at: null,
    attempt_count: 0,
    last_error: null,
    pending_fields: [],
    ...extra,
  };
}

export function isPendingCloudSyncStatus(status?: LocalSyncStatus | null) {
  return (
    status === "pending-cloud-sync" ||
    status === "uploading" ||
    status === "failed"
  );
}

function queueCloudSyncOperation(
  current: Partial<LocalSyncMeta> | null | undefined,
  input: {
    cloudArchiveId: string;
    operationKind: LocalSyncOperationKind;
    timestamp: string;
    cloudRecordId?: string | null;
    dependsOnOperationId?: string | null;
    pendingFields?: string[];
  }
) {
  const normalized = normalizeLocalSyncMeta(current);
  // A successful operation is immutable. Edits made while another operation is
  // in flight also need their own identity so the older response cannot clear
  // newer pending fields. Images are immutable, so their retry identity stays
  // stable while uploading.
  const startNewOperation =
    normalized.status === "synced" ||
    (normalized.status === "uploading" && input.operationKind !== "upload-image");
  const base = startNewOperation
    ? normalizeLocalSyncMeta({
        ...normalized,
        client_operation_id: null,
        depends_on_operation_id: null,
        operation_kind: null,
        queued_at: null,
        last_error: null,
        pending_fields: [],
      })
    : normalized;

  return normalizeLocalSyncMeta({
    ...base,
    status: "pending-cloud-sync",
    cloud_archive_id: input.cloudArchiveId,
    cloud_record_id:
      input.cloudRecordId === undefined
        ? base.cloud_record_id
        : input.cloudRecordId,
    client_operation_id:
      base.client_operation_id || createOperationId(),
    depends_on_operation_id:
      input.dependsOnOperationId === undefined
        ? base.depends_on_operation_id
        : input.dependsOnOperationId,
    operation_kind: base.operation_kind || input.operationKind,
    queued_at: base.queued_at || input.timestamp,
    last_error: null,
    pending_fields: [
      ...(base.pending_fields || []),
      ...(input.pendingFields || []),
    ],
  });
}

function applyCloudSyncOperationUpdate(
  current: Partial<LocalSyncMeta> | null | undefined,
  operationId: string,
  update: LocalCloudSyncOperationUpdate,
  timestamp: string
) {
  const normalized = normalizeLocalSyncMeta(current);
  if (normalized.client_operation_id !== operationId) {
    return normalized;
  }

  const withCloudIds = normalizeLocalSyncMeta({
    ...normalized,
    cloud_archive_id:
      update.cloud_archive_id === undefined
        ? normalized.cloud_archive_id
        : update.cloud_archive_id,
    cloud_record_id:
      update.cloud_record_id === undefined
        ? normalized.cloud_record_id
        : update.cloud_record_id,
    cloud_media_id:
      update.cloud_media_id === undefined
        ? normalized.cloud_media_id
        : update.cloud_media_id,
    cloud_media_url:
      update.cloud_media_url === undefined
        ? normalized.cloud_media_url
        : update.cloud_media_url,
  });

  if (update.status === "uploading") {
    return normalizeLocalSyncMeta({
      ...withCloudIds,
      status: "uploading",
      attempt_count: (withCloudIds.attempt_count || 0) + 1,
      last_error: null,
    });
  }

  if (update.status === "failed") {
    return normalizeLocalSyncMeta({
      ...withCloudIds,
      status: "failed",
      last_error: update.last_error || "云端上传失败，请稍后重试。",
    });
  }

  return normalizeLocalSyncMeta({
    ...withCloudIds,
    status: "synced",
    last_sync_at: timestamp,
    client_operation_id: null,
    depends_on_operation_id: null,
    operation_kind: null,
    queued_at: null,
    last_error: null,
    pending_fields: [],
  });
}

function markArchivePendingPrompt(archive: LocalArchive, timestamp: string) {
  return {
    ...archive,
    pending_sync_prompt_mode: archive.pending_sync_prompt_mode || "ask",
    pending_sync_first_detected_at:
      archive.pending_sync_first_detected_at || timestamp,
  } satisfies LocalArchive;
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 操作失败"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("IndexedDB 事务失败"));
    transaction.onabort = () =>
      reject(transaction.error || new Error("IndexedDB 事务已取消"));
  });
}

function openLocalDb() {
  assertLocalOfflineAvailable();

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ARCHIVE_STORE)) {
        const store = db.createObjectStore(ARCHIVE_STORE, { keyPath: "id" });
        store.createIndex("updated_at", "updated_at");
        store.createIndex("category", "category");
        store.createIndex("main_category", "main_category");
        store.createIndex("subcategory", "subcategory");
        store.createIndex("group_name", "group_name");
        store.createIndex("plant_id", "plant_id");
        store.createIndex("plant_slug", "plant_slug");
        store.createIndex("local_owner_user_id", "local_owner_user_id");
        store.createIndex("local_owner_email", "local_owner_email");
        store.createIndex("migration_status", "migration_status");
        store.createIndex("sync_status", "sync.status");
      } else {
        const store = request.transaction?.objectStore(ARCHIVE_STORE);

        if (store) {
          if (!store.indexNames.contains("category")) {
            store.createIndex("category", "category");
          }
          if (!store.indexNames.contains("main_category")) {
            store.createIndex("main_category", "main_category");
          }
          if (!store.indexNames.contains("subcategory")) {
            store.createIndex("subcategory", "subcategory");
          }
          if (!store.indexNames.contains("group_name")) {
            store.createIndex("group_name", "group_name");
          }
          if (!store.indexNames.contains("plant_id")) {
            store.createIndex("plant_id", "plant_id");
          }
          if (!store.indexNames.contains("plant_slug")) {
            store.createIndex("plant_slug", "plant_slug");
          }
          if (!store.indexNames.contains("local_owner_user_id")) {
            store.createIndex("local_owner_user_id", "local_owner_user_id");
          }
          if (!store.indexNames.contains("local_owner_email")) {
            store.createIndex("local_owner_email", "local_owner_email");
          }
          if (!store.indexNames.contains("migration_status")) {
            store.createIndex("migration_status", "migration_status");
          }

          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;

            const archive = cursor.value as LocalArchive;
            const normalized = normalizeLocalArchive(archive);
            const updateRequest = cursor.update(normalized);
            updateRequest.onsuccess = () => cursor.continue();
          };
        }
      }

      if (!db.objectStoreNames.contains(RECORD_STORE)) {
        const store = db.createObjectStore(RECORD_STORE, { keyPath: "id" });
        store.createIndex("archive_id", "archive_id");
        store.createIndex("record_time", "record_time");
        store.createIndex("sync_status", "sync.status");
      }

      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        const store = db.createObjectStore(IMAGE_STORE, { keyPath: "id" });
        store.createIndex("archive_id", "archive_id");
        store.createIndex("record_id", "record_id");
        store.createIndex("created_at", "created_at");
        store.createIndex("sync_status", "sync.status");
      }

      if (!db.objectStoreNames.contains(TAXONOMY_STORE)) {
        const store = db.createObjectStore(TAXONOMY_STORE, { keyPath: "id" });
        store.createIndex("kind", "kind");
        store.createIndex("category", "category");
        store.createIndex("subcategory", "subcategory");
        store.createIndex("local_owner_user_id", "local_owner_user_id");
      } else {
        const store = request.transaction?.objectStore(TAXONOMY_STORE);

        if (store) {
          if (!store.indexNames.contains("kind")) {
            store.createIndex("kind", "kind");
          }
          if (!store.indexNames.contains("category")) {
            store.createIndex("category", "category");
          }
          if (!store.indexNames.contains("subcategory")) {
            store.createIndex("subcategory", "subcategory");
          }
          if (!store.indexNames.contains("local_owner_user_id")) {
            store.createIndex("local_owner_user_id", "local_owner_user_id");
          }
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败"));
  });
}

async function getAllRows<T>(storeName: string) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const rows = await requestToPromise<T[]>(
      transaction.objectStore(storeName).getAll()
    );
    await done;
    return rows;
  } finally {
    db.close();
  }
}

async function getRowById<T>(storeName: string, id: string) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const row = await requestToPromise<T | undefined>(
      transaction.objectStore(storeName).get(id)
    );
    await done;
    return row || null;
  } finally {
    db.close();
  }
}

function updateLocalUsageHints(archiveCount: number, recordCount: number) {
  if (typeof window === "undefined") return;

  try {
  window.localStorage.setItem("lifespace_local_project_count", String(archiveCount));
  window.localStorage.setItem("lifespace_local_record_count", String(recordCount));
  if (!window.localStorage.getItem("lifespace_first_local_used_at")) {
    window.localStorage.setItem("lifespace_first_local_used_at", nowIso());
  }
  } catch { /* Usage badges are optional; a committed record must remain successful. */ }
}

async function refreshLocalUsageHints() {
  const [archives, records] = await Promise.all([
    getAllRows<LocalArchive>(ARCHIVE_STORE),
    getAllRows<LocalRecord>(RECORD_STORE),
  ]);
  const normalizedArchives = archives.map(normalizeLocalArchive);
  const userLocalArchives = normalizedArchives.filter(isUserLocalArchive);
  const visibleRecordCount = userLocalArchives.reduce(
    (total, archive) =>
      total + getVisibleLocalRecordsForArchive(archive, records).length,
    0
  );

  updateLocalUsageHints(userLocalArchives.length, visibleRecordCount);
}

function buildSummary(
  archive: LocalArchive,
  records: LocalRecord[],
  images: LocalImage[]
): LocalArchiveSummary {
  const archiveRecords = getVisibleLocalRecordsForArchive(archive, records)
    .sort(
      (a, b) =>
        new Date(b.record_time || b.created_at).getTime() -
        new Date(a.record_time || a.created_at).getTime()
    );
  const visibleRecordIds = new Set(archiveRecords.map((record) => record.id));
  const archiveImages = images.filter(
    (image) =>
      image.archive_id === archive.id && visibleRecordIds.has(image.record_id)
  );
  const latestRecord = archiveRecords[0] || null;
  const coverRecord = archiveRecords.find((record) =>
    archiveImages.some((image) => image.record_id === record.id)
  );
  const coverImage =
    (coverRecord &&
      archiveImages
        .filter((image) => image.record_id === coverRecord.id)
        .sort((a, b) => a.sort_order - b.sort_order)[0]) ||
    archiveImages.sort((a, b) => a.sort_order - b.sort_order)[0] ||
    null;

  return {
    ...archive,
    record_count: archiveRecords.length,
    image_count: archiveImages.length,
    pending_record_count: archiveRecords.filter(
      (record) => record.sync?.status === "pending-cloud-sync"
    ).length,
    latest_record_time: latestRecord?.record_time || null,
    latest_record_note: latestRecord?.note || null,
    cover_image: coverImage,
  };
}

export async function listLocalArchiveSummaries() {
  const [archives, records, images] = await Promise.all([
    getAllRows<LocalArchive>(ARCHIVE_STORE),
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);

  const normalizedArchives = archives.map(normalizeLocalArchive);
  const userLocalArchives = normalizedArchives.filter(isUserLocalArchive);
  updateLocalUsageHints(
    userLocalArchives.length,
    userLocalArchives.reduce(
      (total, archive) =>
        total + getVisibleLocalRecordsForArchive(archive, records).length,
      0
    )
  );

  return userLocalArchives
    .map((archive) => buildSummary(archive, records, images))
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime()
    );
}

export async function inferSingleLocalArchiveOwnerContext(): Promise<LocalArchiveOwnerContext | null> {
  const archives = await getAllRows<LocalArchive>(ARCHIVE_STORE);
  const owners = new Map<string, string | null>();

  for (const archive of archives.map(normalizeLocalArchive)) {
    const userId = normalizeOptionalText(archive.local_owner_user_id);
    if (!userId) continue;
    owners.set(userId, normalizeOptionalText(archive.local_owner_email));
    if (owners.size > 1) return null;
  }

  if (owners.size !== 1) return null;
  const [[userId, email]] = owners;
  return { userId, email };
}

export async function listLocalArchiveCycleTrash(
  ownerContext?: LocalArchiveOwnerContext | null
): Promise<LocalArchiveCycleTrashListItem[]> {
  const archives = await getAllRows<LocalArchive>(ARCHIVE_STORE);

  return archives
    .map(normalizeLocalArchive)
    .filter((archive) => isLocalArchiveVisibleToOwner(archive, ownerContext))
    .flatMap((archive) =>
      (archive.trashed_cycles || []).map((trash) => ({
        archive_id: archive.id,
        archive_title: archive.title,
        trash,
      }))
    )
    .sort(
      (a, b) =>
        new Date(b.trash.deleted_at).getTime() -
        new Date(a.trash.deleted_at).getTime()
    );
}

export async function listVisibleLocalArchiveSummaries(
  ownerContext?: LocalArchiveOwnerContext | null
): Promise<LocalArchiveVisibilityResult> {
  const [archives, records, images] = await Promise.all([
    getAllRows<LocalArchive>(ARCHIVE_STORE),
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);
  const currentUserId = getOwnerUserId(ownerContext);

  const normalizedArchives = archives.map(normalizeLocalArchive);
  await persistRepairedLocalArchiveRoles(archives, normalizedArchives);
  updateLocalUsageHints(
    normalizedArchives.length,
    normalizedArchives.reduce(
      (total, archive) =>
        total + getVisibleLocalRecordsForArchive(archive, records).length,
      0
    )
  );
  const summaries = normalizedArchives
    .filter(isUserLocalArchive)
    .map((archive) => buildSummary(archive, records, images));
  const visible = summaries.filter((archive) =>
    isLocalArchiveVisibleToOwner(archive, ownerContext)
  );

  return {
    archives: visible.sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime()
    ),
    totalCount: summaries.length,
    unownedCount: summaries.filter((archive) => !archive.local_owner_user_id).length,
    ownedByCurrentCount: currentUserId
      ? summaries.filter((archive) => archive.local_owner_user_id === currentUserId).length
      : 0,
    hiddenOwnedByOtherCount: summaries.filter(
      (archive) =>
        Boolean(archive.local_owner_user_id) &&
        archive.local_owner_user_id !== currentUserId
    ).length,
  };
}

export async function listPendingCloudSyncSummaries(
  ownerContext?: LocalArchiveOwnerContext | null
): Promise<PendingCloudSyncSummary[]> {
  const [archives, records, images] = await Promise.all([
    getAllRows<LocalArchive>(ARCHIVE_STORE),
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);

  return archives
    .map(normalizeLocalArchive)
    .filter(
      (archive) =>
        Boolean(archive.source_cloud_archive_id) &&
        isUserLocalArchive(archive) &&
        isLocalArchiveVisibleToOwner(archive, ownerContext)
    )
    .map((archive) => {
      const pendingRecords = records
        .filter((record) => record.archive_id === archive.id)
        .map((record) => ({
          ...record,
          sync: normalizeLocalSyncMeta(record.sync),
        }))
        .filter((record) => isPendingCloudSyncStatus(record.sync.status));
      const pendingImages = images
        .filter((image) => image.archive_id === archive.id)
        .map((image) => ({
          ...image,
          sync: normalizeLocalSyncMeta(image.sync),
        }))
        .filter((image) => isPendingCloudSyncStatus(image.sync.status));
      const archiveUpdatePending = isPendingCloudSyncStatus(
        archive.sync.status
      );

      if (
        !archiveUpdatePending &&
        pendingRecords.length === 0 &&
        pendingImages.length === 0
      ) {
        return null;
      }

      const promptMode = archive.pending_sync_prompt_mode || "ask";
      return {
        local_archive_id: archive.id,
        cloud_archive_id: archive.source_cloud_archive_id!,
        title: archive.title,
        record_count: pendingRecords.length,
        image_count: pendingImages.length,
        estimated_media_bytes: pendingImages.reduce(
          (total, image) => total + Math.max(0, Number(image.cached_size) || 0),
          0
        ),
        failed_record_count: pendingRecords.filter(
          (record) => record.sync.status === "failed"
        ).length,
        failed_image_count: pendingImages.filter(
          (image) => image.sync.status === "failed"
        ).length,
        archive_update_pending: archiveUpdatePending,
        prompt_mode: promptMode,
        should_prompt: promptMode === "ask",
        first_detected_at: archive.pending_sync_first_detected_at || null,
        deferred_at: archive.pending_sync_deferred_at || null,
      } satisfies PendingCloudSyncSummary;
    })
    .filter((summary): summary is PendingCloudSyncSummary => Boolean(summary))
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
}

export async function preparePendingCloudSyncQueue(
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const db = await openLocalDb();
  const timestamp = nowIso();
  let queuedRecordCount = 0;
  let queuedImageCount = 0;

  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);
    const [archives, records, images] = await Promise.all([
      requestToPromise<LocalArchive[]>(archiveStore.getAll()),
      requestToPromise<LocalRecord[]>(recordStore.getAll()),
      requestToPromise<LocalImage[]>(imageStore.getAll()),
    ]);

    for (const rawArchive of archives) {
      const archive = normalizeLocalArchive(rawArchive);
      const cloudArchiveId = normalizeOptionalText(
        archive.source_cloud_archive_id
      );
      if (
        !cloudArchiveId ||
        !isLocalArchiveVisibleToOwner(archive, ownerContext)
      ) {
        continue;
      }

      let archiveHasNewPending = false;
      const archiveRecords = records.filter(
        (record) => record.archive_id === archive.id
      );
      const recordSyncById = new Map<string, LocalSyncMeta>();

      for (const record of archiveRecords) {
        let sync = normalizeLocalSyncMeta(record.sync);
        if (sync.status === "local-only" && !sync.cloud_record_id) {
          sync = queueCloudSyncOperation(sync, {
            cloudArchiveId,
            operationKind: "create-record",
            timestamp,
          });
          await requestToPromise(recordStore.put({ ...record, sync }));
          queuedRecordCount += 1;
          archiveHasNewPending = true;
        }
        recordSyncById.set(record.id, sync);
      }

      for (const image of images.filter(
        (candidate) => candidate.archive_id === archive.id
      )) {
        const currentSync = normalizeLocalSyncMeta(image.sync);
        if (
          currentSync.status !== "local-only" ||
          currentSync.cloud_media_id
        ) {
          continue;
        }

        const parentSync = recordSyncById.get(image.record_id);
        if (!parentSync) continue;
        const sync = queueCloudSyncOperation(currentSync, {
          cloudArchiveId,
          operationKind: "upload-image",
          timestamp,
          cloudRecordId: parentSync.cloud_record_id,
          dependsOnOperationId: parentSync.cloud_record_id
            ? null
            : parentSync.client_operation_id,
        });
        await requestToPromise(imageStore.put({ ...image, sync }));
        queuedImageCount += 1;
        archiveHasNewPending = true;
      }

      if (archiveHasNewPending) {
        await requestToPromise(
          archiveStore.put(markArchivePendingPrompt(archive, timestamp))
        );
      }
    }

    await done;
    return { queuedRecordCount, queuedImageCount };
  } finally {
    db.close();
  }
}

export async function deferPendingCloudSyncPrompt(
  archiveId: string,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const db = await openLocalDb();
  const timestamp = nowIso();

  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(archiveId)
    );

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (
      !normalizedArchive.source_cloud_archive_id ||
      !isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)
    ) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("这个项目没有可延后的云端待上传内容。");
    }

    const [records, images] = await Promise.all([
      requestToPromise<LocalRecord[]>(
        transaction.objectStore(RECORD_STORE).getAll()
      ),
      requestToPromise<LocalImage[]>(
        transaction.objectStore(IMAGE_STORE).getAll()
      ),
    ]);
    const hasPendingRecord = records.some(
      (record) =>
        record.archive_id === archiveId &&
        isPendingCloudSyncStatus(normalizeLocalSyncMeta(record.sync).status)
    );
    const hasPendingImage = images.some(
      (image) =>
        image.archive_id === archiveId &&
        isPendingCloudSyncStatus(normalizeLocalSyncMeta(image.sync).status)
    );
    if (
      !hasPendingRecord &&
      !hasPendingImage &&
      !isPendingCloudSyncStatus(normalizedArchive.sync.status)
    ) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("这个项目目前没有待上传内容。");
    }

    const nextArchive: LocalArchive = {
      ...normalizedArchive,
      pending_sync_prompt_mode: "manual",
      pending_sync_first_detected_at:
        normalizedArchive.pending_sync_first_detected_at || timestamp,
      pending_sync_deferred_at: timestamp,
    };
    await requestToPromise(archiveStore.put(nextArchive));
    await done;
    return nextArchive;
  } finally {
    db.close();
  }
}

function localTaxonomyKey(item: Pick<LocalTaxonomyItem, "kind" | "label"> & {
  category?: ArchiveCategory | null;
  subcategory?: string | null;
}) {
  return [
    item.kind,
    item.category || "",
    item.subcategory || "",
    normalizeOptionalText(item.label) || "",
  ].join("::");
}

export async function diagnoseLocalArchiveStores(
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const [archives, records, images] = await Promise.all([
    getAllRows<LocalArchive>(ARCHIVE_STORE),
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);
  const remembered = loadRememberedLocalOwnerContext();
  const visibleOwner = ownerContextForVisibleCaches(ownerContext);
  const counts = {
    localProject: 0,
    savedLocalCopy: 0,
    cloudOfflineCache: 0,
    other: 0,
  };
  const caches = archives.map(normalizeLocalArchive).filter((archive) => {
    if (archive.local_role === "local-project") counts.localProject += 1;
    else if (archive.local_role === "saved-local-copy") counts.savedLocalCopy += 1;
    else if (archive.local_role === "cloud-offline-cache") counts.cloudOfflineCache += 1;
    else counts.other += 1;
    return archive.local_role === "cloud-offline-cache";
  }).map((archive) => ({
    id: archive.id,
    source_cloud_archive_id: archive.source_cloud_archive_id || null,
    local_role: archive.local_role,
    local_owner_user_id: archive.local_owner_user_id || null,
    source_cloud_cache_revision: archive.source_cloud_cache_revision || null,
    updated_at: archive.updated_at,
    visible: isLocalArchiveVisibleToOwner(archive, visibleOwner),
  }));
  const visibleCacheCount = caches.filter((item) => item.visible).length;
  return {
    origin: typeof location !== "undefined" ? location.origin : "",
    ownerContextUserId: ownerContext?.userId || null,
    rememberedUserId: remembered?.userId || null,
    visibleOwnerUserId: visibleOwner?.userId || null,
    counts,
    recordCount: records.length,
    imageCount: images.length,
    caches,
    visibleCacheCount,
  };
}

export async function listVisibleCloudOfflineArchiveSummaries(
  ownerContext?: LocalArchiveOwnerContext | null
): Promise<LocalArchiveSummary[]> {
  const visibleOwner = ownerContextForVisibleCaches(ownerContext);
  const [archives, records, images] = await Promise.all([
    getAllRows<LocalArchive>(ARCHIVE_STORE),
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);

  const normalizedArchives = archives.map(normalizeLocalArchive);
  await persistRepairedLocalArchiveRoles(archives, normalizedArchives);

  return normalizedArchives
    .filter(
      (archive) =>
        archive.local_role === "cloud-offline-cache" &&
        isLocalArchiveVisibleToOwner(archive, visibleOwner)
    )
    .map((archive) => buildSummary(archive, records, images))
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime()
    );
}

export async function listVisibleLocalTaxonomyItems(
  ownerContext?: LocalArchiveOwnerContext | null
): Promise<LocalTaxonomyItem[]> {
  const [taxonomyRows, archiveRows] = await Promise.all([
    getAllRows<LocalTaxonomyItem>(TAXONOMY_STORE),
    getAllRows<LocalArchive>(ARCHIVE_STORE),
  ]);
  const timestamp = nowIso();
  const visibleItems = taxonomyRows
    .map(normalizeLocalTaxonomyItem)
    .filter((item) => item.label && isLocalTaxonomyVisibleToOwner(item, ownerContext));
  const visibleArchives = archiveRows
    .map(normalizeLocalArchive)
    .filter((archive) => isLocalArchiveVisibleToOwner(archive, ownerContext));
  const merged = new Map<string, LocalTaxonomyItem>();

  for (const item of visibleItems) {
    merged.set(localTaxonomyKey(item), item);
  }

  for (const archive of visibleArchives) {
    if (archive.subcategory) {
      const item: LocalTaxonomyItem = {
        id: `derived_subcategory_${archive.category}_${archive.subcategory}`,
        kind: "subcategory",
        label: archive.subcategory,
        category: archive.category,
        subcategory: null,
        local_owner_user_id: archive.local_owner_user_id || null,
        local_owner_email: archive.local_owner_email || null,
        created_at: archive.created_at || timestamp,
        updated_at: archive.updated_at || archive.created_at || timestamp,
        local_only: true,
      };
      if (!merged.has(localTaxonomyKey(item))) {
        merged.set(localTaxonomyKey(item), item);
      }
    }

    if (archive.group_name) {
      const item: LocalTaxonomyItem = {
        id: `derived_group_${archive.category}_${archive.subcategory || "none"}_${archive.group_name}`,
        kind: "group",
        label: archive.group_name,
        category: archive.category,
        subcategory: archive.subcategory || null,
        local_owner_user_id: archive.local_owner_user_id || null,
        local_owner_email: archive.local_owner_email || null,
        created_at: archive.created_at || timestamp,
        updated_at: archive.updated_at || archive.created_at || timestamp,
        local_only: true,
      };
      if (!merged.has(localTaxonomyKey(item))) {
        merged.set(localTaxonomyKey(item), item);
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    const categoryCompare = String(a.category || "").localeCompare(String(b.category || ""), "zh-CN");
    if (categoryCompare !== 0) return categoryCompare;
    const kindCompare = a.kind.localeCompare(b.kind);
    if (kindCompare !== 0) return kindCompare;
    return a.label.localeCompare(b.label, "zh-CN");
  });
}

export async function createLocalTaxonomyItem(
  input: {
    kind: LocalTaxonomyKind;
    label: string;
    category?: ArchiveCategory | null;
    subcategory?: string | null;
  },
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const label = normalizeOptionalText(input.label);
  if (!label) throw new Error("请填写本地分类名称");

  const timestamp = nowIso();
  const item: LocalTaxonomyItem = {
    id: createId(`local_${input.kind}`),
    kind: input.kind === "group" ? "group" : "subcategory",
    label,
    category: input.category ? normalizeLocalArchiveCategory(input.category) : null,
    subcategory: normalizeOptionalText(input.subcategory),
    local_owner_user_id: getOwnerUserId(ownerContext),
    local_owner_email: normalizeOptionalText(ownerContext?.email),
    created_at: timestamp,
    updated_at: timestamp,
    local_only: true,
  };
  const existingItems = await getAllRows<LocalTaxonomyItem>(TAXONOMY_STORE);
  const existing = existingItems
    .map(normalizeLocalTaxonomyItem)
    .find(
      (row) =>
        isLocalTaxonomyVisibleToOwner(row, ownerContext) &&
        localTaxonomyKey(row) === localTaxonomyKey(item)
    );
  if (existing) return existing;

  const db = await openLocalDb();
  try {
    const transaction = db.transaction(TAXONOMY_STORE, "readwrite");
    const done = transactionDone(transaction);
    await requestToPromise(transaction.objectStore(TAXONOMY_STORE).add(item));
    await done;
    return item;
  } finally {
    db.close();
  }
}

export async function deleteLocalTaxonomyItem(
  input: {
    kind: LocalTaxonomyKind;
    label: string;
    category?: ArchiveCategory | null;
    subcategory?: string | null;
  },
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const label = normalizeOptionalText(input.label);
  if (!label) return;

  const category = input.category ? normalizeLocalArchiveCategory(input.category) : null;
  const subcategory = normalizeOptionalText(input.subcategory);
  const [taxonomyRows, archiveRows] = await Promise.all([
    getAllRows<LocalTaxonomyItem>(TAXONOMY_STORE),
    getAllRows<LocalArchive>(ARCHIVE_STORE),
  ]);
  const matchingTaxonomyIds = taxonomyRows
    .map(normalizeLocalTaxonomyItem)
    .filter(
      (item) =>
        item.kind === input.kind &&
        item.label === label &&
        (category ? item.category === category : true) &&
        (input.kind === "group" && subcategory ? item.subcategory === subcategory : true) &&
        isLocalTaxonomyVisibleToOwner(item, ownerContext)
    )
    .map((item) => item.id);
  const matchingArchives = archiveRows
    .map(normalizeLocalArchive)
    .filter((archive) => {
      if (!isLocalArchiveVisibleToOwner(archive, ownerContext)) return false;
      if (category && archive.category !== category) return false;
      if (input.kind === "subcategory") return archive.subcategory === label;
      if (subcategory && archive.subcategory !== subcategory) return false;
      return archive.group_name === label;
    });

  const db = await openLocalDb();
  try {
    const transaction = db.transaction([TAXONOMY_STORE, ARCHIVE_STORE], "readwrite");
    const done = transactionDone(transaction);
    const taxonomyStore = transaction.objectStore(TAXONOMY_STORE);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const timestamp = nowIso();

    for (const id of matchingTaxonomyIds) {
      await requestToPromise(taxonomyStore.delete(id));
    }

    for (const archive of matchingArchives) {
      const nextArchive: LocalArchive =
        input.kind === "subcategory"
          ? { ...archive, subcategory: null, group_name: null, updated_at: timestamp }
          : { ...archive, group_name: null, updated_at: timestamp };
      await requestToPromise(archiveStore.put(nextArchive));
    }

    await done;
  } finally {
    db.close();
  }
}

export async function renameLocalTaxonomyItem(
  input: {
    kind: LocalTaxonomyKind;
    oldLabel: string;
    newLabel: string;
    category?: ArchiveCategory | null;
    subcategory?: string | null;
  },
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const oldLabel = normalizeOptionalText(input.oldLabel);
  const newLabel = normalizeOptionalText(input.newLabel);
  if (!oldLabel || !newLabel || oldLabel === newLabel) return;

  const category = input.category ? normalizeLocalArchiveCategory(input.category) : null;
  const subcategory = normalizeOptionalText(input.subcategory);
  const [taxonomyRows, archiveRows] = await Promise.all([
    getAllRows<LocalTaxonomyItem>(TAXONOMY_STORE),
    getAllRows<LocalArchive>(ARCHIVE_STORE),
  ]);
  const db = await openLocalDb();

  try {
    const transaction = db.transaction([TAXONOMY_STORE, ARCHIVE_STORE], "readwrite");
    const done = transactionDone(transaction);
    const taxonomyStore = transaction.objectStore(TAXONOMY_STORE);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const timestamp = nowIso();

    for (const rawItem of taxonomyRows) {
      const item = normalizeLocalTaxonomyItem(rawItem);
      if (!isLocalTaxonomyVisibleToOwner(item, ownerContext)) continue;
      if (category && item.category !== category) continue;

      if (input.kind === "subcategory") {
        if (item.kind === "subcategory" && item.label === oldLabel) {
          await requestToPromise(
            taxonomyStore.put({ ...item, label: newLabel, updated_at: timestamp })
          );
        }
        if (item.kind === "group" && item.subcategory === oldLabel) {
          await requestToPromise(
            taxonomyStore.put({ ...item, subcategory: newLabel, updated_at: timestamp })
          );
        }
      } else if (
        item.kind === "group" &&
        item.label === oldLabel &&
        (!subcategory || item.subcategory === subcategory)
      ) {
        await requestToPromise(
          taxonomyStore.put({ ...item, label: newLabel, updated_at: timestamp })
        );
      }
    }

    for (const rawArchive of archiveRows) {
      const archive = normalizeLocalArchive(rawArchive);
      if (!isLocalArchiveVisibleToOwner(archive, ownerContext)) continue;
      if (category && archive.category !== category) continue;

      if (input.kind === "subcategory" && archive.subcategory === oldLabel) {
        await requestToPromise(
          archiveStore.put({ ...archive, subcategory: newLabel, updated_at: timestamp })
        );
      }
      if (
        input.kind === "group" &&
        archive.group_name === oldLabel &&
        (!subcategory || archive.subcategory === subcategory)
      ) {
        await requestToPromise(
          archiveStore.put({ ...archive, group_name: newLabel, updated_at: timestamp })
        );
      }
    }

    await done;
  } finally {
    db.close();
  }
}

export async function updateLocalArchiveFields(
  archiveId: string,
  updates: {
    title?: string | null;
    category?: ArchiveCategory | null;
    subcategory?: string | null;
    group_name?: string | null;
    system_name?: string | null;
    species_name?: string | null;
    plant_id?: string | null;
    plant_slug?: string | null;
    source?: string | null;
  planting_region?: PlantingRegion | null;
    note?: string | null;
    archive_summary?: string | null;
    cycle_enabled?: boolean;
    next_cycle_name?: string | null;
    status?: "active" | "ended";
    ended_at?: string | null;
  },
  ownerContext?: LocalArchiveOwnerContext | null
) {
  if (updates.planting_region != null && !normalizePlantingRegion(updates.planting_region)) {
    throw new Error("种植地区无效 / Invalid planting region.");
  }
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(archiveId)
    );

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("没有权限修改这个本地项目。");
    }
    if (normalizedArchive.local_role === "cloud-offline-cache") {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("云端离线副本为只读，请联网后修改项目资料。");
    }

    let nextArchive: LocalArchive = {
      ...normalizedArchive,
      title:
        updates.title === undefined
          ? normalizedArchive.title
          : normalizeOptionalText(updates.title) || normalizedArchive.title,
      category:
        updates.category === undefined || updates.category === null
          ? normalizedArchive.category
          : normalizeLocalArchiveCategory(updates.category),
      main_category:
        updates.category === undefined || updates.category === null
          ? normalizedArchive.main_category
          : normalizeLocalArchiveCategory(updates.category),
      subcategory:
        updates.subcategory === undefined
          ? normalizedArchive.subcategory
          : normalizeOptionalText(updates.subcategory),
      group_name:
        updates.group_name === undefined
          ? normalizedArchive.group_name
          : normalizeOptionalText(updates.group_name),
      system_name:
        updates.system_name === undefined
          ? normalizedArchive.system_name
          : normalizeOptionalText(updates.system_name),
      species_name:
        updates.species_name === undefined
          ? normalizedArchive.species_name
          : normalizeOptionalText(updates.species_name),
      plant_id:
        updates.plant_id === undefined
          ? normalizedArchive.plant_id
          : normalizeOptionalText(updates.plant_id),
      plant_slug:
        updates.plant_slug === undefined
          ? normalizedArchive.plant_slug
          : normalizeOptionalText(updates.plant_slug),
      source:
        updates.source === undefined
          ? normalizedArchive.source
          : normalizeOptionalText(updates.source),
      planting_region: updates.planting_region === undefined ? normalizedArchive.planting_region : normalizePlantingRegion(updates.planting_region),
      note:
        updates.note === undefined
          ? normalizedArchive.note
          : normalizeOptionalText(updates.note),
      archive_summary:
        updates.archive_summary === undefined
          ? normalizedArchive.archive_summary
          : normalizeOptionalText(updates.archive_summary),
      cycle_enabled:
        updates.cycle_enabled === undefined
          ? normalizedArchive.cycle_enabled
          : Boolean(updates.cycle_enabled),
      next_cycle_name:
        updates.next_cycle_name === undefined
          ? normalizedArchive.next_cycle_name
          : normalizeOptionalText(updates.next_cycle_name)?.slice(0, 80) || null,
      status:
        updates.status === undefined
          ? normalizedArchive.status
          : updates.status,
      ended_at:
        updates.ended_at === undefined
          ? normalizedArchive.ended_at
          : normalizeOptionalText(updates.ended_at),
      updated_at: nowIso(),
    };

    const cloudArchiveId = normalizeOptionalText(
      normalizedArchive.source_cloud_archive_id
    );
    const pendingFieldChecks: Array<[string, boolean]> = [
      ["title", updates.title !== undefined && nextArchive.title !== normalizedArchive.title],
      ["category", updates.category !== undefined && nextArchive.category !== normalizedArchive.category],
      ["system_name", updates.system_name !== undefined && nextArchive.system_name !== normalizedArchive.system_name],
      ["species_name", updates.species_name !== undefined && nextArchive.species_name !== normalizedArchive.species_name],
      ["plant_id", updates.plant_id !== undefined && nextArchive.plant_id !== normalizedArchive.plant_id],
      ["source", updates.source !== undefined && nextArchive.source !== normalizedArchive.source],
      ["planting_region", updates.planting_region !== undefined && JSON.stringify(nextArchive.planting_region || null) !== JSON.stringify(normalizedArchive.planting_region || null)],
      ["note", updates.note !== undefined && nextArchive.note !== normalizedArchive.note],
      ["archive_summary", updates.archive_summary !== undefined && nextArchive.archive_summary !== normalizedArchive.archive_summary],
      ["cycle_enabled", updates.cycle_enabled !== undefined && nextArchive.cycle_enabled !== normalizedArchive.cycle_enabled],
      ["next_cycle_name", updates.next_cycle_name !== undefined && nextArchive.next_cycle_name !== normalizedArchive.next_cycle_name],
      ["status", updates.status !== undefined && nextArchive.status !== normalizedArchive.status],
      ["ended_at", updates.ended_at !== undefined && nextArchive.ended_at !== normalizedArchive.ended_at],
    ];
    const pendingFields = pendingFieldChecks
      .filter((item) => item[1])
      .map((item) => item[0]);

    if (cloudArchiveId && pendingFields.length > 0) {
      nextArchive = markArchivePendingPrompt(nextArchive, nextArchive.updated_at);
      nextArchive.sync = queueCloudSyncOperation(nextArchive.sync, {
        cloudArchiveId,
        operationKind: "update-archive",
        timestamp: nextArchive.updated_at,
        pendingFields,
      });
    }

    await requestToPromise(archiveStore.put(nextArchive));
    await done;
    await refreshLocalUsageHints();
    return nextArchive;
  } finally {
    db.close();
  }
}

export async function updateLocalArchiveMigrationState(
  archiveId: string,
  updates: {
    migration_status?: LocalCloudMigrationStatus | null;
    migration_cloud_archive_id?: string | null;
    migration_started_at?: string | null;
    migration_error?: string | null;
    migration_visibility?: "private" | "public" | null;
    migrated_at?: string | null;
    sync?: Partial<LocalSyncMeta>;
  },
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(archiveId)
    );

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("没有权限修改这个本地项目。");
    }

    const nextArchive: LocalArchive = {
      ...normalizedArchive,
      migration_status:
        updates.migration_status === undefined
          ? normalizedArchive.migration_status || null
          : updates.migration_status,
      migration_cloud_archive_id:
        updates.migration_cloud_archive_id === undefined
          ? normalizedArchive.migration_cloud_archive_id || null
          : normalizeOptionalText(updates.migration_cloud_archive_id),
      migration_started_at:
        updates.migration_started_at === undefined
          ? normalizedArchive.migration_started_at || null
          : normalizeOptionalText(updates.migration_started_at),
      migration_error:
        updates.migration_error === undefined
          ? normalizedArchive.migration_error || null
          : normalizeOptionalText(updates.migration_error),
      migration_visibility:
        updates.migration_visibility === undefined
          ? normalizedArchive.migration_visibility || null
          : updates.migration_visibility,
      migrated_at:
        updates.migrated_at === undefined
          ? normalizedArchive.migrated_at || null
          : normalizeOptionalText(updates.migrated_at),
      sync: updates.sync
        ? normalizeLocalSyncMeta({ ...normalizedArchive.sync, ...updates.sync })
        : normalizeLocalSyncMeta(normalizedArchive.sync),
      updated_at: nowIso(),
    };

    await requestToPromise(archiveStore.put(nextArchive));
    await done;
    await refreshLocalUsageHints();
    return nextArchive;
  } finally {
    db.close();
  }
}

export async function updateLocalArchiveCloudSyncOperation(
  archiveId: string,
  operationId: string,
  update: LocalCloudSyncOperationUpdate,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const db = await openLocalDb();
  const timestamp = nowIso();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(archiveId)
    );

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("没有权限修改这个本地项目。");
    }

    const nextArchive: LocalArchive = {
      ...normalizedArchive,
      sync: applyCloudSyncOperationUpdate(
        normalizedArchive.sync,
        operationId,
        update,
        timestamp
      ),
      updated_at: timestamp,
    };
    await requestToPromise(archiveStore.put(nextArchive));
    await done;
    return nextArchive;
  } finally {
    db.close();
  }
}

export async function updateLocalRecordFields(recordId: string, updates: {
  note?: string | null; record_time?: string | null; cycle_id?: string | null;
  location?: RecordLocation | null; image_files?: File[]; image_captured_at?: Array<string | null>;
}) {
  const files = updates.image_files || [];
  if (files.length > 10) throw new Error("每次最多添加10张照片。");
  // Decode before the transaction. Conversion failure must not commit partial edits.
  const prepared = await Promise.all(files.map((file, index) => prepareLocalImage(file, index)));
  const db = await openLocalDb();
  const transaction = db.transaction([RECORD_STORE, ARCHIVE_STORE, IMAGE_STORE], "readwrite");
  const done = transactionDone(transaction);
  void done.catch(() => undefined);
  try {
    const recordStore = transaction.objectStore(RECORD_STORE);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);
    const record = await requestToPromise<LocalRecord | undefined>(recordStore.get(recordId));
    if (!record) throw new Error("本地记录不存在。");
    const archive = await requestToPromise<LocalArchive | undefined>(archiveStore.get(record.archive_id));
    if (!archive) throw new Error("本地项目不存在。");
    const normalizedArchive = normalizeLocalArchive(archive);
    const nextCycleId = updates.cycle_id === undefined ? record.cycle_id || null : normalizeOptionalText(updates.cycle_id);
    if (
      normalizedArchive.local_role === "cloud-offline-cache" &&
      record.sync?.status !== "pending-cloud-sync"
    ) {
      throw new Error("云端已有记录离线时只读，请联网后修改。");
    }
    if (updates.cycle_id !== undefined && nextCycleId && !normalizedArchive.cycles?.some((cycle) => cycle.id === nextCycleId)) throw new Error("选择的期次不属于这个本地项目。");
    const timestamp = nowIso();
    const nextRecord: LocalRecord = {
      ...record, location: updates.location === undefined ? record.location : normalizeRecordLocation(updates.location),
      note: updates.note === undefined ? record.note : normalizeOptionalText(updates.note) || "",
      record_time: updates.record_time === undefined ? record.record_time : normalizeOptionalText(updates.record_time) || record.record_time,
      cycle_id: nextCycleId,
      sync: normalizeLocalSyncMeta(record.sync),
      updated_at: timestamp,
    };
    const recordFieldChecks: Array<[string, boolean]> = [
      ["note", updates.note !== undefined && nextRecord.note !== record.note],
      ["record_time", updates.record_time !== undefined && nextRecord.record_time !== record.record_time],
      ["cycle_id", updates.cycle_id !== undefined && nextRecord.cycle_id !== (record.cycle_id || null)],
      ["location", updates.location !== undefined && JSON.stringify(nextRecord.location || null) !== JSON.stringify(record.location || null)],
    ];
    const changedRecordFields = recordFieldChecks
      .filter((item) => item[1])
      .map((item) => item[0]);
    const cloudArchiveId = normalizeOptionalText(
      normalizedArchive.source_cloud_archive_id
    );

    if (cloudArchiveId && !nextRecord.sync.cloud_record_id) {
      nextRecord.sync = queueCloudSyncOperation(nextRecord.sync, {
        cloudArchiveId,
        operationKind: "create-record",
        timestamp,
        pendingFields: changedRecordFields,
      });
    } else if (cloudArchiveId && changedRecordFields.length > 0) {
      nextRecord.sync = queueCloudSyncOperation(nextRecord.sync, {
        cloudArchiveId,
        operationKind: "update-record",
        timestamp,
        cloudRecordId: nextRecord.sync.cloud_record_id,
        pendingFields: changedRecordFields,
      });
    }
    if (prepared.length) {
      const previous = await requestToPromise<LocalImage[]>(imageStore.getAll());
      const order = Math.max(-1, ...previous.filter((image) => image.record_id === recordId).map((image) => image.sort_order || 0)) + 1;
      for (let index = 0; index < prepared.length; index++) {
        const capturedAt = updates.image_captured_at?.[index];
        await requestToPromise(imageStore.add({ ...prepared[index], id: createId("local_image"), archive_id: record.archive_id, record_id: recordId,
          sort_order: order + index, created_at: timestamp, captured_at: capturedAt && !Number.isNaN(new Date(capturedAt).getTime()) ? new Date(capturedAt).toISOString() : null,
          local_only: true,
          sync: cloudArchiveId
            ? queueCloudSyncOperation(null, {
                cloudArchiveId,
                operationKind: "upload-image",
                timestamp,
                cloudRecordId: nextRecord.sync.cloud_record_id,
                dependsOnOperationId: nextRecord.sync.cloud_record_id
                  ? null
                  : nextRecord.sync.client_operation_id,
              })
            : localSyncMeta(),
        } satisfies LocalImage));
      }
    }
    await requestToPromise(recordStore.put(nextRecord));
    const nextArchive =
      cloudArchiveId &&
      (prepared.length > 0 || isPendingCloudSyncStatus(nextRecord.sync.status))
        ? markArchivePendingPrompt(
            { ...normalizedArchive, updated_at: timestamp },
            timestamp,
          )
        : { ...normalizedArchive, updated_at: timestamp };
    await requestToPromise(archiveStore.put(nextArchive));
    await done;
    await refreshLocalUsageHints();
    return nextRecord;
  } catch (error) {
    try { transaction.abort(); } catch { /* Already completed. */ }
    await done.catch(() => undefined);
    throw error;
  } finally { db.close(); }
}

export async function updateLocalRecordSyncMeta(
  recordId: string,
  syncUpdates: Partial<LocalSyncMeta>
) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(RECORD_STORE, "readwrite");
    const done = transactionDone(transaction);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const record = await requestToPromise<LocalRecord | undefined>(
      recordStore.get(recordId)
    );

    if (!record) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地记录不存在。");
    }

    const nextRecord: LocalRecord = {
      ...record,
      sync: normalizeLocalSyncMeta({ ...record.sync, ...syncUpdates }),
      updated_at: nowIso(),
    };

    await requestToPromise(recordStore.put(nextRecord));
    await done;
    return nextRecord;
  } finally {
    db.close();
  }
}

export async function updateLocalImageSyncMeta(
  imageId: string,
  syncUpdates: Partial<LocalSyncMeta>
) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(IMAGE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const imageStore = transaction.objectStore(IMAGE_STORE);
    const image = await requestToPromise<LocalImage | undefined>(
      imageStore.get(imageId)
    );

    if (!image) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地图片缓存不存在。");
    }

    const nextImage: LocalImage = {
      ...image,
      sync: normalizeLocalSyncMeta({ ...image.sync, ...syncUpdates }),
    };

    await requestToPromise(imageStore.put(nextImage));
    await done;
    return nextImage;
  } finally {
    db.close();
  }
}

export async function updateLocalRecordCloudSyncOperation(
  recordId: string,
  operationId: string,
  update: LocalCloudSyncOperationUpdate
) {
  const db = await openLocalDb();
  const timestamp = nowIso();

  try {
    const transaction = db.transaction(RECORD_STORE, "readwrite");
    const done = transactionDone(transaction);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const record = await requestToPromise<LocalRecord | undefined>(
      recordStore.get(recordId)
    );

    if (!record) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地记录不存在。");
    }

    const nextRecord: LocalRecord = {
      ...record,
      sync: applyCloudSyncOperationUpdate(
        record.sync,
        operationId,
        update,
        timestamp
      ),
      updated_at: timestamp,
    };
    await requestToPromise(recordStore.put(nextRecord));
    await done;
    return nextRecord;
  } finally {
    db.close();
  }
}

export async function updateLocalImageCloudSyncOperation(
  imageId: string,
  operationId: string,
  update: LocalCloudSyncOperationUpdate
) {
  const db = await openLocalDb();
  const timestamp = nowIso();

  try {
    const transaction = db.transaction(IMAGE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const imageStore = transaction.objectStore(IMAGE_STORE);
    const image = await requestToPromise<LocalImage | undefined>(
      imageStore.get(imageId)
    );

    if (!image) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地图片缓存不存在。");
    }

    const nextImage: LocalImage = {
      ...image,
      sync: applyCloudSyncOperationUpdate(
        image.sync,
        operationId,
        update,
        timestamp
      ),
    };
    await requestToPromise(imageStore.put(nextImage));
    await done;
    return nextImage;
  } finally {
    db.close();
  }
}

export async function clearPendingCloudSyncPromptIfComplete(
  archiveId: string,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(archiveId)
    );

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("没有权限修改这个本地项目。");
    }

    const [records, images] = await Promise.all([
      requestToPromise<LocalRecord[]>(
        transaction.objectStore(RECORD_STORE).getAll()
      ),
      requestToPromise<LocalImage[]>(
        transaction.objectStore(IMAGE_STORE).getAll()
      ),
    ]);
    const hasPending =
      isPendingCloudSyncStatus(normalizedArchive.sync.status) ||
      records.some(
        (record) =>
          record.archive_id === archiveId &&
          isPendingCloudSyncStatus(normalizeLocalSyncMeta(record.sync).status)
      ) ||
      images.some(
        (image) =>
          image.archive_id === archiveId &&
          isPendingCloudSyncStatus(normalizeLocalSyncMeta(image.sync).status)
      );

    if (hasPending) {
      await done;
      return false;
    }

    await requestToPromise(
      archiveStore.put({
        ...normalizedArchive,
        pending_sync_prompt_mode: null,
        pending_sync_first_detected_at: null,
        pending_sync_deferred_at: null,
      } satisfies LocalArchive)
    );
    await done;
    return true;
  } finally {
    db.close();
  }
}

export async function completeLocalArchiveCloudTransfer(
  archiveId: string,
  cloudArchiveId: string,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const [records, images] = await Promise.all([
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);
  const db = await openLocalDb();
  const timestamp = nowIso();

  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(archiveId)
    );

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("没有权限移除这个本地项目。");
    }

    for (const image of images.filter((item) => item.archive_id === archiveId)) {
      await requestToPromise(
        imageStore.put({
          ...image,
          sync: normalizeLocalSyncMeta({
            ...image.sync,
            status: "synced",
            cloud_archive_id: cloudArchiveId,
            last_sync_at: timestamp,
          }),
        } satisfies LocalImage)
      );
    }

    for (const record of records.filter((item) => item.archive_id === archiveId)) {
      await requestToPromise(recordStore.delete(record.id));
    }

    await requestToPromise(archiveStore.delete(archiveId));
    await done;
    await refreshLocalUsageHints();
  } finally {
    db.close();
  }
}

export async function markUnownedLocalArchivesForOwner(ownerContext: {
  userId: string;
  email?: string | null;
}) {
  const userId = normalizeOptionalText(ownerContext.userId);
  if (!userId) throw new Error("请先登录后再标记本地项目归属");

  const db = await openLocalDb();
  const timestamp = nowIso();
  let markedCount = 0;

  try {
    const transaction = db.transaction([ARCHIVE_STORE, TAXONOMY_STORE], "readwrite");
    const done = transactionDone(transaction);
    const cursorRequest = transaction.objectStore(ARCHIVE_STORE).openCursor();

    await new Promise<void>((resolve, reject) => {
      cursorRequest.onerror = () =>
        reject(cursorRequest.error || new Error("无法读取本地项目"));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve();
          return;
        }

        const archive = normalizeLocalArchive(cursor.value as LocalArchive);
        if (!archive.local_owner_user_id) {
          markedCount += 1;
          const updateRequest = cursor.update({
            ...archive,
            local_owner_user_id: userId,
            local_owner_email: normalizeOptionalText(ownerContext.email),
            local_owner_marked_at: timestamp,
          } satisfies LocalArchive);
          updateRequest.onerror = () =>
            reject(updateRequest.error || new Error("标记本地项目失败"));
          updateRequest.onsuccess = () => cursor.continue();
          return;
        }

        cursor.continue();
      };
    });

    const taxonomyCursorRequest = transaction.objectStore(TAXONOMY_STORE).openCursor();
    await new Promise<void>((resolve, reject) => {
      taxonomyCursorRequest.onerror = () =>
        reject(taxonomyCursorRequest.error || new Error("无法读取本地分类"));
      taxonomyCursorRequest.onsuccess = () => {
        const cursor = taxonomyCursorRequest.result;
        if (!cursor) {
          resolve();
          return;
        }

        const item = normalizeLocalTaxonomyItem(cursor.value as LocalTaxonomyItem);
        if (!item.local_owner_user_id) {
          const updateRequest = cursor.update({
            ...item,
            local_owner_user_id: userId,
            local_owner_email: normalizeOptionalText(ownerContext.email),
            updated_at: timestamp,
          } satisfies LocalTaxonomyItem);
          updateRequest.onerror = () =>
            reject(updateRequest.error || new Error("标记本地分类失败"));
          updateRequest.onsuccess = () => cursor.continue();
          return;
        }

        cursor.continue();
      };
    });

    await done;
    return markedCount;
  } finally {
    db.close();
  }
}

export async function markLocalArchiveForOwner(
  archiveId: string,
  ownerContext: {
    userId: string;
    email?: string | null;
  }
) {
  const userId = normalizeOptionalText(ownerContext.userId);
  if (!userId) throw new Error("请先登录后再标记本地项目归属");

  const db = await openLocalDb();
  const timestamp = nowIso();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(archiveId)
    );

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (
      normalizedArchive.local_owner_user_id &&
      normalizedArchive.local_owner_user_id !== userId
    ) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("这个本地项目已归属其他账号。");
    }

    await requestToPromise(
      archiveStore.put({
        ...normalizedArchive,
        local_owner_user_id: userId,
        local_owner_email: normalizeOptionalText(ownerContext.email),
        local_owner_marked_at: normalizedArchive.local_owner_marked_at || timestamp,
        updated_at: timestamp,
      } satisfies LocalArchive)
    );

    await done;
    await refreshLocalUsageHints();
  } finally {
    db.close();
  }
}

export async function createLocalArchive(input: {
  title: string;
  category: ArchiveCategory;
  subcategory?: string | null;
  group_name?: string | null;
  plant_id?: string | null;
  plant_slug?: string | null;
  system_name?: string | null;
  species_name?: string | null;
  source?: string | null;
  planting_region?: PlantingRegion | null;
  local_owner_user_id?: string | null;
  local_owner_email?: string | null;
  local_owner_marked_at?: string | null;
  note?: string | null;
  archive_summary?: string | null;
  cycle_enabled?: boolean;
  next_cycle_name?: string | null;
}) {
  const timestamp = nowIso();
  const category = normalizeLocalArchiveCategory(input.category);
  if (category === "plant" && !normalizePlantingRegion(input.planting_region)) {
    throw new Error("请填写项目种植地区 / Enter the planting region.");
  }
  const archive: LocalArchive = {
    id: createId("local_archive"),
    local_role: "local-project",
    title: input.title.trim(),
    category,
    main_category: category,
    subcategory: normalizeOptionalText(input.subcategory),
    group_name: normalizeOptionalText(input.group_name),
    plant_id: normalizeOptionalText(input.plant_id),
    plant_slug: normalizeOptionalText(input.plant_slug),
    system_name: normalizeOptionalText(input.system_name),
    species_name: normalizeOptionalText(input.species_name),
    source: normalizeOptionalText(input.source),
    planting_region: normalizePlantingRegion(input.planting_region),
    local_owner_user_id: normalizeOptionalText(input.local_owner_user_id),
    local_owner_email: normalizeOptionalText(input.local_owner_email),
    local_owner_marked_at: normalizeOptionalText(input.local_owner_marked_at),
    migration_status: null,
    migration_cloud_archive_id: null,
    migration_started_at: null,
    migration_error: null,
    migration_visibility: null,
    migrated_at: null,
    note: normalizeOptionalText(input.note),
    archive_summary: normalizeOptionalText(input.archive_summary),
    cycle_enabled: Boolean(input.cycle_enabled),
    next_cycle_name: normalizeOptionalText(input.next_cycle_name)?.slice(0, 80) || null,
    cycles: [],
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
    local_only: true,
    sync: localSyncMeta(),
  };
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    await requestToPromise(transaction.objectStore(ARCHIVE_STORE).add(archive));
    await done;
    await refreshLocalUsageHints();
    return archive;
  } finally {
    db.close();
  }
}

export async function getLocalArchiveDetail(
  archiveId: string,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const [archive, records, images] = await Promise.all([
    getRowById<LocalArchive>(ARCHIVE_STORE, archiveId),
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);

  if (!archive) return null;
  const normalizedArchive = normalizeLocalArchive(archive);
  if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) return null;

  const imageMap = new Map<string, LocalImage[]>();
  images
    .filter((image) => image.archive_id === archiveId)
    .forEach((image) => {
      const list = imageMap.get(image.record_id) || [];
      list.push({ ...image, sync: normalizeLocalSyncMeta(image.sync) });
      imageMap.set(image.record_id, list);
    });

  const detailRecords = getVisibleLocalRecordsForArchive(normalizedArchive, records)
    .sort(
      (a, b) =>
        new Date(b.record_time || b.created_at).getTime() -
        new Date(a.record_time || a.created_at).getTime()
    )
    .map((record) => ({
      ...record,
      sync: normalizeLocalSyncMeta(record.sync),
      images: (imageMap.get(record.id) || []).sort(
        (a, b) => a.sort_order - b.sort_order
      ),
    }));

  return { archive: normalizedArchive, records: detailRecords } satisfies LocalArchiveDetail;
}

export async function getLocalArchiveByCloudSource(
  cloudArchiveId: string,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const sourceId = normalizeOptionalText(cloudArchiveId);
  if (!sourceId) return null;

  const archives = await getAllRows<LocalArchive>(ARCHIVE_STORE);
  return (
    archives
      .map(normalizeLocalArchive)
      .find(
        (archive) =>
          archive.source_cloud_archive_id === sourceId &&
          archive.local_role !== "cloud-offline-cache" &&
          isLocalArchiveVisibleToOwner(archive, ownerContext)
      ) || null
  );
}

export async function getCloudOfflineCacheByCloudSource(
  cloudArchiveId: string,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const sourceId = normalizeOptionalText(cloudArchiveId);
  if (!sourceId) return null;

  const archives = await getAllRows<LocalArchive>(ARCHIVE_STORE);
  return (
    archives
      .map(normalizeLocalArchive)
      .find(
        (archive) =>
          archive.source_cloud_archive_id === sourceId &&
          archive.local_role === "cloud-offline-cache" &&
          isLocalArchiveVisibleToOwner(archive, ownerContext)
      ) || null
  );
}

async function removeAbandonedCloudArchiveLocalImportRows(
  cloudArchiveId: string
) {
  const [archives, records, images] = await Promise.all([
    getAllRows<LocalArchive>(ARCHIVE_STORE),
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);
  const archiveIds = new Set(archives.map((archive) => archive.id));
  const abandonedRecords = records.filter(
    (record) =>
      !archiveIds.has(record.archive_id) &&
      normalizeOptionalText(record.sync?.cloud_archive_id) === cloudArchiveId
  );
  const abandonedImages = images.filter(
    (image) =>
      !archiveIds.has(image.archive_id) &&
      normalizeOptionalText(image.sync?.cloud_archive_id) === cloudArchiveId
  );

  if (abandonedRecords.length === 0 && abandonedImages.length === 0) return;

  const db = await openLocalDb();
  try {
    const transaction = db.transaction([RECORD_STORE, IMAGE_STORE], "readwrite");
    const done = transactionDone(transaction);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);

    for (const record of abandonedRecords) {
      await requestToPromise(recordStore.delete(record.id));
    }
    for (const image of abandonedImages) {
      await requestToPromise(imageStore.delete(image.id));
    }

    await done;
    await refreshLocalUsageHints();
  } finally {
    db.close();
  }
}

export async function beginCloudArchiveLocalImport(input: {
  cloud_archive_id: string;
  cycles: CloudArchiveLocalCycleInput[];
  owner_context: LocalArchiveOwnerContext;
}): Promise<CloudArchiveLocalImportSession> {
  const cloudArchiveId = normalizeOptionalText(input.cloud_archive_id);
  const ownerUserId = getOwnerUserId(input.owner_context);
  if (!cloudArchiveId || !ownerUserId) {
    throw new Error("请先登录，再将云端项目保存到本机。");
  }

  await removeAbandonedCloudArchiveLocalImportRows(cloudArchiveId);
  await preparePendingCloudSyncQueue(input.owner_context);
  const previous = await getLocalArchiveByCloudSource(
    cloudArchiveId,
    input.owner_context
  );
  if (previous) {
    const pending = (await listPendingCloudSyncSummaries(input.owner_context))
      .find((summary) => summary.local_archive_id === previous.id);
    if (pending) {
      throw new Error(
        "本机副本还有待上传内容，不能用云端快照覆盖。请先处理待上传内容。"
      );
    }
  }
  const stagingArchiveId = createId("local_archive");
  const timestamp = nowIso();
  const cloudCycleIdMap: Record<string, string> = {};
  const cycles = input.cycles
    .map((cycle) => {
      const cloudCycleId = normalizeOptionalText(cycle.cloud_cycle_id);
      const cycleNo = Number(cycle.cycle_no);
      if (!cloudCycleId || !Number.isInteger(cycleNo) || cycleNo <= 0) {
        return null;
      }

      const localCycleId = createId("local_cycle");
      cloudCycleIdMap[cloudCycleId] = localCycleId;
      return normalizeLocalArchiveCycle(
        {
          id: localCycleId,
          archive_id: stagingArchiveId,
          cycle_no: cycleNo,
          display_name: normalizeOptionalText(cycle.display_name),
          status: cycle.status === "ended" ? "ended" : "active",
          started_at: cycle.started_at,
          ended_at: cycle.status === "ended" ? cycle.ended_at || null : null,
          created_at: cycle.created_at || cycle.started_at,
          updated_at: cycle.updated_at || cycle.created_at || cycle.started_at,
        },
        stagingArchiveId
      );
    })
    .filter((cycle): cycle is LocalArchiveCycle => Boolean(cycle))
    .sort((a, b) => a.cycle_no - b.cycle_no);

  return {
    staging_archive_id: stagingArchiveId,
    cloud_archive_id: cloudArchiveId,
    previous_local_archive_id: previous?.id || null,
    started_at: timestamp,
    cycles,
    cloud_cycle_id_map: cloudCycleIdMap,
  };
}

export async function stageCloudArchiveLocalRecord(input: {
  location?: RecordLocation | null;
  session: CloudArchiveLocalImportSession;
  cloud_record_id: string;
  cloud_cycle_id?: string | null;
  note?: string | null;
  record_time: string;
  created_at?: string | null;
  updated_at?: string | null;
  visibility?: string | null;
  status_tag?: string | null;
  behavior_tags?: string[];
}) {
  const cloudRecordId = normalizeOptionalText(input.cloud_record_id);
  if (!cloudRecordId) throw new Error("云端记录编号无效。");

  const timestamp = nowIso();
  const record: LocalRecord = {
    id: createId("local_record"),
    archive_id: input.session.staging_archive_id,
    location: normalizeRecordLocation(input.location),
    cycle_id: input.cloud_cycle_id
      ? input.session.cloud_cycle_id_map[input.cloud_cycle_id] || null
      : null,
    note: normalizeOptionalText(input.note) || "",
    record_time: normalizeOptionalText(input.record_time) || timestamp,
    created_at: normalizeOptionalText(input.created_at) || timestamp,
    updated_at: normalizeOptionalText(input.updated_at) || timestamp,
    source_cloud_visibility: normalizeOptionalText(input.visibility),
    source_cloud_status_tag: normalizeOptionalText(input.status_tag),
    source_cloud_behavior_tags: Array.from(
      new Set(
        (input.behavior_tags || [])
          .map((tag) => normalizeOptionalText(tag))
          .filter((tag): tag is string => Boolean(tag))
      )
    ),
    local_only: true,
    sync: localSyncMeta({
      status: "local-only",
      cloud_archive_id: input.session.cloud_archive_id,
      cloud_record_id: cloudRecordId,
      last_sync_at: input.session.started_at,
    }),
  };

  const db = await openLocalDb();
  try {
    const transaction = db.transaction(RECORD_STORE, "readwrite");
    const done = transactionDone(transaction);
    await requestToPromise(transaction.objectStore(RECORD_STORE).add(record));
    await done;
    return record;
  } finally {
    db.close();
  }
}

export async function stageCloudArchiveLocalImage(input: {
  session: CloudArchiveLocalImportSession;
  local_record_id: string;
  cloud_record_id: string;
  cloud_media_id: string;
  blob: Blob;
  mime_type?: string | null;
  name?: string | null;
  original_size?: number | null;
  width?: number | null;
  height?: number | null;
  captured_at?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
  cloud_media_url?: string | null;
}) {
  const cloudMediaId = normalizeOptionalText(input.cloud_media_id);
  if (!cloudMediaId || !(input.blob instanceof Blob) || input.blob.size <= 0) {
    throw new Error("云端图片内容无效。");
  }

  const timestamp = nowIso();
  const image: LocalImage = {
    id: createId("local_image"),
    archive_id: input.session.staging_archive_id,
    record_id: input.local_record_id,
    blob: input.blob,
    mime_type:
      normalizeOptionalText(input.mime_type) ||
      normalizeOptionalText(input.blob.type) ||
      "image/jpeg",
    name: normalizeOptionalText(input.name) || `${cloudMediaId}.jpg`,
    original_size: Math.max(
      Number(input.original_size || 0),
      input.blob.size
    ),
    cached_size: input.blob.size,
    width: Number.isFinite(Number(input.width)) ? Number(input.width) : null,
    height: Number.isFinite(Number(input.height)) ? Number(input.height) : null,
    captured_at: normalizeOptionalText(input.captured_at),
    sort_order: Number.isFinite(Number(input.sort_order))
      ? Number(input.sort_order)
      : 0,
    created_at: normalizeOptionalText(input.created_at) || timestamp,
    local_only: true,
    sync: localSyncMeta({
      status: "local-only",
      cloud_archive_id: input.session.cloud_archive_id,
      cloud_record_id: normalizeOptionalText(input.cloud_record_id),
      cloud_media_id: cloudMediaId,
      cloud_media_url: normalizeOptionalText(input.cloud_media_url),
      last_sync_at: input.session.started_at,
    }),
  };

  const db = await openLocalDb();
  try {
    const transaction = db.transaction(IMAGE_STORE, "readwrite");
    const done = transactionDone(transaction);
    await requestToPromise(transaction.objectStore(IMAGE_STORE).add(image));
    await done;
    return image;
  } finally {
    db.close();
  }
}

export async function abortCloudArchiveLocalImport(
  session: CloudArchiveLocalImportSession
) {
  const [records, images] = await Promise.all([
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);
  const db = await openLocalDb();

  try {
    const transaction = db.transaction([RECORD_STORE, IMAGE_STORE], "readwrite");
    const done = transactionDone(transaction);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);
    for (const record of records.filter(
      (item) => item.archive_id === session.staging_archive_id
    )) {
      await requestToPromise(recordStore.delete(record.id));
    }
    for (const image of images.filter(
      (item) => item.archive_id === session.staging_archive_id
    )) {
      await requestToPromise(imageStore.delete(image.id));
    }
    await done;
  } finally {
    db.close();
  }
}

export async function verifyCloudArchiveLocalImport(input: {
  session: CloudArchiveLocalImportSession;
  expected_record_count: number;
  expected_image_count: number;
}) {
  const [allRecords, allImages] = await Promise.all([
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);
  const stagedRecords = allRecords.filter(
    (item) => item.archive_id === input.session.staging_archive_id
  );
  const stagedImages = allImages.filter(
    (item) => item.archive_id === input.session.staging_archive_id
  );

  if (
    stagedRecords.length !== input.expected_record_count ||
    stagedImages.length !== input.expected_image_count ||
    stagedImages.some((image) => !image.blob || image.blob.size <= 0)
  ) {
    throw new Error("保存到本机的内容校验未通过，请重新操作。");
  }
}

export async function completeCloudArchiveLocalImport(input: {
  session: CloudArchiveLocalImportSession;
  cloud_archive_id: string;
  title: string;
  category: ArchiveCategory;
  subcategory?: string | null;
  group_name?: string | null;
  plant_id?: string | null;
  plant_slug?: string | null;
  system_name?: string | null;
  species_name?: string | null;
  source?: string | null;
  planting_region?: PlantingRegion | null;
  note?: string | null;
  archive_summary?: string | null;
  cycle_enabled?: boolean;
  next_cycle_name?: string | null;
  status?: "active" | "ended";
  ended_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_public?: boolean;
  owner_context: LocalArchiveOwnerContext;
  expected_record_count: number;
  expected_image_count: number;
  retain_cloud_source?: boolean;
}) {
  const cloudArchiveId = normalizeOptionalText(input.cloud_archive_id);
  const ownerUserId = getOwnerUserId(input.owner_context);
  if (!cloudArchiveId || !ownerUserId) {
    throw new Error("无法确认云端项目归属。");
  }

  await verifyCloudArchiveLocalImport({
    session: input.session,
    expected_record_count: input.expected_record_count,
    expected_image_count: input.expected_image_count,
  });

  const [allArchives, allRecords, allImages] = await Promise.all([
    getAllRows<LocalArchive>(ARCHIVE_STORE),
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);
  const timestamp = nowIso();
  const retainCloudSource = input.retain_cloud_source !== false;
  const previous = allArchives
    .map(normalizeLocalArchive)
    .find(
      (archive) =>
        archive.id === input.session.previous_local_archive_id &&
        archive.source_cloud_archive_id === cloudArchiveId &&
        isLocalArchiveVisibleToOwner(archive, input.owner_context)
    );
  const category = normalizeLocalArchiveCategory(input.category);
  const archive: LocalArchive = {
    id: input.session.staging_archive_id,
    local_role: "saved-local-copy",
    title: normalizeOptionalText(input.title) || "未命名项目",
    category,
    main_category: category,
    subcategory: normalizeOptionalText(input.subcategory),
    group_name: normalizeOptionalText(input.group_name),
    plant_id: normalizeOptionalText(input.plant_id),
    plant_slug: normalizeOptionalText(input.plant_slug),
    system_name: normalizeOptionalText(input.system_name),
    species_name: normalizeOptionalText(input.species_name),
    source: normalizeOptionalText(input.source),
    planting_region: normalizePlantingRegion(input.planting_region),
    local_owner_user_id: ownerUserId,
    local_owner_email: normalizeOptionalText(input.owner_context.email),
    local_owner_marked_at: timestamp,
    source_cloud_archive_id: retainCloudSource ? cloudArchiveId : null,
    source_cloud_saved_at: retainCloudSource ? timestamp : null,
    source_cloud_updated_at: retainCloudSource
      ? normalizeOptionalText(input.updated_at)
      : null,
    source_cloud_is_public: retainCloudSource ? Boolean(input.is_public) : null,
    migration_status: null,
    migration_cloud_archive_id: null,
    migration_started_at: null,
    migration_error: null,
    migration_visibility: null,
    migrated_at: null,
    note: normalizeOptionalText(input.note),
    archive_summary: normalizeOptionalText(input.archive_summary),
    cycle_enabled: Boolean(input.cycle_enabled || input.session.cycles.length),
    next_cycle_name: normalizeOptionalText(input.next_cycle_name)?.slice(0, 80) || null,
    cycles: input.session.cycles,
    trashed_cycles: [],
    status: input.status === "ended" ? "ended" : "active",
    ended_at: input.status === "ended" ? normalizeOptionalText(input.ended_at) : null,
    created_at: normalizeOptionalText(input.created_at) || timestamp,
    updated_at: timestamp,
    local_only: true,
    sync: localSyncMeta({
      status: "local-only",
      cloud_archive_id: retainCloudSource ? cloudArchiveId : null,
      last_sync_at: timestamp,
    }),
  };

  const db = await openLocalDb();
  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);

    if (previous) {
      for (const record of allRecords.filter(
        (item) => item.archive_id === previous.id
      )) {
        await requestToPromise(recordStore.delete(record.id));
      }
      for (const image of allImages.filter(
        (item) => item.archive_id === previous.id
      )) {
        await requestToPromise(imageStore.delete(image.id));
      }
      await requestToPromise(archiveStore.delete(previous.id));
    }

    if (!retainCloudSource) {
      for (const record of allRecords.filter(
        (item) => item.archive_id === input.session.staging_archive_id
      )) {
        await requestToPromise(
          recordStore.put({
            ...record,
            sync: localSyncMeta({ last_sync_at: timestamp }),
          })
        );
      }
      for (const image of allImages.filter(
        (item) => item.archive_id === input.session.staging_archive_id
      )) {
        await requestToPromise(
          imageStore.put({
            ...image,
            sync: localSyncMeta({ last_sync_at: timestamp }),
          })
        );
      }
    }

    await requestToPromise(archiveStore.add(archive));
    await done;
    await refreshLocalUsageHints();
    return archive;
  } finally {
    db.close();
  }
}

export async function replaceCloudOfflineCache(input: {
  cloud_archive_id: string;
  owner_context: LocalArchiveOwnerContext;
  title: string;
  category: ArchiveCategory;
  subcategory?: string | null;
  group_name?: string | null;
  plant_id?: string | null;
  plant_slug?: string | null;
  system_name?: string | null;
  species_name?: string | null;
  source?: string | null;
  planting_region?: PlantingRegion | null;
  note?: string | null;
  archive_summary?: string | null;
  cycle_enabled?: boolean;
  next_cycle_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_public?: boolean;
  cycles: CloudOfflineCacheCycleInput[];
  cache_revision?: string | null;
  records: CloudOfflineCacheRecordInput[];
  images: CloudOfflineCacheImageInput[];
}) {
  const cloudArchiveId = normalizeOptionalText(input.cloud_archive_id);
  const ownerUserId = getOwnerUserId(input.owner_context);
  if (!cloudArchiveId || !ownerUserId) {
    throw new Error("无法确认云端离线副本归属。");
  }

  const [allArchives, allRecords, allImages] = await Promise.all([
    getAllRows<LocalArchive>(ARCHIVE_STORE),
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);
  const previous = allArchives
    .map(normalizeLocalArchive)
    .find(
      (archive) =>
        archive.local_role === "cloud-offline-cache" &&
        archive.source_cloud_archive_id === cloudArchiveId &&
        isLocalArchiveVisibleToOwner(archive, input.owner_context)
    );
  const archiveId = previous?.id || createId("cloud_cache_archive");
  const timestamp = nowIso();
  const category = normalizeLocalArchiveCategory(input.category);
  const cycleIdByCloudId = new Map<string, string>();
  const cycles: LocalArchiveCycle[] = input.cycles.map((cycle) => {
    const localCycleId = "cloud_cache_cycle_" + cycle.id;
    cycleIdByCloudId.set(cycle.id, localCycleId);
    return {
      id: localCycleId,
      archive_id: archiveId,
      source_cloud_cycle_id: cycle.id,
      cycle_no: cycle.cycle_no,
      display_name: normalizeOptionalText(cycle.display_name),
      status: cycle.status === "ended" ? "ended" : "active",
      started_at: cycle.started_at,
      ended_at: cycle.status === "ended" ? normalizeOptionalText(cycle.ended_at) : null,
      created_at: normalizeOptionalText(cycle.created_at) || cycle.started_at,
      updated_at: normalizeOptionalText(cycle.updated_at) || cycle.started_at,
    };
  });
  const localRecordIdByCloudId = new Map<string, string>();
  const cachedRecords: LocalRecord[] = input.records.map((record) => {
    const localRecordId = "cloud_cache_record_" + record.id;
    localRecordIdByCloudId.set(record.id, localRecordId);
    return {
      id: localRecordId,
      archive_id: archiveId,
      cycle_id: record.cycle_id
        ? cycleIdByCloudId.get(record.cycle_id) || null
        : null,
      note: normalizeOptionalText(record.note) || "",
      record_time: record.record_time,
      created_at: normalizeOptionalText(record.created_at) || record.record_time,
      updated_at:
        normalizeOptionalText(record.updated_at) ||
        normalizeOptionalText(record.created_at) ||
        record.record_time,
      source_cloud_visibility: normalizeOptionalText(record.visibility),
      source_cloud_status_tag: normalizeOptionalText(record.status_tag),
      source_cloud_behavior_tags: Array.isArray(record.behavior_tags)
        ? record.behavior_tags.filter((tag): tag is string => Boolean(tag))
        : [],
      local_only: true,
      sync: localSyncMeta({
        status: "synced",
        cloud_archive_id: cloudArchiveId,
        cloud_record_id: record.id,
        last_sync_at: timestamp,
      }),
    };
  });
  const cachedImages: LocalImage[] = [];
  for (const image of input.images) {
    const localRecordId = localRecordIdByCloudId.get(image.record_id);
    if (!localRecordId || !image.blob || image.blob.size <= 0) continue;
    cachedImages.push({
      id: "cloud_cache_media_" + image.id,
      archive_id: archiveId,
      record_id: localRecordId,
      blob: image.blob,
      mime_type: normalizeOptionalText(image.mime_type) || image.blob.type || "image/jpeg",
      name: normalizeOptionalText(image.name) || "cloud-thumb-" + image.id + ".jpg",
      original_size: image.blob.size,
      cached_size: image.blob.size,
      metadata_stripped: true,
      width: image.width ?? null,
      height: image.height ?? null,
      captured_at: normalizeOptionalText(image.captured_at),
      sort_order: Number.isFinite(Number(image.sort_order))
        ? Number(image.sort_order)
        : 0,
      created_at: normalizeOptionalText(image.created_at) || timestamp,
      local_only: true,
      sync: localSyncMeta({
        status: "synced",
        cloud_archive_id: cloudArchiveId,
        cloud_record_id: image.record_id,
        cloud_media_id: image.id,
        last_sync_at: timestamp,
      }),
    });
  }
  const archive: LocalArchive = {
    id: archiveId,
    local_role: "cloud-offline-cache",
    title: normalizeOptionalText(input.title) || "未命名项目",
    category,
    main_category: category,
    subcategory: normalizeOptionalText(input.subcategory),
    group_name: normalizeOptionalText(input.group_name),
    plant_id: normalizeOptionalText(input.plant_id),
    plant_slug: normalizeOptionalText(input.plant_slug),
    system_name: normalizeOptionalText(input.system_name),
    species_name: normalizeOptionalText(input.species_name),
    source: normalizeOptionalText(input.source),
    planting_region: normalizePlantingRegion(input.planting_region),
    local_owner_user_id: ownerUserId,
    local_owner_email: normalizeOptionalText(input.owner_context.email),
    local_owner_marked_at: previous?.local_owner_marked_at || timestamp,
    source_cloud_archive_id: cloudArchiveId,
    source_cloud_saved_at: previous?.source_cloud_saved_at || timestamp,
    source_cloud_updated_at: normalizeOptionalText(input.updated_at),
    source_cloud_cache_revision: normalizeOptionalText(input.cache_revision),
    source_cloud_is_public: Boolean(input.is_public),
    pending_sync_prompt_mode: previous?.pending_sync_prompt_mode || null,
    pending_sync_first_detected_at: previous?.pending_sync_first_detected_at || null,
    pending_sync_deferred_at: previous?.pending_sync_deferred_at || null,
    migration_status: null,
    migration_cloud_archive_id: null,
    migration_started_at: null,
    migration_error: null,
    migration_visibility: null,
    migrated_at: null,
    note: normalizeOptionalText(input.note),
    archive_summary: normalizeOptionalText(input.archive_summary),
    cycle_enabled: Boolean(input.cycle_enabled || cycles.length),
    next_cycle_name: normalizeOptionalText(input.next_cycle_name)?.slice(0, 80) || null,
    cycles,
    trashed_cycles: [],
    status: "active",
    ended_at: null,
    created_at: normalizeOptionalText(input.created_at) || previous?.created_at || timestamp,
    updated_at: timestamp,
    local_only: true,
    sync: localSyncMeta({
      status: "synced",
      cloud_archive_id: cloudArchiveId,
      last_sync_at: timestamp,
    }),
  };

  const pendingRecords = allRecords.filter(
    (record) =>
      record.archive_id === archiveId &&
      isPendingCloudSyncStatus(normalizeLocalSyncMeta(record.sync).status)
  );
  const pendingRecordIds = new Set(pendingRecords.map((record) => record.id));
  const pendingImages = allImages.filter(
    (image) =>
      image.archive_id === archiveId &&
      (isPendingCloudSyncStatus(normalizeLocalSyncMeta(image.sync).status) ||
        pendingRecordIds.has(image.record_id))
  );
  const db = await openLocalDb();
  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);

    for (const record of allRecords.filter(
      (item) =>
        item.archive_id === archiveId &&
        !isPendingCloudSyncStatus(normalizeLocalSyncMeta(item.sync).status)
    )) {
      await requestToPromise(recordStore.delete(record.id));
    }
    for (const image of allImages.filter(
      (item) =>
        item.archive_id === archiveId &&
        !isPendingCloudSyncStatus(normalizeLocalSyncMeta(item.sync).status) &&
        !pendingRecordIds.has(item.record_id)
    )) {
      await requestToPromise(imageStore.delete(image.id));
    }
    for (const record of cachedRecords) {
      await requestToPromise(recordStore.put(record));
    }
    for (const image of cachedImages) {
      await requestToPromise(imageStore.put(image));
    }
    for (const record of pendingRecords) {
      await requestToPromise(recordStore.put(record));
    }
    for (const image of pendingImages) {
      await requestToPromise(imageStore.put(image));
    }
    await requestToPromise(archiveStore.put(archive));
    await done;
    return archive;
  } finally {
    db.close();
  }
}

export async function pruneCloudOfflineCacheForEndedSource(
  cloudArchiveId: string,
  ownerContext?: LocalArchiveOwnerContext | null,
  sourceUpdatedAt?: string | null
) {
  const cache = await getCloudOfflineCacheByCloudSource(
    cloudArchiveId,
    ownerContext
  );
  if (!cache) return { removed: false, preservedPending: false };

  const [records, images] = await Promise.all([
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);
  const archiveRecords = records.filter((record) => record.archive_id === cache.id);
  const pendingRecords = archiveRecords.filter(
    (record) => isPendingCloudSyncStatus(normalizeLocalSyncMeta(record.sync).status)
  );
  const pendingRecordIds = new Set(pendingRecords.map((record) => record.id));
  const archiveImages = images.filter((image) => image.archive_id === cache.id);
  const pendingImages = archiveImages.filter(
    (image) =>
      isPendingCloudSyncStatus(normalizeLocalSyncMeta(image.sync).status) ||
      pendingRecordIds.has(image.record_id)
  );
  const hasPending = pendingRecords.length > 0 || pendingImages.length > 0;
  const db = await openLocalDb();
  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);

    for (const record of archiveRecords) {
      if (!hasPending || !isPendingCloudSyncStatus(normalizeLocalSyncMeta(record.sync).status)) {
        await requestToPromise(recordStore.delete(record.id));
      }
    }
    for (const image of archiveImages) {
      if (
        !hasPending ||
        (!isPendingCloudSyncStatus(normalizeLocalSyncMeta(image.sync).status) &&
          !pendingRecordIds.has(image.record_id))
      ) {
        await requestToPromise(imageStore.delete(image.id));
      }
    }

    if (hasPending) {
      await requestToPromise(
        archiveStore.put({
          ...cache,
          status: "ended",
          source_cloud_updated_at:
            normalizeOptionalText(sourceUpdatedAt) ||
            cache.source_cloud_updated_at ||
            null,
          updated_at: nowIso(),
        } satisfies LocalArchive)
      );
    } else {
      await requestToPromise(archiveStore.delete(cache.id));
    }
    await done;
    return { removed: !hasPending, preservedPending: hasPending };
  } finally {
    db.close();
  }
}

function ensureLocalImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} 不是图片文件。`);
  }

  if (file.size > MAX_LOCAL_IMAGE_BYTES) {
    throw new Error(`${file.name} 超过 25MB，请先选择较小的图片。`);
  }
}

async function prepareLocalImage(file: File, sortOrder: number) {
  ensureLocalImageFile(file);

  const standard = await standardizeRecordPhotoFile(file);

  return {
    blob: standard.file,
    metadata_stripped: standard.wasCompressed,
    mime_type: standard.file.type || file.type,
    original_size: file.size,
    cached_size: standard.file.size,
    name: standard.file.name || file.name || `local-image-${sortOrder + 1}.jpg`,
    width: standard.width ?? null,
    height: standard.height ?? null,
  };
}

export async function createLocalArchiveCycle(
  archiveId: string,
  startedAt: string,
  ownerContext?: LocalArchiveOwnerContext | null,
  displayName?: string | null
) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ARCHIVE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(store.get(archiveId));

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("没有权限修改这个本地项目。");
    }

    if (normalizedArchive.local_role === "cloud-offline-cache") {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("云端期次离线时只读，请联网后修改。");
    }

    const normalizedStartedAt = normalizeOptionalText(startedAt);
    if (!normalizedStartedAt || Number.isNaN(new Date(normalizedStartedAt).getTime())) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("请选择有效的开始日期。");
    }

    const cycles = normalizedArchive.cycles || [];
    const trashedCycles = normalizedArchive.trashed_cycles || [];
    const timestamp = nowIso();
    const cycle: LocalArchiveCycle = {
      id: createId("local_cycle"),
      archive_id: archiveId,
      cycle_no: [...cycles, ...trashedCycles.map((item) => item.cycle)].reduce(
        (max, item) => Math.max(max, item.cycle_no),
        0
      ) + 1,
      display_name: normalizeOptionalText(displayName)?.slice(0, 80) || null,
      status: "active",
      started_at: normalizedStartedAt,
      ended_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    };

    await requestToPromise(
      store.put({
        ...normalizedArchive,
        cycles: [...cycles, cycle],
        updated_at: timestamp,
      } satisfies LocalArchive)
    );
    await done;
    return cycle;
  } finally {
    db.close();
  }
}

export async function endLocalArchiveCycle(
  archiveId: string,
  cycleId: string,
  endedAt: string,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ARCHIVE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(store.get(archiveId));

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("没有权限修改这个本地项目。");
    }

    const cycles = normalizedArchive.cycles || [];
    if (normalizedArchive.local_role === "cloud-offline-cache") {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("云端期次离线时只读，请联网后修改。");
    }
    const target = cycles.find((cycle) => cycle.id === cycleId);
    if (!target || target.status !== "active") {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("这个周期已经结束或不存在。");
    }

    const normalizedEndedAt = normalizeOptionalText(endedAt);
    if (
      !normalizedEndedAt ||
      Number.isNaN(new Date(normalizedEndedAt).getTime()) ||
      new Date(normalizedEndedAt).getTime() < new Date(target.started_at).getTime()
    ) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("结束日期不能早于开始日期。");
    }

    const timestamp = nowIso();
    const nextCycles = cycles.map((cycle) =>
      cycle.id === cycleId
        ? {
            ...cycle,
            status: "ended" as const,
            ended_at: normalizedEndedAt,
            updated_at: timestamp,
          }
        : cycle
    );

    await requestToPromise(
      store.put({
        ...normalizedArchive,
        cycles: nextCycles,
        updated_at: timestamp,
      } satisfies LocalArchive)
    );
    await done;
    return nextCycles.find((cycle) => cycle.id === cycleId) || null;
  } finally {
    db.close();
  }
}

export async function updateLocalArchiveCycleDates(
  archiveId: string,
  cycleId: string,
  dates: { started_at: string; ended_at: string | null },
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ARCHIVE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(store.get(archiveId));

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("没有权限修改这个本地项目。");
    }

    const cycles = normalizedArchive.cycles || [];
    const target = cycles.find((cycle) => cycle.id === cycleId);
    if (!target) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("这个周期不存在。");
    }

    const startedAt = normalizeOptionalText(dates.started_at);
    const endedAt = target.status === "ended" ? normalizeOptionalText(dates.ended_at) : null;
    if (!startedAt || Number.isNaN(new Date(startedAt).getTime())) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("请选择有效的开始日期。");
    }
    if (
      target.status === "ended" &&
      (!endedAt ||
        Number.isNaN(new Date(endedAt).getTime()) ||
        new Date(endedAt).getTime() < new Date(startedAt).getTime())
    ) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("结束日期不能早于开始日期。");
    }

    const timestamp = nowIso();
    const nextCycles = cycles.map((cycle) =>
      cycle.id === cycleId
        ? {
            ...cycle,
            started_at: startedAt,
            ended_at: target.status === "ended" ? endedAt : null,
            updated_at: timestamp,
          }
        : cycle
    );

    await requestToPromise(
      store.put({
        ...normalizedArchive,
        cycles: nextCycles,
        updated_at: timestamp,
      } satisfies LocalArchive)
    );
    await done;
    return nextCycles.find((cycle) => cycle.id === cycleId) || null;
  } finally {
    db.close();
  }
}

export async function updateLocalArchiveCycleName(
  archiveId: string,
  cycleId: string,
  displayName: string,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ARCHIVE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(store.get(archiveId));

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("没有权限修改这个本地项目。");
    }

    const cycles = normalizedArchive.cycles || [];
    if (!cycles.some((cycle) => cycle.id === cycleId)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("这个周期不存在。");
    }

    const cleanName = normalizeOptionalText(displayName)?.slice(0, 80) || null;
    const timestamp = nowIso();
    const nextCycles = cycles.map((cycle) =>
      cycle.id === cycleId
        ? { ...cycle, display_name: cleanName, updated_at: timestamp }
        : cycle
    );

    await requestToPromise(
      store.put({
        ...normalizedArchive,
        cycles: nextCycles,
        updated_at: timestamp,
      } satisfies LocalArchive)
    );
    await done;
    return nextCycles.find((cycle) => cycle.id === cycleId) || null;
  } finally {
    db.close();
  }
}

export async function deleteLocalArchiveCycle(
  archiveId: string,
  cycleId: string,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction([ARCHIVE_STORE, RECORD_STORE], "readwrite");
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(archiveId)
    );

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("没有权限修改这个本地项目。");
    }

    const cycles = normalizedArchive.cycles || [];
    const targetCycle = cycles.find((cycle) => cycle.id === cycleId);
    if (!targetCycle) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("这个周期不存在。");
    }

    const archiveRecords = await requestToPromise<LocalRecord[]>(
      recordStore.index("archive_id").getAll(archiveId)
    );
    const recordsToTrash = archiveRecords.filter(
      (record) => record.cycle_id === cycleId
    );
    const timestamp = nowIso();
    const trashEntry: LocalArchiveCycleTrash = {
      id: createId("local_cycle_trash"),
      archive_id: archiveId,
      cycle: targetCycle,
      record_ids: recordsToTrash.map((record) => record.id),
      deleted_at: timestamp,
    };

    await requestToPromise(
      archiveStore.put({
        ...normalizedArchive,
        cycles: cycles.filter((cycle) => cycle.id !== cycleId),
        trashed_cycles: [
          trashEntry,
          ...(normalizedArchive.trashed_cycles || []),
        ],
        updated_at: timestamp,
      } satisfies LocalArchive)
    );

    await done;
    await refreshLocalUsageHints();
    return recordsToTrash.length;
  } finally {
    db.close();
  }
}

export async function restoreLocalArchiveCycle(
  archiveId: string,
  trashEntryId: string,
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ARCHIVE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      store.get(archiveId)
    );

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    if (!isLocalArchiveVisibleToOwner(normalizedArchive, ownerContext)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("没有权限修改这个本地项目。");
    }

    const trashedCycles = normalizedArchive.trashed_cycles || [];
    const trashEntry = trashedCycles.find((item) => item.id === trashEntryId);
    if (!trashEntry) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("这个已删除期次不存在。");
    }

    const cycles = normalizedArchive.cycles || [];
    if (cycles.some((cycle) => cycle.id === trashEntry.cycle.id)) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("这个期次已经恢复。");
    }

    const timestamp = nowIso();
    const restoredCycle = {
      ...trashEntry.cycle,
      archive_id: archiveId,
      updated_at: timestamp,
    } satisfies LocalArchiveCycle;

    await requestToPromise(
      store.put({
        ...normalizedArchive,
        cycles: [...cycles, restoredCycle].sort(
          (a, b) => a.cycle_no - b.cycle_no
        ),
        trashed_cycles: trashedCycles.filter(
          (item) => item.id !== trashEntryId
        ),
        updated_at: timestamp,
      } satisfies LocalArchive)
    );
    await done;
    await refreshLocalUsageHints();
    return {
      cycle: restoredCycle,
      recordCount: trashEntry.record_ids.length,
    };
  } finally {
    db.close();
  }
}

export async function createLocalRecord(input: {
  location?: RecordLocation | null;
  archive_id: string;
  cycle_id?: string | null;
  end_cycle_after_record?: boolean;
  note: string;
  image_files?: File[];
  image_captured_at?: Array<string | null>;
  record_time?: string;
}) {
  const note = input.note.trim();
  const files = input.image_files || [];

  if (!note && files.length === 0) {
    throw new Error("请填写记录内容，或至少选择一张图片。");
  }

  const timestamp = nowIso();
  const recordTime =
    input.record_time && !Number.isNaN(new Date(input.record_time).getTime())
      ? new Date(input.record_time).toISOString()
      : timestamp;
  const record: LocalRecord = {
    id: createId("local_record"),
    archive_id: input.archive_id,
    location: input.location === undefined ? loadDefaultRecordLocation() : normalizeRecordLocation(input.location),
    cycle_id: normalizeOptionalText(input.cycle_id),
    note,
    record_time: recordTime,
    created_at: timestamp,
    updated_at: timestamp,
    local_only: true,
    sync: localSyncMeta(),
  };
  const preparedImages = await Promise.all(
    files.map((file, index) => prepareLocalImage(file, index))
  );
  const images: LocalImage[] = preparedImages.map((image, index) => ({
    id: createId("local_image"),
    archive_id: input.archive_id,
    record_id: record.id,
    blob: image.blob,
    mime_type: image.mime_type,
    name: image.name,
    original_size: image.original_size,
    cached_size: image.cached_size,
    metadata_stripped: image.metadata_stripped,
    width: image.width,
    height: image.height,
    captured_at:
      input.image_captured_at?.[index] &&
      !Number.isNaN(new Date(input.image_captured_at[index]!).getTime())
        ? new Date(input.image_captured_at[index]!).toISOString()
        : null,
    sort_order: index,
    created_at: timestamp,
    local_only: true,
    sync: localSyncMeta(),
  }));
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(input.archive_id)
    );

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    const normalizedArchive = normalizeLocalArchive(archive);
    const isCloudOfflineCache = normalizedArchive.local_role === "cloud-offline-cache";
    if (isCloudOfflineCache) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("云项目离线缓存只读，不能新增记录。");
    }
    const cloudArchiveId = normalizeOptionalText(normalizedArchive.source_cloud_archive_id);
    if (cloudArchiveId) {
      record.sync = queueCloudSyncOperation(record.sync, {
        cloudArchiveId,
        operationKind: "create-record",
        timestamp,
      });
      for (const image of images) {
        image.sync = queueCloudSyncOperation(image.sync, {
          cloudArchiveId,
          operationKind: "upload-image",
          timestamp,
          dependsOnOperationId: record.sync.client_operation_id,
        });
      }
    }
    const requestedCycle = normalizedArchive.cycles?.find(
      (cycle) => cycle.id === record.cycle_id && cycle.status === "active"
    );
    record.cycle_id = requestedCycle?.id || null;

    if (input.end_cycle_after_record) {
      if (isCloudOfflineCache) {
        transaction.abort();
        await done.catch(() => undefined);
        throw new Error("云端期次离线时只读，请联网后结束期次。");
      }
      if (!requestedCycle) {
        transaction.abort();
        await done.catch(() => undefined);
        throw new Error("所选周期已结束或不存在，请重新选择。");
      }
      if (isLocalDateBefore(recordTime, requestedCycle.started_at)) {
        transaction.abort();
        await done.catch(() => undefined);
        throw new Error("记录日期不能早于所选周期开始日期。");
      }

      const endedAt = toLocalDateEndIso(recordTime);
      normalizedArchive.cycles = (normalizedArchive.cycles || []).map((cycle) =>
        cycle.id === requestedCycle.id
          ? {
              ...cycle,
              status: "ended" as const,
              ended_at: endedAt,
              updated_at: timestamp,
            }
          : cycle
      );
    }

    await requestToPromise(recordStore.add(record));
    for (const image of images) {
      await requestToPromise(imageStore.add(image));
    }

    const nextArchive = cloudArchiveId
      ? markArchivePendingPrompt(
          { ...normalizedArchive, updated_at: timestamp },
          timestamp,
        )
      : { ...normalizedArchive, updated_at: timestamp };
    await requestToPromise(archiveStore.put(nextArchive));
    await done;
    await refreshLocalUsageHints();

    return record;
  } finally {
    db.close();
  }
}

export async function deleteLocalRecord(recordId: string) {
  const record = await getRowById<LocalRecord>(RECORD_STORE, recordId);
  if (!record) return;

  const images = await getAllRows<LocalImage>(IMAGE_STORE);
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(record.archive_id)
    );
    if (archive) {
      const normalizedArchive = normalizeLocalArchive(archive);
      if (
        normalizedArchive.local_role === "cloud-offline-cache" &&
        record.sync?.status !== "pending-cloud-sync"
      ) {
        transaction.abort();
        await done.catch(() => undefined);
        throw new Error("云端已有记录离线时只读，不能删除。");
      }
    }

    await requestToPromise(recordStore.delete(recordId));
    for (const image of images.filter((item) => item.record_id === recordId)) {
      await requestToPromise(imageStore.delete(image.id));
    }

    if (archive) {
      const normalizedArchive = normalizeLocalArchive(archive);
      normalizedArchive.updated_at = nowIso();
      await requestToPromise(archiveStore.put(normalizedArchive));
    }

    await done;
    await refreshLocalUsageHints();
  } finally {
    db.close();
  }
}

export async function deleteLocalArchive(archiveId: string) {
  const [records, images] = await Promise.all([
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);

    for (const record of records.filter((item) => item.archive_id === archiveId)) {
      await requestToPromise(recordStore.delete(record.id));
    }
    for (const image of images.filter((item) => item.archive_id === archiveId)) {
      await requestToPromise(imageStore.delete(image.id));
    }
    await requestToPromise(transaction.objectStore(ARCHIVE_STORE).delete(archiveId));
    await done;
    await refreshLocalUsageHints();
  } finally {
    db.close();
  }
}

function getMigrationRowTime(value: {
  updated_at?: string | null;
  created_at?: string | null;
}) {
  const timestamp = new Date(value.updated_at || value.created_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function putNewerMigrationRow<T extends {
  id: string;
  updated_at?: string | null;
  created_at?: string | null;
}>(store: IDBObjectStore, incoming: T) {
  if (!incoming?.id) return;

  const existing = await requestToPromise<T | undefined>(store.get(incoming.id));
  if (!existing || getMigrationRowTime(incoming) > getMigrationRowTime(existing)) {
    await requestToPromise(store.put(incoming));
  }
}

/**
 * Merges the non-image portion of the one-time Android origin migration.
 * Existing production-origin rows win unless the legacy copy is newer, so a
 * retry cannot roll back edits made after the domain switch.
 */
export async function mergeLocalOriginBaseSnapshot(
  snapshot: LocalOriginBaseSnapshot,
) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, TAXONOMY_STORE],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const taxonomyStore = transaction.objectStore(TAXONOMY_STORE);

    for (const archive of Array.isArray(snapshot.archives)
      ? snapshot.archives
      : []) {
      if (!archive?.id) continue;
      await putNewerMigrationRow(archiveStore, normalizeLocalArchive(archive));
    }

    for (const record of Array.isArray(snapshot.records)
      ? snapshot.records
      : []) {
      if (!record?.id || !record.archive_id) continue;
      await putNewerMigrationRow(recordStore, {
        ...record,
        note: normalizeOptionalText(record.note) || "",
        local_only: true,
        sync: normalizeLocalSyncMeta(record.sync),
      } satisfies LocalRecord);
    }

    for (const taxonomy of Array.isArray(snapshot.taxonomy)
      ? snapshot.taxonomy
      : []) {
      if (!taxonomy?.id) continue;
      await putNewerMigrationRow(
        taxonomyStore,
        normalizeLocalTaxonomyItem(taxonomy),
      );
    }

    await done;
  } finally {
    db.close();
  }
}

/** Images are streamed one at a time to avoid holding every photo in memory. */
export async function mergeLocalOriginImage(image: LocalImage) {
  if (!image?.id || !image.archive_id || !image.record_id || !image.blob) return;

  const db = await openLocalDb();
  try {
    const transaction = db.transaction(IMAGE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(IMAGE_STORE);
    const existing = await requestToPromise<LocalImage | undefined>(
      store.get(image.id),
    );
    if (!existing) {
      await requestToPromise(
        store.put({
          ...image,
          local_only: true,
          sync: normalizeLocalSyncMeta(image.sync),
        } satisfies LocalImage),
      );
    }
    await done;
  } finally {
    db.close();
  }
}

export async function finalizeLocalOriginMigration() {
  await refreshLocalUsageHints();
}
