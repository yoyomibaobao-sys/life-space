"use client";

import type { MouseEvent } from "react";
import { getBehaviorTagLabel } from "@/lib/tag-labels";
import type { FeedItem } from "@/lib/discover-types";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon from "@/components/ui/UiIcon";
import {
  categoryLabel,
  getArchiveLifecycleStatus,
  getArchiveRecordCount,
  getArchiveDurationDays,
  getArchiveFollowerCount,
  getArchiveSystemName,
  getArchiveUserTitle,
  getArchiveViewCount,
  shortText,
} from "@/lib/discover-utils";
import { useLanguage } from "@/lib/i18n/useLanguage";


export function getFeedItemDisplayImageUrl(record: FeedItem) {
  return record.primary_thumb_url || null;
}

export function DefaultUserAvatar({ size = 30 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #edf7e8 0%, #dfeedd 100%)",
        color: "#3f7d3d",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.max(15, Math.round(size * 0.55)),
        flexShrink: 0,
        border: "1px solid #dbe8d5",
      }}
    >
      <UiIcon name="sprout" size={Math.max(15, Math.round(size * 0.55))} />
    </span>
  );
}

export function HelpBadge() {
  const { t } = useLanguage();
  return (
    <span
      style={{
        fontSize: 11,
        color: "#a65f45",
        background: "#fff5ee",
        border: "1px solid #efd8cc",
        borderRadius: 999,
        padding: "1px 7px",
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontWeight: 600,
        letterSpacing: 0.5,
      }}
    >
      {t.discover.help_badge}
    </span>
  );
}

export function ResolvedBadge() {
  const { t } = useLanguage();
  return (
    <span
      style={{
        fontSize: 11,
        color: "#4d7c5b",
        background: "#f1faf3",
        border: "1px solid #cfe4d4",
        borderRadius: 999,
        padding: "1px 7px",
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontWeight: 600,
        letterSpacing: 0.2,
      }}
    >
      {t.discover.resolved_badge}
    </span>
  );
}

export function EndedBadge() {
  const { t } = useLanguage();
  return (
    <span
      style={{
        fontSize: 11,
        color: "#7f7668",
        background: "#f6f2ec",
        border: "1px solid #e4d8ca",
        borderRadius: 999,
        padding: "1px 7px",
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontWeight: 500,
        lineHeight: 1.35,
      }}
    >
      {t.discover.ended_badge}
    </span>
  );
}

export function CategoryBadge({ category }: { category?: string | null }) {
  const { language } = useLanguage();
  const isPlant = category === "plant";

  return (
    <span
      style={{
        fontSize: 11,
        color: isPlant ? "#2e7d32" : "#7a6a2a",
        background: isPlant ? "#f0fff4" : "#fff9e8",
        border: isPlant ? "1px solid #cae9ca" : "1px solid #eadca8",
        borderRadius: 999,
        padding: "1px 6px",
        whiteSpace: "nowrap",
        flexShrink: 0,
        lineHeight: 1.35,
      }}
    >
      {categoryLabel(category, language)}
    </span>
  );
}

export function RecordTagPill({
  record,
  tag,
  enableLink = false,
}: {
  record: FeedItem;
  tag: string;
  enableLink?: boolean;
}) {
  const { language } = useLanguage();
  return (
    <span
      onClick={
        enableLink
          ? (e: MouseEvent<HTMLSpanElement>) => {
              e.preventDefault();
              e.stopPropagation();

              if (record.species_id) {
                window.location.href = `/discover/search?type=records&tag=${encodeURIComponent(tag)}&species=${record.species_id}`;
                return;
              }

              window.location.href = `/discover/search?type=records&tag=${encodeURIComponent(tag)}`;
            }
          : undefined
      }
      style={{
        padding: "1px 6px",
        borderRadius: 999,
        border: "1px solid #e2e8df",
        background: "#fafafa",
        color: "#4CAF50",
        cursor: enableLink ? "pointer" : "default",
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontSize: 11,
        lineHeight: 1.35,
      }}
    >
      {getBehaviorTagLabel(tag, language)}
    </span>
  );
}

