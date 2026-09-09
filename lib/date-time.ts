const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RECENT_DAY_LIMIT = 7;

function parseDate(value?: string | number | Date | null) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Ordinary cards and date-only fields: globally unambiguous numeric date. */
export function formatCardDate(value?: string | number | Date | null) {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

/** Detail, edit history, audit and notification surfaces: minute precision. */
export function formatPreciseDateTime(value?: string | number | Date | null, timeZone?: string) {
  const date = parseDate(value);
  if (!date) return "";
  if (timeZone) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: normalizeTimeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
    return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
  }
  return `${formatCardDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeTimeZone(value?: string | null) {
  if (!value || value.length > 100) return "UTC";
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; }
  catch { return "UTC"; }
}

export function getClientTimeZone() {
  return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function toLocalDateTimeInputValue(value: string | Date | null | undefined = new Date()) {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Keep the original instant for text-only edits, including the repeated DST hour. */
export function localDateTimeInputToIso(value: string, original?: string | null) {
  const previous = parseDate(original);
  if (previous && toLocalDateTimeInputValue(previous) === value) return previous.toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = parseDate(value);
  // Reject impossible dates and spring-forward gaps instead of silently changing the time.
  return date && toLocalDateTimeInputValue(date) === value ? date.toISOString() : null;
}

/** Activity metadata may be relative while recent, then falls back to YYYY/MM/DD. */
export function formatRecentActivityTime(
  value?: string | number | Date | null,
  now = Date.now(),
  language: Language = "zh"
) {
  const date = parseDate(value);
  if (!date) return "";

  const elapsed = now - date.getTime();
  if (elapsed < 0) return formatCardDate(date);
  if (elapsed < MINUTE_MS) return language === "en" ? "Just now" : "刚刚";
  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS);
    return language === "en" ? `${minutes}m ago` : `${minutes}分钟前`;
  }
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return language === "en" ? `${hours}h ago` : `${hours}小时前`;
  }
  if (elapsed < RECENT_DAY_LIMIT * DAY_MS) {
    const days = Math.floor(elapsed / DAY_MS);
    return language === "en" ? `${days}d ago` : `${days}天前`;
  }
  return formatCardDate(date);
}

export function getInclusiveDaySpan(
  start?: string | number | Date | null,
  end?: string | number | Date | null
) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return null;
  const elapsed = endDate.getTime() - startDate.getTime();
  if (elapsed < 0) return null;
  return Math.max(1, Math.floor(elapsed / DAY_MS) + 1);
}
import type { Language } from "@/lib/i18n";
