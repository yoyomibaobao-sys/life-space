import { supabase } from "@/lib/supabase";
import type { MediaItem } from "@/lib/domain-types";

export function mediaSizeMbToBytes(sizeMb?: number | string | null) {
  const value = Number(sizeMb || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 1024 * 1024);
}

export function sumMediaSizeBytes(mediaItems: Array<Pick<MediaItem, "size_mb"> | null | undefined>) {
  return mediaItems.reduce((total, item) => total + mediaSizeMbToBytes(item?.size_mb), 0);
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

export async function removeMediaFilesFromStorage(mediaItems: Array<Pick<MediaItem, "url" | "file_url"> | null | undefined>) {
  const paths = Array.from(
    new Set(
      mediaItems
        .map((item) => getMediaStoragePath(item?.url || item?.file_url || null))
        .filter((path): path is string => Boolean(path))
    )
  );

  if (paths.length === 0) return;

  const { error } = await supabase.storage.from("media").remove(paths);
  if (error) {
    console.error("remove media files error:", error);
  }
}

export async function subtractStorageUsed(userId: string | null | undefined, sizeBytes: number) {
  if (!userId || sizeBytes <= 0) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("storage_used")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("load storage used before subtract error:", error);
    return;
  }

  const currentStorageUsed = Number(data?.storage_used || 0);
  const nextStorageUsed = Math.max(0, currentStorageUsed - sizeBytes);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ storage_used: nextStorageUsed })
    .eq("id", userId);

  if (updateError) {
    console.error("subtract storage used error:", updateError);
  }
}
