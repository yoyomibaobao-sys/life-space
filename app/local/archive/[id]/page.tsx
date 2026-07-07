"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import ArchiveRecordCard from "@/components/archive-detail/ArchiveRecordCard";
import ArchiveLightbox from "@/components/archive-detail/ArchiveLightbox";
import ArchiveDetailHeaderView, {
  type ArchiveProfileFieldSave,
} from "@/components/archive-ui/ArchiveDetailHeaderView";
import ArchiveRecordComposer from "@/components/archive-ui/ArchiveRecordComposer";
import ArchiveTimeline from "@/components/archive-ui/ArchiveTimeline";
import { supabase } from "@/lib/supabase";
import type {
  ArchiveDetailArchive,
  LightboxImage,
  RecordItem,
} from "@/lib/archive-detail-types";
import type { MediaItem } from "@/lib/domain-types";
import type {
  ArchiveProjectView,
} from "@/components/archive-ui/types";
import {
  createLocalRecord,
  deleteLocalArchive,
  deleteLocalRecord,
  getLocalArchiveDetail,
  updateLocalArchiveFields,
  updateLocalRecordFields,
  type LocalArchiveOwnerContext,
  type LocalArchiveDetail,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
  getDefaultSystemNames,
  type ArchiveCategory,
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

function getOngoingDays(createdAt?: string | null) {
  if (!createdAt) return null;

  const startedAt = new Date(createdAt);
  if (Number.isNaN(startedAt.getTime())) return null;

  const startDate = new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.max(1, Math.floor((today - startDate) / dayMs) + 1);
}

function getLocalOwnerLabel(
  archive: LocalArchiveDetail["archive"],
  ownerContext?: LocalArchiveOwnerContext | null
) {
  if (!archive.local_owner_user_id) return "未归属账号";
  if (archive.local_owner_user_id === ownerContext?.userId) return "已归属当前账号";
  return "已归属其他账号";
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
  const [timeMode, setTimeMode] = useState<"now" | "custom">("now");
  const [customTime, setCustomTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<LocalRecordWithImages | null>(null);
  const [localRecordItems, setLocalRecordItems] = useState<RecordItem[]>([]);
  const [localLightboxImages, setLocalLightboxImages] = useState<LightboxImage[]>([]);
  const [localLightboxIndex, setLocalLightboxIndex] = useState(0);
  const [localLightboxRecord, setLocalLightboxRecord] =
    useState<RecordItem | null>(null);
  const [deleteArchiveOpen, setDeleteArchiveOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [ownerContext, setOwnerContext] = useState<LocalArchiveOwnerContext | null>(null);
  const localRecordObjectUrlsRef = useRef<string[]>([]);

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
      setOwnerContext(ownerContext);
      const nextDetail = await getLocalArchiveDetail(archiveId, ownerContext);
      setDetail(nextDetail);
      setLocalRecordItems(nextDetail ? buildLocalRecordItems(nextDetail.records) : []);
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

  useEffect(() => {
    return () => {
      revokeLocalRecordUrls();
    };
  }, []);

  function revokeLocalRecordUrls() {
    localRecordObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localRecordObjectUrlsRef.current = [];
  }

  function buildLocalRecordItems(records: LocalRecordWithImages[]): RecordItem[] {
    revokeLocalRecordUrls();

    return records.map((record) => ({
      id: record.id,
      note: record.note,
      record_time: record.record_time,
      visibility: "private",
      status_tag: null,
      comment_count: 0,
      media: record.images.map((image) => {
        const url = URL.createObjectURL(image.blob);
        localRecordObjectUrlsRef.current.push(url);
        return {
          id: image.id,
          record_id: record.id,
          type: "image",
          url,
          display_url: url,
          thumb_url: url,
          display_thumb_url: url,
          mime_type: image.mime_type,
          original_filename: image.name,
          size_bytes: image.cached_size || image.original_size || null,
          width: image.width || null,
          height: image.height || null,
          sort_order: image.sort_order,
          created_at: image.created_at,
        } satisfies MediaItem;
      }),
    }));
  }

  function openLocalRecordItemLightbox(
    mediaItems: MediaItem[],
    imageIndex: number,
    record: RecordItem
  ) {
    const images = mediaItems
      .map((item, index) => ({
        id: item.id,
        recordId: item.record_id,
        url: item.display_url || item.url || item.file_url || "",
        alt: item.original_filename || `本地记录图片 ${index + 1}`,
      }))
      .filter((item) => Boolean(item.url));

    if (!images.length) return;

    setLocalLightboxImages(images);
    setLocalLightboxIndex(Math.max(0, Math.min(imageIndex, images.length - 1)));
    setLocalLightboxRecord(record);
  }

  function closeLocalLightbox() {
    setLocalLightboxImages([]);
    setLocalLightboxIndex(0);
    setLocalLightboxRecord(null);
  }

  function appendFiles(files: FileList | null) {
    const images = fileListToArray(files);
    if (images.length === 0) return;
    setSelectedFiles((current) => [...current, ...images].slice(0, 12));
  }

  async function handleAddRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!archiveId || saving) return;

    const recordTime =
      timeMode === "custom" && customTime ? new Date(customTime) : new Date();
    if (Number.isNaN(recordTime.getTime())) {
      showToast("记录时间无效");
      return;
    }

    setSaving(true);
    try {
      await createLocalRecord({
        archive_id: archiveId,
        note,
        image_files: selectedFiles,
        record_time: recordTime.toISOString(),
      });
      setNote("");
      setSelectedFiles([]);
      setTimeMode("now");
      setCustomTime("");
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
      const deletedRecordId = recordToDelete.id;
      await deleteLocalRecord(recordToDelete.id);
      showToast("本地记录已删除");
      setRecordToDelete(null);
      if (localLightboxRecord?.id === deletedRecordId) {
        closeLocalLightbox();
      }
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
      router.push("/archive?source=local");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除本地项目失败");
    }
  }

  async function updateLocalArchiveProfile(
    updates: Parameters<typeof updateLocalArchiveFields>[1],
    successMessage: string
  ) {
    if (!archiveId) return;

    try {
      await updateLocalArchiveFields(archiveId, updates, ownerContext);
      showToast(successMessage);
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "更新本地项目失败");
    }
  }

  async function saveLocalArchiveProfileField(change: ArchiveProfileFieldSave) {
    if (!detail) return;

    const updates: Parameters<typeof updateLocalArchiveFields>[1] = {};

    if (change.field === "title") {
      const cleanTitle = change.value.trim();
      if (!cleanTitle) throw new Error("项目名称不能为空");
      if (cleanTitle !== (detail.archive.title || "")) updates.title = cleanTitle;
    }

    if (change.field === "category") {
      if (change.value !== detail.archive.category) {
        updates.category = change.value;
      }
    }

    if (change.field === "systemName") {
      const cleanName = change.value.name.trim();
      if (!cleanName) throw new Error("系统名不能为空");
      if (cleanName !== (detail.archive.system_name || detail.archive.species_name || "")) {
        updates.system_name = cleanName;
      }
    }

    if (change.field === "source") {
      const cleanSource = change.value.trim();
      if ((cleanSource || null) !== (detail.archive.source || null)) {
        updates.source = cleanSource || null;
      }
    }

    if (change.field === "note") {
      const cleanNote = change.value.trim();
      if ((cleanNote || null) !== (detail.archive.note || null)) {
        updates.note = cleanNote || null;
      }
    }

    if (Object.keys(updates).length === 0) return;
    await updateLocalArchiveProfile(updates, "本地项目档案已更新");
  }

  if (loading) {
    return <main style={pageStyle}>正在读取本地项目...</main>;
  }

  if (error || !detail) {
    return (
      <main style={pageStyle}>
        <section style={panelStyle}>
          <p style={{ margin: 0 }}>{error || "本地项目不存在"}</p>
          <Link href="/archive?source=local" style={backButtonStyle}>
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
  const latestUpdate = records[0]?.record_time || archive.updated_at || archive.created_at;
  const ongoingDays = getOngoingDays(archive.created_at);
  const ownerLabel = getLocalOwnerLabel(archive, ownerContext);
  const localSystemNameLabel = archive.category === "plant" ? "系统植物名 *" : "系统名 *";
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
    visibilityLabel: "本地离线",
    visibilityTone: "neutral",
  };
  const localProfileRows = [
    {
      label: "项目名称 *",
      value: archive.title || "未命名项目",
      field: "title" as const,
    },
    {
      label: "种类",
      value: getArchiveCategoryLabel(archive.category),
      field: "category" as const,
    },
    {
      label: localSystemNameLabel,
      value: archive.system_name || archive.species_name || "未填写",
      field: "systemName" as const,
    },
    {
      label: "来源",
      value: archive.source || "未填写",
      field: "source" as const,
    },
    {
      label: "备注",
      value: archive.note || "未填写",
      field: "note" as const,
    },
    { label: "创建时间", value: formatDate(archive.created_at) || "暂无" },
    { label: "最近更新", value: formatDate(latestUpdate) || "暂无" },
    { label: "记录数", value: `${records.length}` },
    { label: "持续天数", value: ongoingDays ? `已持续 ${ongoingDays} 天` : "暂无" },
  ];
  const localArchiveRecordShell: ArchiveDetailArchive = {
    id: archive.id,
    user_id: archive.local_owner_user_id || "local",
    title: archive.title || "本地项目",
    category: archive.category,
    created_at: archive.created_at,
    last_record_time: archive.updated_at,
    is_public: false,
    default_record_visibility: "private",
    record_count: records.length,
    status: null,
    species_id: archive.plant_id,
    species_name_snapshot: archive.species_name,
    system_name: archive.system_name,
    source: "local",
    note: archive.note,
    help_status: null,
  };
  const localLightboxRecordIndex = localLightboxRecord
    ? localRecordItems.findIndex((record) => record.id === localLightboxRecord.id)
    : -1;
  const localLightboxMetaText = localLightboxRecord
    ? `${localLightboxRecordIndex === 0 ? "最新进展 · " : ""}第 ${getDayNumber(
        startTime,
        localLightboxRecord.record_time
      )} 天 · ${formatDate(localLightboxRecord.record_time)}`
    : "";
  const localSystemNameUsesCandidates =
    archive.category === "plant" ||
    archive.category === "system" ||
    archive.category === "insect_fish";
  const localSystemNameCandidates =
    archive.category === "system" || archive.category === "insect_fish"
      ? getDefaultSystemNames(archive.category).map((name) => ({ label: name }))
      : [];

  return (
    <main style={pageStyle}>
      <section style={headerStyle}>
        <Link href="/archive?source=local" style={backLinkStyle}>
          返回本地项目
        </Link>
        <ArchiveDetailHeaderView
          project={projectView}
          eyebrow="本地档案"
          latestUpdateText={
            `最近更新 ${formatDate(latestUpdate) || "暂无"}`
          }
          recordCountText={`记录 ${records.length}`}
          durationText={ongoingDays ? `已持续 ${ongoingDays} 天` : undefined}
          hint={`只保存在这台设备，不上传云端。本地分类独立于云空间。${ownerLabel ? ` · ${ownerLabel}` : ""}`}
          profileRows={localProfileRows}
          profileEditor={{
            values: {
              title: archive.title || "",
              category: archive.category,
              systemName: archive.system_name || archive.species_name || "",
              source: archive.source || "",
              note: archive.note || "",
            },
            onSaveField: saveLocalArchiveProfileField,
            systemNameMode: localSystemNameUsesCandidates ? "candidate" : "text",
            systemNameCandidates: localSystemNameCandidates,
            systemNameHint: localSystemNameUsesCandidates
              ? "本地系统名只保存在这台设备；无匹配时可使用当前输入。"
              : "其他种类没有预设系统名，可直接输入。",
          }}
          profileActions={
            <button type="button" onClick={() => setDeleteArchiveOpen(true)} style={localProfileDangerButtonStyle}>
              删除本地项目
            </button>
          }
        />
      </section>

      <ArchiveRecordComposer
        mobileMode={isMobileViewport}
        open={!isMobileViewport || addRecordOpen}
        onClose={() => setAddRecordOpen(false)}
      >
          <form onSubmit={handleAddRecord} style={recordFormStyle}>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="记录今天的变化"
              style={recordInputStyle}
            />

            <div style={recordControlRowStyle}>
              <select
                value={timeMode}
                onChange={(event) =>
                  setTimeMode(event.target.value === "custom" ? "custom" : "now")
                }
                style={recordSelectStyle}
              >
                <option value="now">当前时间</option>
                <option value="custom">自定义时间</option>
              </select>

              {timeMode === "custom" ? (
                <input
                  type="datetime-local"
                  value={customTime}
                  onChange={(event) => setCustomTime(event.target.value)}
                  style={recordTimeInputStyle}
                />
              ) : null}
            </div>

            <div style={imageActionRowStyle}>
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

      <ArchiveTimeline id="archive-records" mobileMode={isMobileViewport}>
        {localRecordItems.map((record, index) => (
            <ArchiveRecordCard
              key={record.id}
              variant="local"
              archive={localArchiveRecordShell}
              item={record}
              index={index}
              mode="owner"
              startTime={startTime}
              isHighlighted={false}
              sameTagLinks={[]}
              onOpenLightbox={(media, mediaIndex, item) =>
                openLocalRecordItemLightbox(media, mediaIndex, item)
              }
              onDeleteMedia={async () => undefined}
              onVisibilityChange={async () => undefined}
              onSetHelpStatus={async () => undefined}
              onRemoveTag={() => undefined}
              onAddTag={async () => undefined}
              onRecordUpdated={async (recordId, patch) => {
                await updateLocalRecordFields(recordId, {
                  note: typeof patch.note === "string" ? patch.note : undefined,
                  record_time:
                    typeof patch.record_time === "string"
                      ? patch.record_time
                      : undefined,
                });
                await loadDetail();
              }}
              onNoteSaved={async () => undefined}
              onRecordDeleted={(recordId) => {
                const target = records.find((item) => item.id === recordId);
                if (target) setRecordToDelete(target);
              }}
              isMobileViewport={isMobileViewport}
            />
        ))}

        {records.length === 0 ? (
          <div style={emptyRecordsStyle}>
            <div>还没有本地记录，添加第一条记录</div>
          </div>
        ) : null}
      </ArchiveTimeline>

      {localLightboxImages.length > 0 ? (
        <ArchiveLightbox
          images={localLightboxImages}
          index={localLightboxIndex}
          onChange={setLocalLightboxIndex}
          isMobileViewport={isMobileViewport}
          metaText={localLightboxMetaText}
          note={localLightboxRecord?.note || ""}
          onClose={closeLocalLightbox}
        />
      ) : null}

      {isMobileViewport && !addRecordOpen ? (
        <button
          type="button"
          onClick={() => setAddRecordOpen(true)}
          style={mobileFloatingAddButtonStyle}
        >
          + 记录
        </button>
      ) : null}

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

const pageStyle = {
  padding: "18px 16px 46px",
  maxWidth: 760,
  margin: "0 auto",
  background: "#fbfcf7",
  color: "#263326",
} satisfies CSSProperties;

const headerStyle = {
  margin: "0 auto 12px",
} satisfies CSSProperties;

const backLinkStyle = {
  display: "inline-flex",
  color: "#617258",
  fontSize: 13,
  textDecoration: "none",
  marginBottom: 10,
} satisfies CSSProperties;

const localProfileDangerButtonStyle = {
  border: "1px solid #efd8d5",
  borderRadius: 999,
  background: "#fff",
  color: "#c85f5a",
  fontSize: 13,
  fontWeight: 800,
  padding: "7px 12px",
  cursor: "pointer",
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
  marginTop: 0,
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const recordInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #dbe5d4",
  borderRadius: 8,
  padding: "10px",
  color: "#263326",
  background: "#fff",
  lineHeight: 1.5,
  outline: "none",
} satisfies CSSProperties;

const recordControlRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
} satisfies CSSProperties;

const recordSelectStyle = {
  height: 34,
  border: "1px solid #dfe5dc",
  borderRadius: 8,
  background: "#fff",
  color: "#52614f",
  padding: "0 9px",
  fontSize: 13,
} satisfies CSSProperties;

const recordTimeInputStyle = {
  ...recordSelectStyle,
  minWidth: 190,
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

const recordMenuItemStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 9,
  border: "none",
  background: "transparent",
  color: "#40583a",
  fontSize: 13,
  fontWeight: 700,
  textAlign: "left",
  cursor: "pointer",
} satisfies CSSProperties;

const recordMenuDangerItemStyle = {
  ...recordMenuItemStyle,
  color: "#a44848",
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
