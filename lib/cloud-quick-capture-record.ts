import { createImageThumbnailFile, standardizeRecordPhotoFile } from "@/lib/image-compression";
import { uploadMediaStorageObject } from "@/lib/media-storage-upload";
import { readImageCapturedAt } from "@/lib/photo-metadata";
import {
  deleteQuickCapture,
  getQuickCapture,
  getQuickCapturePhotos,
} from "@/lib/quick-capture";
import {
  cancelStorageUploadReservation,
  reconcileMediaUploadCommit,
  reserveStorageUpload,
  settleStorageUploadReservation,
} from "@/lib/storage-usage";
import { isStorageUploadMaintenance } from "@/lib/storage-upload-maintenance";
import { supabase } from "@/lib/supabase";
import { isMissingDatabaseColumn, withoutCapturedAt } from "@/lib/supabase-schema-compat";

export type CloudQuickCaptureErrorCode =
  | "capture_missing"
  | "upload_maintenance"
  | "record_create_failed"
  | "storage_limit_exceeded"
  | "membership_inactive"
  | "capacity_check_failed"
  | "upload_failed"
  | "save_pending";

export class CloudQuickCaptureError extends Error {
  code: CloudQuickCaptureErrorCode;

  constructor(code: CloudQuickCaptureErrorCode) {
    super(code);
    this.code = code;
  }
}

async function uploadQuickCapturePhoto({
  file,
  capturedAt,
  recordId,
  userId,
  onStoredPath,
}: {
  file: File;
  capturedAt: string;
  recordId: string;
  userId: string;
  onStoredPath: (path: string) => void;
}) {
  const compressed = await standardizeRecordPhotoFile(file);
  const uploadFile = compressed.file;
  const thumbnail = await createImageThumbnailFile(uploadFile);
  const thumbFile = thumbnail.wasGenerated ? thumbnail.file : null;
  const uploadBytes = uploadFile.size;
  const thumbBytes = thumbFile?.size || 0;
  const reservedBytes = uploadBytes + thumbBytes;
  const safeName = uploadFile.name.replace(/[^\w.\-]+/g, "_");
  const uploadKey = crypto.randomUUID();
  const mediaId = crypto.randomUUID();
  const storagePath = `${userId}/${recordId}/${uploadKey}-${safeName}`;
  const thumbSafeName = thumbFile?.name.replace(/[^\w.\-]+/g, "_") || null;
  const thumbPath = thumbFile && thumbSafeName
    ? `${userId}/${recordId}/thumbs/${uploadKey}-${thumbSafeName}`
    : null;

  const reserveResult = await reserveStorageUpload({
    targetType: "media",
    targetId: mediaId,
    targetParentId: recordId,
    storagePath,
    storageBytes: uploadBytes,
    thumbPath,
    thumbBytes,
  });

  if (!reserveResult.ok) {
    const code = reserveResult.message === "storage_limit_exceeded"
      ? "storage_limit_exceeded"
      : reserveResult.message === "membership_inactive"
        ? "membership_inactive"
        : "capacity_check_failed";
    throw new CloudQuickCaptureError(code);
  }

  const reservation = {
    reservation_id: reserveResult.reservation_id,
    reservation_mode: reserveResult.reservation_mode,
    reserved_bytes: reservedBytes,
  } as const;

  const { error: uploadError } = await uploadMediaStorageObject(storagePath, uploadFile, {
    contentType: uploadFile.type || "image/jpeg",
  });
  if (uploadError) {
    console.error("quick capture media upload failed:", uploadError);
    await supabase.storage.from("media").remove(
      [storagePath, thumbPath].filter((path): path is string => Boolean(path)),
    );
    await cancelStorageUploadReservation(reservation);
    throw new CloudQuickCaptureError("upload_failed");
  }
  onStoredPath(storagePath);

  let savedThumbPath: string | null = null;
  let savedThumbBytes = 0;
  if (thumbFile && thumbPath) {
    const { error: thumbError } = await uploadMediaStorageObject(thumbPath, thumbFile, {
      contentType: thumbFile.type || "image/jpeg",
    });
    if (thumbError) {
      console.error("quick capture thumbnail upload failed:", thumbError);
      await supabase.storage.from("media").remove([thumbPath]);
    } else {
      savedThumbPath = thumbPath;
      savedThumbBytes = thumbBytes;
      onStoredPath(thumbPath);
    }
  }

  const actualBytes = uploadBytes + savedThumbBytes;
  const mediaPayload = {
    id: mediaId,
    record_id: recordId,
    type: "image",
    url: null,
    user_id: userId,
    size_mb: actualBytes / (1024 * 1024),
    size_bytes: actualBytes,
    storage_path: storagePath,
    thumb_url: null,
    thumb_path: savedThumbPath,
    mime_type: uploadFile.type || "image/jpeg",
    width: compressed.width ?? null,
    height: compressed.height ?? null,
    original_filename: file.name,
    captured_at: capturedAt,
    storage_class: "hot",
    ...(reservation.reservation_id
      ? { upload_reservation_id: reservation.reservation_id }
      : {}),
  };
  let mediaResult = await supabase.from("media").insert([mediaPayload]).select("id").single();
  if (isMissingDatabaseColumn(mediaResult.error, "media", "captured_at")) {
    mediaResult = await supabase
      .from("media")
      .insert([withoutCapturedAt(mediaPayload)])
      .select("id")
      .single();
  }

  let committedMediaId = mediaResult.data?.id ? String(mediaResult.data.id) : null;
  if (mediaResult.error || !committedMediaId) {
    console.error("quick capture media row create failed:", mediaResult.error);
    const reconciliation = await reconcileMediaUploadCommit({ storagePath });
    if (reconciliation.status === "found") {
      committedMediaId = reconciliation.mediaId;
    } else if (reconciliation.status === "missing") {
      await supabase.storage.from("media").remove(
        [storagePath, savedThumbPath].filter((path): path is string => Boolean(path)),
      );
      await cancelStorageUploadReservation(reservation);
      throw new CloudQuickCaptureError("upload_failed");
    } else {
      throw new CloudQuickCaptureError("save_pending");
    }
  }

  await settleStorageUploadReservation({
    reservation,
    targetType: "media",
    targetId: committedMediaId,
    legacyActualBytes: actualBytes,
  });
  return committedMediaId;
}

