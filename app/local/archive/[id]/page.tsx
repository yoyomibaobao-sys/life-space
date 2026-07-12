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
import ArchiveCycleTimeline from "@/components/archive-detail/ArchiveCycleTimeline";
import ArchiveLightbox from "@/components/archive-detail/ArchiveLightbox";
import ArchiveDetailHeaderView, {
  type ArchiveProfileFieldSave,
} from "@/components/archive-ui/ArchiveDetailHeaderView";
import ArchiveRecordComposer from "@/components/archive-ui/ArchiveRecordComposer";
import { supabase } from "@/lib/supabase";
import {
  syncLocalArchiveToCloud,
  type LocalToCloudVisibility,
} from "@/lib/local-to-cloud-sync";
import type {
  ArchiveDetailArchive,
  ArchiveCycle,
  LightboxImage,
  RecordItem,
} from "@/lib/archive-detail-types";
import type { MediaItem } from "@/lib/domain-types";
import { formatLocalCycleDate, isLocalDateBefore } from "@/lib/archive-cycle-dates";
import { getArchiveCycleTerminology } from "@/lib/archive-cycle-terminology";
import {
  getSystemNameCandidates,
  type SystemNameCandidate,
} from "@/lib/system-name-candidates";
import type {
  ArchiveProjectView,
} from "@/components/archive-ui/types";
import {
  createLocalRecord,
  createLocalArchiveCycle,
  deleteLocalArchiveCycle,
  deleteLocalArchive,
  deleteLocalRecord,
  endLocalArchiveCycle,
  getLocalArchiveDetail,
  markLocalArchiveForOwner,
  updateLocalArchiveCycleDates,
  updateLocalArchiveFields,
  updateLocalRecordFields,
  type LocalArchiveOwnerContext,
  type LocalArchiveDetail,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
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
  const [cycleBusy, setCycleBusy] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>(undefined);
  const [endSelectedCycleAfterSave, setEndSelectedCycleAfterSave] = useState(false);
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<LocalRecordWithImages | null>(null);
  const [localRecordItems, setLocalRecordItems] = useState<RecordItem[]>([]);
  const [localLightboxImages, setLocalLightboxImages] = useState<LightboxImage[]>([]);
  const [localLightboxIndex, setLocalLightboxIndex] = useState(0);
  const [localLightboxRecord, setLocalLightboxRecord] =
    useState<RecordItem | null>(null);
  const [deleteArchiveOpen, setDeleteArchiveOpen] = useState(false);
  const [transferPromptOpen, setTransferPromptOpen] = useState(false);
  const [transferVisibility, setTransferVisibility] =
    useState<LocalToCloudVisibility>("private");
  const [transferRunning, setTransferRunning] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferErrorDetail, setTransferErrorDetail] = useState("");
  const [showTransferErrorReason, setShowTransferErrorReason] = useState(false);
  const [transferredCloudArchiveId, setTransferredCloudArchiveId] = useState("");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [ownerContext, setOwnerContext] = useState<LocalArchiveOwnerContext | null>(null);
  const [systemNameCandidates, setSystemNameCandidates] = useState<SystemNameCandidate[]>([]);
  const localRecordObjectUrlsRef = useRef<string[]>([]);
  const cycleTerminology = getArchiveCycleTerminology(detail?.archive.category);

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

  useEffect(() => {
    async function loadCandidates() {
      if (!detail?.archive.category) {
        setSystemNameCandidates([]);
        return;
      }

      const candidates = await getSystemNameCandidates({
        category: detail.archive.category,
        currentValue: detail.archive.system_name || detail.archive.species_name,
        mode: "local",
        supabase,
        limit: 200,
      });
      setSystemNameCandidates(candidates);
    }

    void loadCandidates();
  }, [detail?.archive.category, detail?.archive.system_name, detail?.archive.species_name]);

  function revokeLocalRecordUrls() {
    localRecordObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localRecordObjectUrlsRef.current = [];
  }

  function buildLocalRecordItems(records: LocalRecordWithImages[]): RecordItem[] {
    revokeLocalRecordUrls();

    return records.map((record) => ({
      id: record.id,
      cycle_id: record.cycle_id || null,
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

    const activeCycles = [...(detail?.archive.cycles || [])]
      .filter((cycle) => cycle.status === "active")
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    const defaultCycleId = activeCycles[0]?.id || "";
    const effectiveCycleId =
      selectedCycleId === undefined
        ? defaultCycleId
        : selectedCycleId === "" || activeCycles.some((cycle) => cycle.id === selectedCycleId)
          ? selectedCycleId
          : defaultCycleId;
    const selectedActiveCycle = activeCycles.find((cycle) => cycle.id === effectiveCycleId) || null;
    if (
      endSelectedCycleAfterSave &&
      selectedActiveCycle &&
      isLocalDateBefore(recordTime, selectedActiveCycle.started_at)
    ) {
      showToast(cycleTerminology.recordDateBeforeStartMessage);
      return;
    }

    setSaving(true);
    try {
      await createLocalRecord({
        archive_id: archiveId,
        cycle_id: effectiveCycleId || null,
        end_cycle_after_record: endSelectedCycleAfterSave && Boolean(effectiveCycleId),
        note,
        image_files: selectedFiles,
        record_time: recordTime.toISOString(),
      });
      setNote("");
      setSelectedFiles([]);
      setTimeMode("now");
      setCustomTime("");
      setSelectedCycleId(undefined);
      setEndSelectedCycleAfterSave(false);
      setAddRecordOpen(false);
      showToast("本地记录已保存");
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存本地记录失败");
    } finally {
      setSaving(false);
    }
  }

  async function startLocalCycle(startedAt: string) {
    if (!archiveId || cycleBusy) return;
    setCycleBusy(true);
    try {
      const cycle = await createLocalArchiveCycle(archiveId, startedAt, ownerContext);
      showToast(cycleTerminology.startSuccess(cycle.cycle_no));
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : cycleTerminology.startFailure);
    } finally {
      setCycleBusy(false);
    }
  }

  async function endLocalCycle(cycle: ArchiveCycle, endedAt: string) {
    if (!archiveId || cycleBusy) return;
    setCycleBusy(true);
    try {
      await endLocalArchiveCycle(archiveId, cycle.id, endedAt, ownerContext);
      showToast(cycleTerminology.endSuccess(cycle.cycle_no));
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : cycleTerminology.endFailure);
    } finally {
      setCycleBusy(false);
    }
  }

  async function updateLocalCycleDates(
    cycle: ArchiveCycle,
    dates: { startedAt: string; endedAt: string | null }
  ) {
    if (!archiveId || cycleBusy) return;
    setCycleBusy(true);
    try {
      await updateLocalArchiveCycleDates(
        archiveId,
        cycle.id,
        { started_at: dates.startedAt, ended_at: dates.endedAt },
        ownerContext
      );
      showToast(cycleTerminology.datesUpdated(cycle.cycle_no));
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "调整日期失败，请稍后重试。");
    } finally {
      setCycleBusy(false);
    }
  }

  async function deleteLocalCycle(cycle: ArchiveCycle) {
    if (!archiveId || cycleBusy) return false;
    setCycleBusy(true);
    try {
      const movedRecordCount = await deleteLocalArchiveCycle(
        archiveId,
        cycle.id,
        ownerContext
      );
      if (selectedCycleId === cycle.id) {
        setSelectedCycleId(undefined);
        setEndSelectedCycleAfterSave(false);
      }
      showToast(cycleTerminology.deleteSuccess(cycle.cycle_no, movedRecordCount));
      await loadDetail();
      return true;
    } catch (err) {
      console.error("delete local archive cycle failed", err);
      showToast("删除失败，请稍后重试。");
      return false;
    } finally {
      setCycleBusy(false);
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

  async function markCurrentLocalArchiveAsMine() {
    if (!archiveId || !ownerContext?.userId) {
      showToast("请先登录后再标记本地项目归属");
      return;
    }

    try {
      await markLocalArchiveForOwner(archiveId, {
        userId: ownerContext.userId,
        email: ownerContext.email || null,
      });
      showToast("已标记为我的本地项目");
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "标记本地项目失败");
    }
  }

  function openTransferPrompt() {
    if (!detail) return;

    setTransferError("");
    setTransferErrorDetail("");
    setShowTransferErrorReason(false);

    if (!ownerContext?.userId) {
      setTransferError("请先登录，再转到云空间。");
      setTransferPromptOpen(false);
      return;
    }

    if (!detail.archive.title?.trim()) {
      setTransferError("项目名称不能为空。");
      setTransferPromptOpen(false);
      return;
    }

    if (!(detail.archive.system_name || detail.archive.species_name)?.trim()) {
      setTransferError("系统名不能为空。");
      setTransferPromptOpen(false);
      return;
    }

    if (detail.archive.migration_status === "migrating") {
      setTransferError("这个本地项目正在转到云空间，请稍后再试。");
      setTransferPromptOpen(false);
      return;
    }

    setTransferVisibility(detail.archive.migration_visibility || "private");
    setTransferPromptOpen(true);
  }

  async function confirmTransferToCloud() {
    if (!archiveId || !ownerContext?.userId || transferRunning) {
      if (!ownerContext?.userId) {
        setTransferError("请先登录，再转到云空间。");
      }
      return;
    }

    setTransferRunning(true);
    setTransferError("");
    setTransferErrorDetail("");
    setShowTransferErrorReason(false);

    try {
      const result = await syncLocalArchiveToCloud({
        localArchiveId: archiveId,
        ownerContext,
        visibility: transferVisibility,
      });

      if (result.success) {
        setTransferPromptOpen(false);
        setTransferredCloudArchiveId(result.cloudArchiveId);
        setDetail(null);
        setLocalRecordItems([]);
        revokeLocalRecordUrls();
        showToast("已转到云空间");
        return;
      }

      setTransferError(
        "转到云空间未完成，请稍后重试。"
      );
      setTransferErrorDetail(result.error);
      await loadDetail();
    } catch (err) {
      setTransferError("转到云空间未完成，请稍后重试。");
      setTransferErrorDetail(
        err instanceof Error ? err.message : "转到云空间失败，请稍后重试。"
      );
      await loadDetail();
    } finally {
      setTransferRunning(false);
    }
  }

  async function updateLocalArchiveProfile(
    updates: Parameters<typeof updateLocalArchiveFields>[1],
    successMessage: string
  ) {
    if (!archiveId) return;

    try {
      const nextArchive = await updateLocalArchiveFields(archiveId, updates, ownerContext);
      setDetail((current) =>
        current
          ? {
              ...current,
              archive: nextArchive,
            }
          : current
      );
      showToast(successMessage);
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

    if (change.field === "archiveSummary") {
      const cleanSummary = change.value.trim();
      if ((cleanSummary || null) !== (detail.archive.archive_summary || null)) {
        updates.archive_summary = cleanSummary || null;
      }
    }

    if (Object.keys(updates).length === 0) return;
    await updateLocalArchiveProfile(updates, "本地项目档案已更新");
  }

  if (loading) {
    return <main style={pageStyle}>正在读取本地项目...</main>;
  }

  if (transferredCloudArchiveId) {
    return (
      <main style={pageStyle}>
        <section style={transferSuccessPanelStyle}>
          <h1 style={transferSuccessTitleStyle}>已转到云空间</h1>
          <div style={transferSuccessActionsStyle}>
            <Link
              href={`/archive/${transferredCloudArchiveId}`}
              style={transferPrimaryLinkStyle}
            >
              查看云端项目
            </Link>
          </div>
        </section>
      </main>
    );
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
  const cycles = archive.cycles || [];
  const activeCycles = cycles
    .filter((cycle) => cycle.status === "active")
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  const defaultCycleId = activeCycles[0]?.id || "";
  const effectiveCycleId =
    selectedCycleId === undefined
      ? defaultCycleId
      : selectedCycleId === "" || activeCycles.some((cycle) => cycle.id === selectedCycleId)
        ? selectedCycleId
        : defaultCycleId;
  const selectedActiveCycle = activeCycles.find((cycle) => cycle.id === effectiveCycleId) || null;
  const cycleOptions = [...cycles]
    .sort((a, b) => b.cycle_no - a.cycle_no)
    .map((cycle) => ({
      id: cycle.id,
      label: `${cycleTerminology.cycleLabel(cycle.cycle_no)}（${cycle.status === "active" ? "进行中" : "已结束"} · ${formatLocalCycleDate(cycle.started_at)}）`,
    }));
  const startTime = records.length
    ? records[records.length - 1]?.record_time || archive.created_at
    : archive.created_at;
  const latestUpdate = records[0]?.record_time || archive.updated_at || archive.created_at;
  const ongoingDays = getOngoingDays(archive.created_at);
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
    visibilityLabel: null,
    visibilityTone: "neutral",
    storageLabel: "本机",
    storageTone: "device",
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
    {
      label: "项目摘要",
      value: archive.archive_summary || "未填写",
      field: "archiveSummary" as const,
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
    archive_summary: archive.archive_summary,
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
    localSystemNameUsesCandidates ? systemNameCandidates : [];

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
          hint="只保存在这台设备，不上传云端。本地分类独立于云空间。"
          actionSlot={
            <div style={headerActionSlotStyle}>
              {!archive.local_owner_user_id && ownerContext?.userId ? (
                <button
                  type="button"
                  onClick={markCurrentLocalArchiveAsMine}
                  style={markOwnerButtonStyle}
                >
                  标记归属
                </button>
              ) : null}
              <button
                type="button"
                onClick={openTransferPrompt}
                disabled={transferRunning || archive.migration_status === "migrating"}
                style={{
                  ...transferActionButtonStyle,
                  opacity:
                    transferRunning || archive.migration_status === "migrating"
                      ? 0.55
                      : 1,
                  cursor:
                    transferRunning || archive.migration_status === "migrating"
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                转到云空间
              </button>
            </div>
          }
          profileRows={localProfileRows}
          profileEditor={{
            values: {
              title: archive.title || "",
              category: archive.category,
              systemName: archive.system_name || archive.species_name || "",
              source: archive.source || "",
              note: archive.note || "",
              archiveSummary: archive.archive_summary || "",
            },
            onSaveField: saveLocalArchiveProfileField,
            systemNameMode: localSystemNameUsesCandidates ? "candidate" : "text",
            systemNameCandidates: localSystemNameCandidates,
            systemNameHint: localSystemNameUsesCandidates
              ? "本地系统名只保存在这台设备；无匹配时可使用当前输入。"
              : "其他种类没有预设系统名，可直接输入。",
          }}
          profileActions={
            <div style={localProfileActionsStyle}>
              <button type="button" onClick={() => setDeleteArchiveOpen(true)} style={localProfileDangerButtonStyle}>
                删除本地项目
              </button>
            </div>
          }
        />
      </section>

      {transferError ? (
        <div style={transferErrorStyle}>
          <div>{transferError}</div>
          {transferErrorDetail ? (
            <div>
              <button
                type="button"
                onClick={() => setShowTransferErrorReason((current) => !current)}
                style={transferReasonButtonStyle}
              >
                {showTransferErrorReason ? "收起原因" : "查看原因"}
              </button>
              {showTransferErrorReason ? (
                <div style={transferReasonTextStyle}>{transferErrorDetail}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : archive.migration_status === "failed" && archive.migration_error ? (
        <div style={transferErrorStyle}>
          <div>转到云空间未完成，请稍后重试。</div>
          <button
            type="button"
            onClick={() => setShowTransferErrorReason((current) => !current)}
            style={transferReasonButtonStyle}
          >
            {showTransferErrorReason ? "收起原因" : "查看原因"}
          </button>
          {showTransferErrorReason ? (
            <div style={transferReasonTextStyle}>{archive.migration_error}</div>
          ) : null}
        </div>
      ) : null}

      {transferPromptOpen ? (
        <div
          style={transferOverlayStyle}
          onClick={() => {
            if (!transferRunning) setTransferPromptOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="local-to-cloud-title"
            style={transferDialogStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={transferPanelHeaderStyle}>
              <h2 id="local-to-cloud-title" style={transferTitleStyle}>
                转到云空间
              </h2>
            </div>
            <p style={transferTextStyle}>
              转成功后，本地项目会从本地列表移除。
              <br />
              手机相册和本地照片不会删除。
            </p>
            <div style={transferVisibilityGroupStyle} aria-label="云端可见性">
              <label style={transferVisibilityOptionStyle}>
                <input
                  type="radio"
                  name="local-to-cloud-visibility"
                  value="private"
                  checked={transferVisibility === "private"}
                  onChange={() => setTransferVisibility("private")}
                  disabled={transferRunning}
                />
                <span>
                  <strong>仅自己可见</strong>
                </span>
              </label>
              <label style={transferVisibilityOptionStyle}>
                <input
                  type="radio"
                  name="local-to-cloud-visibility"
                  value="public"
                  checked={transferVisibility === "public"}
                  onChange={() => setTransferVisibility("public")}
                  disabled={transferRunning}
                />
                <span>
                  <strong>公开发现</strong>
                  <small>公开后别人可以在发现页看到，不会自动发布到集市或求助。</small>
                </span>
              </label>
            </div>
            <div style={transferActionRowStyle}>
              <button
                type="button"
                onClick={confirmTransferToCloud}
                disabled={transferRunning}
                style={transferPrimaryButtonStyle}
              >
                {transferRunning ? "正在转到云空间…" : "转到云空间"}
              </button>
              <button
                type="button"
                onClick={() => setTransferPromptOpen(false)}
                disabled={transferRunning}
                style={transferSecondaryButtonStyle}
              >
                取消
              </button>
            </div>
          </section>
        </div>
      ) : null}

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

            {activeCycles.length > 0 ? (
              <label style={recordCycleSelectLabelStyle}>
                <span>{cycleTerminology.assignLabel}</span>
                <select
                  value={effectiveCycleId}
                  onChange={(event) => {
                    setSelectedCycleId(event.target.value);
                    if (!event.target.value) setEndSelectedCycleAfterSave(false);
                  }}
                  style={recordSelectStyle}
                >
                  {activeCycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycleTerminology.cycleLabel(cycle.cycle_no)}（{formatLocalCycleDate(cycle.started_at)}开始）
                    </option>
                  ))}
                  <option value="">{cycleTerminology.unassignedOption}</option>
                </select>
              </label>
            ) : null}

            {selectedActiveCycle ? (
              <label style={recordEndCycleLabelStyle}>
                <input
                  type="checkbox"
                  checked={endSelectedCycleAfterSave}
                  onChange={(event) => setEndSelectedCycleAfterSave(event.target.checked)}
                />
                {cycleTerminology.selectedEndAction}
              </label>
            ) : null}

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

      <ArchiveCycleTimeline
        cycles={cycles}
        records={localRecordItems}
        category={archive.category}
        mobileMode={isMobileViewport}
        canManage
        busy={cycleBusy}
        onStartCycle={startLocalCycle}
        onEndCycle={endLocalCycle}
        onUpdateCycleDates={updateLocalCycleDates}
        onDeleteCycle={deleteLocalCycle}
        emptyState={
          <div style={emptyRecordsStyle}>
            <div>还没有本地记录，添加第一条记录</div>
          </div>
        }
        renderRecord={(record, index) => (
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
              cycleOptions={cycleOptions}
              onCycleChange={async (recordId, cycleId) => {
                try {
                  await updateLocalRecordFields(recordId, { cycle_id: cycleId });
                  showToast(
                    cycleId
                      ? cycleTerminology.recordAssignedSuccess
                      : cycleTerminology.recordUnassignedSuccess
                  );
                  await loadDetail();
                } catch (err) {
                  showToast(
                    err instanceof Error
                      ? err.message
                      : `${cycleTerminology.adjustLabel}失败，请稍后重试。`
                  );
                }
              }}
              isMobileViewport={isMobileViewport}
            />
        )}
      />

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

const localProfileActionsStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
} satisfies CSSProperties;

const headerActionSlotStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
} satisfies CSSProperties;

const markOwnerButtonStyle = {
  border: "1px solid #d8e5d1",
  borderRadius: 999,
  background: "#fff",
  color: "#617258",
  fontSize: 13,
  fontWeight: 800,
  padding: "7px 12px",
  cursor: "pointer",
} satisfies CSSProperties;

const transferActionButtonStyle = {
  border: "1px solid #cbdcc4",
  borderRadius: 999,
  background: "#f7fbf4",
  color: "#44633b",
  fontSize: 13,
  fontWeight: 800,
  padding: "7px 12px",
  cursor: "pointer",
} satisfies CSSProperties;

const transferOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 18,
  background: "rgba(38, 51, 38, 0.28)",
  boxSizing: "border-box",
} satisfies CSSProperties;

const transferDialogStyle = {
  width: "min(440px, 100%)",
  padding: "18px 20px",
  borderRadius: 18,
  border: "1px solid #dbe8d2",
  background: "#fffdf8",
  boxShadow: "0 24px 60px rgba(29, 45, 26, 0.22)",
} satisfies CSSProperties;

const transferPanelHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
} satisfies CSSProperties;

const transferEyebrowStyle = {
  margin: "0 0 4px",
  color: "#6f7d69",
  fontSize: 12,
  fontWeight: 800,
} satisfies CSSProperties;

const transferTitleStyle = {
  margin: 0,
  fontSize: 19,
  lineHeight: 1.3,
  color: "#263326",
} satisfies CSSProperties;

const transferCancelIconStyle = {
  border: "1px solid #e2e7dd",
  borderRadius: 999,
  background: "#fff",
  color: "#6f786b",
  fontSize: 13,
  fontWeight: 700,
  padding: "6px 10px",
  cursor: "pointer",
} satisfies CSSProperties;

const transferTextStyle = {
  margin: "12px 0 0",
  color: "#4f5d4a",
  fontSize: 14,
  lineHeight: 1.8,
} satisfies CSSProperties;

const transferVisibilityGroupStyle = {
  display: "grid",
  gap: 8,
  marginTop: 12,
} satisfies CSSProperties;

const transferVisibilityOptionStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid #e2eadc",
  background: "#fff",
  color: "#344230",
  lineHeight: 1.5,
} satisfies CSSProperties;

const transferActionRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 14,
  flexWrap: "wrap",
} satisfies CSSProperties;

const transferPrimaryButtonStyle = {
  border: "1px solid #4f7d3e",
  borderRadius: 999,
  background: "#3f7d3d",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  padding: "9px 16px",
  cursor: "pointer",
} satisfies CSSProperties;

const transferSecondaryButtonStyle = {
  border: "1px solid #dfe7d9",
  borderRadius: 999,
  background: "#fff",
  color: "#5f6f5b",
  fontSize: 14,
  fontWeight: 700,
  padding: "9px 14px",
  cursor: "pointer",
} satisfies CSSProperties;

const transferErrorStyle = {
  maxWidth: 900,
  margin: "0 auto 12px",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid #efd8c8",
  background: "#fff7ef",
  color: "#9a4a14",
  fontSize: 13,
  lineHeight: 1.7,
} satisfies CSSProperties;

const transferReasonButtonStyle = {
  marginTop: 6,
  border: 0,
  background: "transparent",
  color: "#7a5c24",
  fontSize: 12,
  fontWeight: 800,
  padding: 0,
  cursor: "pointer",
} satisfies CSSProperties;

const transferReasonTextStyle = {
  marginTop: 6,
  color: "#8a6b36",
  fontSize: 12,
  lineHeight: 1.6,
  wordBreak: "break-word",
} satisfies CSSProperties;

const transferSuccessPanelStyle = {
  maxWidth: 720,
  margin: "34px auto",
  padding: "24px 26px",
  borderRadius: 22,
  border: "1px solid #dfe9d8",
  background: "#fff",
  boxShadow: "0 14px 34px rgba(42, 66, 34, 0.08)",
} satisfies CSSProperties;

const transferSuccessEyebrowStyle = {
  margin: 0,
  color: "#5d7c2f",
  fontSize: 13,
  fontWeight: 800,
} satisfies CSSProperties;

const transferSuccessTitleStyle = {
  margin: "8px 0 6px",
  fontSize: 24,
  lineHeight: 1.25,
  color: "#253221",
} satisfies CSSProperties;

const transferSuccessTextStyle = {
  margin: 0,
  color: "#5f6b5a",
  fontSize: 14,
  lineHeight: 1.8,
} satisfies CSSProperties;

const transferSuccessActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 18,
} satisfies CSSProperties;

const transferPrimaryLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 40,
  padding: "0 16px",
  borderRadius: 999,
  background: "#3f7d3d",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
} satisfies CSSProperties;

const transferSecondaryLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 40,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid #dfe7d9",
  color: "#5f6f5b",
  fontWeight: 700,
  textDecoration: "none",
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
  display: "block",
} satisfies CSSProperties;

const recordCycleSelectLabelStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  color: "#5b6b58",
  fontSize: 13,
} satisfies CSSProperties;

const recordEndCycleLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginTop: 8,
  color: "#5b6b58",
  fontSize: 13,
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
  marginTop: 10,
} satisfies CSSProperties;

const recordSelectStyle = {
  height: 32,
  border: "1px solid #dfe5dc",
  borderRadius: 6,
  background: "#fff",
  color: "#52614f",
  padding: "0 8px",
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
  marginTop: 10,
} satisfies CSSProperties;

const imagePickerStyle = {
  height: 40,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid #dfe6dc",
  background: "#fff",
  color: "#52614f",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 500,
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
  marginTop: 10,
  padding: 10,
  borderRadius: 12,
  background: "#f7faf3",
  color: "#5f6d58",
  fontSize: 13,
  lineHeight: 1.7,
} satisfies CSSProperties;

const submitRowStyle = {
  display: "flex",
  justifyContent: "flex-start",
  marginTop: 12,
} satisfies CSSProperties;

const submitButtonStyle = {
  height: 40,
  padding: "0 16px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#263326",
  fontWeight: 500,
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
