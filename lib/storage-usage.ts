import { supabase } from "@/lib/supabase";
import type { MediaItem } from "@/lib/domain-types";
import { getMediaStoragePathFromUrl } from "@/lib/media-urls";

export type StorageReserveResult = {
  ok: boolean;
  reservation_id: string | null;
  reservation_mode: "reservation" | "legacy";
  storage_used: number;
  storage_limit_bytes: number;
  remaining_bytes: number;
  message: string;
};

export type StorageReservationMutationResult = {
  ok: boolean;
  reservation_id: string | null;
  status: string | null;
  reserved_bytes: number;
  actual_bytes: number | null;
  storage_used: number;
  storage_limit_bytes: number;
  remaining_bytes: number;
  message: string;
};

export type StorageUploadReservation = Pick<
  StorageReserveResult,
  "reservation_id" | "reservation_mode"
> & {
  reserved_bytes: number;
};

export type StorageUploadTargetType =
  | "media"
  | "market_cover"
  | "market_media";

export type MediaUploadCommitReconciliation =
  | { status: "found"; mediaId: string }
  | { status: "missing"; mediaId: null }
  | { status: "unknown"; mediaId: null };

export const STORAGE_UPLOAD_MAINTENANCE_MESSAGE =
  "云端图片上传正在维护，暂时无法上传，请稍后再试。文字内容仍可正常保存。";

function firstRpcRow<T>(data: T[] | T | null | undefined): T | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export function mediaSizeMbToBytes(sizeMb?: number | string | null) {
  const value = Number(sizeMb || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 1024 * 1024);
}

export function mediaSizeToBytes(
  item: Pick<MediaItem, "size_mb" | "size_bytes"> | null | undefined
) {
  const sizeBytes = Number(item?.size_bytes || 0);

  if (Number.isFinite(sizeBytes) && sizeBytes > 0) {
    return Math.round(sizeBytes);
  }

  return mediaSizeMbToBytes(item?.size_mb);
}

export function sumMediaSizeBytes(
  mediaItems: Array<Pick<MediaItem, "size_mb" | "size_bytes"> | null | undefined>
) {
  return mediaItems.reduce((total, item) => total + mediaSizeToBytes(item), 0);
}

export function getMediaStoragePath(url?: string | null) {
  return getMediaStoragePathFromUrl(url);
}

export async function removeMediaFilesFromStorage(
  mediaItems: Array<
    | Pick<MediaItem, "url" | "file_url" | "storage_path" | "thumb_path">
    | null
    | undefined
  >
) {
  const paths = Array.from(
    new Set(
      mediaItems
        .flatMap((item) => [
          item?.storage_path || null,
          item?.thumb_path || null,
          getMediaStoragePath(item?.url || item?.file_url || null),
        ])
        .filter((path): path is string => Boolean(path))
    )
  );

  if (paths.length === 0) return;

  const { error } = await supabase.storage.from("media").remove(paths);
  if (error) {
    console.error("remove media files error:", error);
  }
}

function isMissingReservationRpc(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /reserve_storage_upload|schema cache|function .* does not exist/i.test(error.message || "")
  );
}

async function reserveLegacyStorageBytes(bytes: number) {
  const { data, error } = await supabase.rpc("reserve_storage_bytes", {
    p_bytes: bytes,
  });

  if (error) {
    console.error("reserve legacy storage bytes error:", error);
    return {
      ok: false,
      reservation_id: null,
      reservation_mode: "legacy",
      storage_used: 0,
      storage_limit_bytes: 0,
      remaining_bytes: 0,
      message: "reserve_failed",
    } satisfies StorageReserveResult;
  }

  const row = firstRpcRow<Omit<StorageReserveResult, "reservation_id" | "reservation_mode">>(data);

  return {
    ok: Boolean(row?.ok),
    reservation_id: null,
    reservation_mode: "legacy",
    storage_used: Number(row?.storage_used || 0),
    storage_limit_bytes: Number(row?.storage_limit_bytes || 0),
    remaining_bytes: Number(row?.remaining_bytes || 0),
    message: row?.message || "unknown",
  } satisfies StorageReserveResult;
}

export async function reserveStorageUpload(params: {
  reservationId?: string;
  targetType: StorageUploadTargetType;
  targetId: string;
  targetParentId?: string | null;
  storagePath: string;
  storageBytes: number;
  thumbPath?: string | null;
  thumbBytes?: number | null;
}) {
  const storageBytes = Math.max(0, Math.round(Number(params.storageBytes || 0)));
  const thumbBytes = Math.max(0, Math.round(Number(params.thumbBytes || 0)));
  const reservedBytes = storageBytes + thumbBytes;
  const reservationId = params.reservationId || crypto.randomUUID();
  const rpcParams = {
    p_reservation_id: reservationId,
    p_target_type: params.targetType,
    p_target_id: params.targetId,
    p_target_parent_id: params.targetParentId || null,
    p_storage_path: params.storagePath,
    p_storage_bytes: storageBytes,
    p_thumb_path: params.thumbPath || null,
    p_thumb_bytes: thumbBytes,
  };

  let { data, error } = await supabase.rpc("reserve_storage_upload", rpcParams);

  if (isMissingReservationRpc(error)) {
    return reserveLegacyStorageBytes(reservedBytes);
  }

  if (error) {
    const retry = await supabase.rpc("reserve_storage_upload", rpcParams);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error("reserve storage upload error:", error);
    await supabase.rpc("cancel_storage_upload_reservation", {
      p_reservation_id: reservationId,
    });
    return {
      ok: false,
      reservation_id: null,
      reservation_mode: "reservation",
      storage_used: 0,
      storage_limit_bytes: 0,
      remaining_bytes: 0,
      message: "reserve_failed",
    } satisfies StorageReserveResult;
  }

  const row = firstRpcRow<StorageReserveResult>(data);

  return {
    ok: Boolean(row?.ok),
    reservation_id: row?.reservation_id || null,
    reservation_mode: "reservation",
    storage_used: Number(row?.storage_used || 0),
    storage_limit_bytes: Number(row?.storage_limit_bytes || 0),
    remaining_bytes: Number(row?.remaining_bytes || 0),
    message: row?.message || "unknown",
  } satisfies StorageReserveResult;
}