export async function saveQuickCaptureAsFirstCloudRecord({
  archiveId,
  userId,
  quickCaptureId,
}: {
  archiveId: string;
  userId: string;
  quickCaptureId: string;
}) {
  const capture = await getQuickCapture(quickCaptureId);
  if (!capture) throw new CloudQuickCaptureError("capture_missing");
  if (await isStorageUploadMaintenance()) {
    throw new CloudQuickCaptureError("upload_maintenance");
  }

  const photos = getQuickCapturePhotos(capture);
  const files = photos.map((photo) =>
    new File([photo.blob], photo.name, {
      type: photo.mimeType || photo.blob.type || "image/jpeg",
      lastModified: new Date(photo.createdAt).getTime(),
    }),
  );
  if (files.length === 0) throw new CloudQuickCaptureError("capture_missing");
  const capturedTimes = await Promise.all(
    files.map(async (file, index) =>
      (await readImageCapturedAt(file)) || photos[index]?.createdAt || capture.createdAt,
    ),
  );
  const recordTime = capturedTimes.reduce(
    (latest, value) =>
      new Date(value).getTime() > new Date(latest).getTime() ? value : latest,
    capture.createdAt || new Date().toISOString(),
  );
  const { data: record, error: recordError } = await supabase
    .from("records")
    .insert([{
      archive_id: archiveId,
      cycle_id: null,
      note: "",
      user_id: userId,
      visibility: "public",
      photo_time: recordTime,
      record_time: recordTime,
      upload_time: new Date().toISOString(),
      status_tag: null,
    }])
    .select("id")
    .single();

  if (recordError || !record?.id) {
    console.error("quick capture record create failed:", recordError);
    throw new CloudQuickCaptureError("record_create_failed");
  }

  const recordId = String(record.id);
  const removeDraftRecord = () =>
    supabase.from("records").delete().eq("id", recordId).eq("user_id", userId);
  const storedPaths = new Set<string>();
  const mediaIds: string[] = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      const mediaId = await uploadQuickCapturePhoto({
        file: files[index],
        capturedAt: capturedTimes[index],
        recordId,
        userId,
        onStoredPath: (path) => storedPaths.add(path),
      });
      mediaIds.push(mediaId);
    }
  } catch (error) {
    if (error instanceof CloudQuickCaptureError && error.code === "save_pending") {
      throw error;
    }

    await removeDraftRecord();
    if (storedPaths.size > 0) {
      await supabase.storage.from("media").remove(Array.from(storedPaths));
    }
    throw error instanceof CloudQuickCaptureError
      ? error
      : new CloudQuickCaptureError("upload_failed");
  }

  await deleteQuickCapture(quickCaptureId).catch(() => undefined);
  return { recordId, mediaIds };
}
