import { compressImageFile, createImageThumbnailFile } from "@/lib/image-compression";
import { uploadMediaStorageObject } from "@/lib/media-storage-upload";
import {
  completeLocalArchiveCloudTransfer,
  getLocalArchiveDetail,
  isLocalArchiveVisibleToOwner,
  updateLocalArchiveMigrationState,
  updateLocalImageSyncMeta,
  updateLocalRecordSyncMeta,
  type LocalArchive,
  type LocalArchiveCycle,
  type LocalArchiveOwnerContext,
  type LocalImage,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";
import {
  cancelStorageUploadReservation,
  reconcileMediaUploadCommit,
  reserveStorageUpload,
  settleStorageUploadReservation,
} from "@/lib/storage-usage";
import {
  isStorageUploadMaintenance,
  STORAGE_UPLOAD_MAINTENANCE_SYNC_MESSAGE,
  STORAGE_UPLOAD_MAINTENANCE_SYNC_NOT_STARTED_MESSAGE,
} from "@/lib/storage-upload-maintenance";
import { supabase } from "@/lib/supabase";

export type LocalToCloudVisibility = "private" | "public";

export type LocalToCloudResult =
  | {
      success: true;
      cloudArchiveId: string;
    }
  | {
      success: false;
      cloudArchiveId?: string | null;
      error: string;
      partialFailure?: boolean;
    };

type CloudRecordRow = {
  id: string;
};

type CloudCycleRow = {
  id: string;
  cycle_no: number;
};

type SupabaseMutationError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

function safeFileName(value?: string | null) {
  return (value?.trim() || "local-image.jpg").replace(/[^\w.\-]+/g, "_");
}

function getLocalArchiveSystemName(archive: LocalArchive) {
  return cleanText(archive.system_name) || cleanText(archive.species_name);
}

function getUserFacingSyncError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "转到云空间失败，请稍后重试。";
}

function getSupabaseErrorMessage(error?: SupabaseMutationError | null) {
  return (
    cleanText(error?.message) ||
    cleanText(error?.details) ||
    cleanText(error?.hint) ||
    cleanText(error?.code) ||
    "未知错误"
  );
}

function logArchiveMutationError(
  label: string,
  error: SupabaseMutationError | null,
  payload: Record<string, unknown>
) {
  if (process.env.NODE_ENV === "production") return;

  console.error(label, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
    payload: {
      title: payload.title,
      category: payload.category,
      species_id: payload.species_id,
      species_name_snapshot: payload.species_name_snapshot,
      system_name: payload.system_name,
      source: payload.source,
      note: payload.note ? "[has note]" : null,
      archive_summary: payload.archive_summary ? "[has summary]" : null,
      user_id: payload.user_id,
      is_public: payload.is_public,
    },
  });
}

async function findExistingCloudRecord(params: {
  archiveId: string;
  userId: string;
  record: LocalRecordWithImages;
}) {
  let query = supabase
    .from("records")
    .select("id")
    .eq("archive_id", params.archiveId)
    .eq("user_id", params.userId)
    .eq("record_time", params.record.record_time)
    .limit(1);

  if (params.record.note) {
    query = query.eq("note", params.record.note);
  } else {
    query = query.or("note.is.null,note.eq.");
  }

  const { data, error } = await query;
  if (error) {
    console.error("find existing cloud record error:", error);
    return null;
  }

  return (data?.[0] as CloudRecordRow | undefined)?.id || null;
}

async function ensureCloudArchive(params: {
  archive: LocalArchive;
  userId: string;
  visibility: LocalToCloudVisibility;
  existingCloudArchiveId?: string | null;
}) {
  const systemName = getLocalArchiveSystemName(params.archive);
  if (!systemName) throw new Error("系统名不能为空。");

  const isPublic = params.visibility === "public";
  const speciesId =
    params.archive.category === "plant" && isUuid(params.archive.plant_id)
      ? params.archive.plant_id
      : null;
  const basePayload = {
    title: params.archive.title.trim(),
    category: params.archive.category,
    species_id: speciesId,
    species_name_snapshot:
      params.archive.category === "plant"
        ? params.archive.species_name || systemName
        : null,
    system_name: params.archive.category === "plant" ? null : systemName,
    source: params.archive.source || null,
    note: params.archive.note || null,
    archive_summary: params.archive.archive_summary || null,
    user_id: params.userId,
    is_public: isPublic,
  };

  if (params.existingCloudArchiveId) {
    const { data, error } = await supabase
      .from("archives")
      .update(basePayload)
      .eq("id", params.existingCloudArchiveId)
      .eq("user_id", params.userId)
      .select("id")
      .maybeSingle();

    if (error) {
      logArchiveMutationError("update migrated cloud archive error", error, basePayload);
      throw new Error(`继续转云端项目失败：${getSupabaseErrorMessage(error)}`);
    }

    if (data?.id) return data.id as string;
  }

  const { data, error } = await supabase
    .from("archives")
    .insert([basePayload])
    .select("id")
    .single();

  if (error || !data?.id) {
    logArchiveMutationError("create migrated cloud archive error", error, basePayload);
    throw new Error(`创建云端项目失败：${getSupabaseErrorMessage(error)}`);
  }

  return data.id as string;
}

