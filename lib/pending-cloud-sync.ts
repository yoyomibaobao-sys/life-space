import { createImageThumbnailFile, standardizeRecordPhotoFile } from "@/lib/image-compression";
import {
  clearPendingCloudSyncPromptIfComplete,
  getLocalArchiveDetail,
  isPendingCloudSyncStatus,
  listPendingCloudSyncSummaries,
  preparePendingCloudSyncQueue,
  updateLocalArchiveCloudSyncOperation,
  updateLocalImageCloudSyncOperation,
  updateLocalRecordCloudSyncOperation,
  type LocalArchive,
  type LocalArchiveDetail,
  type LocalArchiveOwnerContext,
  type LocalImage,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";
import { normalizePlantingRegion } from "@/lib/planting-region";
import { uploadMediaStorageObject } from "@/lib/media-storage-upload";
import {
  reserveStorageUpload,
  settleStorageUploadReservation,
  type StorageUploadReservation,
} from "@/lib/storage-usage";
import { supabase } from "@/lib/supabase";
import {
  isMissingDatabaseColumn,
  withoutCapturedAt,
} from "@/lib/supabase-schema-compat";

export const PENDING_CLOUD_SYNC_UPDATED_EVENT =
  "lifespace:pending-cloud-sync-updated";

export type PendingCloudSyncProgress = {
  completed: number;
  total: number;
  label: "archive" | "record" | "image";
};

export type PendingCloudSyncResult = {
  success: boolean;
  cloudArchiveId: string | null;
  archiveUpdated: boolean;
  recordCount: number;
  imageCount: number;
  failedCount: number;
  error?: string;
};

type CloudArchiveRow = {
  id: string;
  user_id: string;
  is_public?: boolean | null;
  default_record_visibility?: string | null;
};

type CloudCycleRow = {
  id: string;
  cycle_no: number;
};

type CloudRecordRow = {
  id: string;
  archive_id: string;
  user_id: string;
};

type CloudMediaRow = {
  id: string;
  record_id: string;
  user_id: string;
  storage_path: string;
  size_bytes?: number | null;
};

type SupabaseError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function isStableCloudOperationId(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

function safeFileName(value?: string | null) {
  return (value?.trim() || "offline-image.jpg").replace(/[^\w.\-]+/g, "_");
}

export function buildPendingMediaStoragePaths(params: {
  userId: string;
  recordId: string;
  operationId: string;
  fileName?: string | null;
  thumbnailName?: string | null;
}) {
  const name = safeFileName(params.fileName);
  const storagePath = `${params.userId}/${params.recordId}/offline-${params.operationId}-${name}`;
  const thumbPath = params.thumbnailName
    ? `${params.userId}/${params.recordId}/thumbs/offline-${params.operationId}-${safeFileName(params.thumbnailName)}`
    : null;
  return { storagePath, thumbPath };
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  const candidate = error as SupabaseError | null;
  return (
    cleanText(candidate?.message) ||
    cleanText(candidate?.details) ||
    cleanText(candidate?.hint) ||
    fallback
  );
}

function dispatchPendingSyncUpdated(localArchiveId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PENDING_CLOUD_SYNC_UPDATED_EVENT, {
      detail: { localArchiveId },
    })
  );
}

function getOperationId(item: { sync: { client_operation_id?: string | null } }) {
  const operationId = cleanText(item.sync.client_operation_id);
  if (!isStableCloudOperationId(operationId)) {
    throw new Error("本地上传标识无效，请保留本机内容并稍后重试。");
  }
  return operationId!;
}

async function loadCloudArchive(
  cloudArchiveId: string,
  userId: string
): Promise<CloudArchiveRow> {
  const { data, error } = await supabase
    .from("archives")
    .select("id,user_id,is_public,default_record_visibility")
    .eq("id", cloudArchiveId)
    .eq("user_id", userId)
    .is("trashed_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`读取原云端项目失败：${errorMessage(error, "请稍后重试。")}`);
  }
  if (!data?.id) {
    throw new Error("原云端项目不存在、已进入回收站，或当前账号无权修改。");
  }
  return data as CloudArchiveRow;
}

