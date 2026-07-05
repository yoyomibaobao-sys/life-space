"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import ArchiveDetailHeaderView from "@/components/archive-ui/ArchiveDetailHeaderView";
import ArchiveLocalRecordCard from "@/components/archive-ui/ArchiveLocalRecordCard";
import ArchiveRecordComposer from "@/components/archive-ui/ArchiveRecordComposer";
import ArchiveTimeline from "@/components/archive-ui/ArchiveTimeline";
import { supabase } from "@/lib/supabase";
import type {
  ArchiveProjectView,
  ArchiveRecordView,
} from "@/components/archive-ui/types";
import {
  createLocalRecord,
  deleteLocalArchive,
  deleteLocalRecord,
  getLocalArchiveDetail,
  type LocalArchiveDetail,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDayNumber(startValue?: string | null, currentValue?: string | null) {
  if (!startValue || !currentValue) return 1;

  const start = new Date(startValue);
  const current = new Date(currentValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) return 1;

  const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const currentDate = new Date(current.getFullYear(), current.getMonth(), current.getDate());
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.max(1, Math.floor((currentDate.getTime() - startDate.getTime()) / dayMs) + 1);
}

function fileListToArray(files: FileList | null) {
  return Array.from(files || []).filter((file) => file.type.startsWith("image/"));
}

export default function LocalArchiveDetailPage() {
  const params = useParams<{ id: string }>();
  const archiveId = params?.id;
  const router = useRouter();

  const [detail, setDetail] = useState<LocalArchiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [recordMenuOpenId, setRecordMenuOpenId] = useState<string | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<LocalRecordWithImages | null>(null);
  const [deleteArchiveOpen, setDeleteArchiveOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const selectedSizeLabel = useMemo(() => {
    const total = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (total <= 0) return "";
    return `${(total / 1024 / 1024).toFixed(1)} MB`;
  }, [selectedFiles]);

  async function loadDetail() {
    if (!archiveId) return;

    setLoading(true);
    try {
      const { data } = await supabase.auth.getUser();
      const ownerContext = data.user
        ? { userId: data.user.id, email: data.user.email || null }
        : null;
      const nextDetail = await getLocalArchiveDetail(archiveId, ownerContext);
      setDetail(nextDetail);
      setError(nextDetail ? "" : "没有找到这个本地项目");
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取本地项目失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveId]);

  useEffect(() => {
    function updateViewportMode() {
      setIsMobileViewport(window.innerWidth < 760);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  function appendFiles(files: FileList | null) {
    const images = fileListToArray(files);
    if (images.length === 0) return;
    setSelectedFiles((current) => [...current, ...images].slice(0, 12));
  }

  async function handleAddRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!archiveId || saving) return;

    setSaving(true);
    try {
      await createLocalRecord({
        archive_id: archiveId,
        note,
        image_files: selectedFiles,
      });
      setNote("");
      setSelectedFiles([]);
      setAddRecordOpen(false);
      showToast("本地记录已保存");
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存本地记录失败");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteRecord() {
    if (!recordToDelete) return;

    try {
      await deleteLocalRecord(recordToDelete.id);
      showToast("本地记录已删除");
      setRecordToDelete(null);
      setRecordMenuOpenId(null);
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除本地记录失败");
    }
  }

  async function confirmDeleteArchive() {
    if (!archiveId) return;

    try {
      await deleteLocalArchive(archiveId);
      showToast("本地项目已删除");
      router.push("/local/archive");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除本地项目失败");
    }
  }

  if (loading) {
    return <main style={pageStyle}>正在读取本地项目...</main>;
  }

  if (error || !detail) {
    return (
      <main style={pageStyle}>
        <section style={panelStyle}>
          <p style={{ margin: 0 }}>{error || "本地项目不存在"}</p>
          <Link href="/local/archive" style={backButtonStyle}>
            返回本地项目
          </Link>
        </section>
      </main>
    );
  }

  const { archive, records } = detail;
  const startTime = records.length
    ? records[records.length - 1]?.record_time || archive.created_at
    : archive.created_at;
  const projectView: ArchiveProjectView = {
    id: archive.id,
    mode: "local",
    title: archive.title || "未命名项目",
    category: archive.category,
    plantId: archive.plant_id,
    plantSlug: archive.plant_slug,
    categoryLabel: getArchiveCategoryLabel(archive.category),
    categoryIcon: getArchiveCategoryIcon(archive.category),
    systemName: archive.system_name || archive.species_name || "未填写",
    subcategoryLabel: archive.subcategory,
    groupLabel: archive.group_name,
    badges: ["本地离线", "本地分类", "未同步"],
    footerItems: ["只保存在这台设备", "本地分类独立于云空间"],
  };

  return (
    <main style={pageStyle}>
      <section style={headerStyle}>
        <Link href="/local/archive" style={backLinkStyle}>
          返回本地项目
        </Link>
        <ArchiveDetailHeaderView
          project={projectView}
          eyebrow="本地项目记录"
          latestUpdateText={
            archive.note ? `位置 / 备注：${archive.note}` : undefined
          }
          recordCountText={`${records.length} 条记录 · ${records.reduce(
            (sum, record) => sum + record.images.length,
            0
          )} 张图片`}
          hint="本地离线，不上传云端；子分类和分组只保存在本机，未来同步也需要重新确认云端分类。"
          actionSlot={
            <button
              type="button"
              onClick={() => setAddRecordOpen((open) => !open)}
              style={headerAddButtonStyle}
            >
              {addRecordOpen ? "收起" : "+ 添加记录"}
            </button>
          }
        />
      </section>

      {addRecordOpen ? (
        <ArchiveRecordComposer
          mobileMode={isMobileViewport}
          open={addRecordOpen}
          onClose={() => setAddRecordOpen(false)}
        >
          <form onSubmit={handleAddRecord} style={recordFormStyle}>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="记录今天的变化"
              rows={4}
              style={textareaStyle}
            />

            <div style={imageActionRowStyle}>
              <label style={imagePickerStyle}>
                拍照
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    appendFiles(event.target.files);
                    event.target.value = "";
                  }}
                  style={{ display: "none" }}
                />
              </label>
              <label style={imagePickerStyle}>
                选择照片
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    appendFiles(event.target.files);
                    event.target.value = "";
                  }}
                  style={{ display: "none" }}
                />
              </label>
              {selectedFiles.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedFiles([])}
                  style={clearFilesButtonStyle}
                >
                  清空图片
                </button>
              ) : null}
            </div>

            {selectedFiles.length > 0 ? (
              <div style={selectedFilesStyle}>
                已选择 {selectedFiles.length} 张图片
                {selectedSizeLabel ? ` · 原始大小 ${selectedSizeLabel}` : ""}
                <br />
                保存时会生成 App 内部缓存副本，默认不写入系统相册。
              </div>
            ) : null}

            <div style={submitRowStyle}>
              <button type="submit" disabled={saving} style={submitButtonStyle}>
                {saving ? "保存中..." : "保存记录"}
              </button>
            </div>
          </form>
        </ArchiveRecordComposer>
      ) : null}

      <section style={recordsSectionStyle}>
        <div style={recordsHeaderStyle}>
          <h2 style={sectionTitleStyle}>本地记录</h2>
          <span style={countTextStyle}>{records.length} 条</span>
        </div>

        {records.length === 0 ? (
          <div style={emptyRecordsStyle}>
            <div>还没有本地记录。</div>
            <button
              type="button"
              onClick={() => setAddRecordOpen(true)}
              style={emptyAddButtonStyle}
            >
              添加第一条记录
            </button>
          </div>
        ) : (
          <ArchiveTimeline mobileMode={isMobileViewport}>
            <div style={timelineListStyle}>
              {records.map((record, index) => (
                <ArchiveLocalRecordCard
                  key={record.id}
                  record={toLocalRecordView(record, index, startTime)}
                  mobileMode={isMobileViewport}
                  latest={index === 0}
                  actionSlot={
                    <div style={recordMenuWrapStyle}>
                      <button
                        type="button"
                        aria-label="更多本地记录操作"
                        onClick={() =>
                          setRecordMenuOpenId((current) =>
                            current === record.id ? null : record.id
                          )
                        }
                        style={recordMoreButtonStyle}
                      >
                        ⋯
                      </button>
                      {recordMenuOpenId === record.id ? (
                        <div style={recordMenuStyle}>
                          <button
                            type="button"
                            onClick={() => {
                              setRecordToDelete(record);
                              setRecordMenuOpenId(null);
                            }}
                            style={recordMenuDangerItemStyle}
                          >
                            删除本地记录
                          </button>
                        </div>
                      ) : null}
                    </div>
                  }
                />
              ))}
            </div>
          </ArchiveTimeline>
        )}
      </section>

      {isMobileViewport && !addRecordOpen ? (
        <button
          type="button"
          onClick={() => setAddRecordOpen(true)}
          style={mobileFloatingAddButtonStyle}
        >
          + 记录
        </button>
      ) : null}

      <section style={dangerPanelStyle}>
        <div>
          <h2 style={dangerTitleStyle}>本地项目操作</h2>
          <p style={dangerTextStyle}>
            删除后会清理 App 内部 IndexedDB 中的项目、记录和图片缓存，不会影响系统相册中的原图。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDeleteArchiveOpen(true)}
          style={deleteArchiveButtonStyle}
        >
          删除本地项目
        </button>
      </section>

      <ConfirmDialog
        open={Boolean(recordToDelete)}
        title="删除本地记录"
        message="确定要删除这条本地记录吗？这会删除 App 内部缓存的记录图片，不会影响系统相册中的原图。"
        confirmText="确认删除"
        danger
        onClose={() => setRecordToDelete(null)}
        onConfirm={confirmDeleteRecord}
      />

      <ConfirmDialog
        open={deleteArchiveOpen}
        title="删除本地项目"
        message="确定要删除这个本地项目吗？项目下的本地记录和 App 内图片缓存会一起删除，不会删除系统相册里的原图。"
        confirmText="确认删除项目"
        danger
        onClose={() => setDeleteArchiveOpen(false)}
        onConfirm={confirmDeleteArchive}
      />
    </main>
  );
}