async function ensureCloudRecord(params: {
  archiveId: string;
  userId: string;
  visibility: LocalToCloudVisibility;
  record: LocalRecordWithImages;
  cycleId?: string | null;
}) {
  const existingRecordId = cleanText(params.record.sync?.cloud_record_id);
  if (existingRecordId) {
    const { error } = await supabase
      .from("records")
      .update({ cycle_id: params.cycleId || null })
      .eq("id", existingRecordId)
      .eq("archive_id", params.archiveId)
      .eq("user_id", params.userId);
    if (error) throw new Error("恢复云端记录周期归属失败，请稍后重试。");
    return existingRecordId;
  }

  const foundRecordId = await findExistingCloudRecord(params);
  if (foundRecordId) {
    const { error: cycleError } = await supabase
      .from("records")
      .update({ cycle_id: params.cycleId || null })
      .eq("id", foundRecordId)
      .eq("archive_id", params.archiveId)
      .eq("user_id", params.userId);
    if (cycleError) throw new Error("恢复云端记录周期归属失败，请稍后重试。");

    await updateLocalRecordSyncMeta(params.record.id, {
      status: "pending-cloud-sync",
      cloud_archive_id: params.archiveId,
      cloud_record_id: foundRecordId,
      last_sync_at: new Date().toISOString(),
    });
    return foundRecordId;
  }

  const { data, error } = await supabase
    .from("records")
    .insert([
      {
        archive_id: params.archiveId,
        cycle_id: params.cycleId || null,
        user_id: params.userId,
        note: params.record.note || "",
        visibility: params.visibility,
        photo_time: params.record.record_time,
        record_time: params.record.record_time,
        upload_time: params.record.created_at || new Date().toISOString(),
        created_at: params.record.created_at || undefined,
        status_tag: null,
      },
    ])
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("create migrated cloud record error:", error);
    throw new Error("创建云端记录失败，请稍后重试。");
  }

  await updateLocalRecordSyncMeta(params.record.id, {
    status: "pending-cloud-sync",
    cloud_archive_id: params.archiveId,
    cloud_record_id: data.id,
    last_sync_at: new Date().toISOString(),
  });

  return data.id as string;
}

async function ensureCloudCycles(params: {
  archiveId: string;
  cycles: LocalArchiveCycle[];
}) {
  const cycleIdMap = new Map<string, string>();
  if (params.cycles.length === 0) return cycleIdMap;

  const { data: existingRows, error: existingError } = await supabase
    .from("archive_cycles")
    .select("id, cycle_no")
    .eq("archive_id", params.archiveId);

  if (existingError) {
    console.error("load migrated archive cycles error:", existingError);
    throw new Error("读取云端周期失败，请稍后重试。");
  }

  const cloudByCycleNo = new Map(
    ((existingRows || []) as CloudCycleRow[]).map((cycle) => [cycle.cycle_no, cycle])
  );

  for (const cycle of [...params.cycles].sort((a, b) => a.cycle_no - b.cycle_no)) {
    const payload = {
      archive_id: params.archiveId,
      cycle_no: cycle.cycle_no,
      status: cycle.status,
      started_at: cycle.started_at,
      ended_at: cycle.status === "ended" ? cycle.ended_at || cycle.updated_at : null,
    };
    let cloudCycle = cloudByCycleNo.get(cycle.cycle_no) || null;

    if (cloudCycle) {
      const { error } = await supabase
        .from("archive_cycles")
        .update(payload)
        .eq("id", cloudCycle.id)
        .eq("archive_id", params.archiveId);
      if (error) {
        console.error("update migrated archive cycle error:", error);
        throw new Error(`更新云端第${cycle.cycle_no}个周期失败，请稍后重试。`);
      }
    } else {
      const { data, error } = await supabase
        .from("archive_cycles")
        .insert([payload])
        .select("id, cycle_no")
        .single();

      if (error || !data?.id) {
        const { data: racedCycle } = await supabase
          .from("archive_cycles")
          .select("id, cycle_no")
          .eq("archive_id", params.archiveId)
          .eq("cycle_no", cycle.cycle_no)
          .maybeSingle();
        if (!racedCycle?.id) {
          console.error("create migrated archive cycle error:", error);
          throw new Error(`创建云端第${cycle.cycle_no}个周期失败，请稍后重试。`);
        }
        cloudCycle = racedCycle as CloudCycleRow;
      } else {
        cloudCycle = data as CloudCycleRow;
      }

      cloudByCycleNo.set(cycle.cycle_no, cloudCycle);
    }

    cycleIdMap.set(cycle.id, cloudCycle.id);
  }

  return cycleIdMap;
}

