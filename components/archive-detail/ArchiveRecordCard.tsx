"use client";

import { useRef, useState, type RefObject } from "react";
import Link from "next/link";
import DeleteRecordButton from "@/app/archive/[id]/DeleteRecordButton";
import EditRecord from "@/components/EditRecord";
import TagList from "@/components/TagList";
import ArchiveCommentsSection from "@/components/archive-detail/ArchiveCommentsSection";
import ArchiveStatusBadge from "@/components/archive-detail/ArchiveStatusBadge";
import {
  RECORD_TAG_OPTIONS,
  buildMediaList,
  formatDateTime,
  getDayNumber,
  smallActionButtonStyle,
} from "@/lib/archive-detail-utils";
import type {
  ArchiveDetailArchive,
  ArchiveMode,
  RecordItem,
} from "@/lib/archive-detail-types";
import type { MediaItem } from "@/lib/domain-types";
import { getBehaviorTagLabel } from "@/lib/tag-labels";

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
  onReplaceMedia?: (
    recordId: string,
    mediaId: string,
    files: File[],
  ) => Promise<void>;
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
  onAddMedia?: (recordId: string, files: File[]) => Promise<unknown>;
  onNoteSaved?: (recordId: string, nextText: string) => void;
  archiveDisplayName?: string;
  archiveDisplayHref?: string | null;
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
  onReplaceMedia,
  onVisibilityChange,
  onSetHelpStatus,
  onRemoveTag,
  onAddTag,
  onAddMedia,
  onNoteSaved,
  archiveDisplayName,
  archiveDisplayHref,
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
  const [replacingMedia, setReplacingMedia] = useState(false);
  const [editingMedia, setEditingMedia] = useState(false);
  const [replaceMediaId, setReplaceMediaId] = useState<string | null>(null);
  const chooseInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const statusBadge = isHelpRecord
    ? { label: "求助中", kind: "help" as const }
    : isResolvedRecord
      ? { label: "已解决", kind: "resolved" as const }
      : null;

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

  async function handleReplaceMediaFiles(fileList: FileList | null) {
    const nextFiles = Array.from(fileList || []).slice(0, 1);
    if (
      !nextFiles.length ||
      !replaceMediaId ||
      !onReplaceMedia ||
      replacingMedia
    ) {
      if (replaceInputRef.current) replaceInputRef.current.value = "";
      return;
    }

    setReplacingMedia(true);
    try {
      await onReplaceMedia(item.id, replaceMediaId, nextFiles);
    } finally {
      setReplacingMedia(false);
      setReplaceMediaId(null);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  }

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
          padding: isMobileViewport ? 10 : 12,
          borderRadius: isMobileViewport ? 14 : 16,
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
          <>
            <MobileRecordArchiveLine
              title={archive.title || "未命名项目"}
              systemName={archiveDisplayName || ""}
              href={archiveDisplayHref || null}
            />
            <MobileRecordPublishRow
              archive={archive}
              item={item}
              mode={mode}
              onVisibilityChange={onVisibilityChange}
            />
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
          </>
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
                      borderRadius: isMobileViewport ? 10 : 14,
                      display: "block",
                      background: "#f3f6f1",
                    }}
                  />

                  {mode === "owner" && !isMobileViewport ? (
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
                      x
                    </button>
                  ) : null}

                  {mode === "owner" && isMobileViewport && editingMedia ? (
                    <div style={mobileMediaTileActionWrapStyle}>
                      <button
                        type="button"
                        onClick={async (event) => {
                          event.stopPropagation();
                          if (!target?.id) return;
                          await onDeleteMedia(item.id, target.id);
                        }}
                        style={mobileMediaTileDangerButtonStyle}
                      >
                        删除
                      </button>

                      {target?.id && onReplaceMedia ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setReplaceMediaId(target.id);
                            replaceInputRef.current?.click();
                          }}
                          disabled={replacingMedia}
                          style={mobileMediaTileButtonStyle}
                        >
                          {replacingMedia && replaceMediaId === target.id
                            ? "替换中"
                            : "替换"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {mode === "owner" && isMobileViewport ? (
          <MobileRecordMediaManager
            open={editingMedia}
            mediaCount={mediaList.length}
            addingMedia={addingMedia}
            replacingMedia={replacingMedia}
            chooseInputRef={chooseInputRef}
            cameraInputRef={cameraInputRef}
            replaceInputRef={replaceInputRef}
            onToggle={() => setEditingMedia((value) => !value)}
            onAddMediaFiles={handleAddMediaFiles}
            onReplaceMediaFiles={handleReplaceMediaFiles}
          />
        ) : null}

        {isMobileViewport ? (
          <EditRecord
            key={`${item.id}-${mode}-mobile`}
            id={item.id}
            initialText={item.note || ""}
            readOnly={mode !== "owner"}
            compact
            placeholder="添加文字"
            onSaved={(nextText) => onNoteSaved?.(item.id, nextText)}
          />
        ) : (
          <div style={{ marginBottom: 8 }}>
            <EditRecord
              key={`${item.id}-${mode}`}
              id={item.id}
              initialText={item.note || ""}
              readOnly={mode !== "owner"}
            />
          </div>
        )}

        {mode === "owner" ? (
          <DesktopAndMobileRecordActions
            archive={archive}
            item={item}
            isMobileViewport={isMobileViewport}
            addingMedia={addingMedia}
            chooseInputRef={chooseInputRef}
            cameraInputRef={cameraInputRef}
            onSetHelpStatus={onSetHelpStatus}
            onVisibilityChange={onVisibilityChange}
            onAddMediaFiles={handleAddMediaFiles}
            onRecordDeleted={onRecordDeleted}
          />
        ) : null}

        {!isMobileViewport && isPlantArchive ? (
          <DesktopRecordTags
            item={item}
            mode={mode}
            onRemoveTag={onRemoveTag}
            onAddTag={onAddTag}
          />
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
          <DesktopSameTagLinks sameTagLinks={sameTagLinks} />
        ) : null}
      </div>
    </article>
  );
}

