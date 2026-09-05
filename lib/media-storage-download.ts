import type { MediaItem } from "@/lib/domain-types";
import { getMediaObjectPath } from "@/lib/media-urls";
import { supabase } from "@/lib/supabase";

export type MediaStorageDownloadResult =
  | { data: Blob; error: null }
  | { data: null; error: Error };

function asError(error: unknown, fallback: string) {
  if (error instanceof Error) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return new Error(message);
  }
  return new Error(fallback);
}

function getLegacyDownloadUrl(media: MediaItem) {
  return (
    media.display_url ||
    media.url ||
    media.file_url ||
    null
  );
}

/**
 * Downloads the original media object through the authenticated storage layer.
 *
 * Keeping this behind one helper lets the later R2 test deployment replace the
 * backend without changing the cloud-to-local project workflow.
 */
export async function downloadMediaStorageObject(
  media: MediaItem
): Promise<MediaStorageDownloadResult> {
  const storagePath = getMediaObjectPath(media);
  let storageError: unknown = null;

  if (storagePath) {
    const { data, error } = await supabase.storage
      .from("media")
      .download(storagePath);
    if (!error && data && data.size > 0) return { data, error: null };
    storageError = error || new Error("Downloaded media was empty");
  }

  const fallbackUrl = getLegacyDownloadUrl(media);
  if (!fallbackUrl) {
    return {
      data: null,
      error: asError(storageError, "Media download address is unavailable"),
    };
  }

  try {
    const response = await fetch(fallbackUrl, {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        data: null,
        error: new Error(`Media download failed (${response.status})`),
      };
    }

    const blob = await response.blob();
    if (blob.size <= 0) {
      return { data: null, error: new Error("Downloaded media was empty") };
    }
    return { data: blob, error: null };
  } catch (error) {
    return {
      data: null,
      error: asError(error || storageError, "Media download failed"),
    };
  }
}
