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
import { getCompactCardLocation } from "@/lib/card-location";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon from "@/components/ui/UiIcon";
import InlineRecordSummary from "@/components/ui/InlineRecordSummary";
import verticalCard from "@/components/ui/VerticalFeedCard.module.css";
import styles from "@/components/discover/DiscoverProjectFeed.module.css";
import { useLanguage } from "@/lib/i18n/useLanguage";

export function DiscoverProjectCard({
  item,
  eager = false,
  showCategoryBadge = true,
}: {
  item: DiscoveryProjectFeedItem;
  eager?: boolean;
  showCategoryBadge?: boolean;
}) {
  const { language, t } = useLanguage();
  const [imageFailed, setImageFailed] = useState(false);
  const title = item.archive_title?.trim() || t.discover.unnamed_project;
  const categoryLabel = getArchiveCategoryLabel(item.category, language);
  const categoryIcon = getArchiveCategoryIcon(item.category);
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
    <Link
      href={`/archive/${item.archive_id}`}
      aria-label={`${t.discover.view_project_prefix}${title}`}
      className={`${styles.card} ${verticalCard.card}`}
    >
      <div className={`${styles.imageRegion} ${verticalCard.media}`}>
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

        {showCategoryBadge || item.has_public_help ? (
          <div className={styles.imageMeta}>
            {showCategoryBadge ? (
              <span className={styles.categoryChip}>
                {categoryLabel}
              </span>
            ) : null}
            {item.has_public_help ? (
              <span className={styles.helpChip}>
                {t.discover.help_badge}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className={styles.imageTitleArea}>
          <h2 className={styles.title}>
            {title}
          </h2>
        </div>
      </div>

      <div className={`${styles.textRegion} ${verticalCard.copy}`}>
        <div className={styles.body}>
          <InlineRecordSummary text={item.card_summary} time={item.public_activity_at} className={styles.summary} />
        </div>

      <ProjectMetaLine
        recordCount={item.public_record_count}
        durationDays={durationDays}
        ended={Boolean(item.archive_ended_at)}
        followerCount={item.follower_count}
        order={["follow", "record", "duration"]}
        compactProjectStats
        style={{ flexWrap: "nowrap", gap: 8 }}
        className={styles.projectMeta}
      />

      <div className={styles.ownerRow}>
        <span className={styles.owner}>
          {ownerName}
          {region ? ` · ${region}` : ""}
        </span>
      </div>
      </div>
    </Link>
  );
}
