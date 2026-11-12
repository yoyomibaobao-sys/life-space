import { supabase } from "@/lib/supabase";

type MediaStorageUploadOptions = {
  cacheControl?: string;
  contentType?: string;
  upsert?: boolean;
};

type MediaStorageUploadResult = {
  error: Error | null;
  failure_kind?: "definite-rejection" | "unknown";
  status_code?: number;
};

export function isDefiniteStorageUploadRejection(statusCode: number) {
  return Number.isInteger(statusCode) &&
    statusCode >= 400 && statusCode < 500 &&
    ![408, 409, 425, 429, 499].includes(statusCode);
}

function encodeStoragePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function readStorageError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;

  return new Error(
    body?.message || body?.error || `Storage upload failed (${response.status})`
  );
}

/**
 * Uploads a media object as a raw binary body.
 *
 * Supabase's SDK uses multipart/form-data for File uploads. Its request
 * Content-Length includes multipart framing, so it cannot be compared with a
 * reservation created from File.size. A binary body lets Storage expose the
 * exact file length to the storage.objects INSERT policy as
 * metadata.contentLength.
 */
export async function uploadMediaStorageObject(
  path: string,
  file: Blob,
  options: MediaStorageUploadOptions = {}
): Promise<MediaStorageUploadResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) return { error: sessionError, failure_kind: "definite-rejection" };
  if (!session?.access_token) {
    return { error: new Error("Not authenticated"), failure_kind: "definite-rejection" };
  }
  if (!supabaseUrl || !publishableKey) {
    return {
      error: new Error("Supabase configuration is missing"),
      failure_kind: "definite-rejection",
    };
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/media/${encodeStoragePath(path)}`,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${session.access_token}`,
          "Cache-Control": `max-age=${options.cacheControl || "3600"}`,
          "Content-Type": options.contentType || file.type || "application/octet-stream",
          "x-upsert": String(Boolean(options.upsert)),
        },
        body: file,
      }
    );

    if (!response.ok) {
      return {
        error: await readStorageError(response),
        failure_kind: isDefiniteStorageUploadRejection(response.status)
          ? "definite-rejection"
          : "unknown",
        status_code: response.status,
      };
    }
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error("Storage upload failed"),
      failure_kind: "unknown",
    };
  }
}
