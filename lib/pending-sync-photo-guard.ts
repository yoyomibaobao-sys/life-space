import { normalizeLocalImageBlob } from "@/lib/local-image-blob";

type PendingPhoto = {
  id: string;
  blob: unknown;
  mime_type?: string | null;
  cached_size?: number | null;
  name?: string | null;
  captured_at?: string | null;
  created_at?: string | null;
  metadata_stripped?: boolean | null;
};
type StandardizedPhoto = { file: File; width?: number; height?: number };
type ThumbnailPhoto = { file: File; wasGenerated: boolean };

const invalid = () => new Error("本机图片字节无效或不完整，已停止上传并保留待同步原件。");
const thumbnailFailed = () => new Error("无法生成有效缩略图，已停止上传并保留本机照片和待同步任务。");

function matchesImageSignature(mime: string, head: Uint8Array, tail: Uint8Array): boolean {
  const jpeg = mime === "image/jpeg" || mime === "image/jpg";
  if (jpeg) {
    return head.length >= 3 && head[0] === 255 && head[1] === 216 && head[2] === 255 &&
      tail.length >= 2 && tail[tail.length - 2] === 255 && tail[tail.length - 1] === 217;
  }
  if (mime === "image/png") {
    return head.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => head[i] === v);
  }
  if (mime === "image/webp") {
    return head.length >= 12 &&
      String.fromCharCode(...head.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...head.slice(8, 12)) === "WEBP";
  }
  return false;
}

export async function validatePendingPhotoBytes(blob: Blob, mime: string): Promise<void> {
  if (!(blob instanceof Blob) || blob.size < 12 || !mime.startsWith("image/")) throw invalid();
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const tail = new Uint8Array(await blob.slice(-8).arrayBuffer());
  if (!matchesImageSignature(mime.toLowerCase(), head, tail)) throw invalid();
}

export async function restorePendingPhotoFile(image: PendingPhoto): Promise<File> {
  const blob = normalizeLocalImageBlob(image.blob, image.mime_type);
  if (!blob) throw invalid();
  const mime = (image.mime_type || blob.type || "").toLowerCase();
  if (typeof image.cached_size === "number" && image.cached_size > 0 &&
      blob.size !== image.cached_size) throw invalid();
  await validatePendingPhotoBytes(blob, mime);
  const date = new Date(image.captured_at || image.created_at || Date.now()).getTime();
  return new File([blob], image.name || (image.id + ".jpg"), {
    type: mime === "image/jpg" ? "image/jpeg" : mime,
    lastModified: Number.isFinite(date) ? date : Date.now(),
  });
}

/**
 * Decode either an original Blob or the IndexedDB byte-backed {data,type}
 * representation. Prepare and validate both sizes before any remote write.
 */
export async function preparePendingSyncPhoto<T extends StandardizedPhoto>(
  image: PendingPhoto,
  codecs: {
    standardize: (file: File, options: { requireSanitized: boolean }) => Promise<T>;
    thumbnail: (file: File) => Promise<ThumbnailPhoto>;
  },
): Promise<{
  originalFile: File;
  uploadFile: File;
  thumbFile: File;
  standardized: T | null;
}> {
  const originalFile = await restorePendingPhotoFile(image);
  const standardized = image.metadata_stripped
    ? null
    : await codecs.standardize(originalFile, { requireSanitized: true });
  const uploadFile = standardized?.file || originalFile;
  await validatePendingPhotoBytes(uploadFile, uploadFile.type);
  const generated = await codecs.thumbnail(uploadFile);
  if (!generated.wasGenerated || !(generated.file instanceof File) ||
      generated.file.type !== "image/jpeg") throw thumbnailFailed();
  try { await validatePendingPhotoBytes(generated.file, generated.file.type); }
  catch { throw thumbnailFailed(); }
  return { originalFile, uploadFile, thumbFile: generated.file, standardized };
}