function toLocalRecordView(
  record: LocalRecordWithImages,
  index: number,
  startTime?: string | null
): ArchiveRecordView {
  return {
    id: record.id,
    metaText: `${index === 0 ? "最新进展 · " : ""}第 ${getDayNumber(
      startTime,
      record.record_time
    )} 天 · ${formatDate(record.record_time)}`,
    note: record.note,
    media: record.images.map((image) => ({
      id: image.id,
      kind: "blob",
      blob: image.blob,
      alt: image.name || "本地记录图片",
    })),
    footerItems: ["本地记录", "只保存在这台设备"],
    emptyNoteText: "这条记录只有图片。",
  };
}

const pageStyle = {
  minHeight: "calc(100vh - 70px)",
  padding: "22px 16px 48px",
  background: "#fbfcf7",
  color: "#263326",
} satisfies CSSProperties;

const headerStyle = {
  maxWidth: 900,
  margin: "0 auto 12px",
} satisfies CSSProperties;

const backLinkStyle = {
  display: "inline-flex",
  color: "#617258",
  fontSize: 13,
  textDecoration: "none",
  marginBottom: 10,
} satisfies CSSProperties;

const headerTopRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
} satisfies CSSProperties;

const headerMetaStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  color: "#78906e",
  fontSize: 13,
  fontWeight: 700,
} satisfies CSSProperties;

