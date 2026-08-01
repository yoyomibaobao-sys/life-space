"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { getArchiveCategoryIcon } from "@/lib/archive-categories";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import { getDurationDays } from "@/lib/follow-utils";
import styles from "@/components/discover/FollowedProjects.module.css";

function formatLocalDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function getSystemName(item: DiscoveryProjectFeedItem) {
  const value =
    item.category === "plant"
      ? item.species_name_snapshot
      : item.system_name;
  return value?.trim() || null;
}

export function FollowedProjectCard({
  item,
  mode,
  unfollowing = false,
  onRequestUnfollow,
}: {
  item: DiscoveryProjectFeedItem;
  mode: "followed-project" | "followed-user-project";
  unfollowing?: boolean;
  onRequestUnfollow?: (archiveId: string) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const title = item.archive_title?.trim() || "未命名项目";
  const systemName = getSystemName(item);
  const updateDate = formatLocalDate(item.public_activity_at);
  const durationDays = getDurationDays(
    item.archive_created_at,
    item.archive_ended_at
  );
  const ownerName = item.profile_display_name?.trim() || "一位种植者";
  const region = item.profile_region?.trim() || null;
  const showImage = Boolean(item.display_image_url) && !imageFailed;

  return (
    <article className={styles.card}>
      <Link
        href={`/archive/${item.archive_id}`}
        aria-label={`查看项目：${title}`}
        className={styles.cardLink}
      >
        <div className={styles.imageRegion}>
          {showImage ? (
            <Image
              src={item.display_image_url as string}
              alt={title}
              fill
              unoptimized
              sizes="(max-width: 419px) 88px, (max-width: 767px) 96px, (max-width: 1099px) 104px, 112px"
              className={styles.image}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className={styles.imagePlaceholder} aria-hidden="true">
              {getArchiveCategoryIcon(item.category)}
            </div>
          )}
        </div>

        <div className={styles.body}>
          <div className={styles.nameRow}>
            <h2 className={styles.title}>{title}</h2>
            {systemName ? (
              <span className={styles.systemName}>· {systemName}</span>
            ) : null}
          </div>
          {item.card_summary ? (
            <p className={styles.summary}>{item.card_summary}</p>
          ) : null}
          <div className={styles.metaLine}>
            {updateDate ? `${updateDate} 更新 · ` : ""}
            {item.public_record_count}条记录 · {durationDays}天 · {item.public_comment_count}条评论
          </div>
          <div className={styles.owner}>
            {ownerName}
            {region ? ` · ${region}` : ""}
          </div>
        </div>
      </Link>

      {mode === "followed-project" ? (
        <div className={styles.followActionRow}>
          <span className={styles.followStatus}>已关注</span>
          <span className={styles.followActionDivider} aria-hidden="true">
            |
          </span>
          <button
            type="button"
            className={styles.unfollowButton}
            disabled={unfollowing}
            onClick={() => onRequestUnfollow?.(item.archive_id)}
          >
            {unfollowing ? "处理中..." : "取消关注"}
          </button>
        </div>
      ) : null}
    </article>
  );
}
