"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { getArchiveCategoryIcon } from "@/lib/archive-categories";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import { getDurationDays } from "@/lib/follow-utils";
import { getCompactCardLocation } from "@/lib/card-location";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon from "@/components/ui/UiIcon";
import styles from "@/components/discover/FollowedProjects.module.css";
import { useLanguage } from "@/lib/i18n/useLanguage";

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
  const { t } = useLanguage();
  const [imageFailed, setImageFailed] = useState(false);
  const title = item.archive_title?.trim() || t.discover.unnamed_project;
  const systemName = getSystemName(item);
  const durationDays = getDurationDays(
    item.archive_created_at,
    item.archive_ended_at
  );
  const ownerName = item.profile_display_name?.trim() || t.discover.default_grower;
  const region = getCompactCardLocation({
    city: item.profile_city,
    region: item.profile_region_name,
    country: item.profile_country,
    fallback: item.profile_region,
  });
  const showImage = Boolean(item.display_image_url) && !imageFailed;

  return (
    <article className={styles.card}>
      <Link
        href={`/archive/${item.archive_id}`}
        aria-label={`${t.discover.view_project_prefix}${title}`}
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
              <UiIcon name={getArchiveCategoryIcon(item.category)} size={28} strokeWidth={1.6} />
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
          {item.card_summary || item.public_activity_at ? (
            <p className={styles.summary}>
              {item.card_summary || ""}
              {item.public_activity_at ? (
                <span className={styles.summaryTime}>
                  {item.card_summary ? <span aria-hidden="true"> · </span> : null}
                  <CompactActivityTime value={item.public_activity_at} />
                </span>
              ) : null}
            </p>
          ) : null}
          <ProjectMetaLine
            recordCount={item.public_record_count}
            durationDays={durationDays}
            ended={Boolean(item.archive_ended_at)}
            commentCount={item.public_comment_count}
            viewCount={item.view_count}
            compactProjectStats
            className={styles.metaLine}
          />
          <div className={styles.owner}>
            {ownerName}
            {region ? ` · ${region}` : ""}
          </div>
        </div>
      </Link>

      {mode === "followed-project" ? (
        <div className={styles.followActionRow}>
          <span className={styles.followStatus}>{t.discover.followed_badge}</span>
          <span className={styles.followActionDivider} aria-hidden="true">
            |
          </span>
          <button
            type="button"
            className={styles.unfollowButton}
            disabled={unfollowing}
            onClick={() => onRequestUnfollow?.(item.archive_id)}
          >
            {unfollowing ? t.discover.processing : t.discover.unfollow}
          </button>
        </div>
      ) : null}
    </article>
  );
}
