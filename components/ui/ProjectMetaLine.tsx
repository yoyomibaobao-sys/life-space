"use client";

import type { CSSProperties } from "react";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import UiIcon, { type UiIconName } from "@/components/ui/UiIcon";
import { formatCompactActivityTime } from "@/lib/activity-time";
import { useLanguage } from "@/lib/i18n/useLanguage";

type MetaItem = {
  key: string;
  icon: UiIconName;
  hideIcon?: boolean;
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
  bookmarkCount,
  helpfulCount,
  updatedAt,
  compactProjectStats = false,
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
  bookmarkCount?: number | null;
  helpfulCount?: number | null;
  updatedAt?: string | null;
  compactProjectStats?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const { language, t } = useLanguage();
  const compactNumberFormatter = new Intl.NumberFormat(
    language === "en" ? "en" : "zh-CN",
    { notation: "compact", maximumFractionDigits: 1 }
  );
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

  if (recordCount !== null && recordCount !== undefined) {
    const count = Math.max(0, Number(recordCount) || 0);
    items.push({
      key: "record",
      icon: "record",
      hideIcon: compactProjectStats,
      accessibleLabel: `${t.meta.records} ${count}`,
      value: `${compactNumberFormatter.format(count)}${t.meta.record_suffix}`,
    });
  }
  if (durationDays !== null && durationDays !== undefined) {
    const days = Math.max(1, Math.round(Number(durationDays) || 1));
    items.push({
      key: "duration",
      icon: "duration",
      hideIcon: compactProjectStats,
      accessibleLabel: `${ended ? t.meta.duration_ended : t.meta.duration_ongoing} ${days} ${t.meta.day_suffix}`,
      value: `${compactNumberFormatter.format(days)}${t.meta.day_suffix}`,
    });
  }
  addCount("view", "view", t.meta.views, viewCount);
  addCount("follow", "follow", t.meta.follows, followerCount);
  addCount("comment", "comment", t.meta.comments, commentCount);
  addCount("photo", "image", t.meta.photos, photoCount);
  addCount("project", "project", t.meta.projects, projectCount);
  addCount("bookmark", "bookmark", t.meta.bookmarks, bookmarkCount);
  addCount("helpful", "helpful", t.meta.helpful, helpfulCount);
  if (updatedAt) {
    items.push({
      key: "update",
      icon: "clock",
      accessibleLabel: `${t.meta.updated} ${formatCompactActivityTime(updatedAt, undefined, language)}`,
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
          {item.hideIcon ? null : (
            <UiIcon name={item.icon} size={14} strokeWidth={1.75} />
          )}
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
