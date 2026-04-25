"use client";

import EditRecord from "@/components/EditRecord";
import TagList from "@/components/TagList";
import DeleteRecordButton from "@/app/archive/[id]/DeleteRecordButton";
import ArchiveStatusBadge from "@/components/archive-detail/ArchiveStatusBadge";
import ArchiveCommentsSection from "@/components/archive-detail/ArchiveCommentsSection";
import {
  RECORD_TAG_OPTIONS,
  buildMediaList,
  formatDateTime,
  getDayNumber,
  smallActionButtonStyle,
} from "@/lib/archive-detail-utils";
import { getBehaviorTagLabel } from "@/lib/tag-labels";
import type {
  ArchiveDetailArchive,
  ArchiveMode,
  RecordItem,
} from "@/lib/archive-detail-types";
import type { MediaItem } from "@/lib/domain-types";

type ArchiveRecordCardProps = {
  archive: ArchiveDetailArchive;
  item: RecordItem;
  index: number;
  mode: ArchiveMode;
  startTime?: string | null;
  isHighlighted: boolean;
  sameTagLinks: Array<{ tag: string; count: number; href: string }>;
  onOpenLightbox: (media: MediaItem[], index: number) => void;
  onDeleteMedia: (recordId: string, mediaId: string) => Promise<void>;
  onVisibilityChange: (recordId: string, nextVisibility: string) => Promise<void>;
  onSetHelpStatus: (recordId: string, nextStatus: "help" | "resolved" | null) => Promise<void>;
  onRemoveTag: (recordId: string, tag: string) => void;
  onAddTag: (recordId: string, tag: string) => Promise<void>;
  currentUserId?: string | null;
  onCommentCountChange?: (recordId: string, count: number) => void;
};