const localBadgeStyle = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid #d9e6d0",
  background: "#f6faf3",
  color: "#4e6b45",
} satisfies CSSProperties;

const headerAddButtonStyle = {
  height: 36,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid #bcd8b5",
  background: "#3f7d3d",
  color: "#fff",
  fontSize: 13,
  fontWeight: 800,
} satisfies CSSProperties;

const titleStyle = {
  margin: "6px 0 4px",
  fontSize: 27,
  lineHeight: 1.22,
} satisfies CSSProperties;

const systemNameStyle = {
  color: "#5e6f58",
  fontSize: 15,
} satisfies CSSProperties;

const classificationRowStyle = {
  marginTop: 8,
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexWrap: "wrap",
} satisfies CSSProperties;

const classificationChipStyle = {
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid #dde8d7",
  background: "#f7fbf4",
  color: "#5e7258",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.35,
} satisfies CSSProperties;

const archiveNoteStyle = {
  margin: "10px 0 0",
  color: "#4f5d4a",
  fontSize: 14,
  lineHeight: 1.7,
  whiteSpace: "pre-line",
} satisfies CSSProperties;

const projectSummaryStyle = {
  marginTop: 10,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  color: "#6f7b69",
  fontSize: 13,
  lineHeight: 1.5,
} satisfies CSSProperties;