async function loadCloudCycleMap(detail: LocalArchiveDetail, cloudArchiveId: string) {
  const result = new Map<string, string>();
  if (!(detail.archive.cycles || []).length) return result;

  const { data, error } = await supabase
    .from("archive_cycles")
    .select("id,cycle_no")
    .eq("archive_id", cloudArchiveId);
  if (error) {
    throw new Error("读取云端项目分期失败，请稍后重试。");
  }

  const cloudByNumber = new Map(
    ((data || []) as CloudCycleRow[]).map((cycle) => [cycle.cycle_no, cycle.id])
  );
  for (const localCycle of detail.archive.cycles || []) {
    const cloudId = cloudByNumber.get(localCycle.cycle_no);
    if (cloudId) result.set(localCycle.id, cloudId);
  }
  return result;
}

function resolveCloudCycleId(
  record: LocalRecordWithImages,
  cycleMap: Map<string, string>
) {
  if (!record.cycle_id) return null;
  const cloudCycleId = cycleMap.get(record.cycle_id);
  if (!cloudCycleId) {
    throw new Error("记录所属的本地分期在云端不存在，请先调整记录分期。");
  }
  return cloudCycleId;
}

export function buildPendingArchivePatch(
  archive: LocalArchive,
  pendingFields: string[]
) {
  const fields = new Set(pendingFields);
  const patch: Record<string, unknown> = {};

  if (fields.has("title")) patch.title = archive.title.trim();
  if (fields.has("source")) patch.source = archive.source || null;
  if (fields.has("planting_region")) {
    patch.planting_region = normalizePlantingRegion(archive.planting_region);
  }
  if (fields.has("note")) patch.note = archive.note || null;
  if (fields.has("archive_summary")) {
    patch.archive_summary = archive.archive_summary || null;
  }
  if (fields.has("cycle_enabled")) {
    patch.cycle_enabled = Boolean(archive.cycle_enabled);
  }
  if (fields.has("next_cycle_name")) {
    patch.next_cycle_name = archive.next_cycle_name || null;
  }

  if (
    ["category", "system_name", "species_name", "plant_id"].some((field) =>
      fields.has(field)
    )
  ) {
    const isPlant = archive.category === "plant";
    patch.category = archive.category;
    patch.species_id =
      isPlant && isStableCloudOperationId(archive.plant_id)
        ? archive.plant_id
        : null;
    patch.species_name_snapshot = isPlant
      ? archive.species_name || archive.system_name || null
      : null;
    patch.system_name = isPlant
      ? null
      : archive.system_name || archive.species_name || null;
  }

  if (fields.has("status") || fields.has("ended_at")) {
    patch.status = archive.status;
    patch.ended_at = archive.status === "ended" ? archive.ended_at || null : null;
  }

  return patch;
}

async function syncArchiveUpdate(params: {
  detail: LocalArchiveDetail;
  cloudArchiveId: string;
  userId: string;
  ownerContext: LocalArchiveOwnerContext;
}) {
  const { archive } = params.detail;
  if (!isPendingCloudSyncStatus(archive.sync.status)) return false;
  const operationId = getOperationId(archive);
  await updateLocalArchiveCloudSyncOperation(
    archive.id,
    operationId,
    {
      status: "uploading",
      cloud_archive_id: params.cloudArchiveId,
    },
    params.ownerContext
  );

  try {
    const patch = buildPendingArchivePatch(
      archive,
      archive.sync.pending_fields || []
    );
    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase
        .from("archives")
        .update(patch)
        .eq("id", params.cloudArchiveId)
        .eq("user_id", params.userId)
        .is("trashed_at", null)
        .select("id")
        .maybeSingle();
      if (error || !data?.id) {
        throw new Error(
          `更新云端项目失败：${errorMessage(error, "项目不可编辑。")}`
        );
      }
    }

    await updateLocalArchiveCloudSyncOperation(
      archive.id,
      operationId,
      {
        status: "synced",
        cloud_archive_id: params.cloudArchiveId,
      },
      params.ownerContext
    );
    return true;
  } catch (error) {
    await updateLocalArchiveCloudSyncOperation(
      archive.id,
      operationId,
      {
        status: "failed",
        cloud_archive_id: params.cloudArchiveId,
        last_error: errorMessage(error, "更新云端项目失败，请稍后重试。"),
      },
      params.ownerContext
    ).catch(() => undefined);
    throw error;
  }
}