function DesktopAndMobileRecordActions({
  archive,
  item,
  isMobileViewport,
  addingMedia,
  chooseInputRef,
  cameraInputRef,
  onSetHelpStatus,
  onVisibilityChange,
  onAddMediaFiles,
  onRecordDeleted,
}: {
  archive: ArchiveDetailArchive;
  item: RecordItem;
  isMobileViewport: boolean;
  addingMedia: boolean;
  chooseInputRef: RefObject<HTMLInputElement | null>;
  cameraInputRef: RefObject<HTMLInputElement | null>;
  onSetHelpStatus: (
    recordId: string,
    nextStatus: "help" | "resolved" | null,
  ) => Promise<void>;
  onVisibilityChange: (
    recordId: string,
    nextVisibility: string,
  ) => Promise<void>;
  onAddMediaFiles: (fileList: FileList | null) => Promise<void>;
  onRecordDeleted?: (recordId: string) => void;
}) {
  if (isMobileViewport) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        marginBottom: 10,
      }}
    >
      {!isMobileViewport ? (
        archive.is_public ? (
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
        )
      ) : null}

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

      <input
        ref={chooseInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(event) => void onAddMediaFiles(event.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(event) => void onAddMediaFiles(event.target.files)}
      />

      <button
        type="button"
        onClick={() => chooseInputRef.current?.click()}
        disabled={addingMedia}
        style={smallActionButtonStyle("#f8fbf6", "#4c7441", "#dbe9d6")}
      >
        {addingMedia ? "添加中..." : "添加图片"}
      </button>
      <button
        type="button"
        onClick={() => cameraInputRef.current?.click()}
        disabled={addingMedia}
        style={smallActionButtonStyle("#f8fbf6", "#4c7441", "#dbe9d6")}
      >
        拍照
      </button>

      {!isMobileViewport ? (
        <Link
          href={`/market/new?archiveId=${archive.id}&recordId=${item.id}`}
          style={{
            ...smallActionButtonStyle("#fffaf0", "#7a6636", "#f1e3c7"),
            textDecoration: "none",
          }}
        >
          发布到集市
        </Link>
      ) : null}

      <DeleteRecordButton
        id={item.id}
        style={{ marginLeft: "auto" }}
        onDeleted={onRecordDeleted}
      />
    </div>
  );
}

