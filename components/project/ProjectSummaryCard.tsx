"use client";

import Link from "next/link";
import {
  cloneElement,
  isValidElement,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import LocalBlobImage from "@/components/local/LocalBlobImage";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import InlineRecordSummary from "@/components/ui/InlineRecordSummary";
import UiIcon, { type UiIconName } from "@/components/ui/UiIcon";
import MobileArchiveTaxonomyInline from "@/components/archive/MobileArchiveTaxonomyInline";
import type { ArchiveCategory } from "@/lib/archive-categories";
import type { GroupTagItem, SubTagItem } from "@/lib/archive-page-types";
import type { ArchiveCategoryDepths } from "@/lib/archive-category-settings";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "@/components/project/ProjectSummaryCard.module.css";

type ProjectCover =
  | { kind: "url"; url: string }
  | { kind: "blob"; blob: Blob }
  | null;

type InlineTaxonomyActionProps = {
  category: ArchiveCategory;
  subTagId?: string | null;
  groupTagId?: string | null;
  subTags: SubTagItem[];
  groupTags: GroupTagItem[];
  categoryDepths?: ArchiveCategoryDepths;
  allowTaxonomyEdit?: boolean;
  isPublic?: boolean;
  onTogglePublic?: () => void;
  onChangeCategory: (value: string) => void;
  onChangeGroup: (value: string) => void;
};

type Props = {
  href?: string;
  onOpen?: () => void;
  ariaLabel: string;
  cover: ProjectCover;
  imageAlt: string;
  fallbackIcon: UiIconName;
  categoryLabel: string;
  showCategoryBadge?: boolean;
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
  classificationSlot?: ReactNode;
  showClassification?: boolean;
  followerCount?: number | null;
  recordCount?: number | null;
  durationDays?: number | null;
  ownerLine?: ReactNode;
  actionSlot?: ReactNode;
};

export default function ProjectSummaryCard(props: Props) {
  const { t } = useLanguage();
  const taxonomyAction = getInlineTaxonomyAction(props.actionSlot);
  const displayActionSlot = taxonomyAction && isValidElement(props.actionSlot)
    ? cloneElement(
        props.actionSlot as ReactElement<InlineTaxonomyActionProps>,
        { allowTaxonomyEdit: false },
      )
    : props.actionSlot;
  const inlineTaxonomy = taxonomyAction ? (
    <>
      <MobileArchiveTaxonomyInline
        category={taxonomyAction.category}
        subTagId={taxonomyAction.subTagId}
        groupTagId={taxonomyAction.groupTagId}
        subTags={taxonomyAction.subTags}
        groupTags={taxonomyAction.groupTags}
        maxDepth={taxonomyAction.categoryDepths?.[taxonomyAction.category] || 3}
        onChangeCategory={taxonomyAction.onChangeCategory}
        onChangeGroup={taxonomyAction.onChangeGroup}
      />
    </>
  ) : null;
  const effectiveClassificationSlot = props.classificationSlot || inlineTaxonomy;
  const hasClassification = Boolean(
    props.showClassification ||
    props.classificationText || effectiveClassificationSlot,
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
        {props.showCategoryBadge !== false ? (
          <span className={styles.category}>{props.categoryLabel}</span>
        ) : null}
      </span>

      <span className={styles.body}>
        <span className={styles.titleRow}>
          <span className={styles.identity}>
            <strong className={styles.title}>{props.title}</strong>
            {props.visibilityLabel ? (
              taxonomyAction?.onTogglePublic ? (
                <button
                  type="button"
                  className={styles.visibility}
                  data-no-card-nav="true"
                  aria-label={taxonomyAction.isPublic ? t.archive_workspace.set_private : t.archive_workspace.set_public}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    taxonomyAction.onTogglePublic?.();
                  }}
                >
                  {props.visibilityLabel}
                </button>
              ) : <span className={styles.visibility}>{props.visibilityLabel}</span>
            ) : null}
          </span>
          <span className={styles.titleActions}>
            {props.helpLabel ? <span className={styles.help}>{props.helpLabel}</span> : null}
            {props.unread ? <span className={styles.unread} aria-hidden="true" /> : null}
            {displayActionSlot ? (
              <span
                className={styles.actionSlot}
                data-no-card-nav="true"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {displayActionSlot}
              </span>
            ) : null}
          </span>
        </span>

        <InlineRecordSummary text={props.latestText} time={props.latestTime} className={styles.update} />

        {hasClassification ? (
          <span className={styles.classification}>
            {effectiveClassificationSlot ? (
              <span
                className={styles.classificationSlot}
                data-no-card-nav="true"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {effectiveClassificationSlot}
              </span>
            ) : (
              <>
                {props.classificationText ? (
                  <span className={styles.classificationText}>{props.classificationText}</span>
                ) : null}
              </>
            )}
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
    if (event.target !== event.currentTarget) return;
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

function getInlineTaxonomyAction(actionSlot: ReactNode) {
  if (!isValidElement(actionSlot)) return null;
  const element = actionSlot as ReactElement<Partial<InlineTaxonomyActionProps>>;
  const action = element.props;
  if (
    !action.category ||
    !Array.isArray(action.subTags) ||
    !Array.isArray(action.groupTags) ||
    typeof action.onChangeCategory !== "function" ||
    typeof action.onChangeGroup !== "function"
  ) {
    return null;
  }

  return action as InlineTaxonomyActionProps;
}