async function findCloudRecord(recordId: string) {
  const { data, error } = await supabase
    .from("records")
    .select("id,archive_id,user_id")
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw new Error("无法确认记录的云端状态，请稍后重试。");
  return (data || null) as CloudRecordRow | null;
}

function assertMatchingCloudRecord(
  row: CloudRecordRow,
  archiveId: string,
  userId: string
) {
  if (row.archive_id !== archiveId || row.user_id !== userId) {
    throw new Error("云端记录标识发生冲突，已停止上传以保护现有内容。");
  }
}

async function syncRecord(params: {
  record: LocalRecordWithImages;
  cloudArchive: CloudArchiveRow;
  userId: string;
  cycleMap: Map<string, string>;
}) {
  const { record, cloudArchive, userId } = params;
  const operationId = getOperationId(record);
  const isCreate = record.sync.operation_kind === "create-record";
  const cloudRecordId = isCreate
    ? operationId
    : cleanText(record.sync.cloud_record_id);
  if (!isStableCloudOperationId(cloudRecordId)) {
    throw new Error("找不到这条记录对应的云端标识，已停止上传。");
  }

  await updateLocalRecordCloudSyncOperation(record.id, operationId, {
    status: "uploading",
    cloud_archive_id: cloudArchive.id,
    cloud_record_id: cloudRecordId,
  });

  try {
    const pendingFields = new Set(record.sync.pending_fields || []);
    const cloudCycleId =
      isCreate || pendingFields.has("cycle_id")
        ? resolveCloudCycleId(record, params.cycleMap)
        : null;
    let existing = await findCloudRecord(cloudRecordId!);

    if (existing) {
      assertMatchingCloudRecord(existing, cloudArchive.id, userId);
    } else if (isCreate) {
      const visibility =
        cloudArchive.default_record_visibility === "public" ||
        cloudArchive.default_record_visibility === "private"
          ? cloudArchive.default_record_visibility
          : cloudArchive.is_public
            ? "public"
            : "private";
      const payload = {
        id: cloudRecordId,
        archive_id: cloudArchive.id,
        cycle_id: cloudCycleId,
        user_id: userId,
        note: record.note || "",
        visibility,
        photo_time: record.record_time,
        record_time: record.record_time,
        upload_time: record.created_at || new Date().toISOString(),
        created_at: record.created_at || undefined,
        status_tag: record.source_cloud_status_tag || null,
      };
      const inserted = await supabase
        .from("records")
        .insert([payload])
        .select("id,archive_id,user_id")
        .maybeSingle();
      existing = inserted.data as CloudRecordRow | null;
      if (inserted.error || !existing?.id) {
        existing = await findCloudRecord(cloudRecordId!);
      }
      if (!existing?.id) {
        throw new Error(
          `创建云端记录失败：${errorMessage(inserted.error, "请稍后重试。")}`
        );
      }
      assertMatchingCloudRecord(existing, cloudArchive.id, userId);
    } else {
      throw new Error("原云端记录不存在，已保留本机修改。");
    }

    if (!isCreate) {
      const patch: Record<string, unknown> = {};
      if (pendingFields.has("note")) patch.note = record.note || "";
      if (pendingFields.has("record_time")) patch.record_time = record.record_time;
      if (pendingFields.has("cycle_id")) patch.cycle_id = cloudCycleId;

      if (Object.keys(patch).length > 0) {
        const { data, error } = await supabase
          .from("records")
          .update(patch)
          .eq("id", cloudRecordId!)
          .eq("archive_id", cloudArchive.id)
          .eq("user_id", userId)
          .is("trashed_at", null)
          .select("id")
          .maybeSingle();
        if (error || !data?.id) {
          throw new Error(
            `更新云端记录失败：${errorMessage(error, "记录不可编辑。")}`
          );
        }
      }
    }

    if (isCreate || pendingFields.has("location")) {
      const { error } = await supabase.rpc("set_record_location", {
        p_record_id: cloudRecordId,
        p_location: record.location || null,
      });
      if (error) {
        throw new Error(
          `保存记录位置失败：${errorMessage(error, "请稍后重试。")}`
        );
      }
    }

    await updateLocalRecordCloudSyncOperation(record.id, operationId, {
      status: "synced",
      cloud_archive_id: cloudArchive.id,
      cloud_record_id: cloudRecordId,
    });
    return cloudRecordId!;
  } catch (error) {
    await updateLocalRecordCloudSyncOperation(record.id, operationId, {
      status: "failed",
      cloud_archive_id: cloudArchive.id,
      cloud_record_id: cloudRecordId,
      last_error: errorMessage(error, "云端记录上传失败，请稍后重试。"),
    }).catch(() => undefined);
    throw error;
  }
}

