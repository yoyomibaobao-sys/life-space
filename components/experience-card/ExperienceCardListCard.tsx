"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "@/components/experience-card/ExperienceCardListCard.module.css";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import ResponsiveActionMenu from "@/components/ui/ResponsiveActionMenu";
import type { ExperienceCardListItem } from "@/lib/experience-card-types";
import { useLanguage } from "@/lib/i18n/useLanguage";
import ExperienceCardSummary from "@/components/experience-card/ExperienceCardSummary";

export default function ExperienceCardListCard({
  item,
  dateText,
  dateValue,
  status,
  actions,
  showAuthor = false,
  summaryLayout = false,
}: {
  item: ExperienceCardListItem;
  dateText?: string | null;
  dateValue?: string | null;
  status?: ReactNode;
  actions?: ReactNode;
  showAuthor?: boolean;
  summaryLayout?: boolean;
}) {
  const { t } = useLanguage();

  return (
    <div className={styles.card}>
      <Link href={`/experience-cards/${item.id}`} aria-label={item.title}>
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt={`${item.title}${t.experience.card_cover_suffix}`}
            className={styles.cover}
            loading="lazy"
          />
        ) : (
          <div className={styles.placeholder}>{t.experience.no_image}</div>
        )}
      </Link>

      {summaryLayout ? (
        <div className={styles.content}>
          <ExperienceCardSummary item={item} />
        </div>
      ) : <div className={styles.content}>
        <div className={styles.headerRow}>
          <Link href={`/experience-cards/${item.id}`} className={styles.title}>
            {item.title}
          </Link>
          {status || dateValue || dateText ? (
            <div className={styles.statusRow}>
              {status}
              {dateValue ? (
                <CompactActivityTime value={dateValue} fallback={dateText} />
              ) : dateText ? (
                <span>{dateText}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className={styles.source}>
          {item.archiveTitle}
          {showAuthor ? ` · ${item.authorName}` : ""}
        </p>
        <div className={styles.footer}>
          <ProjectMetaLine
            recordCount={item.source_record_count}
            durationDays={item.durationDays}
            commentCount={item.commentCount}
            bookmarkCount={item.bookmarkCount}
            helpfulCount={item.helpfulCount}
          />
          {actions ? <ResponsiveActionMenu label={t.experience.actions}>{actions}</ResponsiveActionMenu> : null}
        </div>
      </div>}
    </div>
  );
}
