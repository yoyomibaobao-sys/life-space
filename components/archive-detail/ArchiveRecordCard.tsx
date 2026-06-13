"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import DeleteRecordButton from "@/app/archive/[id]/DeleteRecordButton";
import EditRecord from "@/components/EditRecord";
import TagList from "@/components/TagList";
import ArchiveCommentsSection from "@/components/archive-detail/ArchiveCommentsSection";
import ArchiveStatusBadge from "@/components/archive-detail/ArchiveStatusBadge";
import { showToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
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
  onOpenLightbox: (media: MediaItem[], index: number, record: RecordItem) => void;
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
  onRecordUpdated?: (recordId: string, patch: Partial<RecordItem>) => void;
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
  onRecordUpdated,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [visibilityMenuOpen, setVisibilityMenuOpen] = useState(false);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
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
            {mode === "owner" ? (
              <MobileRecordFileInputs
                chooseInputRef={chooseInputRef}
                cameraInputRef={cameraInputRef}
                replaceInputRef={replaceInputRef}
                onAddMediaFiles={handleAddMediaFiles}
                onReplaceMediaFiles={handleReplaceMediaFiles}
              />
            ) : null}

            {mediaList.length > 0 ? (
              <MobileRecordMediaGrid
                mediaList={mediaList}
                mediaItems={item.media || []}
                onOpen={(mediaIndex) =>
                  onOpenLightbox(item.media || [], mediaIndex, item)
                }
              />
            ) : null}

            <div style={mobileRecordTextMenuRowStyle}>
              <div style={mobileRecordTextWrapStyle}>
                <EditRecord
                  key={`${item.id}-${mode}-mobile`}
                  id={item.id}
                  initialText={item.note || ""}
                  readOnly={mode !== "owner"}
                  compact
                  placeholder="添加文字"
                  onSaved={(nextText) => onNoteSaved?.(item.id, nextText)}
                />
              </div>
              {mode === "owner" ? (
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen((value) => !value);
                      setHelpMenuOpen(false);
                      setVisibilityMenuOpen(false);
                    }}
                    aria-label="更多记录操作"
                    style={mobileRecordMoreButtonStyle}
                  >
                    ⋯
                  </button>

                  {menuOpen ? (
                    <MobileRecordMoreMenu
                      archive={archive}
                      item={item}
                      helpMenuOpen={helpMenuOpen}
                      visibilityMenuOpen={visibilityMenuOpen}
                      onCamera={() => {
                        setMenuOpen(false);
                        cameraInputRef.current?.click();
                      }}
                      onAlbum={() => {
                        setMenuOpen(false);
                        chooseInputRef.current?.click();
                      }}
                      onToggleHelpMenu={() => {
                        setHelpMenuOpen((value) => !value);
                        setVisibilityMenuOpen(false);
                      }}
                      onToggleVisibilityMenu={() => {
                        setVisibilityMenuOpen((value) => !value);
                        setHelpMenuOpen(false);
                      }}
                      onSetHelpStatus={async (nextStatus) => {
                        await onSetHelpStatus(item.id, nextStatus);
                        setMenuOpen(false);
                        setHelpMenuOpen(false);
                      }}
                      onSetVisibility={async (nextVisibility) => {
                        await onVisibilityChange(item.id, nextVisibility);
                        setMenuOpen(false);
                        setVisibilityMenuOpen(false);
                      }}
                      onEdit={() => {
                        setMenuOpen(false);
                        setEditPanelOpen(true);
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            <MobileRecordMetaRow
              item={item}
              archive={archive}
              isPlantArchive={isPlantArchive}
              statusBadge={statusBadge}
              canEdit={mode === "owner"}
              tagEditorOpen={tagEditorOpen}
              onToggleTagEditor={() => setTagEditorOpen((value) => !value)}
              onRemoveTag={onRemoveTag}
              onAddTag={async (newTag) => {
                await onAddTag(item.id, newTag);
                setTagEditorOpen(false);
              }}
            />

            <ArchiveCommentsSection
              recordId={item.id}
              recordOwnerId={archive.user_id}
              recordStatusTag={item.status_tag}
              currentUserId={currentUserId}
              initialCommentCount={item.comment_count}
              showStatusHint={false}
              compactMobile
              onCommentCountChange={(count) =>
                onCommentCountChange?.(item.id, count)
              }
            />

            {editPanelOpen ? (
              <MobileRecordEditPanel
                item={item}
                onClose={() => setEditPanelOpen(false)}
                onSaved={(patch) => {
                  onRecordUpdated?.(item.id, patch);
                  if (typeof patch.note === "string") {
                    onNoteSaved?.(item.id, patch.note);
                  }
                  setEditPanelOpen(false);
                }}
                onRecordDeleted={onRecordDeleted}
              />
            ) : null}
          </>
        ) : (
          <>
            {mediaList.length > 0 ? (
              <DesktopRecordMediaGrid
                mediaList={mediaList}
                mediaItems={item.media || []}
                mode={mode}
                recordId={item.id}
                onOpen={(mediaIndex) =>
                  onOpenLightbox(item.media || [], mediaIndex, item)
                }
                onDeleteMedia={onDeleteMedia}
              />
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

            {isPlantArchive ? (
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
              showStatusHint
              onCommentCountChange={(count) =>
                onCommentCountChange?.(item.id, count)
              }
            />

            {isPlantArchive && sameTagLinks.length > 0 ? (
              <DesktopSameTagLinks sameTagLinks={sameTagLinks} />
            ) : null}
          </>
        )}
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

function MobileRecordFileInputs({
  chooseInputRef,
  cameraInputRef,
  replaceInputRef,
  onAddMediaFiles,
  onReplaceMediaFiles,
}: {
  chooseInputRef: RefObject<HTMLInputElement | null>;
  cameraInputRef: RefObject<HTMLInputElement | null>;
  replaceInputRef: RefObject<HTMLInputElement | null>;
  onAddMediaFiles: (fileList: FileList | null) => Promise<void>;
  onReplaceMediaFiles: (fileList: FileList | null) => Promise<void>;
}) {
  return (
    <>
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
    </>
  );
}

function MobileRecordMediaGrid({
  mediaList,
  mediaItems,
  onOpen,
}: {
  mediaList: Array<{ url: string; alt: string }>;
  mediaItems: MediaItem[];
  onOpen: (mediaIndex: number) => void;
}) {
  if (mediaList.length === 0) return null;

  return (
    <div style={mobileRecordMediaGridStyle}>
      {mediaList.map((media, mediaIndex) => {
        const target = mediaItems[mediaIndex];

        return (
          <button
            key={media.url}
            type="button"
            aria-label="打开图片预览"
            onClick={() => onOpen(mediaIndex)}
            style={mobileRecordMediaButtonStyle}
          >
            <img
              src={target?.display_thumb_url || target?.thumb_url || media.url}
              alt={media.alt}
              loading="lazy"
              decoding="async"
              style={mobileRecordMediaImageStyle}
            />
          </button>
        );
      })}
    </div>
  );
}

function DesktopRecordMediaGrid({
  mediaList,
  mediaItems,
  mode,
  recordId,
  onOpen,
  onDeleteMedia,
}: {
  mediaList: Array<{ url: string; alt: string }>;
  mediaItems: MediaItem[];
  mode: ArchiveMode;
  recordId: string;
  onOpen: (mediaIndex: number) => void;
  onDeleteMedia: (recordId: string, mediaId: string) => Promise<void>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 8,
        marginBottom: 8,
      }}
    >
      {mediaList.map((media, mediaIndex) => {
        const target = mediaItems[mediaIndex];
        return (
          <div
            key={media.url}
            role="button"
            tabIndex={0}
            aria-label="打开图片预览"
            onClick={() => onOpen(mediaIndex)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(mediaIndex);
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
                  await onDeleteMedia(recordId, target.id);
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
          </div>
        );
      })}
    </div>
  );
}

function MobileRecordMoreMenu({
  archive,
  item,
  helpMenuOpen,
  visibilityMenuOpen,
  onCamera,
  onAlbum,
  onToggleHelpMenu,
  onToggleVisibilityMenu,
  onSetHelpStatus,
  onSetVisibility,
  onEdit,
}: {
  archive: ArchiveDetailArchive;
  item: RecordItem;
  helpMenuOpen: boolean;
  visibilityMenuOpen: boolean;
  onCamera: () => void;
  onAlbum: () => void;
  onToggleHelpMenu: () => void;
  onToggleVisibilityMenu: () => void;
  onSetHelpStatus: (nextStatus: "help" | "resolved" | null) => Promise<void>;
  onSetVisibility: (nextVisibility: string) => Promise<void>;
  onEdit: () => void;
}) {
  const visibility =
    item.visibility === "private" || !archive.is_public ? "private" : "public";
  const nextHelp =
    item.status_tag === "help"
      ? { label: "标记已解决", value: "resolved" as const }
      : item.status_tag === "resolved"
        ? { label: "取消求助", value: null }
        : { label: "发起求助", value: "help" as const };
  const nextVisibility =
    visibility === "public"
      ? { label: "设为私密", value: "private" }
      : { label: "设为公开", value: "public" };

  return (
    <div style={mobileRecordMenuStyle}>
      <button type="button" onClick={onCamera} style={mobileRecordMenuItemStyle}>
        拍照
      </button>
      <button type="button" onClick={onAlbum} style={mobileRecordMenuItemStyle}>
        从相册添加
      </button>
      <Link
        href={`/market/new?archiveId=${archive.id}&recordId=${item.id}`}
        style={mobileRecordMenuLinkStyle}
      >
        转发到集市
      </Link>
      <button
        type="button"
        onClick={onToggleHelpMenu}
        style={mobileRecordMenuItemStyle}
      >
        求助状态
      </button>
      {helpMenuOpen ? (
        <button
          type="button"
          onClick={() => onSetHelpStatus(nextHelp.value)}
          style={mobileRecordSubMenuItemStyle}
        >
          {nextHelp.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onToggleVisibilityMenu}
        style={mobileRecordMenuItemStyle}
      >
        公开设置
      </button>
      {visibilityMenuOpen ? (
        <button
          type="button"
          onClick={() => onSetVisibility(nextVisibility.value)}
          disabled={!archive.is_public}
          style={mobileRecordSubMenuItemStyle}
        >
          {archive.is_public ? nextVisibility.label : "项目私密"}
        </button>
      ) : null}
      <button type="button" onClick={onEdit} style={mobileRecordMenuItemStyle}>
        编辑
      </button>
    </div>
  );
}

function MobileRecordMetaRow({
  item,
  archive,
  isPlantArchive,
  statusBadge,
  canEdit,
  tagEditorOpen,
  onToggleTagEditor,
  onRemoveTag,
  onAddTag,
}: {
  item: RecordItem;
  archive: ArchiveDetailArchive;
  isPlantArchive: boolean;
  statusBadge: { label: string; kind: "help" | "resolved" } | null;
  canEdit: boolean;
  tagEditorOpen: boolean;
  onToggleTagEditor: () => void;
  onRemoveTag: (recordId: string, tag: string) => void;
  onAddTag: (tag: string) => Promise<void>;
}) {
  const tags = Array.isArray(item.display_tags) ? item.display_tags : [];
  const visibility =
    item.visibility === "private" || !archive.is_public ? "私密" : "已公开";

  return (
    <div style={mobileRecordMetaWrapStyle}>
      <div style={mobileRecordMetaRowStyle}>
        {isPlantArchive && tags.length > 0 ? (
          <button
            type="button"
            onClick={canEdit ? onToggleTagEditor : undefined}
            style={mobileRecordMetaTagsButtonStyle}
          >
            <TagList
              tags={tags}
              editable={canEdit && tagEditorOpen}
              recordId={item.id}
              userTags={item.user_behavior_tags}
              onChange={(tag) => onRemoveTag(item.id, tag)}
              containerStyle={mobileRecordTagListStyle}
              tagStyle={mobileRecordTagPillStyle}
            />
          </button>
        ) : canEdit && isPlantArchive ? (
          <button
            type="button"
            onClick={onToggleTagEditor}
            style={mobileRecordAddTagButtonStyle}
          >
            添加标签
          </button>
        ) : null}

        {statusBadge ? (
          <span style={mobileRecordInlineStatusStyle(statusBadge.kind)}>
            {statusBadge.label}
          </span>
        ) : (
          <span style={mobileRecordMetaTextStyle}>无求助</span>
        )}
        <span style={mobileRecordMetaTextStyle}>{visibility}</span>
      </div>

      {tagEditorOpen && canEdit && isPlantArchive ? (
        <select
          onChange={async (event) => {
            const newTag = event.target.value;
            event.target.value = "";
            event.target.blur();
            if (!newTag) return;
            await onAddTag(newTag);
          }}
          defaultValue=""
          style={mobileRecordTagEditorSelectStyle}
          aria-label="选择标签"
        >
          <option value="">选择标签</option>
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

function MobileRecordEditPanel({
  item,
  onClose,
  onSaved,
  onRecordDeleted,
}: {
  item: RecordItem;
  onClose: () => void;
  onSaved: (patch: Partial<RecordItem>) => void;
  onRecordDeleted?: (recordId: string) => void;
}) {
  const [note, setNote] = useState(item.note || "");
  const [timeValue, setTimeValue] = useState(toDateTimeLocalValue(item.record_time));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote(item.note || "");
    setTimeValue(toDateTimeLocalValue(item.record_time));
  }, [item.id, item.note, item.record_time]);

  async function save() {
    if (saving) return;

    const recordTime = timeValue ? new Date(timeValue) : new Date(item.record_time);
    if (Number.isNaN(recordTime.getTime())) {
      showToast("记录时间无效");
      return;
    }

    const patch = {
      note: note.trim(),
      record_time: recordTime.toISOString(),
    };

    setSaving(true);
    const { error } = await supabase
      .from("records")
      .update(patch)
      .eq("id", item.id);
    setSaving(false);

    if (error) {
      showToast("保存记录失败");
      return;
    }

    showToast("记录已更新");
    onSaved(patch);
  }

  return (
    <div style={mobileEditOverlayStyle} onClick={onClose}>
      <section
        style={mobileEditPanelStyle}
        onClick={(event) => event.stopPropagation()}
        aria-label="编辑记录"
      >
        <div style={mobileEditHeaderStyle}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#233223" }}>
            编辑记录
          </div>
          <button type="button" onClick={onClose} style={mobileEditCloseButtonStyle}>
            取消
          </button>
        </div>

        <label style={mobileEditFieldStyle}>
          <span style={mobileEditLabelStyle}>记录时间</span>
          <input
            type="datetime-local"
            value={timeValue}
            onChange={(event) => setTimeValue(event.target.value)}
            style={mobileEditInputStyle}
          />
        </label>

        <label style={mobileEditFieldStyle}>
          <span style={mobileEditLabelStyle}>记录内容</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={5}
            style={mobileEditTextareaStyle}
          />
        </label>

        <label style={mobileEditFieldStyle}>
          <span style={mobileEditLabelStyle}>记录地点</span>
          <input
            value="暂不保存地点"
            disabled
            style={mobileEditDisabledInputStyle}
            aria-label="记录地点预留"
          />
        </label>

        <div style={mobileEditFieldStyle}>
          <span style={mobileEditLabelStyle}>图片排序</span>
          <div style={mobileEditHintStyle}>
            当前媒体数据没有可安全持久化的排序字段，本轮不保存排序。
          </div>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          style={mobileEditSaveButtonStyle}
        >
          {saving ? "保存中..." : "保存"}
        </button>

        <div style={mobileEditDeleteWrapStyle}>
          <DeleteRecordButton
            id={item.id}
            onDeleted={onRecordDeleted}
            style={mobileEditDeleteButtonStyle}
          />
        </div>
      </section>
    </div>
  );
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

const mobileRecordMediaGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 8,
} as const;

const mobileRecordMediaButtonStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  borderRadius: 10,
  overflow: "hidden",
  cursor: "pointer",
} as const;

const mobileRecordMediaImageStyle = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  borderRadius: 10,
  display: "block",
  background: "#f3f6f1",
} as const;

const mobileRecordTextMenuRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 32px",
  alignItems: "start",
  gap: 6,
  marginTop: 2,
} as const;

const mobileRecordTextWrapStyle = {
  minWidth: 0,
} as const;

const mobileRecordMoreButtonStyle = {
  width: 32,
  height: 32,
  borderRadius: 999,
  border: "none",
  background: "transparent",
  color: "#6f7a6b",
  fontSize: 22,
  lineHeight: 1,
  cursor: "pointer",
} as const;

const mobileRecordMenuStyle = {
  position: "absolute",
  top: 34,
  right: 0,
  zIndex: 30,
  width: 154,
  border: "1px solid #e3eadf",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 12px 30px rgba(39, 55, 36, 0.14)",
  padding: 5,
  display: "grid",
  gap: 2,
} as const;

const mobileRecordMenuItemStyle = {
  width: "100%",
  minHeight: 34,
  border: "none",
  borderRadius: 9,
  background: "transparent",
  color: "#2f3d2e",
  textAlign: "left",
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 650,
  cursor: "pointer",
} as const;

const mobileRecordMenuLinkStyle = {
  ...mobileRecordMenuItemStyle,
  display: "flex",
  alignItems: "center",
  textDecoration: "none",
  boxSizing: "border-box",
} as const;

const mobileRecordSubMenuItemStyle = {
  ...mobileRecordMenuItemStyle,
  minHeight: 30,
  marginLeft: 8,
  width: "calc(100% - 8px)",
  color: "#55704f",
  background: "#f8fbf6",
  fontSize: 12,
} as const;

const mobileRecordMetaWrapStyle = {
  display: "grid",
  gap: 5,
  marginTop: 4,
  marginBottom: 4,
} as const;

const mobileRecordMetaRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  color: "#7a8577",
  fontSize: 12,
  lineHeight: 1.35,
} as const;

const mobileRecordMetaTagsButtonStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
} as const;

const mobileRecordAddTagButtonStyle = {
  border: "none",
  background: "transparent",
  color: "#adb7a8",
  padding: 0,
  fontSize: 12,
  cursor: "pointer",
} as const;

const mobileRecordMetaTextStyle = {
  color: "#7c8878",
} as const;

function mobileRecordInlineStatusStyle(kind: "help" | "resolved") {
  return {
    color: kind === "help" ? "#9a6232" : "#3f7a49",
    fontWeight: 650,
  } as const;
}

const mobileRecordTagEditorSelectStyle = {
  width: "fit-content",
  maxWidth: "100%",
  height: 28,
  borderRadius: 999,
  border: "1px solid #dfe8da",
  background: "#fff",
  color: "#536050",
  fontSize: 12,
  padding: "0 8px",
} as const;

const mobileEditOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 2400,
  background: "rgba(30, 45, 30, 0.24)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: "64px 10px calc(68px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
} as const;

const mobileEditPanelStyle = {
  width: "100%",
  maxWidth: 560,
  maxHeight: "80vh",
  overflowY: "auto",
  border: "1px solid #dfe9d7",
  borderRadius: "22px 22px 18px 18px",
  background: "#fff",
  padding: 14,
  boxShadow: "0 -12px 36px rgba(41, 65, 35, 0.18)",
} as const;

const mobileEditHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
} as const;

const mobileEditCloseButtonStyle = {
  border: "1px solid #dfe7d9",
  borderRadius: 999,
  background: "#fff",
  color: "#5f6f5b",
  fontSize: 13,
  fontWeight: 700,
  padding: "7px 12px",
  cursor: "pointer",
} as const;

const mobileEditFieldStyle = {
  display: "grid",
  gap: 6,
  marginTop: 12,
} as const;

const mobileEditLabelStyle = {
  color: "#6f7b69",
  fontSize: 12,
  fontWeight: 700,
} as const;

const mobileEditInputStyle = {
  width: "100%",
  height: 38,
  borderRadius: 12,
  border: "1px solid #dfe8da",
  padding: "0 10px",
  fontSize: 14,
  boxSizing: "border-box",
} as const;

const mobileEditTextareaStyle = {
  width: "100%",
  minHeight: 120,
  borderRadius: 12,
  border: "1px solid #dfe8da",
  padding: 10,
  fontSize: 14,
  lineHeight: 1.6,
  resize: "vertical",
  boxSizing: "border-box",
} as const;

const mobileEditDisabledInputStyle = {
  ...mobileEditInputStyle,
  color: "#9aa59a",
  background: "#f8faf6",
} as const;

const mobileEditHintStyle = {
  color: "#8a9588",
  fontSize: 12,
  lineHeight: 1.6,
} as const;

const mobileEditSaveButtonStyle = {
  width: "100%",
  height: 40,
  marginTop: 14,
  borderRadius: 999,
  border: "1px solid #b9d9b2",
  background: "#f2faef",
  color: "#2f6634",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
} as const;

const mobileEditDeleteWrapStyle = {
  marginTop: 16,
  paddingTop: 12,
  borderTop: "1px solid #f1e1dd",
  display: "flex",
  justifyContent: "center",
} as const;

const mobileEditDeleteButtonStyle = {
  color: "#b33a2c",
  fontSize: "13px",
  fontWeight: 800,
  padding: "8px 12px",
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
