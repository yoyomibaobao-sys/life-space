import { normalizeRecordLocation } from "@/lib/record-location";
import exifr from "exifr";

export function capturedAtFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const candidates = [
    [metadata?.DateTimeOriginal, metadata?.OffsetTimeOriginal],
    [metadata?.CreateDate || metadata?.DateTimeDigitized, metadata?.OffsetTimeDigitized],
  ];
  for (const [value, offset] of candidates) {
    if (typeof value !== "string") continue;
    const match = value.trim().match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?$/);
    if (!match) continue;
    const [, year, month, day, hour, minute, second, embeddedOffset] = match;
    const wallTime = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    const calendarCheck = new Date(`${wallTime}Z`);
    if (!Number.isFinite(calendarCheck.getTime()) || calendarCheck.toISOString().slice(0, 19) !== wallTime) continue;
    const validOffset = typeof offset === "string" && /^(Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.test(offset.trim()) ? offset.trim() : "";
    const zone = embeddedOffset || validOffset;
    // EXIF wall times without an offset are interpreted in the device's timezone.
    const date = new Date(wallTime + zone);
    if (!zone && [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()].some((part, index) => part !== Number([year, month, day, hour, minute, second][index]))) continue;
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return null;
}

export async function readImageCapturedAt(file: Blob) {
  try {
    // Keep raw date text so the EXIF offset can be applied before any Date conversion.
    const metadata = await exifr.parse(file, { reviveValues: false });
    return capturedAtFromMetadata(metadata);
  } catch {
    return null;
  }
}

export async function readImageLocation(file: Blob) {
  try { const gps = await exifr.gps(file); return normalizeRecordLocation({ ...gps, source: "photo" }); } catch { return null; }
}
