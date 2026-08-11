import {
  formatPreciseDateTime,
  formatRecentActivityTime,
} from "@/lib/date-time";
import type { Language } from "@/lib/i18n";

export function formatCompactActivityTime(
  value?: string | number | Date | null,
  now = Date.now(),
  language: Language = "zh"
) {
  return formatRecentActivityTime(value, now, language);
}

export function formatFullActivityTime(value?: string | number | Date | null) {
  return formatPreciseDateTime(value);
}
