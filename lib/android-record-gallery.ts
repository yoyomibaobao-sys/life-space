import { Capacitor, registerPlugin } from "@capacitor/core";

type GalleryResponse = { status: "selected" | "canceled"; count: number; truncated?: boolean };
type GalleryPhoto = { name: string; mime: string; data: string };
type RecordGallery = {
  pick(): Promise<GalleryResponse>;
  read(options: { index: number }): Promise<GalleryPhoto>;
  clear(): Promise<void>;
};

const gallery = registerPlugin<RecordGallery>("RecordGallery");

export function isAndroidRecordGallery() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function pickAndroidRecordPhotos(): Promise<{ files: File[]; truncated: boolean }> {
  const selection = await gallery.pick();
  if (selection.status === "canceled") return { files: [], truncated: false };
  const files: File[] = [];
  try {
    for (let index = 0; index < selection.count; index++) {
      const photo = await gallery.read({ index });
      const decoded = atob(photo.data);
      const bytes = new Uint8Array(decoded.length);
      for (let byte = 0; byte < decoded.length; byte++) bytes[byte] = decoded.charCodeAt(byte);
      files.push(new File([bytes], photo.name, { type: photo.mime }));
    }
    return { files, truncated: Boolean(selection.truncated) };
  } finally {
    await gallery.clear();
  }
}