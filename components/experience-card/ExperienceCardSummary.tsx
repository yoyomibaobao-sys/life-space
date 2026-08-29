"use client";

import Link from "next/link";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import type { ExperienceCardListItem } from "@/lib/experience-card-types";
import { formatCompactPlaybackDuration } from "@/lib/experience-card-playback";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "@/components/experience-card/ExperienceCardSummary.module.css";

export default function ExperienceCardSummary({
  item,
}: {
  item: ExperienceCardListItem;
}) {
  const { t } = useLanguage();
  const guideCategory = item.archiveCategory === "plant" ||
    item.archiveCategory === "system" ||
    item.archiveCategory === "insect_fish" ||
    item.archiveCategory === "other"
    ? item.archiveCategory
    : "other";
  const guideHref = item.systemName
    ? `/plant?section=${encodeURIComponent(guideCategory)}&q=${encodeURIComponent(item.systemName)}`
    : null;
  return (
    <span className={styles.summary}>
      <Link href={`/experience-cards/${item.id}`} className={styles.title}>
        {item.title}
      </Link>
      <span className={styles.line}>
        <Link href={`/user/${item.user_id}`} className={`${styles.ellipsis} ${styles.inlineLink}`}>
          {item.authorName}
        </Link>
        <span aria-hidden="true">·</span>
        {guideHref ? (
          <Link href={guideHref} className={`${styles.ellipsis} ${styles.inlineLink}`}>
            {item.systemName}
          </Link>
        ) : (
          <span className={styles.ellipsis}>{t.experience.not_filled}</span>
        )}
      </span>
      <span className={styles.line}>
        <span>{formatCompactPlaybackDuration(item.playbackDurationSeconds)}</span>
        {item.published_at ? <span aria-hidden="true">·</span> : null}
        {item.published_at ? <CompactActivityTime value={item.published_at} /> : null}
      </span>
      <span className={styles.footer}>
        <span className={styles.metrics}>
          {t.experience.follow_count} {item.bookmarkCount}
          <span aria-hidden="true"> · </span>
          {t.experience.adoption_count} {item.helpfulCount}
        </span>
        <Link href={`/experience-cards/${item.id}`} className={styles.details}>
          {t.experience.open_details}<span aria-hidden="true"> &gt;</span>
        </Link>
      </span>
    </span>
  );
}
