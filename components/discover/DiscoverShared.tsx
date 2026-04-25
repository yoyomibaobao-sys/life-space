import type { MouseEvent } from "react";
import { getBehaviorTagLabel } from "@/lib/tag-labels";
import type { FeedItem } from "@/lib/discover-types";
import {
  categoryLabel,
  formatDate,
  getArchiveLifecycleStatus,
  getArchiveRecordCount,
  getArchiveSystemName,
  getArchiveUserTitle,
  getArchiveViewCount,
  shortText,
} from "@/lib/discover-utils";

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
      🌱
    </span>
  );
}

export function HelpBadge() {
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
      求助
    </span>
  );
}

export function ResolvedBadge() {
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
      求助已解决
    </span>
  );
}

export function EndedBadge() {
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
      已结束
    </span>
  );
}

export function CategoryBadge({ category }: { category?: string | null }) {
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
      {categoryLabel(category)}
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
  return (
    <span
      onClick={
        enableLink
          ? (e: MouseEvent<HTMLSpanElement>) => {
              e.preventDefault();
              e.stopPropagation();

              if (record.species_id) {
                window.location.href = `/discover/search?tag=${encodeURIComponent(tag)}&species=${record.species_id}`;
                return;
              }

              window.location.href = `/discover/search?tag=${encodeURIComponent(tag)}`;
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
      {getBehaviorTagLabel(tag)}
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
}: {
  record: FeedItem;
  imageHeight: number;
  titleFontSize: number;
  noteMaxLength: number;
  enableTagLinks?: boolean;
  showUsername?: boolean;
}) {
  const isHelp = record.status_tag === "help";
  const isResolved = record.status_tag === "resolved";
  const lifecycleStatus = getArchiveLifecycleStatus(record);
  const archiveUserTitle = getArchiveUserTitle(record);
  const archiveSystemName = getArchiveSystemName(record);
  const archiveRecordCount = getArchiveRecordCount(record);
  const archiveViewCount = getArchiveViewCount(record);
  const commentCount = typeof record.comment_count === "number" ? record.comment_count : 0;
  const tags = Array.isArray(record.display_tags) ? record.display_tags.slice(0, 2) : [];
  const updateText = formatDate(record.record_time);
  const displayUsername = record.username || "用户";
  const statParts = [
    showUsername ? displayUsername : null,
    archiveRecordCount !== null ? `共 ${archiveRecordCount} 条记录` : null,
    archiveViewCount !== null ? `浏览 ${archiveViewCount} 次` : null,
    `${commentCount} 评论`,
  ].filter((item): item is string => Boolean(item));

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
        {isHelp && <HelpBadge />}
        {isResolved && <ResolvedBadge />}
        {lifecycleStatus === "ended" && <EndedBadge />}
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
            maxWidth: "44%",
          }}
          title={archiveUserTitle}
        >
          {archiveUserTitle}
        </span>

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
          {record.note ? shortText(record.note, noteMaxLength) : "这条记录没有文字内容"}
          {updateText ? <span style={{ color: "#9aa59a" }}>　更新 {updateText}</span> : null}
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
        {statParts.map((part, index) => (
          <span
            key={`${part}-${index}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minWidth: 0,
              flexShrink: index === 0 && showUsername ? 1 : 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={part}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {part}
            </span>
            {index < statParts.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  color: "#cbd4c8",
                  margin: "0 1px 0 5px",
                  flexShrink: 0,
                }}
              >
                ·
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
