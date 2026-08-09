import {
  formatPreciseDateTime,
  formatRecentActivityTime,
} from "@/lib/date-time";

export function formatCompactActivityTime(
  value?: string | number | Date | null,
  now = Date.now()
) {
  return formatRecentActivityTime(value, now);
}

export function formatFullActivityTime(value?: string | number | Date | null) {
  return formatPreciseDateTime(value);
}