export async function reconcileMediaUploadCommit(params: {
  storagePath: string;
}): Promise<MediaUploadCommitReconciliation> {
  const { data, error } = await supabase
    .from("media")
    .select("id")
    .eq("storage_path", params.storagePath)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("reconcile media upload commit error:", error);
    return { status: "unknown", mediaId: null };
  }

  if (!data?.id) return { status: "missing", mediaId: null };
  return { status: "found", mediaId: String(data.id) };
}

async function releaseLegacyStorageBytes(sizeBytes: number) {
  const bytes = Math.max(0, Math.round(Number(sizeBytes || 0)));

  if (bytes <= 0) {
    return {
      ok: true,
      reservation_id: null,
      status: null,
      reserved_bytes: 0,
      actual_bytes: null,
      storage_used: 0,
      storage_limit_bytes: 0,
      remaining_bytes: 0,
      message: "no_bytes_released",
    } satisfies StorageReservationMutationResult;
  }

  const { data, error } = await supabase.rpc("release_storage_bytes", {
    p_bytes: bytes,
  });

  if (error) {
    console.error("release storage bytes error:", error);
    return {
      ok: false,
      reservation_id: null,
      status: null,
      reserved_bytes: bytes,
      actual_bytes: null,
      storage_used: 0,
      storage_limit_bytes: 0,
      remaining_bytes: 0,
      message: "release_failed",
    } satisfies StorageReservationMutationResult;
  }

  const row = firstRpcRow<
    Pick<
      StorageReservationMutationResult,
      "storage_used" | "storage_limit_bytes" | "remaining_bytes" | "message"
    >
  >(data);

  return {
    ok: true,
    reservation_id: null,
    status: null,
    reserved_bytes: bytes,
    actual_bytes: null,
    storage_used: Number(row?.storage_used || 0),
    storage_limit_bytes: Number(row?.storage_limit_bytes || 0),
    remaining_bytes: Number(row?.remaining_bytes || 0),
    message: row?.message || "released",
  } satisfies StorageReservationMutationResult;
}

export async function cancelStorageUploadReservation(
  reservation: StorageUploadReservation
) {
  if (!reservation.reservation_id) {
    return releaseLegacyStorageBytes(reservation.reserved_bytes);
  }

  const { data, error } = await supabase.rpc("cancel_storage_upload_reservation", {
    p_reservation_id: reservation.reservation_id,
  });

  if (error) {
    console.error("cancel storage upload reservation error:", error);
    return {
      ok: false,
      reservation_id: reservation.reservation_id,
      status: null,
      reserved_bytes: reservation.reserved_bytes,
      actual_bytes: null,
      storage_used: 0,
      storage_limit_bytes: 0,
      remaining_bytes: 0,
      message: "cancel_failed",
    } satisfies StorageReservationMutationResult;
  }

  const row = firstRpcRow<StorageReservationMutationResult>(data);
  return normalizeReservationMutation(row, reservation);
}

export async function settleStorageUploadReservation(params: {
  reservation: StorageUploadReservation;
  targetType: StorageUploadTargetType;
  targetId: string;
  legacyActualBytes: number;
}) {
  if (!params.reservation.reservation_id) {
    return releaseLegacyStorageBytes(
      Math.max(0, params.reservation.reserved_bytes - params.legacyActualBytes)
    );
  }

  const { data, error } = await supabase.rpc("settle_storage_upload_reservation", {
    p_reservation_id: params.reservation.reservation_id,
    p_target_type: params.targetType,
    p_target_id: params.targetId,
  });

  if (error) {
    console.error("settle storage upload reservation error:", error);
    return {
      ok: false,
      reservation_id: params.reservation.reservation_id,
      status: null,
      reserved_bytes: params.reservation.reserved_bytes,
      actual_bytes: null,
      storage_used: 0,
      storage_limit_bytes: 0,
      remaining_bytes: 0,
      message: "settle_failed",
    } satisfies StorageReservationMutationResult;
  }

  const row = firstRpcRow<StorageReservationMutationResult>(data);
  return normalizeReservationMutation(row, params.reservation);
}

function normalizeReservationMutation(
  row: StorageReservationMutationResult | null,
  reservation: StorageUploadReservation
) {
  return {
    ok: Boolean(row?.ok),
    reservation_id: row?.reservation_id || reservation.reservation_id,
    status: row?.status || null,
    reserved_bytes: Number(row?.reserved_bytes ?? reservation.reserved_bytes),
    actual_bytes: row?.actual_bytes == null ? null : Number(row.actual_bytes),
    storage_used: Number(row?.storage_used || 0),
    storage_limit_bytes: Number(row?.storage_limit_bytes || 0),
    remaining_bytes: Number(row?.remaining_bytes || 0),
    message: row?.message || "unknown",
  } satisfies StorageReservationMutationResult;
}