async function findCloudMediaById(mediaId: string) {
  const { data, error } = await supabase
    .from("media")
    .select("id,record_id,user_id,storage_path,size_bytes")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw new Error("无法确认图片的云端状态，请稍后重试。");
  return (data || null) as CloudMediaRow | null;
}

async function findCloudMediaByPath(storagePath: string) {
  const { data, error } = await supabase
    .from("media")
    .select("id,record_id,user_id,storage_path,size_bytes")
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (error) throw new Error("无法确认图片文件状态，请稍后重试。");
  return (data || null) as CloudMediaRow | null;
}

function assertMatchingCloudMedia(params: {
  row: CloudMediaRow;
  mediaId: string;
  recordId: string;
  userId: string;
  storagePath: string;
}) {
  if (
    params.row.id !== params.mediaId ||
    params.row.record_id !== params.recordId ||
    params.row.user_id !== params.userId ||
    params.row.storage_path !== params.storagePath
  ) {
    throw new Error("云端图片标识发生冲突，已停止上传以保护现有内容。");
  }
}

async function settleStableMediaReservation(params: {
  mediaId: string;
  reservedBytes: number;
  actualBytes: number;
}) {
  const reservation: StorageUploadReservation = {
    reservation_id: params.mediaId,
    reservation_mode: "reservation",
    reserved_bytes: params.reservedBytes,
  };
  const result = await settleStorageUploadReservation({
    reservation,
    targetType: "media",
    targetId: params.mediaId,
    legacyActualBytes: params.actualBytes,
  });
  if (!result.ok) {
    throw new Error("图片已保存，但容量结算尚未确认；请稍后重试。");
  }
}

