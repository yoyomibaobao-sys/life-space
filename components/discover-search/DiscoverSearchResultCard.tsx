"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import UiIcon, { type UiIconName } from "@/components/ui/UiIcon";
import styles from "@/components/discover-search/DiscoverSearchResultCard.module.css";

type DiscoverSearchResultCardProps = {
  href: string;
  ariaLabel: string;
  title: string;
  secondaryTitle?: string | null;
  imageUrl?: string | null;
  imageAlt: string;
  fallbackIcon: UiIconName;
  category: ReactNode;
  status?: ReactNode;
  dateValue?: string | null;
  detail?: ReactNode;
  summary?: ReactNode;
  author?: ReactNode;
  meta?: ReactNode;
};

export default function DiscoverSearchResultCard({
  href,
  ariaLabel,
  title,
  secondaryTitle,
  imageUrl,
  imageAlt,
  fallbackIcon,
  category,
  status,
  dateValue,
  detail,
  summary,
  author,
  meta,
}: DiscoverSearchResultCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <Link href={href} aria-label={ariaLabel} className={styles.card}>
      <div className={styles.media}>
        {showImage ? (
          <Image
            src={imageUrl as string}
            alt={imageAlt}
            fill
            unoptimized
            loading="lazy"
            sizes="(max-width: 759px) 112px, 108px"
            className={styles.image}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className={styles.placeholder} aria-hidden="true">
            <UiIcon name={fallbackIcon} size={27} strokeWidth={1.6} />
          </div>
        )}
        <div className={styles.mediaCategory}>{category}</div>
      </div>

      <div className={styles.content}>
        <div className={styles.topRow}>
          <div className={styles.badges}>
            {status}
          </div>
          {dateValue ? (
            <CompactActivityTime value={dateValue} className={styles.date} />
          ) : null}
        </div>

        <h2 className={styles.title}>
          <span>{title}</span>
          {secondaryTitle ? (
            <span className={styles.secondaryTitle}> · {secondaryTitle}</span>
          ) : null}
        </h2>
        {detail ? <div className={styles.detail}>{detail}</div> : null}
        {summary ? (
          <div className={`${styles.summary} ${styles.desktopSummary}`}>{summary}</div>
        ) : null}

        {summary || dateValue ? (
          <div className={styles.mobileUpdateRow}>
            {summary ? <span className={styles.mobileSummary}>{summary}</span> : null}
            {summary && dateValue ? <span aria-hidden="true">·</span> : null}
            {dateValue ? <CompactActivityTime value={dateValue} /> : null}
          </div>
        ) : null}

        {author || meta ? (
          <div className={styles.footer}>
            {author ? <div className={styles.author}>{author}</div> : <span />}
            {meta ? <div className={styles.meta}>{meta}</div> : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
