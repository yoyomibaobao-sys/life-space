"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import { getDurationDays } from "@/lib/follow-utils";
import AppIcon from "@/components/ui/AppIcon";
import styles from "@/components/discover/DiscoverProjectFeed.module.css";

function formatCompactActivityTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const elapsedMs = Math.max(0, now.getTime() - date.getTime());
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (elapsedMs < hourMs) return `${Math.max(1, Math.floor(elapsedMs / minuteMs))}m`;
  if (elapsedMs < dayMs) return `${Math.floor(elapsedMs / hourMs)}h`;
  if (elapsedMs < 7 * dayMs) return `${Math.floor(elapsedMs / dayMs)}d`;

  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  }).format(date);
}

export function DiscoverProjectCard({
  item,
  eager = false,
}: {
  item: DiscoveryProjectFeedItem;
  eager?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const title = item.archive_title?.trim() || "未命名项目";
  const categoryLabel = getArchiveCategoryLabel(item.category);
  const activityTime = formatCompactActivityTime(item.public_activity_at);
  const durationDays = getDurationDays(
    item.archive_created_at,
    item.archive_ended_at
  );
  const ownerName = item.profile_display_name?.trim() || "一位种植者";
  const region = item.profile_region?.trim() || null;
  const showImage = Boolean(item.display_image_url) && !imageFailed;
  const summary =
    item.latest_public_record_note?.trim() ||
    (showImage ? "新增了照片" : item.archive_summary?.trim() || "项目刚刚开始");
  const durationLabel = item.archive_ended_at ? "历时" : "已持续";

  return (
    <Link
      href={`/archive/${item.archive_id}`}
      aria-label={`查看项目：${title}`}
      className={styles.card}
    >
      <div className={styles.imageRegion}>
        {showImage ? (
          <Image
            src={item.display_image_url as string}
            alt={title}
            fill
            unoptimized
            loading={eager ? "eager" : "lazy"}
            sizes="(max-width: 1023px) 50vw, 25vw"
            className={styles.image}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden="true">
            <AppIcon
              name={getArchiveCategoryIcon(item.category)}
              size={30}
              strokeWidth={1.7}
            />
          </div>
        )}

        <div className={styles.imageShade} aria-hidden="true" />

        <div className={styles.imageMeta}>
          <span className={styles.categoryChip}>{categoryLabel}</span>
          {item.has_public_help ? <span className={styles.helpChip}>求助</span> : null}
        </div>

        <h2 className={styles.imageTitle}>{title}</h2>
      </div>

      <div className={styles.body}>
        <p className={styles.summary}>
          <span>{summary}</span>
          {activityTime ? (
            <time dateTime={item.public_activity_at || undefined} className={styles.summaryTime}>
              {activityTime}
            </time>
          ) : null}
        </p>
      </div>

      <div className={styles.imageStats}>
        <span>{item.public_record_count} 条记录</span>
        <span className={styles.statSegment}>
          <span aria-hidden="true">·</span>
          <span>{durationLabel} {durationDays} 天</span>
        </span>
      </div>

      <div className={styles.ownerRow}>
        <span className={styles.owner}>
          {ownerName}
          {region ? ` · ${region}` : ""}
        </span>
      </div>
    </Link>
  );
}
