import { compressImageFile, createImageThumbnailFile } from "@/lib/image-compression";
import { supabase } from "@/lib/supabase";
import {
  cancelStorageUploadReservation,
  reserveStorageUpload,
  settleStorageUploadReservation,
  STORAGE_UPLOAD_MAINTENANCE_MESSAGE,
  type StorageUploadReservation,
  type StorageUploadTargetType,
} from "@/lib/storage-usage";

export type ReservedMarketImage = {
  targetType: Extract<StorageUploadTargetType, "market_cover" | "market_media">;
  targetId: string;
  postId: string;
  path: string;
  thumbPath: string | null;
  reservation: StorageUploadReservation;
  actualBytes: number;
};

type MarketMutationResult = {
  ok: boolean;
  status: number;
  cleanup: "processed" | "queued" | null;
};

function safeFileName(value: string, fallback: string) {
  return value.replace(/[^\w.\-]+/g, "_") || fallback;
}

function getUploadErrorMessage(message: string) {
  if (message === "upload_maintenance") return STORAGE_UPLOAD_MAINTENANCE_MESSAGE;
  if (message === "storage_limit_exceeded") {
    return "云空间容量不足，请先清理图片或调整空间容量。";
  }
  if (message === "membership_inactive") {
    return "当前云空间状态暂不能上传图片。";
  }
  return "容量检查失败，请稍后重试。";
}

async function getAuthHeaders(includeJson = false) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (includeJson) headers.set("Content-Type", "application/json");
  return headers;
}

async function requestMarketMutation(
  path: string,
  method: "DELETE" | "PUT",
  body?: unknown,
): Promise<MarketMutationResult> {
  try {
    const response = await fetch(path, {
      method,
      headers: await getAuthHeaders(body !== undefined),
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = (await response.json().catch(() => null)) as {
      ok?: unknown;
      cleanup?: unknown;
    } | null;

    return {
      ok: response.ok && result?.ok === true,
      status: response.status,
      cleanup:
        result?.cleanup === "processed" || result?.cleanup === "queued"
          ? result.cleanup
          : null,
    };
  } catch {
    return { ok: false, status: 0, cleanup: null };
  }
}

export async function uploadReservedMarketImage(params: {
  userId: string;
  postId: string;
  targetType: Extract<StorageUploadTargetType, "market_cover" | "market_media">;
  targetId: string;
  file: File;
}) {
  const compressed = await compressImageFile(params.file);
  const uploadFile = compressed.file;
  const thumbnail = await createImageThumbnailFile(uploadFile);
  const thumbFile = thumbnail.wasGenerated ? thumbnail.file : null;
  const uploadKey = crypto.randomUUID();
  const safeName = safeFileName(uploadFile.name, "image.jpg");
  const path = `${params.userId}/market/${params.postId}/${uploadKey}-${safeName}`;
  const thumbPath = thumbFile
    ? `${params.userId}/market/${params.postId}/thumbs/${uploadKey}-${safeFileName(thumbFile.name, `thumb-${safeName}`)}`
    : null;
  const reservedBytes = uploadFile.size + (thumbFile?.size || 0);
  const reserveResult = await reserveStorageUpload({
    targetType: params.targetType,
    targetId: params.targetId,
    targetParentId: params.targetType === "market_media" ? params.postId : null,
    storagePath: path,
    storageBytes: uploadFile.size,
    thumbPath,
    thumbBytes: thumbFile?.size || 0,
  });

  if (!reserveResult.ok) {
    throw new Error(getUploadErrorMessage(reserveResult.message));
  }

  const reservation = {
    reservation_id: reserveResult.reservation_id,
    reservation_mode: reserveResult.reservation_mode,
    reserved_bytes: reservedBytes,
  } satisfies StorageUploadReservation;

  const { error: uploadError } = await supabase.storage.from("media").upload(
    path,
    uploadFile,
    {
      contentType: uploadFile.type || "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    },
  );

  if (uploadError) {
    await supabase.storage.from("media").remove([path, thumbPath].filter(Boolean) as string[]);
    await cancelStorageUploadReservation(reservation);
    throw new Error("图片上传失败，请稍后重试。");
  }

  let uploadedThumbPath: string | null = null;
  let uploadedThumbBytes = 0;
  if (thumbFile && thumbPath) {
    const { error: thumbError } = await supabase.storage.from("media").upload(
      thumbPath,
      thumbFile,
      {
        contentType: thumbFile.type || "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      },
    );
    if (thumbError) {
      await supabase.storage.from("media").remove([thumbPath]);
    } else {
      uploadedThumbPath = thumbPath;
      uploadedThumbBytes = thumbFile.size;
    }
  }

  return {
    targetType: params.targetType,
    targetId: params.targetId,
    postId: params.postId,
    path,
    thumbPath: uploadedThumbPath,
    reservation,
    actualBytes: uploadFile.size + uploadedThumbBytes,
  } satisfies ReservedMarketImage;
}

export async function settleReservedMarketImage(image: ReservedMarketImage) {
  return settleStorageUploadReservation({
    reservation: image.reservation,
    targetType: image.targetType,
    targetId: image.targetId,
    legacyActualBytes: image.actualBytes,
  });
}

export async function rollbackReservedMarketImage(image: ReservedMarketImage) {
  const paths = [image.path, image.thumbPath].filter(Boolean) as string[];
  const removeResult = await supabase.storage.from("media").remove(paths);
  if (removeResult.error) return false;
  const cancelResult = await cancelStorageUploadReservation(image.reservation);
  return cancelResult.ok;
}

export function setMarketPostCover(params: {
  postId: string;
  path: string | null;
  thumbPath?: string | null;
  reservationId?: string | null;
}) {
  return requestMarketMutation(`/api/market/posts/${encodeURIComponent(params.postId)}/cover`, "PUT", {
    path: params.path,
    thumbPath: params.thumbPath || null,
    reservationId: params.reservationId || null,
  });
}

export function requestMarketMediaDeletion(mediaId: string) {
  return requestMarketMutation(`/api/market/media/${encodeURIComponent(mediaId)}`, "DELETE");
}

export function requestMarketPostDeletion(postId: string) {
  return requestMarketMutation(`/api/market/posts/${encodeURIComponent(postId)}`, "DELETE");
}