const localHintStyle = {
  marginTop: 8,
  color: "#8a9584",
  fontSize: 12,
  lineHeight: 1.6,
} satisfies CSSProperties;

const noticeStyle = {
  maxWidth: 900,
  margin: "0 auto 12px",
  padding: 12,
  borderRadius: 14,
  border: "1px solid #dfe9d8",
  background: "#f6faf3",
  color: "#5f7058",
  fontSize: 13,
  lineHeight: 1.7,
} satisfies CSSProperties;

const panelStyle = {
  maxWidth: 900,
  margin: "0 auto 12px",
  padding: 16,
  borderRadius: 18,
  border: "1px solid #e2eadc",
  background: "#fff",
  boxShadow: "0 8px 22px rgba(42, 66, 34, 0.05)",
} satisfies CSSProperties;

const addRecordPanelStyle = {
  ...panelStyle,
  borderRadius: 20,
  border: "1px solid #dfe9d7",
  boxShadow: "0 12px 30px rgba(42, 66, 34, 0.08)",
} satisfies CSSProperties;

const addRecordHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
} satisfies CSSProperties;

const addRecordCancelStyle = {
  border: "1px solid #dfe7d9",
  borderRadius: 999,
  background: "#fff",
  color: "#5f6f5b",
  fontSize: 13,
  fontWeight: 700,
  padding: "7px 12px",
} satisfies CSSProperties;

const sectionTitleStyle = {
  margin: 0,
  fontSize: 18,
  lineHeight: 1.3,
} satisfies CSSProperties;

const recordFormStyle = {
  marginTop: 12,
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const textareaStyle = {
  width: "100%",
  minHeight: 104,
  border: "1px solid #dbe5d4",
  borderRadius: 14,
  padding: 12,
  color: "#263326",
  background: "#fff",
  resize: "vertical",
  lineHeight: 1.7,
  outline: "none",
} satisfies CSSProperties;

const imageActionRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const imagePickerStyle = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid #cfe0c8",
  background: "#f4fbf1",
  color: "#2f5d2b",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
} satisfies CSSProperties;

const clearFilesButtonStyle = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid #e4d7d7",
  background: "#fff7f7",
  color: "#a44848",
  fontSize: 14,
} satisfies CSSProperties;

const selectedFilesStyle = {
  padding: 10,
  borderRadius: 12,
  background: "#f7faf3",
  color: "#5f6d58",
  fontSize: 13,
  lineHeight: 1.7,
} satisfies CSSProperties;

const submitRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
} satisfies CSSProperties;

const submitButtonStyle = {
  height: 42,
  padding: "0 18px",
  borderRadius: 999,
  border: "1px solid #b7d2b0",
  background: "#3f7d3d",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
} satisfies CSSProperties;

const recordsSectionStyle = {
  ...panelStyle,
  padding: 14,
} satisfies CSSProperties;

const recordsHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
} satisfies CSSProperties;

const countTextStyle = {
  color: "#7c8975",
  fontSize: 13,
} satisfies CSSProperties;

const emptyRecordsStyle = {
  padding: 18,
  borderRadius: 14,
  background: "#f8fbf4",
  color: "#697663",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
} satisfies CSSProperties;