export default function ArchiveRecordCard({
  archive,
  item,
  index,
  mode,
  startTime,
  isHighlighted,
  sameTagLinks,
  onOpenLightbox,
  onDeleteMedia,
  onVisibilityChange,
  onSetHelpStatus,
  onRemoveTag,
  onAddTag,
  currentUserId,
  onCommentCountChange,
}: ArchiveRecordCardProps) {
  const mediaList = buildMediaList(item.media, archive.title || "项目");

  return (
    <article
      id={`record-${item.id}`}
      style={{
        position: "relative",
        marginBottom: 22,
        paddingLeft: 10,
        scrollMarginTop: 120,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -13,
          top: 8,
          width: 11,
          height: 11,
          borderRadius: "50%",
          background: index === 0 ? "#4CAF50" : "#9fc59a",
          boxShadow: "0 0 0 4px #f8fbf6",
        }}
      />

      {archive && startTime ? (
        <div
          style={{
            fontSize: 12,
            color: "#8a9588",
            marginBottom: 6,
          }}
        >
          {index === 0 ? "最新进展 · " : ""}
          第 {getDayNumber(startTime, item.record_time)} 天 · {formatDateTime(item.record_time)}
        </div>
      ) : null}

      <div
        style={{
          background: "#fff",
          padding: 14,
          borderRadius: 18,
          border: isHighlighted ? "1px solid #b6ddb4" : "1px solid #ebefea",
          boxShadow: isHighlighted
            ? "0 0 0 4px rgba(79, 143, 70, 0.08)"
            : "0 4px 18px rgba(0,0,0,0.03)",
        }}
      >
        {mediaList.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {mediaList.map((media, mediaIndex) => {
              const target = item.media?.[mediaIndex];
              return (
                <div key={media.url} style={{ position: "relative" }}>
                  <img
                    src={media.url}
                    alt={media.alt}
                    onClick={() => onOpenLightbox(item.media || [], mediaIndex)}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      objectFit: "cover",
                      borderRadius: 14,
                      display: "block",
                      cursor: "pointer",
                      background: "#f3f6f1",
                    }}
                  />

                  {mode === "owner" ? (
                    <button
                      type="button"
                      onClick={async (event) => {
                        event.stopPropagation();
                        if (!target?.id) return;
                        await onDeleteMedia(item.id, target.id);
                      }}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        border: "none",
                        background: "rgba(0,0,0,0.58)",
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div style={{ marginBottom: 10 }}>
          <EditRecord
            key={`${item.id}-${mode}`}
            id={item.id}
            initialText={item.note || ""}
            readOnly={mode !== "owner"}
          />
        </div>

        {mode === "owner" ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            {archive.is_public ? (
              <select
                value={item.visibility || "public"}
                onChange={async (event) => {
                  await onVisibilityChange(item.id, event.target.value);
                }}
                style={{
                  fontSize: 12,
                  borderRadius: 999,
                  border: "1px solid #dfe5dc",
                  padding: "6px 10px",
                  background: "#fff",
                }}
              >
                <option value="public">已公开</option>
                <option value="private">仅自己可见</option>
              </select>
            ) : (
              <ArchiveStatusBadge>项目私密，记录仅自己可见</ArchiveStatusBadge>
            )}

            <button
              type="button"
              onClick={() => onSetHelpStatus(item.id, item.status_tag === "help" ? null : "help")}
              style={smallActionButtonStyle(
                item.status_tag === "help" ? undefined : "#fff5ee",
                item.status_tag === "help" ? undefined : "#a65f45",
                item.status_tag === "help" ? undefined : "#efd8cc"
              )}
            >
              {item.status_tag === "help" ? "取消求助" : "求助"}
            </button>

            <button
              type="button"
              onClick={() => onSetHelpStatus(item.id, "resolved")}
              style={smallActionButtonStyle(
                item.status_tag === "resolved" ? "#eef7ef" : "#f7faf7",
                item.status_tag === "resolved" ? "#3f7d4c" : "#6f7f6f",
                item.status_tag === "resolved" ? "#cfe1d0" : "#dfe7de"
              )}
            >
              已解决
            </button>
          </div>
        ) : null}

        <div
          style={{
            marginTop: 2,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <TagList
            tags={item.display_tags}
            editable={mode === "owner"}
            recordId={item.id}
            userTags={item.user_behavior_tags}
            onChange={(tag) => onRemoveTag(item.id, tag)}
          />

          {mode === "owner" ? (
            <>
              <select
                onChange={async (event) => {
                  const newTag = event.target.value;
                  const currentScrollY = window.scrollY;
                  event.target.value = "";
                  event.target.blur();

                  if (!newTag) return;

                  await onAddTag(item.id, newTag);
                  requestAnimationFrame(() =>
                    window.scrollTo({ top: currentScrollY })
                  );
                }}
                defaultValue=""
                style={{
                  fontSize: 12,
                  borderRadius: 999,
                  border: "1px solid #dfe5dc",
                  padding: "6px 10px",
                  background: "#fff",
                }}
              >
                <option value="">+ 添加标签</option>
                {RECORD_TAG_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <DeleteRecordButton id={item.id} style={{ marginLeft: "auto" }} />
            </>
          ) : null}
        </div>



        <ArchiveCommentsSection
          recordId={item.id}
          recordOwnerId={archive.user_id}
          recordStatusTag={item.status_tag}
          currentUserId={currentUserId}
          initialCommentCount={item.comment_count}
          onCommentCountChange={(count) => onCommentCountChange?.(item.id, count)}
        />

        {sameTagLinks.length > 0 ? (
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px dashed #ebefea",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, color: "#9aa59a" }}>同类记录：</span>
            {sameTagLinks.map((linkItem) => (
              <a
                key={linkItem.tag}
                href={linkItem.href}
                style={{
                  fontSize: 12,
                  color: "#4CAF50",
                  textDecoration: "none",
                  border: "1px solid #d9ead5",
                  background: "#f7fcf5",
                  padding: "4px 10px",
                  borderRadius: 999,
                }}
              >
                {getBehaviorTagLabel(linkItem.tag)}（{linkItem.count}） →
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