async function syncImage(params: {
  image: LocalImage;
  cloudArchiveId: string;
  cloudRecordId: string;
  userId: string;
}) {
  const { image, cloudArchiveId, cloudRecordId, userId } = params;
  const operationId = getOperationId(image);
  const mediaId = operationId;
  await updateLocalImageCloudSyncOperation(image.id, operationId, {
    status: "uploading",
    cloud_archive_id: cloudArchiveId,
    cloud_record_id: cloudRecordId,
  });

  try {
    const originalFile = new File(
      [image.blob],
      image.name || `${image.id}.jpg`,
      {
        type: image.mime_type || image.blob.type || "image/jpeg",
        lastModified: new Date(
          image.captured_at || image.created_at || Date.now()
        ).getTime(),
      }
    );
    const standardized = image.metadata_stripped
      ? null
      : await standardizeRecordPhotoFile(originalFile, {
          requireSanitized: true,
        });
    const uploadFile = standardized?.file || originalFile;
    const thumbnail = await createImageThumbnailFile(uploadFile);
    const thumbFile = thumbnail.wasGenerated ? thumbnail.file : null;
    const { storagePath, thumbPath } = buildPendingMediaStoragePaths({
      userId,
      recordId: cloudRecordId,
      operationId,
      fileName: uploadFile.name,
      thumbnailName: thumbFile?.name,
    });
    const reservedBytes = uploadFile.size + (thumbFile?.size || 0);

    let existing = await findCloudMediaById(mediaId);
    if (!existing) existing = await findCloudMediaByPath(storagePath);
    if (existing) {
      assertMatchingCloudMedia({
        row: existing,
        mediaId,
        recordId: cloudRecordId,
        userId,
        storagePath,
      });
      await settleStableMediaReservation({
        mediaId,
        reservedBytes,
        actualBytes: Number(existing.size_bytes || reservedBytes),
      });
      await updateLocalImageCloudSyncOperation(image.id, operationId, {
        status: "synced",
        cloud_archive_id: cloudArchiveId,
        cloud_record_id: cloudRecordId,
        cloud_media_id: mediaId,
        cloud_media_url: null,
      });
      return;
    }

    const reserveResult = await reserveStorageUpload({
      reservationId: operationId,
      preserveOnUncertainError: true,
      requireIdempotentReservation: true,
      targetType: "media",
      targetId: mediaId,
      targetParentId: cloudRecordId,
      storagePath,
      storageBytes: uploadFile.size,
      thumbPath,
      thumbBytes: thumbFile?.size || 0,
    });
    if (!reserveResult.ok) {
      if (reserveResult.message === "storage_limit_exceeded") {
        throw new Error("云空间容量不足，照片仍保留在本机。");
      }
      if (reserveResult.message === "membership_inactive") {
        throw new Error("当前云会员状态不能上传照片，照片仍保留在本机。");
      }
      if (reserveResult.message === "upload_maintenance") {
        throw new Error("云端图片上传正在维护，请稍后重试。");
      }
      if (reserveResult.message === "idempotent_reservation_unavailable") {
        throw new Error("当前云端暂不支持安全续传，已停止上传并保留本机照片。");
      }
      throw new Error("图片容量检查失败，请稍后重试。");
    }
    if (
      reserveResult.reservation_mode !== "reservation" ||
      reserveResult.reservation_id !== operationId
    ) {
      throw new Error("当前云端暂不支持安全续传，已停止上传并保留本机照片。");
    }

    const mainUpload = await uploadMediaStorageObject(storagePath, uploadFile, {
      contentType: uploadFile.type || "image/jpeg",
      upsert: true,
    });
    if (mainUpload.error) {
      throw new Error("图片上传中断，稍后可从当前进度重试。");
    }

    let uploadedThumbPath: string | null = null;
    let uploadedThumbBytes = 0;
    if (thumbFile && thumbPath) {
      const thumbUpload = await uploadMediaStorageObject(thumbPath, thumbFile, {
        contentType: thumbFile.type || "image/jpeg",
        upsert: true,
      });
      if (!thumbUpload.error) {
        uploadedThumbPath = thumbPath;
        uploadedThumbBytes = thumbFile.size;
      }
    }

    const actualBytes = uploadFile.size + uploadedThumbBytes;
    const mediaPayload = {
      id: mediaId,
      record_id: cloudRecordId,
      type: "image",
      url: null,
      user_id: userId,
      size_mb: actualBytes / (1024 * 1024),
      size_bytes: actualBytes,
      storage_path: storagePath,
      thumb_url: null,
      thumb_path: uploadedThumbPath,
      mime_type: uploadFile.type || "image/jpeg",
      width: standardized?.width ?? image.width ?? null,
      height: standardized?.height ?? image.height ?? null,
      original_filename: originalFile.name,
      captured_at: image.captured_at || null,
      sort_order: image.sort_order || 0,
      storage_class: "hot",
      upload_reservation_id: operationId,
    };
    let inserted = await supabase
      .from("media")
      .insert([mediaPayload])
      .select("id,record_id,user_id,storage_path,size_bytes")
      .maybeSingle();
    if (isMissingDatabaseColumn(inserted.error, "media", "captured_at")) {
      inserted = await supabase
        .from("media")
        .insert([withoutCapturedAt(mediaPayload)])
        .select("id,record_id,user_id,storage_path,size_bytes")
        .maybeSingle();
    }

    existing = inserted.data as CloudMediaRow | null;
    if (inserted.error || !existing?.id) {
      existing = await findCloudMediaById(mediaId);
      if (!existing) existing = await findCloudMediaByPath(storagePath);
    }
    if (!existing?.id) {
      throw new Error(
        `图片文件已保留，云端记录尚未确认：${errorMessage(
          inserted.error,
          "稍后重试即可继续。"
        )}`
      );
    }
    assertMatchingCloudMedia({
      row: existing,
      mediaId,
      recordId: cloudRecordId,
      userId,
      storagePath,
    });
    await settleStableMediaReservation({
      mediaId,
      reservedBytes,
      actualBytes,
    });
    await updateLocalImageCloudSyncOperation(image.id, operationId, {
      status: "synced",
      cloud_archive_id: cloudArchiveId,
      cloud_record_id: cloudRecordId,
      cloud_media_id: mediaId,
      cloud_media_url: null,
    });
  } catch (error) {
    await updateLocalImageCloudSyncOperation(image.id, operationId, {
      status: "failed",
      cloud_archive_id: cloudArchiveId,
      cloud_record_id: cloudRecordId,
      cloud_media_id: mediaId,
      last_error: errorMessage(error, "图片上传失败，请稍后重试。"),
    }).catch(() => undefined);
    throw error;
  }
}