function DesktopRecordTags({
  item,
  mode,
  onRemoveTag,
  onAddTag,
}: {
  item: RecordItem;
  mode: ArchiveMode;
  onRemoveTag: (recordId: string, tag: string) => void;
  onAddTag: (recordId: string, tag: string) => Promise<void>;
}) {
  return (
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
            requestAnimationFrame(() => window.scrollTo({ top: currentScrollY }));
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
  );
}

function DesktopSameTagLinks({
  sameTagLinks,
}: {
  sameTagLinks: Array<{ tag: string; count: number; href: string }>;
}) {
  return (
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
  );
}

function MobileRecordArchiveLine({
  title,
  systemName,
  href,
}: {
  title: string;
  systemName: string;
  href: string | null;
}) {
  return (
    <div style={mobileRecordArchiveLineStyle}>
      <span style={mobileRecordArchiveTitleStyle}>{title}</span>
      {systemName ? (
        <>
          <span style={mobileRecordArchiveDotStyle}>·</span>
          {href ? (
            <Link href={href} style={mobileRecordArchiveLinkStyle}>
              {systemName}
            </Link>
          ) : (
            <span style={mobileRecordArchiveSystemStyle}>{systemName}</span>
          )}
        </>
      ) : null}
    </div>
  );
}

function MobileRecordMediaManager({
  open,
  mediaCount,
  addingMedia,
  replacingMedia,
  chooseInputRef,
  cameraInputRef,
  replaceInputRef,
  onToggle,
  onAddMediaFiles,
  onReplaceMediaFiles,
}: {
  open: boolean;
  mediaCount: number;
  addingMedia: boolean;
  replacingMedia: boolean;
  chooseInputRef: RefObject<HTMLInputElement | null>;
  cameraInputRef: RefObject<HTMLInputElement | null>;
  replaceInputRef: RefObject<HTMLInputElement | null>;
  onToggle: () => void;
  onAddMediaFiles: (fileList: FileList | null) => Promise<void>;
  onReplaceMediaFiles: (fileList: FileList | null) => Promise<void>;
}) {
  const disabled = addingMedia || replacingMedia;

  return (
    <div style={mobileMediaManagerStyle(open, mediaCount)}>
      <input
        ref={chooseInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(event) => void onAddMediaFiles(event.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(event) => void onAddMediaFiles(event.target.files)}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(event) => void onReplaceMediaFiles(event.target.files)}
      />

      <button
        type="button"
        onClick={onToggle}
        style={mobileMediaManagerToggleStyle(open)}
      >
        {open ? "完成" : "管理图片"}
      </button>

      {open ? (
        <div style={mobileMediaManagerActionsStyle}>
          <button
            type="button"
            onClick={() => chooseInputRef.current?.click()}
            disabled={disabled}
            style={mobileMediaManagerActionButtonStyle}
          >
            {addingMedia ? "添加中" : "添加图片"}
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled}
            style={mobileMediaManagerActionButtonStyle}
          >
            拍照
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MobileRecordPublishRow({
  archive,
  item,
  mode,
  onVisibilityChange,
}: {
  archive: ArchiveDetailArchive;
  item: RecordItem;
  mode: ArchiveMode;
  onVisibilityChange: (
    recordId: string,
    nextVisibility: string,
  ) => Promise<void>;
}) {
  const isOwner = mode === "owner";
  const visibility = item.visibility === "private" || !archive.is_public ? "private" : "public";
  const visibilityText = visibility === "public" ? "已公开" : "私密";

  return (
    <div style={mobileRecordPublishRowStyle}>
      {isOwner && archive.is_public ? (
        <button
          type="button"
          onClick={() =>
            onVisibilityChange(item.id, visibility === "public" ? "private" : "public")
          }
          style={mobileRecordVisibilityButtonStyle(visibility)}
        >
          {visibilityText}
        </button>
      ) : (
        <span style={mobileRecordVisibilityTextStyle(visibility)}>
          {visibilityText}
        </span>
      )}

      {isOwner ? (
        <Link
          href={`/market/new?archiveId=${archive.id}&recordId=${item.id}`}
          aria-label="发布到集市"
          title="发布到集市"
          style={mobileMarketShareLinkStyle}
        >
          ↗
        </Link>
      ) : null}
    </div>
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

  async function cycleHelpStatus() {
    if (item.status_tag === "help") {
      await onSetHelpStatus(item.id, "resolved");
      return;
    }

    if (item.status_tag === "resolved") {
      await onSetHelpStatus(item.id, null);
      return;
    }

    await onSetHelpStatus(item.id, "help");
  }

  return (
    <div style={mobileRecordTagStripStyle}>
      {canEdit ? (
        <button
          type="button"
          onClick={cycleHelpStatus}
          style={mobileRecordStatusButtonStyle(item.status_tag)}
        >
          {item.status_tag === "help"
            ? "求助中"
            : item.status_tag === "resolved"
              ? "已解决"
              : "点击求助"}
        </button>
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
            requestAnimationFrame(() => window.scrollTo({ top: currentScrollY }));
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

const mobileRecordArchiveLineStyle = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  minWidth: 0,
  color: "#253325",
  fontSize: 13,
  lineHeight: 1.35,
  marginBottom: 6,
} as const;

const mobileRecordArchiveTitleStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 800,
} as const;

const mobileRecordArchiveDotStyle = {
  color: "#9aa596",
  flexShrink: 0,
} as const;

const mobileRecordArchiveSystemStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#5f6f5b",
} as const;

const mobileRecordArchiveLinkStyle = {
  ...mobileRecordArchiveSystemStyle,
  color: "#2f6a31",
  textDecoration: "none",
  fontWeight: 700,
} as const;

function mobileMediaManagerStyle(open: boolean, mediaCount: number) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
    margin: mediaCount > 0 ? "0 0 8px" : "2px 0 8px",
    paddingTop: open ? 2 : 0,
  } as const;
}

function mobileMediaManagerToggleStyle(open: boolean) {
  return {
    border: "none",
    background: "transparent",
    color: open ? "#2f6a31" : "#7a8577",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 0",
    cursor: "pointer",
  } as const;
}

const mobileMediaManagerActionsStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
} as const;

const mobileMediaManagerActionButtonStyle = {
  minHeight: 28,
  borderRadius: 999,
  border: "1px solid #dbe9d6",
  background: "#f8fbf6",
  color: "#4c7441",
  padding: "0 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const mobileMediaTileActionWrapStyle = {
  position: "absolute",
  left: 6,
  right: 6,
  bottom: 6,
  display: "flex",
  justifyContent: "space-between",
  gap: 6,
} as const;

const mobileMediaTileButtonStyle = {
  flex: "1 1 0",
  minWidth: 0,
  height: 28,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.72)",
  background: "rgba(255,255,255,0.9)",
  color: "#344630",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  backdropFilter: "blur(8px)",
} as const;

const mobileMediaTileDangerButtonStyle = {
  ...mobileMediaTileButtonStyle,
  color: "#9f3529",
} as const;

const mobileRecordPublishRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  margin: "0 0 6px",
} as const;

