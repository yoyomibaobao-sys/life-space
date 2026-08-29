"use client";

import Link from "next/link";
import type { KeyboardEvent, ReactNode } from "react";
import LocalBlobImage from "@/components/local/LocalBlobImage";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import UiIcon, { type UiIconName } from "@/components/ui/UiIcon";
import styles from "@/components/project/ProjectSummaryCard.module.css";

type ProjectCover =
  | { kind: "url"; url: string }
  | { kind: "blob"; blob: Blob }
  | null;

type Props = {
  href?: string;
  onOpen?: () => void;
  ariaLabel: string;
  cover: ProjectCover;
  imageAlt: string;
  fallbackIcon: UiIconName;
  categoryLabel: string;
  title: string;
  systemName?: string | null;
  helpLabel?: string | null;
  endedLabel?: string | null;
  ended?: boolean;
  unread?: boolean;
  latestText?: string | null;
  latestTime?: string | null;
  visibilityLabel?: string | null;
  classificationText?: string | null;
  showClassification?: boolean;
  followerCount?: number | null;
  recordCount?: number | null;
  durationDays?: number | null;
  ownerLine?: ReactNode;
  actionSlot?: ReactNode;
};

export default function ProjectSummaryCard(props: Props) {
  const hasClassification = Boolean(
    props.showClassification ||
    props.visibilityLabel || props.classificationText,
  );
  const stats = (
    <span className={styles.stats}>
      <ProjectMetaLine
        followerCount={props.followerCount}
        recordCount={props.recordCount}
        durationDays={props.durationDays}
        ended={Boolean(props.ended)}
        order={["follow", "record", "duration"]}
        style={{ flexWrap: "nowrap", gap: "3px 8px", fontSize: 11.5 }}
      />
    </span>
  );

  const content = (
    <>
      <span className={styles.media}>
        {props.cover?.kind === "url" ? (
          <img
            src={props.cover.url}
            alt={props.imageAlt}
            loading="lazy"
            className={styles.image}
          />
        ) : props.cover?.kind === "blob" ? (
          <LocalBlobImage
            blob={props.cover.blob}
            alt={props.imageAlt}
            style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
          />
        ) : (
          <UiIcon name={props.fallbackIcon} size={29} strokeWidth={1.6} />
        )}
        <span className={styles.category}>{props.categoryLabel}</span>
      </span>

      <span className={styles.body}>
        <span className={styles.titleRow}>
          <span className={styles.identity}>
            <strong className={styles.title}>{props.title}</strong>
            {props.systemName ? (
              <>
                <span className={styles.dot} aria-hidden="true">·</span>
                <span className={styles.systemName}>{props.systemName}</span>
              </>
            ) : null}
          </span>
          <span className={styles.titleActions}>
            {props.helpLabel ? <span className={styles.help}>{props.helpLabel}</span> : null}
            {props.unread ? <span className={styles.unread} aria-hidden="true" /> : null}
            {props.actionSlot ? (
              <span
                className={styles.actionSlot}
                data-no-card-nav="true"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {props.actionSlot}
              </span>
            ) : null}
          </span>
        </span>

        <span className={styles.update}>
          {props.latestText ? (
            <span className={styles.updateText}>{props.latestText}</span>
          ) : null}
          {props.latestTime ? (
            <CompactActivityTime value={props.latestTime} className={styles.updateTime} />
          ) : null}
        </span>

        {hasClassification ? (
          <span className={styles.classification}>
            {props.visibilityLabel ? (
              <span className={styles.visibility}>{props.visibilityLabel}</span>
            ) : null}
            {props.visibilityLabel && props.classificationText ? (
              <span aria-hidden="true">·</span>
            ) : null}
            {props.classificationText ? (
              <span className={styles.classificationText}>{props.classificationText}</span>
            ) : null}
          </span>
        ) : (
          stats
        )}

        <span className={styles.footer}>
          {hasClassification ? stats : <span className={styles.owner}>{props.ownerLine}</span>}
          {props.ended && props.endedLabel ? (
            <span className={styles.ended}>{props.endedLabel}</span>
          ) : null}
        </span>
      </span>
    </>
  );

  if (props.href) {
    return (
      <Link
        href={props.href}
        aria-label={props.ariaLabel}
        className={styles.card}
        data-ended={props.ended ? "true" : "false"}
        onClick={props.onOpen}
      >
        {content}
      </Link>
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!props.onOpen || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    props.onOpen();
  }

  return (
    <article
      role={props.onOpen ? "link" : undefined}
      tabIndex={props.onOpen ? 0 : undefined}
      aria-label={props.ariaLabel}
      className={styles.card}
      data-ended={props.ended ? "true" : "false"}
      onClick={props.onOpen}
      onKeyDown={handleKeyDown}
    >
      {content}
    </article>
  );
}
