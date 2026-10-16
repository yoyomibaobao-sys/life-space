import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeSharePlugin = {
  shareText(options: { title: string; url: string }): Promise<{ status: "shared" | "canceled" }>;
  shareMp4(options: { title: string; fileName: string; data: string }): Promise<{ status: "shared" | "canceled" }>;
};

const nativeShare = registerPlugin<NativeSharePlugin>("NativeShare");
const MAX_MP4_BYTES = 32 * 1024 * 1024;
const PRODUCTION_SHARE_ORIGIN = "https://life-space.uk";
const ISOLATED_QA_SUPABASE = "mablwxlipcgbmbnfdbkc.supabase.co";

export function qaShareOrigin() {
  let host = "";
  try {
    host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname;
  } catch {
    host = "";
  }
  if (host !== ISOLATED_QA_SUPABASE) return undefined;
  const configured = process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN?.trim() || "";
  if (!configured || configured === PRODUCTION_SHARE_ORIGIN) {
    throw new Error("qa_share_origin_required");
  }
  const origin = new URL(configured);
  if (origin.protocol !== "https:" || origin.origin !== configured) {
    throw new Error("qa_share_origin_required");
  }
  return origin.origin;
}

export type ShareOutcome = "shared" | "canceled" | "unsupported";

export function isAndroidNativeShare() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function publicExperienceCardUrl(origin: string, cardId: string) {
  const url = new URL(`/experience-cards/${encodeURIComponent(cardId)}`, qaShareOrigin() || origin);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function isShareableMp4(file: { name: string; type: string; size: number }, header: Uint8Array) {
  const brand = String.fromCharCode(header[4] || 0, header[5] || 0, header[6] || 0, header[7] || 0);
  return file.size > 0 &&
    file.size <= MAX_MP4_BYTES &&
    header.length >= 12 &&
    brand === "ftyp" &&
    (file.type === "video/mp4" || file.type === "") &&
    file.name.toLowerCase().endsWith(".mp4");
}

function canceled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fileBase64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let value = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    value += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(value);
}

export async function sharePublicCard(title: string, url: string): Promise<ShareOutcome> {
  if (isAndroidNativeShare()) {
    const result = await nativeShare.shareText({ title, url });
    return result.status === "canceled" ? "canceled" : "shared";
  }
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (error) {
      if (canceled(error)) return "canceled";
      throw error;
    }
  }
  return "unsupported";
}

export async function shareMp4File(
  file: File,
  details: { title: string; text: string },
): Promise<ShareOutcome> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!isShareableMp4(file, header)) return "unsupported";
  if (isAndroidNativeShare()) {
    const result = await nativeShare.shareMp4({
      title: details.title,
      fileName: file.name,
      data: await fileBase64(file),
    });
    return result.status === "canceled" ? "canceled" : "shared";
  }
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: details.title,
        text: details.text,
        files: [file],
      });
      return "shared";
    } catch (error) {
      if (canceled(error)) return "canceled";
      throw error;
    }
  }
  return "unsupported";
}