export function ProjectCardRows({
  record,
  imageHeight,
  titleFontSize,
  noteMaxLength,
  enableTagLinks = false,
  showUsername = false,
  mobileFourLine = false,
}: {
  record: FeedItem;
  imageHeight: number;
  titleFontSize: number;
  noteMaxLength: number;
  enableTagLinks?: boolean;
  showUsername?: boolean;
  mobileFourLine?: boolean;
}) {
  const { language, t } = useLanguage();
  const isHelp = record.status_tag === "help";
  const isResolved = record.status_tag === "resolved";
  const lifecycleStatus = getArchiveLifecycleStatus(record);
  const archiveUserTitle = getArchiveUserTitle(record, language);
  const archiveSystemName = getArchiveSystemName(record, language);
  const archiveRecordCount = getArchiveRecordCount(record);
  const archiveViewCount = getArchiveViewCount(record);
  const archiveDurationDays = getArchiveDurationDays(record);
  const archiveFollowerCount = getArchiveFollowerCount(record);
  const commentCount = typeof record.comment_count === "number" ? record.comment_count : 0;
  const tags = Array.isArray(record.display_tags) ? record.display_tags.slice(0, 2) : [];
  const displayUsername = record.username || t.discover.default_user;

  if (mobileFourLine) {
    const statusBadges = (
      <>
        {isHelp && <HelpBadge />}
        {isResolved && <ResolvedBadge />}
        {lifecycleStatus === "ended" && <EndedBadge />}
      </>
    );

    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: imageHeight,
          display: "grid",
          gridTemplateRows: "auto auto minmax(0, 1fr) auto",
          gap: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            minWidth: 0,
            whiteSpace: "nowrap",
            lineHeight: 1.25,
          }}
        >
          <CategoryBadge category={record.archive_category} />
          <span
            style={{
              fontSize: titleFontSize,
              fontWeight: 700,
              color: "#1f2d1f",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
            title={archiveUserTitle}
          >
            {archiveUserTitle}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            minWidth: 0,
            color: "#5f7f58",
            fontSize: 12,
            lineHeight: 1.25,
            whiteSpace: "nowrap",
          }}
        >
          {archiveSystemName ? (
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {archiveSystemName}
            </span>
          ) : null}
          {tags.map((tag) => (
            <RecordTagPill
              key={tag}
              record={record}
              tag={tag}
              enableLink={enableTagLinks}
            />
          ))}
        </div>

        <div
          style={{
            color: record.note ? "#3f4f3f" : "#9aa59a",
            fontSize: 12,
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            wordBreak: "break-word",
          }}
        >
          {record.note ? shortText(record.note, noteMaxLength) : t.discover.no_text}
          {record.record_time ? (
            <span style={{ color: "#9aa59a" }}>
              <span aria-hidden="true"> · </span>
              <CompactActivityTime value={record.record_time} />
            </span>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            minWidth: 0,
            fontSize: 11,
            color: "#8a998a",
            lineHeight: 1.25,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {(isHelp || isResolved || lifecycleStatus === "ended") ? (
            <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
              {statusBadges}
            </span>
          ) : null}
          {showUsername ? <span>{displayUsername}</span> : null}
          <ProjectMetaLine
            recordCount={archiveRecordCount}
            durationDays={archiveDurationDays}
            ended={lifecycleStatus === "ended"}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        height: imageHeight,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          whiteSpace: "nowrap",
          lineHeight: 1.35,
        }}
      >
        <CategoryBadge category={record.archive_category} />
        <span
          style={{
            fontSize: titleFontSize,
            fontWeight: 700,
            color: "#1f2d1f",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: "0 1 auto",
            maxWidth: "42%",
          }}
          title={archiveUserTitle}
        >
          {archiveUserTitle}
        </span>

        {archiveSystemName ? (
          <>
            <span
              aria-hidden="true"
              style={{
                color: "#c7d0c3",
                flexShrink: 0,
                fontSize: Math.max(12, titleFontSize - 2),
              }}
            >
              ·
            </span>

            <span
              style={{
                color: record.archive_category === "plant" ? "#5f7f58" : "#8a742d",
                fontSize: Math.max(12, titleFontSize - 2),
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
                flex: "0 1 auto",
                maxWidth: "30%",
              }}
              title={archiveSystemName}
            >
              {archiveSystemName}
            </span>
          </>
        ) : null}

        {(isHelp || isResolved || lifecycleStatus === "ended") && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            {isHelp && <HelpBadge />}
            {isResolved && <ResolvedBadge />}
            {lifecycleStatus === "ended" && <EndedBadge />}
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          color: "#3f4f3f",
          fontSize: 13,
          lineHeight: 1.35,
          whiteSpace: "nowrap",
        }}
      >
        {tags.map((tag) => (
          <RecordTagPill
            key={tag}
            record={record}
            tag={tag}
            enableLink={enableTagLinks}
          />
        ))}

        <span
          style={{
            color: record.note ? "#3f4f3f" : "#9aa59a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: 1,
          }}
        >
          {record.note ? shortText(record.note, noteMaxLength) : t.discover.no_text}
          {record.record_time ? (
            <span style={{ color: "#9aa59a" }}>
              <span aria-hidden="true"> · </span>
              <CompactActivityTime value={record.record_time} />
            </span>
          ) : null}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          minWidth: 0,
          fontSize: 11,
          color: "#8a998a",
          lineHeight: 1.35,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {showUsername ? <span>{displayUsername}</span> : null}
        <ProjectMetaLine
          recordCount={archiveRecordCount}
          durationDays={archiveDurationDays}
          ended={lifecycleStatus === "ended"}
          followerCount={archiveFollowerCount}
          viewCount={archiveViewCount}
          commentCount={commentCount}
        />
      </div>
    </div>
  );
}