function mobileRecordVisibilityButtonStyle(visibility: "public" | "private") {
  return {
    border: "none",
    background: "transparent",
    color: visibility === "public" ? "#477341" : "#7b7568",
    fontSize: 12,
    fontWeight: 700,
    padding: "2px 0",
    cursor: "pointer",
  } as const;
}

function mobileRecordVisibilityTextStyle(visibility: "public" | "private") {
  return {
    color: visibility === "public" ? "#477341" : "#7b7568",
    fontSize: 12,
    fontWeight: 700,
  } as const;
}

const mobileMarketShareLinkStyle = {
  width: 28,
  height: 28,
  borderRadius: 999,
  border: "1px solid #e3eadf",
  background: "#fff",
  color: "#5d704f",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontSize: 16,
  lineHeight: 1,
} as const;

const mobileRecordNoteStyle = {
  color: "#2e382c",
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  margin: "2px 0 8px",
} as const;

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

function mobileRecordStatusButtonStyle(status?: string | null) {
  return {
    ...mobileRecordTagPillStyle,
    fontWeight: status ? 700 : 500,
    border: status === "help" ? "1px solid #edd2bd" : status === "resolved" ? "1px solid #cfe4d4" : "1px solid #e4eadf",
    background: status === "help" ? "#fff8f1" : status === "resolved" ? "#f4fbf5" : "#fff",
    color: status === "help" ? "#9a6232" : status === "resolved" ? "#3f7a49" : "#687463",
    cursor: "pointer",
  } as const;
}

const mobileRecordTagSelectStyle = {
  ...mobileRecordTagPillStyle,
  height: 24,
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