const emptyAddButtonStyle = {
  height: 34,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid #cfe0c8",
  background: "#fff",
  color: "#2f5d2b",
  fontSize: 13,
  fontWeight: 700,
} satisfies CSSProperties;

const timelineListStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const recordCardStyle = {
  position: "relative",
  border: "1px solid #e5ecdf",
  borderRadius: 14,
  background: "#fff",
  padding: 10,
  boxShadow: "0 3px 14px rgba(0,0,0,0.025)",
} satisfies CSSProperties;

const recordMetaStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  color: "#7c8975",
  fontSize: 12,
  marginBottom: 8,
} satisfies CSSProperties;

const recordMenuWrapStyle = {
  position: "relative",
  flexShrink: 0,
} satisfies CSSProperties;

const recordMoreButtonStyle = {
  width: 30,
  height: 28,
  borderRadius: 999,
  border: "1px solid #e4eadf",
  background: "#fff",
  color: "#6c7a63",
  fontSize: 18,
  lineHeight: 1,
  fontWeight: 800,
} satisfies CSSProperties;

const recordMenuStyle = {
  position: "absolute",
  top: 32,
  right: 0,
  zIndex: 10,
  minWidth: 136,
  padding: 6,
  borderRadius: 12,
  border: "1px solid #eadede",
  background: "#fff",
  boxShadow: "0 12px 26px rgba(40, 50, 35, 0.12)",
} satisfies CSSProperties;

const recordMenuDangerItemStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 9,
  border: "none",
  background: "transparent",
  color: "#a44848",
  fontSize: 13,
  textAlign: "left",
} satisfies CSSProperties;

const imageGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
  gap: 8,
  marginBottom: 10,
} satisfies CSSProperties;

const recordSingleImageStyle = {
  width: "100%",
  aspectRatio: "4 / 3",
  objectFit: "cover",
  borderRadius: 12,
  background: "#eef4e8",
  display: "block",
} satisfies CSSProperties;

const recordLeadImageStyle = {
  width: "100%",
  gridColumn: "1 / -1",
  aspectRatio: "4 / 3",
  objectFit: "cover",
  borderRadius: 12,
  background: "#eef4e8",
  display: "block",
} satisfies CSSProperties;

const recordImageStyle = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  borderRadius: 12,
  background: "#eef4e8",
  display: "block",
} satisfies CSSProperties;

const recordNoteStyle = {
  margin: 0,
  color: "#334033",
  fontSize: 15,
  lineHeight: 1.75,
  whiteSpace: "pre-line",
} satisfies CSSProperties;

const recordEmptyNoteStyle = {
  margin: 0,
  color: "#8a9584",
  fontSize: 14,
} satisfies CSSProperties;

const recordFooterStyle = {
  marginTop: 8,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#8a9584",
  fontSize: 12,
} satisfies CSSProperties;

const mobileFloatingAddButtonStyle = {
  position: "fixed",
  right: 16,
  bottom: "calc(78px + env(safe-area-inset-bottom))",
  zIndex: 60,
  height: 42,
  padding: "0 16px",
  borderRadius: 999,
  border: "1px solid #bcd8b5",
  background: "#3f7d3d",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  boxShadow: "0 12px 28px rgba(49, 90, 45, 0.22)",
} satisfies CSSProperties;

const dangerPanelStyle = {
  ...panelStyle,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
} satisfies CSSProperties;

const dangerTitleStyle = {
  margin: 0,
  fontSize: 16,
  color: "#4a3030",
} satisfies CSSProperties;

const dangerTextStyle = {
  margin: "4px 0 0",
  color: "#7f6767",
  fontSize: 13,
  lineHeight: 1.6,
} satisfies CSSProperties;

const deleteArchiveButtonStyle = {
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid #dca0a0",
  background: "#fff7f7",
  color: "#a44848",
  fontWeight: 700,
  fontSize: 14,
} satisfies CSSProperties;

const backButtonStyle = {
  marginTop: 14,
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#eef6e8",
  color: "#2f5f2d",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
} satisfies CSSProperties;
