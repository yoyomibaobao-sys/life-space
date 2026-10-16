import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeImageActions = {
  save(options: { data: string; mimeType: string; fileName: string }): Promise<{ cancelled: boolean }>;
};

const nativeImages = registerPlugin<NativeImageActions>("ImageActions");
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

async function imageFile(url: string, id: string | undefined): Promise<File> {
  // Fetch the image displayed by the viewer. A revoked or expired private URL fails closed.
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("image_unavailable");
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_IMAGE_BYTES) throw new Error("image_too_large");
  const blob = await response.blob();
  const mimeType = blob.type.split(";")[0].toLowerCase();
  const extension = extensions[mimeType];
  if (!extension || blob.size === 0 || blob.size > MAX_IMAGE_BYTES) {
    throw new Error("unsupported_image");
  }
  const safeId = (id || "image").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "image";
  return new File([blob], `LifeSpace-${safeId}.${extension}`, { type: mimeType });
}

async function nativeData(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let value = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    value += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(value);
}

export async function saveViewedImage(url: string, id?: string): Promise<boolean> {
  const file = await imageFile(url, id);
  if (Capacitor.isNativePlatform()) {
    const result = await nativeImages.save({
      data: await nativeData(file), mimeType: file.type, fileName: file.name,
    });
    return !result.cancelled;
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    return true;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}
