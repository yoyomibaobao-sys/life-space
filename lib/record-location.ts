import { loadRememberedLocalOwnerContext } from "@/lib/local-owner-context";
export type RecordLocation = { label: string; latitude?: number; longitude?: number; source?: "profile" | "manual" | "photo" };
const PREFIX = "lifespace:record-default-location:v1:";
export function normalizeRecordLocation(value: unknown): RecordLocation | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<RecordLocation>;
  const label = typeof v.label === "string" ? v.label.trim().slice(0, 240) : "";
  const coordinates = typeof v.latitude === "number" && Number.isFinite(v.latitude) && Math.abs(v.latitude) <= 90 && typeof v.longitude === "number" && Number.isFinite(v.longitude) && Math.abs(v.longitude) <= 180;
  if (!label && !coordinates) return null;
  return { label, ...(coordinates ? { latitude: v.latitude, longitude: v.longitude } : {}), source: v.source === "photo" || v.source === "profile" ? v.source : "manual" };
}
export function rememberDefaultRecordLocation(userId: string, label: string | null | undefined) {
  if (typeof window === "undefined" || !userId) return;
  try { localStorage.setItem(PREFIX + userId, JSON.stringify(normalizeRecordLocation({ label, source: "profile" }))); } catch { /* Optional preference cache. */ }
}
export function loadDefaultRecordLocation(userId = loadRememberedLocalOwnerContext()?.userId): RecordLocation | null {
  if (typeof window === "undefined" || !userId) return null;
  try { return normalizeRecordLocation(JSON.parse(localStorage.getItem(PREFIX + userId) || "null")); } catch { return null; }
}
