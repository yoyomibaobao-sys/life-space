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
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Detail, edit history, audit and notification surfaces: minute precision. */
export function formatPreciseDateTime(value?: string | number | Date | null) {
  const date = parseDate(value);
  if (!date) return "";
  return `${formatCardDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Activity metadata may be relative while recent, then falls back to YYYY-MM-DD. */
export function formatRecentActivityTime(
  value?: string | number | Date | null,
  now = Date.now()
) {
  const date = parseDate(value);
  if (!date) return "";

  const elapsed = now - date.getTime();
  if (elapsed < 0) return formatCardDate(date);
  if (elapsed < MINUTE_MS) return "刚刚";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}分钟前`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}小时前`;
  if (elapsed < RECENT_DAY_LIMIT * DAY_MS) {
    return `${Math.floor(elapsed / DAY_MS)}天前`;
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
