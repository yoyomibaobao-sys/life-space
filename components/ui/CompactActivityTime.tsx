"use client";

import { formatCompactActivityTime, formatFullActivityTime } from "@/lib/activity-time";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function CompactActivityTime({
  value,
  fallback = null,
  className,
}: {
  value?: string | number | Date | null;
  fallback?: string | null;
  className?: string;
}) {
  const { language } = useLanguage();
  const text = formatCompactActivityTime(value, undefined, language) || fallback;
  if (!text) return null;

  const dateTime = value
    ? (value instanceof Date ? value : new Date(value)).toISOString()
    : undefined;

  return (
    <time
      dateTime={dateTime}
      title={formatFullActivityTime(value) || undefined}
      className={className}
      suppressHydrationWarning
    >
      {text}
    </time>
  );
}
