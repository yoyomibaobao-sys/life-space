const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RECENT_DAY_LIMIT = 7;

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const shortDateWithYearFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatCompactActivityTime(
  value?: string | number | Date | null,
  now = Date.now()
) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return "";

  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < HOUR_MS) {
    return `${Math.max(1, Math.floor(elapsed / MINUTE_MS))}m`;
  }
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h`;
  if (elapsed < RECENT_DAY_LIMIT * DAY_MS) {
    return `${Math.floor(elapsed / DAY_MS)}d`;
  }

  const nowDate = new Date(now);
  return date.getFullYear() === nowDate.getFullYear()
    ? shortDateFormatter.format(date)
    : shortDateWithYearFormatter.format(date);
}

export function formatFullActivityTime(value?: string | number | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
