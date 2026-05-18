import { supabase } from "@/lib/supabase";
import type { MediaItem } from "@/lib/domain-types";

export type StorageReserveResult = {
  ok: boolean;
  storage_used: number;
  storage_limit_bytes: number;
  remaining_bytes: number;
  message: string;
};

export type StorageReleaseResult = {
  storage_used: number;
  storage_limit_bytes: number;
  remaining_bytes: number;
  message: string;
};

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
  if (!url) return null;

  const marker = "/storage/v1/object/public/media/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;

  const rawPath = url.slice(markerIndex + marker.length).split("?")[0];
  if (!rawPath) return null;

  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
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

export async function reserveStorageBytes(sizeBytes: number) {
  const bytes = Math.max(0, Math.round(Number(sizeBytes || 0)));

  const { data, error } = await supabase.rpc("reserve_storage_bytes", {
    p_bytes: bytes,
  });

  if (error) {
    console.error("reserve storage bytes error:", error);
    return {
      ok: false,
      storage_used: 0,
      storage_limit_bytes: 0,
      remaining_bytes: 0,
      message: "reserve_failed",
    } satisfies StorageReserveResult;
  }

  const row = firstRpcRow<StorageReserveResult>(data);

  return {
    ok: Boolean(row?.ok),
    storage_used: Number(row?.storage_used || 0),
    storage_limit_bytes: Number(row?.storage_limit_bytes || 0),
    remaining_bytes: Number(row?.remaining_bytes || 0),
    message: row?.message || "unknown",
  } satisfies StorageReserveResult;
}

export async function releaseStorageBytes(sizeBytes: number) {
  const bytes = Math.max(0, Math.round(Number(sizeBytes || 0)));

  if (bytes <= 0) {
    return {
      storage_used: 0,
      storage_limit_bytes: 0,
      remaining_bytes: 0,
      message: "no_bytes_released",
    } satisfies StorageReleaseResult;
  }

  const { data, error } = await supabase.rpc("release_storage_bytes", {
    p_bytes: bytes,
  });

  if (error) {
    console.error("release storage bytes error:", error);
    return {
      storage_used: 0,
      storage_limit_bytes: 0,
      remaining_bytes: 0,
      message: "release_failed",
    } satisfies StorageReleaseResult;
  }

  const row = firstRpcRow<StorageReleaseResult>(data);

  return {
    storage_used: Number(row?.storage_used || 0),
    storage_limit_bytes: Number(row?.storage_limit_bytes || 0),
    remaining_bytes: Number(row?.remaining_bytes || 0),
    message: row?.message || "released",
  } satisfies StorageReleaseResult;
}

/**
 * 兼容旧调用：
 * 之前代码里叫 subtractStorageUsed(userId, sizeBytes)。
 * 现在实际由数据库根据 auth.uid() 释放容量。
 */
export async function subtractStorageUsed(
  _userId: string | null | undefined,
  sizeBytes: number
) {
  await releaseStorageBytes(sizeBytes);
}