async function uploadLocalImageToCloud(params: {
  image: LocalImage;
  cloudRecordId: string;
  cloudArchiveId: string;
  userId: string;
}) {
  if (
    params.image.sync?.status === "synced" &&
    params.image.sync?.cloud_record_id === params.cloudRecordId &&
    params.image.sync?.cloud_media_id
  ) {
    return;
  }

  const originalFile = new File(
    [params.image.blob],
    params.image.name || `${params.image.id}.jpg`,
    {
      type: params.image.mime_type || params.image.blob.type || "image/jpeg",
      lastModified: new Date(params.image.created_at || Date.now()).getTime(),
    }
  );
  const compressed = await compressImageFile(originalFile);
  const uploadFile = compressed.file;
  const thumbnail = await createImageThumbnailFile(uploadFile);
  const thumbFile = thumbnail.wasGenerated ? thumbnail.file : null;
  const safeName = safeFileName(uploadFile.name);
  const targetMediaId = crypto.randomUUID();
  const fileName = `${params.userId}/${params.cloudRecordId}/local-${params.image.id}-${safeName}`;
  const thumbName = thumbFile
    ? `${params.userId}/${params.cloudRecordId}/thumbs/local-${params.image.id}-${safeFileName(thumbFile.name)}`
    : null;

  const existingMedia = await reconcileMediaUploadCommit({ storagePath: fileName });
  if (existingMedia.status === "unknown") {
    throw new Error("无法确认图片云端状态，请稍后重试。");
  }
  if (existingMedia.status === "found") {
    await updateLocalImageSyncMeta(params.image.id, {
      status: "synced",
      cloud_archive_id: params.cloudArchiveId,
      cloud_record_id: params.cloudRecordId,
      cloud_media_id: existingMedia.mediaId,
      cloud_media_url: null,
      last_sync_at: new Date().toISOString(),
    });
    return;
  }

  const reservedBytes = uploadFile.size + (thumbFile?.size || 0);
  const reserveResult = await reserveStorageUpload({
    targetType: "media",
    targetId: targetMediaId,
    targetParentId: params.cloudRecordId,
    storagePath: fileName,
    storageBytes: uploadFile.size,
    thumbPath: thumbName,
    thumbBytes: thumbFile?.size || 0,
  });

  if (!reserveResult.ok) {
    if (reserveResult.message === "storage_limit_exceeded") {
      throw new Error("存储空间不足，请删除部分图片或升级云空间容量。");
    }
    if (reserveResult.message === "membership_inactive") {
      throw new Error("当前云空间状态暂不能上传图片。");
    }
    if (reserveResult.message === "upload_maintenance") {
      throw new Error(STORAGE_UPLOAD_MAINTENANCE_SYNC_MESSAGE);
    }
    throw new Error("容量检查失败，请稍后重试。");
  }

  const reservation = {
    reservation_id: reserveResult.reservation_id,
    reservation_mode: reserveResult.reservation_mode,
    reserved_bytes: reservedBytes,
  } as const;

  let uploadedThumbPath: string | null = null;
  let uploadedThumbBytes = 0;
  let mediaCommitted = false;
  let cleanupAllowed = true;

  try {
    const { error: uploadError } = await uploadMediaStorageObject(
      fileName,
      uploadFile,
      {
        contentType: uploadFile.type || "image/jpeg",
        upsert: true,
      }
    );

    if (uploadError) {
      console.error("migrate local media upload error:", uploadError);
      if (await isStorageUploadMaintenance()) {
        throw new Error(STORAGE_UPLOAD_MAINTENANCE_SYNC_MESSAGE);
      }
      throw new Error("图片上传失败，请稍后重试。");
    }
    if (thumbFile && thumbName) {
      const { error: thumbError } = await uploadMediaStorageObject(
        thumbName,
        thumbFile,
        {
          contentType: thumbFile.type || "image/jpeg",
          upsert: true,
        }
      );

      if (thumbError) {
        console.error("migrate local thumbnail upload error:", thumbError);
        await supabase.storage.from("media").remove([thumbName]);
      } else {
        uploadedThumbPath = thumbName;
        uploadedThumbBytes = thumbFile.size;
      }
    }

    const actualBytes = uploadFile.size + uploadedThumbBytes;
    const { data: mediaRow, error: mediaError } = await supabase
      .from("media")
      .insert([
        {
          id: targetMediaId,
          record_id: params.cloudRecordId,
          type: "image",
          url: null,
          user_id: params.userId,
          size_mb: actualBytes / (1024 * 1024),
          size_bytes: actualBytes,
          storage_path: fileName,
          thumb_url: null,
          thumb_path: uploadedThumbPath,
          mime_type: uploadFile.type || "image/jpeg",
          width: compressed.width ?? params.image.width ?? null,
          height: compressed.height ?? params.image.height ?? null,
          original_filename: originalFile.name,
          sort_order: params.image.sort_order || 0,
          storage_class: "hot",
          ...(reservation.reservation_id
            ? { upload_reservation_id: reservation.reservation_id }
            : {}),
        },
      ])
      .select("id")
      .single();

    let mediaId = mediaRow?.id ? String(mediaRow.id) : null;

    if (mediaError || !mediaId) {
      console.error("migrate local media insert error:", mediaError);
      const reconciliation = await reconcileMediaUploadCommit({ storagePath: fileName });
      if (reconciliation.status === "found") {
        mediaId = reconciliation.mediaId;
      } else if (reconciliation.status === "unknown") {
        cleanupAllowed = false;
        throw new Error("图片保存状态待确认，已保留上传内容，请稍后重试。");
      } else {
        throw new Error("图片云端记录保存失败，请稍后重试。");
      }
    }
    mediaCommitted = true;

    await settleStorageUploadReservation({
      reservation,
      targetType: "media",
      targetId: mediaId,
      legacyActualBytes: actualBytes,
    });

    await updateLocalImageSyncMeta(params.image.id, {
      status: "synced",
      cloud_archive_id: params.cloudArchiveId,
      cloud_record_id: params.cloudRecordId,
      cloud_media_id: mediaId,
      cloud_media_url: null,
      last_sync_at: new Date().toISOString(),
    });
  } catch (error) {
    if (!mediaCommitted && cleanupAllowed) {
      await supabase.storage
        .from("media")
        .remove([fileName, uploadedThumbPath, thumbName].filter((path): path is string => Boolean(path)));
    }
    if (!mediaCommitted && cleanupAllowed) {
      await cancelStorageUploadReservation(reservation);
    }
    throw error;
  }
}

