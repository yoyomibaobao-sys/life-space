import { formatCompactActivityTime, formatFullActivityTime } from "@/lib/activity-time";

export default function CompactActivityTime({
  value,
  fallback = null,
  className,
}: {
  value?: string | number | Date | null;
  fallback?: string | null;
  className?: string;
}) {
  const text = formatCompactActivityTime(value) || fallback;
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
