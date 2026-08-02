import type { CSSProperties } from "react";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import UiIcon, { type UiIconName } from "@/components/ui/UiIcon";
import { formatCompactActivityTime } from "@/lib/activity-time";

const compactNumberFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type MetaItem = {
  key: string;
  icon: UiIconName;
  accessibleLabel: string;
  value: string | number;
  dateValue?: string | null;
};

export default function ProjectMetaLine({
  recordCount,
  durationDays,
  ended = false,
  viewCount,
  followerCount,
  commentCount,
  photoCount,
  projectCount,
  updatedAt,
  className,
  style,
}: {
  recordCount?: number | null;
  durationDays?: number | null;
  ended?: boolean;
  viewCount?: number | null;
  followerCount?: number | null;
  commentCount?: number | null;
  photoCount?: number | null;
  projectCount?: number | null;
  updatedAt?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const items: MetaItem[] = [];
  const addCount = (
    key: string,
    icon: UiIconName,
    label: string,
    value?: number | null
  ) => {
    if (value === null || value === undefined) return;
    const normalized = Math.max(0, Number(value) || 0);
    items.push({
      key,
      icon,
      accessibleLabel: `${label} ${normalized}`,
      value: compactNumberFormatter.format(normalized),
    });
  };

  addCount("record", "record", "记录", recordCount);
  if (durationDays !== null && durationDays !== undefined) {
    const days = Math.max(1, Math.round(Number(durationDays) || 1));
    items.push({
      key: "duration",
      icon: "duration",
      accessibleLabel: `${ended ? "历时" : "已持续"} ${days} 天`,
      value: `${compactNumberFormatter.format(days)}d`,
    });
  }
  addCount("view", "view", "浏览", viewCount);
  addCount("follow", "follow", "关注", followerCount);
  addCount("comment", "comment", "评论", commentCount);
  addCount("photo", "image", "照片", photoCount);
  addCount("project", "project", "项目", projectCount);
  if (updatedAt) {
    items.push({
      key: "update",
      icon: "clock",
      accessibleLabel: `更新 ${formatCompactActivityTime(updatedAt)}`,
      value: "",
      dateValue: updatedAt,
    });
  }

  if (items.length === 0) return null;

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "5px 10px",
        color: "#748171",
        fontSize: 12,
        lineHeight: 1.4,
        ...style,
      }}
    >
      {items.map((item) => (
        <span
          key={item.key}
          aria-label={item.accessibleLabel}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <UiIcon name={item.icon} size={14} strokeWidth={1.75} />
          {item.dateValue ? (
            <CompactActivityTime value={item.dateValue} />
          ) : (
            item.value
          )}
        </span>
      ))}
    </span>
  );
}
