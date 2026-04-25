import type { FollowProjectCard } from "@/lib/follow-types";

export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function getTimeValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function getDurationDays(start?: string | null, end?: string | null) {
  const startTime = getTimeValue(start);
  const endTime = getTimeValue(end);
  if (!startTime) return 0;
  const safeEnd = endTime || Date.now();
  return Math.max(1, Math.floor((safeEnd - startTime) / (1000 * 60 * 60 * 24)) + 1);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

export function getProjectStatusLabel(helpStatus?: string | null, status?: string | null) {
  if (helpStatus === "open") return "求助中";
  if (helpStatus === "resolved") return "已解决";
  if (status === "ended") return "已结束";
  return "进行中";
}

export function getProjectStatusKind(
  helpStatus?: string | null,
  status?: string | null
): "help" | "resolved" | "ended" | "normal" {
  if (helpStatus === "open") return "help";
  if (helpStatus === "resolved") return "resolved";
  if (status === "ended") return "ended";
  return "normal";
}

export function byRecentProject(a: FollowProjectCard, b: FollowProjectCard) {
  return getTimeValue(b.latestRecordTime) - getTimeValue(a.latestRecordTime);
}