export async function syncPendingCloudArchive(params: {
  localArchiveId: string;
  ownerContext: LocalArchiveOwnerContext;
  onProgress?: (progress: PendingCloudSyncProgress) => void;
}): Promise<PendingCloudSyncResult> {
  const userId = cleanText(params.ownerContext.userId);
  if (!userId) {
    return {
      success: false,
      cloudArchiveId: null,
      archiveUpdated: false,
      recordCount: 0,
      imageCount: 0,
      failedCount: 1,
      error: "请先登录，再上传本机改动。",
    };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      success: false,
      cloudArchiveId: null,
      archiveUpdated: false,
      recordCount: 0,
      imageCount: 0,
      failedCount: 1,
      error: "当前仍处于离线状态，请联网后重试。",
    };
  }

  await preparePendingCloudSyncQueue(params.ownerContext);
  const detail = await getLocalArchiveDetail(
    params.localArchiveId,
    params.ownerContext
  );
  const cloudArchiveId = cleanText(detail?.archive.source_cloud_archive_id);
  if (!detail || !cloudArchiveId) {
    return {
      success: false,
      cloudArchiveId: null,
      archiveUpdated: false,
      recordCount: 0,
      imageCount: 0,
      failedCount: 1,
      error: "找不到可上传到的原云端项目。",
    };
  }

  let archiveUpdated = false;
  let recordCount = 0;
  let imageCount = 0;
  let failedCount = 0;
  let lastError = "";

  try {
    const pendingRecords = detail.records
      .filter((record) => isPendingCloudSyncStatus(record.sync.status))
      .sort((left, right) => {
        const leftCreate = left.sync.operation_kind === "create-record" ? 0 : 1;
        const rightCreate = right.sync.operation_kind === "create-record" ? 0 : 1;
        return leftCreate - rightCreate;
      });
    const cloudArchive = await loadCloudArchive(cloudArchiveId, userId);
    const needsCycleMap = pendingRecords.some(
      (record) =>
        Boolean(record.cycle_id) &&
        (record.sync.operation_kind === "create-record" ||
          (record.sync.pending_fields || []).includes("cycle_id"))
    );
    const cycleMap = needsCycleMap
      ? await loadCloudCycleMap(detail, cloudArchiveId)
      : new Map<string, string>();
    const pendingImageCount = detail.records.reduce(
      (total, record) =>
        total +
        record.images.filter((image) =>
          isPendingCloudSyncStatus(image.sync.status)
        ).length,
      0
    );
    const total =
      (isPendingCloudSyncStatus(detail.archive.sync.status) ? 1 : 0) +
      pendingRecords.length +
      pendingImageCount;
    let completed = 0;

    if (isPendingCloudSyncStatus(detail.archive.sync.status)) {
      try {
        archiveUpdated = await syncArchiveUpdate({
          detail,
          cloudArchiveId,
          userId,
          ownerContext: params.ownerContext,
        });
      } catch (error) {
        failedCount += 1;
        lastError = errorMessage(error, "项目资料上传失败。");
      }
      completed += 1;
      params.onProgress?.({ completed, total, label: "archive" });
    }

    for (const record of pendingRecords) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        lastError = "网络已断开，剩余内容保留在本机。";
        break;
      }
      try {
        await syncRecord({ record, cloudArchive, userId, cycleMap });
        recordCount += 1;
      } catch (error) {
        failedCount += 1;
        lastError = errorMessage(error, "记录上传失败。");
      }
      completed += 1;
      params.onProgress?.({ completed, total, label: "record" });
    }

    const refreshed = await getLocalArchiveDetail(
      params.localArchiveId,
      params.ownerContext
    );
    for (const record of refreshed?.records || []) {
      for (const image of record.images.filter((candidate) =>
        isPendingCloudSyncStatus(candidate.sync.status)
      )) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          lastError = "网络已断开，剩余照片保留在本机。";
          break;
        }
        const cloudRecordId =
          cleanText(image.sync.cloud_record_id) ||
          cleanText(record.sync.cloud_record_id);
        if (!isStableCloudOperationId(cloudRecordId)) {
          failedCount += 1;
          lastError = "照片依赖的记录尚未上传，照片仍保留在本机。";
          const imageOperationId = cleanText(image.sync.client_operation_id);
          if (isStableCloudOperationId(imageOperationId)) {
            await updateLocalImageCloudSyncOperation(
              image.id,
              imageOperationId!,
              {
                status: "failed",
                cloud_archive_id: cloudArchiveId,
                last_error: lastError,
              }
            ).catch(() => undefined);
          }
          completed += 1;
          params.onProgress?.({ completed, total, label: "image" });
          continue;
        }
        try {
          await syncImage({
            image,
            cloudArchiveId,
            cloudRecordId: cloudRecordId!,
            userId,
          });
          imageCount += 1;
        } catch (error) {
          failedCount += 1;
          lastError = errorMessage(error, "照片上传失败。");
        }
        completed += 1;
        params.onProgress?.({ completed, total, label: "image" });
      }
    }

    await clearPendingCloudSyncPromptIfComplete(
      params.localArchiveId,
      params.ownerContext
    );
    const remaining = (
      await listPendingCloudSyncSummaries(params.ownerContext)
    ).find((summary) => summary.local_archive_id === params.localArchiveId);
    if (remaining && !lastError) {
      lastError = "还有新的本机改动待上传，请再次上传。";
    }

    const success = !remaining && failedCount === 0;
    return {
      success,
      cloudArchiveId,
      archiveUpdated,
      recordCount,
      imageCount,
      failedCount,
      ...(success
        ? {}
        : { error: lastError || "部分内容尚未上传，请稍后重试。" }),
    };
  } catch (error) {
    return {
      success: false,
      cloudArchiveId,
      archiveUpdated,
      recordCount,
      imageCount,
      failedCount: Math.max(1, failedCount),
      error: errorMessage(error, "上传本机改动失败，请稍后重试。"),
    };
  } finally {
    dispatchPendingSyncUpdated(params.localArchiveId);
  }
}
