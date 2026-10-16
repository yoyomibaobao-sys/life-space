import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { resolveMatchingCloudOrigin } from "@/lib/android-cloud-export";
import { requestAndroidRemoteApi } from "@/lib/android-remote-api";
import { compressImageFile, createImageThumbnailFile } from "@/lib/image-compression";
import { uploadMediaStorageObject } from "@/lib/media-storage-upload";
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

function marketMutationResult(
  status: number,
  httpOk: boolean,
  result: { ok?: unknown; cleanup?: unknown } | null,
): MarketMutationResult {
  return {
    ok: httpOk && result?.ok === true,
    status,
    cleanup:
      result?.cleanup === "processed" || result?.cleanup === "queued"
        ? result.cleanup
        : null,
  };
}

async function requestNativeMarketMutation(
  path: string,
  method: "DELETE" | "PUT",
  body?: unknown,
): Promise<MarketMutationResult> {
  const { origin } = resolveMatchingCloudOrigin();
  if (origin === "https://life-space.uk") {
    const result = await requestAndroidRemoteApi<{ ok?: unknown; cleanup?: unknown }>(path, {
      method,
      ...(body === undefined ? {} : { json: body }),
    });
    return marketMutationResult(result.status, result.ok, result.data);
  }
  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith("/api/")) {
    return { ok: false, status: 0, cleanup: null };
  }
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return { ok: false, status: 401, cleanup: null };
  const response = await CapacitorHttp.request({
    url: url.href,
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    data: body === undefined ? undefined : JSON.stringify(body),
    disableRedirects: true,
    responseType: "json",
    connectTimeout: 10000,
    readTimeout: 30000,
  });
  const responseUrl = response.url ? new URL(response.url, url) : url;
  if (responseUrl.origin !== origin || (response.status >= 300 && response.status < 400)) {
    return { ok: false, status: response.status, cleanup: null };
  }
  let data: { ok?: unknown; cleanup?: unknown } | null = null;
  if (response.data !== "" && response.data != null) {
    data = (typeof response.data === "string" ? JSON.parse(response.data) : response.data) as {
      ok?: unknown;
      cleanup?: unknown;
    };
    if (typeof data !== "object" || data === null) return { ok: false, status: response.status, cleanup: null };
  }
  return marketMutationResult(response.status, response.status >= 200 && response.status < 300, data);
}

async function requestMarketMutation(
  path: string,
  method: "DELETE" | "PUT",
  body?: unknown,
): Promise<MarketMutationResult> {
  try {
    if (Capacitor.isNativePlatform()) return await requestNativeMarketMutation(path, method, body);
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

    return marketMutationResult(response.status, response.ok, result);
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

  const { error: uploadError } = await uploadMediaStorageObject(
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
    const { error: thumbError } = await uploadMediaStorageObject(
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