async function markRecordSynced(params: {
  record: LocalRecordWithImages;
  cloudArchiveId: string;
  cloudRecordId: string;
}) {
  await updateLocalRecordSyncMeta(params.record.id, {
    status: "synced",
    cloud_archive_id: params.cloudArchiveId,
    cloud_record_id: params.cloudRecordId,
    last_sync_at: new Date().toISOString(),
  });
}

export async function syncLocalArchiveToCloud(params: {
  localArchiveId: string;
  ownerContext: LocalArchiveOwnerContext;
  visibility: LocalToCloudVisibility;
}): Promise<LocalToCloudResult> {
  const userId = cleanText(params.ownerContext.userId);
  if (!userId) {
    return {
      success: false,
      error: "请先登录，再转到云空间。",
    };
  }

  const detail = await getLocalArchiveDetail(params.localArchiveId, params.ownerContext);
  if (!detail) {
    return {
      success: false,
      error: "本地项目不存在，或当前账号无权查看。",
    };
  }

  const archive = detail.archive;
  if (!isLocalArchiveVisibleToOwner(archive, params.ownerContext)) {
    return {
      success: false,
      error: "当前账号无权转出这个本地项目。",
    };
  }
  if (!archive.title?.trim()) {
    return {
      success: false,
      error: "项目名称不能为空。",
    };
  }
  if (!getLocalArchiveSystemName(archive)) {
    return {
      success: false,
      error: "系统名不能为空。",
    };
  }
  if (archive.migration_status === "migrating") {
    return {
      success: false,
      cloudArchiveId: archive.migration_cloud_archive_id || null,
      error: "这个本地项目正在转到云空间，请稍后再试。",
    };
  }

  const hasLocalImages = detail.records.some((record) => record.images.length > 0);
  if (hasLocalImages && (await isStorageUploadMaintenance())) {
    return {
      success: false,
      cloudArchiveId: archive.migration_cloud_archive_id || null,
      partialFailure: false,
      error: STORAGE_UPLOAD_MAINTENANCE_SYNC_NOT_STARTED_MESSAGE,
    };
  }

  let cloudArchiveId = cleanText(archive.migration_cloud_archive_id);
  const startedAt = new Date().toISOString();

  try {
    if (cloudArchiveId) {
      await updateLocalArchiveMigrationState(
        params.localArchiveId,
        {
          migration_status: "migrating",
          migration_started_at: startedAt,
          migration_error: null,
          migration_visibility: params.visibility,
          sync: {
            status: "pending-cloud-sync",
            cloud_archive_id: cloudArchiveId,
            last_sync_at: startedAt,
          },
        },
        params.ownerContext
      );
    }

    cloudArchiveId = await ensureCloudArchive({
      archive,
      userId,
      visibility: params.visibility,
      existingCloudArchiveId: cloudArchiveId,
    });

    await updateLocalArchiveMigrationState(
      params.localArchiveId,
      {
        migration_status: "migrating",
        migration_cloud_archive_id: cloudArchiveId,
        migration_started_at: startedAt,
        migration_error: null,
        migration_visibility: params.visibility,
        sync: {
          status: "pending-cloud-sync",
          cloud_archive_id: cloudArchiveId,
          last_sync_at: new Date().toISOString(),
        },
      },
      params.ownerContext
    );

    const cycleIdMap = await ensureCloudCycles({
      archiveId: cloudArchiveId,
      cycles: archive.cycles || [],
    });

    const sortedRecords = [...detail.records].sort(
      (a, b) =>
        new Date(a.record_time || a.created_at).getTime() -
        new Date(b.record_time || b.created_at).getTime()
    );

    for (const record of sortedRecords) {
      const cloudCycleId = record.cycle_id
        ? cycleIdMap.get(record.cycle_id)
        : null;
      if (record.cycle_id && !cloudCycleId) {
        throw new Error("记录所属周期迁移失败，请重试。");
      }

      const cloudRecordId = await ensureCloudRecord({
        archiveId: cloudArchiveId,
        userId,
        visibility: params.visibility,
        record,
        cycleId: cloudCycleId,
      });

      for (const image of [...record.images].sort((a, b) => a.sort_order - b.sort_order)) {
        await uploadLocalImageToCloud({
          image,
          cloudRecordId,
          cloudArchiveId,
          userId,
        });
      }

      await markRecordSynced({
        record,
        cloudArchiveId,
        cloudRecordId,
      });
    }

    await updateLocalArchiveMigrationState(
      params.localArchiveId,
      {
        migration_status: "migrated",
        migration_cloud_archive_id: cloudArchiveId,
        migration_error: null,
        migration_visibility: params.visibility,
        migrated_at: new Date().toISOString(),
        sync: {
          status: "synced",
          cloud_archive_id: cloudArchiveId,
          last_sync_at: new Date().toISOString(),
        },
      },
      params.ownerContext
    );

    await completeLocalArchiveCloudTransfer(
      params.localArchiveId,
      cloudArchiveId,
      params.ownerContext
    );

    return {
      success: true,
      cloudArchiveId,
    };
  } catch (error) {
    const message = getUserFacingSyncError(error);
    await updateLocalArchiveMigrationState(
      params.localArchiveId,
      {
        migration_status: "failed",
        migration_cloud_archive_id: cloudArchiveId,
        migration_error: message,
        migration_visibility: params.visibility,
        sync: {
          status: "pending-cloud-sync",
          cloud_archive_id: cloudArchiveId,
          last_sync_at: new Date().toISOString(),
        },
      },
      params.ownerContext
    ).catch((stateError) => {
      console.error("save local migration failure state error:", stateError);
    });

    return {
      success: false,
      cloudArchiveId,
      partialFailure: Boolean(cloudArchiveId),
      error: message,
    };
  }
}
