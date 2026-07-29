import exifr from "exifr";

export async function readImageCapturedAt(file: Blob) {
  try {
    const metadata = await exifr.parse(file);
    const candidate =
      metadata?.DateTimeOriginal ||
      metadata?.CreateDate ||
      metadata?.DateTimeDigitized;

    if (!candidate) return null;

    const date = candidate instanceof Date ? candidate : new Date(candidate);
    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString();
  } catch {
    return null;
  }
}
