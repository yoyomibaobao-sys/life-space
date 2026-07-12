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
import styles from "@/components/discover/DiscoverProjectFeed.module.css";

function formatShortLocalDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function getProjectSystemName(item: DiscoveryProjectFeedItem) {
  const value =
    item.category === "plant"
      ? item.species_name_snapshot
      : item.system_name;
  return value?.trim() || null;
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
  const categoryIcon = getArchiveCategoryIcon(item.category);
  const systemName = getProjectSystemName(item);
  const updateDate = formatShortLocalDate(item.public_activity_at);
  const durationDays = getDurationDays(
    item.archive_created_at,
    item.archive_ended_at
  );
  const ownerName = item.profile_display_name?.trim() || "一位种植者";
  const region = item.profile_region?.trim() || null;
  const showImage = Boolean(item.display_image_url) && !imageFailed;

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
          <div
            className={styles.imagePlaceholder}
            aria-hidden="true"
          >
            {categoryIcon}
          </div>
        )}

        <div className={styles.imageMeta}>
          <span className={styles.categoryChip}>
            {categoryLabel}
          </span>
          {item.has_public_help ? (
            <span className={styles.helpChip}>
              求助
            </span>
          ) : null}
        </div>

        <div className={styles.imageTitleArea}>
          <h2 className={styles.title}>
            {title}
          </h2>
        </div>
      </div>

      <div className={styles.body}>
        {systemName ? (
          <div className={styles.systemName}>
            {systemName}
          </div>
        ) : null}

        {item.card_summary ? (
          <p className={styles.summary}>
            {item.card_summary}
          </p>
        ) : null}

        {updateDate ? (
          <div className={styles.updateDate}>
            {updateDate} 更新
          </div>
        ) : null}

        <div className={styles.stats}>
          {item.public_record_count}记录 · {durationDays}天 · {item.public_comment_count}评论
        </div>

        <div className={styles.owner}>
          {ownerName}
          {region ? ` · ${region}` : ""}
        </div>
      </div>
    </Link>
  );
}
