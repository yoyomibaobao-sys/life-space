import { supabase } from "@/lib/supabase";
import { createImageThumbnailFile, standardizeRecordPhotoFile } from "@/lib/image-compression";
import { readImageCapturedAt } from "@/lib/photo-metadata";
import { limitRecordPhotoBatch } from "@/lib/record-photo-batches";
import { uploadMediaStorageObject } from "@/lib/media-storage-upload";
import { isStorageUploadMaintenance } from "@/lib/storage-upload-maintenance";
import { canCreateMembershipContent, normalizeMembershipRpcResult } from "@/lib/membership";
import { reserveStorageUpload, cancelStorageUploadReservation, settleStorageUploadReservation, reconcileMediaUploadCommit } from "@/lib/storage-usage";
import { isMissingDatabaseColumn, withoutCapturedAt } from "@/lib/supabase-schema-compat";
import type { MediaItem } from "@/lib/domain-types";

// Existing-record uploads use the same reservation and reconciliation sequence
// as the website controller. Fail closed: never remove an uncertain upload.
export async function uploadCloudRecordImages({ recordId, files, userId }: {
  recordId: string;
  files: File[];
  userId: string;
}): Promise<MediaItem[]> {
  if (!navigator.onLine) throw new Error("network_required");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || auth.user?.id !== userId) throw new Error("not_authenticated");
  const { data: record, error: recordError } = await supabase.from("records")
    .select("id, archive_id").eq("id", recordId).maybeSingle();
  const ownership = record?.archive_id ? await supabase.from("archives")
    .select("id").eq("id", record.archive_id).eq("user_id", userId).maybeSingle() : null;
  if (recordError || !record || ownership?.error || !ownership?.data) {
    throw new Error("not_record_owner");
  }
  const membership = await supabase.rpc("get_my_membership");
  if (membership.error || !canCreateMembershipContent(normalizeMembershipRpcResult(membership.data))) {
    throw new Error("cloud_membership_read_only");
  }
  if (await isStorageUploadMaintenance()) throw new Error("upload_maintenance");
  const { accepted, rejectedCount } = limitRecordPhotoBatch(files);
  if (rejectedCount) throw new Error("photo_batch_limit");

  const uploaded: MediaItem[] = [];
  for (const [index, original] of accepted.entries()) {
    const capturedAt = await readImageCapturedAt(original);
    const standardized = await standardizeRecordPhotoFile(original, { requireSanitized: true });
    const file = standardized.file;
    const thumbnail = await createImageThumbnailFile(file);
    const thumb = thumbnail.wasGenerated ? thumbnail.file : null;
    const stamp = Date.now();
    const mediaId = crypto.randomUUID();
    const path = `${userId}/${recordId}/${stamp}-${index}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const thumbPath = thumb ? `${userId}/${recordId}/thumbs/${stamp}-${index}-${thumb.name.replace(/[^\w.\-]+/g, "_")}` : null;
    const reservationResult = await reserveStorageUpload({
      targetType: "media", targetId: mediaId, targetParentId: recordId,
      storagePath: path, storageBytes: file.size, thumbPath, thumbBytes: thumb?.size || 0,
    });
    if (!reservationResult.ok) throw new Error(reservationResult.message || "capacity_check_failed");
    const reservation = {
      reservation_id: reservationResult.reservation_id,
      reservation_mode: reservationResult.reservation_mode,
      reserved_bytes: file.size + (thumb?.size || 0),
    } as const;
    const primary = await uploadMediaStorageObject(path, file, { contentType: file.type || "image/jpeg" });
    if (primary.error) {
      await supabase.storage.from("media").remove([path]);
      await cancelStorageUploadReservation(reservation);
      throw primary.error;
    }
    let committedThumb: string | null = null;
    if (thumb && thumbPath) {
      const thumbResult = await uploadMediaStorageObject(thumbPath, thumb, { contentType: thumb.type || "image/jpeg" });
      if (!thumbResult.error) committedThumb = thumbPath;
    }
    const actualBytes = file.size + (committedThumb ? thumb!.size : 0);
    const payload = {
      id: mediaId, record_id: recordId, type: "image", url: null, user_id: userId,
      size_mb: actualBytes / (1024 * 1024), size_bytes: actualBytes,
      storage_path: path, thumb_url: null, thumb_path: committedThumb,
      mime_type: file.type || "image/jpeg", width: standardized.width ?? null,
      height: standardized.height ?? null, original_filename: original.name,
      captured_at: capturedAt, storage_class: "hot",
      ...(reservation.reservation_id ? { upload_reservation_id: reservation.reservation_id } : {}),
    };
    let insert = await supabase.from("media").insert([payload]).select().single();
    if (isMissingDatabaseColumn(insert.error, "media", "captured_at")) {
      insert = await supabase.from("media").insert([withoutCapturedAt(payload)]).select().single();
    }
    let row = insert.data as MediaItem | null;
    if (insert.error || !row?.id) {
      const state = await reconcileMediaUploadCommit({ storagePath: path });
      if (state.status === "found") {
        const read = await supabase.from("media").select("*").eq("id", state.mediaId).single();
        if (read.error || !read.data) throw new Error("save_state_pending");
        row = read.data as MediaItem;
      } else if (state.status === "missing") {
        await supabase.storage.from("media").remove([path, committedThumb].filter((entry): entry is string => Boolean(entry)));
        await cancelStorageUploadReservation(reservation);
        throw insert.error || new Error("media_insert_failed");
      } else {
        throw new Error("save_state_pending");
      }
    }
    await settleStorageUploadReservation({ reservation, targetType: "media", targetId: row.id, legacyActualBytes: actualBytes });
    uploaded.push(row);
  }
  return uploaded;
}
