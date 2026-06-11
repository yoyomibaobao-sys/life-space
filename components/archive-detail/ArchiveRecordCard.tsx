"use client";
import { useRef, useState } from "react";
import Link from "next/link";
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
  onVisibilityChange: (
    recordId: string,
    nextVisibility: string,
  ) => Promise<void>;
  onSetHelpStatus: (
    recordId: string,
    nextStatus: "help" | "resolved" | null,
  ) => Promise<void>;
  onRemoveTag: (recordId: string, tag: string) => void;
  onAddTag: (recordId: string, tag: string) => Promise<void>;
  onAddMedia?: (recordId: string, files: File[]) => Promise<void>;
  currentUserId?: string | null;
  onCommentCountChange?: (recordId: string, count: number) => void;
  onRecordDeleted?: (recordId: string) => void;
  isMobileViewport?: boolean;
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
  onAddMedia,
  currentUserId,
  onCommentCountChange,
  onRecordDeleted,
  isMobileViewport = false,
}: ArchiveRecordCardProps) {
  const mediaList = buildMediaList(item.media, archive.title || "项目");
  const isPlantArchive = archive.category === "plant";
  const isHelpRecord = item.status_tag === "help";
  const isResolvedRecord = item.status_tag === "resolved";
  const [addingMedia, setAddingMedia] = useState(false);
  const chooseInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  async function handleAddMediaFiles(fileList: FileList | null) {
    const nextFiles = Array.from(fileList || []);
    if (!nextFiles.length || !onAddMedia || addingMedia) return;

    setAddingMedia(true);
    try {
      await onAddMedia(item.id, nextFiles);
    } finally {
      setAddingMedia(false);
      if (chooseInputRef.current) chooseInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  const statusBadge = isHelpRecord
    ? { label: "求助中", kind: "help" as const }
    : isResolvedRecord
      ? { label: "已解决", kind: "resolved" as const }
      : null;

  return (
    <article
      id={`record-${item.id}`}
      style={{
        position: "relative",
        marginBottom: 14,
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

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 6,
        }}
      >
        {archive && startTime ? (
          <div
            style={{
              fontSize: 12,
              color: "#8a9588",
              minWidth: 0,
            }}
          >
            {index === 0 ? "最新进展 · " : ""}第{" "}
            {getDayNumber(startTime, item.record_time)} 天 ·{" "}
            {formatDateTime(item.record_time)}
          </div>
        ) : (
          <span />
        )}
        {!isMobileViewport && statusBadge ? (
          <ArchiveStatusBadge kind={statusBadge.kind}>
            {statusBadge.label}
          </ArchiveStatusBadge>
        ) : null}
      </div>

      <div
        style={{
          background: isHelpRecord
            ? "#fffaf5"
            : isResolvedRecord
              ? "#fbfffb"
              : "#fff",
          padding: 12,
          borderRadius: 16,
          border: isHelpRecord
            ? "1px solid #edc6a9"
            : isResolvedRecord
              ? "1px solid #cfe4d4"
              : isHighlighted
                ? "1px solid #b6ddb4"
                : "1px solid #ebefea",
          boxShadow: isHelpRecord
            ? "0 0 0 3px rgba(166, 95, 69, 0.08)"
            : isResolvedRecord
              ? "0 0 0 3px rgba(77, 124, 91, 0.08)"
              : isHighlighted
                ? "0 0 0 4px rgba(79, 143, 70, 0.08)"
                : "0 3px 14px rgba(0,0,0,0.025)",
        }}
      >
        {isMobileViewport ? (
          <MobileRecordTagStrip
            item={item}
            mode={mode}
            isPlantArchive={isPlantArchive}
            statusBadge={statusBadge}
            sameTagLinks={sameTagLinks}
            onSetHelpStatus={onSetHelpStatus}
            onRemoveTag={onRemoveTag}
            onAddTag={onAddTag}
          />
        ) : null}

        {mediaList.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
              marginBottom: 8,
            }}
          >
            {mediaList.map((media, mediaIndex) => {
              const target = item.media?.[mediaIndex];
              return (
                <div
                  key={media.url}
                  role="button"
                  tabIndex={0}
                  aria-label="打开图片预览"
                  onClick={() => onOpenLightbox(item.media || [], mediaIndex)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenLightbox(item.media || [], mediaIndex);
                    }
                  }}
                  style={{ position: "relative", cursor: "pointer" }}
                >
                  <img
                    src={target?.display_thumb_url || target?.thumb_url || media.url}
                    alt={media.alt}
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      objectFit: "cover",
                      borderRadius: 14,
                      display: "block",
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

        <div style={{ marginBottom: 8 }}>
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
              <ArchiveStatusBadge>项目和记录仅自己可见</ArchiveStatusBadge>
            )}

            {!isMobileViewport ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    onSetHelpStatus(
                      item.id,
                      item.status_tag === "help" ? null : "help",
                    )
                  }
                  style={smallActionButtonStyle(
                    item.status_tag === "help" ? "#fff0e4" : "#fff8f3",
                    item.status_tag === "help" ? "#8f4a22" : "#a65f45",
                    item.status_tag === "help" ? "#e1a77d" : "#efd8cc",
                  )}
                >
                  {item.status_tag === "help" ? "求助中 · 取消" : "求助"}
                </button>

                <button
                  type="button"
                  onClick={() => onSetHelpStatus(item.id, "resolved")}
                  style={smallActionButtonStyle(
                    item.status_tag === "resolved" ? "#e8f6ec" : "#f7faf7",
                    item.status_tag === "resolved" ? "#286b3c" : "#6f7f6f",
                    item.status_tag === "resolved" ? "#acd7b5" : "#dfe7de",
                  )}
                >
                  {item.status_tag === "resolved" ? "已解决 ✓" : "已解决"}
                </button>
              </>
            ) : null}
            {onAddMedia ? (
              <>
                <input
                  ref={chooseInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(event) =>
                    void handleAddMediaFiles(event.target.files)
                  }
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={(event) =>
                    void handleAddMediaFiles(event.target.files)
                  }
                />
                <button
                  type="button"
                  onClick={() => chooseInputRef.current?.click()}
                  disabled={addingMedia}
                  style={smallActionButtonStyle(
                    "#f8fbf6",
                    "#4c7441",
                    "#dbe9d6",
                  )}
                >
                  {addingMedia ? "添加中..." : "添加图片"}
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={addingMedia}
                  style={smallActionButtonStyle(
                    "#f8fbf6",
                    "#4c7441",
                    "#dbe9d6",
                  )}
                >
                  拍照
                </button>
              </>
            ) : null}

            <Link
              href={`/market/new?archiveId=${archive.id}&recordId=${item.id}`}
              style={{
                ...smallActionButtonStyle("#fffaf0", "#7a6636", "#f1e3c7"),
                textDecoration: "none",
              }}
            >
              发布到集市
            </Link>

            <DeleteRecordButton
              id={item.id}
              style={{ marginLeft: "auto" }}
              onDeleted={onRecordDeleted}
            />
          </div>
        ) : null}

        {!isMobileViewport && isPlantArchive ? (
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
              <select
                onChange={async (event) => {
                  const newTag = event.target.value;
                  const currentScrollY = window.scrollY;
                  event.target.value = "";
                  event.target.blur();

                  if (!newTag) return;

                  await onAddTag(item.id, newTag);
                  requestAnimationFrame(() =>
                    window.scrollTo({ top: currentScrollY }),
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
            ) : null}
          </div>
        ) : null}

        <ArchiveCommentsSection
          recordId={item.id}
          recordOwnerId={archive.user_id}
          recordStatusTag={item.status_tag}
          currentUserId={currentUserId}
          initialCommentCount={item.comment_count}
          showStatusHint={!isMobileViewport}
          onCommentCountChange={(count) =>
            onCommentCountChange?.(item.id, count)
          }
        />

        {!isMobileViewport && isPlantArchive && sameTagLinks.length > 0 ? (
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

function MobileRecordTagStrip({
  item,
  mode,
  isPlantArchive,
  statusBadge,
  sameTagLinks,
  onSetHelpStatus,
  onRemoveTag,
  onAddTag,
}: {
  item: RecordItem;
  mode: ArchiveMode;
  isPlantArchive: boolean;
  statusBadge: { label: string; kind: "help" | "resolved" } | null;
  sameTagLinks: Array<{ tag: string; count: number; href: string }>;
  onSetHelpStatus: (
    recordId: string,
    nextStatus: "help" | "resolved" | null,
  ) => Promise<void>;
  onRemoveTag: (recordId: string, tag: string) => void;
  onAddTag: (recordId: string, tag: string) => Promise<void>;
}) {
  const hasTags = isPlantArchive && Array.isArray(item.display_tags) && item.display_tags.length > 0;
  const canEdit = mode === "owner";

  if (!statusBadge && !hasTags && sameTagLinks.length === 0 && !canEdit) return null;

  return (
    <div style={mobileRecordTagStripStyle}>
      {canEdit ? (
        <select
          value={item.status_tag || ""}
          onChange={async (event) => {
            const nextValue = event.target.value as "help" | "resolved" | "";
            await onSetHelpStatus(item.id, nextValue || null);
          }}
          style={mobileRecordStatusSelectStyle(item.status_tag)}
          aria-label="求助状态"
        >
          <option value="">状态</option>
          <option value="help">求助中</option>
          <option value="resolved">已解决</option>
        </select>
      ) : statusBadge ? (
        <span style={mobileRecordStatusPillStyle(statusBadge.kind)}>
          {statusBadge.label}
        </span>
      ) : null}

      {isPlantArchive ? (
        <TagList
          tags={item.display_tags}
          editable={canEdit}
          recordId={item.id}
          userTags={item.user_behavior_tags}
          onChange={(tag) => onRemoveTag(item.id, tag)}
          containerStyle={mobileRecordTagListStyle}
          tagStyle={mobileRecordTagPillStyle}
        />
      ) : null}

      {canEdit && isPlantArchive ? (
        <select
          onChange={async (event) => {
            const newTag = event.target.value;
            const currentScrollY = window.scrollY;
            event.target.value = "";
            event.target.blur();

            if (!newTag) return;

            await onAddTag(item.id, newTag);
            requestAnimationFrame(() =>
              window.scrollTo({ top: currentScrollY }),
            );
          }}
          defaultValue=""
          style={mobileRecordTagSelectStyle}
          aria-label="添加标签"
        >
          <option value="">+ 标签</option>
          {RECORD_TAG_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : null}

      {sameTagLinks.map((linkItem) => (
        <a key={linkItem.tag} href={linkItem.href} style={mobileSameTagLinkStyle}>
          同类 {getBehaviorTagLabel(linkItem.tag)} {linkItem.count}
        </a>
      ))}
    </div>
  );
}

const mobileRecordTagStripStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 5,
  margin: "0 0 8px",
} as const;

const mobileRecordTagListStyle = {
  gap: 5,
} as const;

const mobileRecordTagPillStyle = {
  fontSize: 11,
  padding: "3px 7px",
  borderRadius: 999,
  border: "1px solid #e4eadf",
  background: "#f8faf6",
  color: "#586656",
} as const;

function mobileRecordStatusPillStyle(kind: "help" | "resolved") {
  return {
    ...mobileRecordTagPillStyle,
    border: kind === "help" ? "1px solid #edd2bd" : "1px solid #cfe4d4",
    background: kind === "help" ? "#fff8f1" : "#f4fbf5",
    color: kind === "help" ? "#9a6232" : "#3f7a49",
    fontWeight: 700,
  } as const;
}

function mobileRecordStatusSelectStyle(status?: string | null) {
  return {
    ...mobileRecordTagPillStyle,
    height: 26,
    padding: "0 7px",
    fontWeight: status ? 700 : 500,
    border: status === "help" ? "1px solid #edd2bd" : status === "resolved" ? "1px solid #cfe4d4" : "1px solid #e4eadf",
    background: status === "help" ? "#fff8f1" : status === "resolved" ? "#f4fbf5" : "#fff",
    color: status === "help" ? "#9a6232" : status === "resolved" ? "#3f7a49" : "#687463",
  } as const;
}

const mobileRecordTagSelectStyle = {
  ...mobileRecordTagPillStyle,
  height: 26,
  padding: "0 7px",
  background: "#fff",
} as const;

const mobileSameTagLinkStyle = {
  ...mobileRecordTagPillStyle,
  color: "#4f7e49",
  textDecoration: "none",
  border: "1px solid #d9ead5",
  background: "#f7fcf5",
} as const;
