import Link from "next/link";
import type { ReactNode } from "react";
import styles from "@/components/experience-card/ExperienceCardListCard.module.css";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import type { ExperienceCardListItem } from "@/lib/experience-card-types";

export default function ExperienceCardListCard({
  item,
  dateText,
  dateValue,
  status,
  actions,
  showAuthor = false,
}: {
  item: ExperienceCardListItem;
  dateText?: string | null;
  dateValue?: string | null;
  status?: ReactNode;
  actions?: ReactNode;
  showAuthor?: boolean;
}) {
  return (
    <div className={styles.card}>
      <Link href={`/experience-cards/${item.id}`} aria-label={item.title}>
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt={`${item.title}封面`}
            className={styles.cover}
            loading="lazy"
          />
        ) : (
          <div className={styles.placeholder}>无图</div>
        )}
      </Link>

      <div className={styles.content}>
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
        <Link href={`/experience-cards/${item.id}`} className={styles.title}>
          {item.title}
        </Link>
        <p className={styles.source}>
          {item.archiveTitle}
          {showAuthor ? ` · ${item.authorName}` : ""}
        </p>
        <div className={styles.footer}>
          <ProjectMetaLine recordCount={item.source_record_count} />
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}
