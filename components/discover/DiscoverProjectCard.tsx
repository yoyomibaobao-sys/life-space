"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import { formatDiscoveryActivityTime } from "@/lib/discover-card-format";
import { getDurationDays } from "@/lib/follow-utils";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon from "@/components/ui/UiIcon";
import styles from "@/components/discover/DiscoverProjectFeed.module.css";
import { useLanguage } from "@/lib/i18n/useLanguage";

export function DiscoverProjectCard({
  item,
  eager = false,
}: {
  item: DiscoveryProjectFeedItem;
  eager?: boolean;
}) {
  const { language, t } = useLanguage();
  const [imageFailed, setImageFailed] = useState(false);
  const title = item.archive_title?.trim() || t.discover.unnamed_project;
  const categoryLabel = getArchiveCategoryLabel(item.category, language);
  const categoryIcon = getArchiveCategoryIcon(item.category);
  const activityTime = formatDiscoveryActivityTime(
    item.public_activity_at,
    undefined,
    language
  );
  const durationDays = getDurationDays(
    item.archive_created_at,
    item.archive_ended_at
  );
  const ownerName = item.profile_display_name?.trim() || t.discover.default_grower;
  const region = item.profile_region?.trim() || null;
  const showImage = Boolean(item.display_image_url) && !imageFailed;

  return (
    <Link
      href={`/archive/${item.archive_id}`}
      aria-label={`${t.discover.view_project_prefix}${title}`}
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
            <UiIcon name={categoryIcon} size={28} strokeWidth={1.6} />
          </div>
        )}

        <div className={styles.imageMeta}>
          <span className={styles.categoryChip}>
            {categoryLabel}
          </span>
          {item.has_public_help ? (
            <span className={styles.helpChip}>
              {t.discover.help_badge}
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
        <p className={styles.summary} aria-hidden={!item.card_summary}>
          {item.card_summary || "\u00a0"}
        </p>
        {activityTime ? (
          <time
            className={styles.summaryTime}
            dateTime={item.public_activity_at || undefined}
            suppressHydrationWarning
          >
            {activityTime}
          </time>
        ) : null}
      </div>

      <ProjectMetaLine
        recordCount={item.public_record_count}
        durationDays={durationDays}
        ended={Boolean(item.archive_ended_at)}
        viewCount={item.view_count}
        compactProjectStats
        className={styles.projectMeta}
      />

      <div className={styles.ownerRow}>
        <span className={styles.owner}>
          {ownerName}
          {region ? ` · ${region}` : ""}
        </span>
      </div>
    </Link>
  );
}
