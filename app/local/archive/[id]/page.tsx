"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
import ArchiveCycleSettings from "@/components/archive-detail/ArchiveCycleSettings";
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
import { formatPreciseDateTime } from "@/lib/date-time";
import {
  getSystemNameCandidates,
  resolveExactSystemNameCandidate,
  resolveSystemNameSelection,
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
  restoreLocalArchiveCycle,
  updateLocalArchiveCycleDates,
  updateLocalArchiveCycleName,
  updateLocalArchiveFields,
  updateLocalRecordFields,
  type LocalArchiveOwnerContext,
  type LocalArchiveDetail,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";
import {
  getArchiveCategoryIcon,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import { readImageCapturedAt } from "@/lib/photo-metadata";
import {
  buildRecordPhotoGroups,
  limitRecordPhotoBatch,
  MAX_RECORD_PHOTOS_PER_ADD,
  type TimedRecordPhoto,
} from "@/lib/record-photo-batches";
import { useLanguage } from "@/lib/i18n/useLanguage";
import {
  deleteQuickCapture,
  getQuickCapture,
  quickCaptureToFiles,
} from "@/lib/quick-capture";
import {
  DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  getArchiveCategoryDepth,
  getLocalArchiveCategoryDepths,
  type ArchiveCategoryDepths,
} from "@/lib/archive-category-settings";

function formatDate(value?: string | null) {
  return formatPreciseDateTime(value);
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
  const { language, t } = useLanguage();
  const archiveCopy = t.archive;
  const recordCopy = t.record;
  const params = useParams<{ id: string }>();
  const archiveId = params?.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const quickCaptureId = searchParams.get("quickCapture") || "";
  const transferRequested = searchParams.get("transfer") === "1";

  const [detail, setDetail] = useState<LocalArchiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [timeMode, setTimeMode] = useState<"exif" | "now" | "custom">("exif");
  const [customTime, setCustomTime] = useState("");
  const [mergeMode, setMergeMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cycleBusy, setCycleBusy] = useState(false);
  const [cycleSettingsSaving, setCycleSettingsSaving] = useState(false);
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
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [categoryDepths, setCategoryDepths] = useState<ArchiveCategoryDepths>({
    ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  });
  const localRecordObjectUrlsRef = useRef<string[]>([]);
  const loadedQuickCaptureIdRef = useRef("");
  const cycleTerminology = getArchiveCycleTerminology(detail?.archive.category, language);

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
      setCategoryDepths(getLocalArchiveCategoryDepths(ownerContext?.userId));
      const nextDetail = await getLocalArchiveDetail(archiveId, ownerContext);
      setDetail(nextDetail);
      setLocalRecordItems(nextDetail ? buildLocalRecordItems(nextDetail.records) : []);
      setError(nextDetail ? "" : archiveCopy.local_not_found);
    } catch (err) {
      setError(err instanceof Error ? err.message : archiveCopy.local_read_failed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveId]);

  useEffect(() => {
    if (transferRequested && detail) setTransferPromptOpen(true);
  }, [detail, transferRequested]);

  useEffect(() => {
    if (!quickCaptureId || loadedQuickCaptureIdRef.current === quickCaptureId) {
      return;
    }
    let cancelled = false;

    async function loadCapturedPhoto() {
      try {
        const capture = await getQuickCapture(quickCaptureId);
        if (!capture || cancelled) return;
        loadedQuickCaptureIdRef.current = quickCaptureId;
        setSelectedFiles((current) => [...quickCaptureToFiles(capture), ...current]);
        setAddRecordOpen(true);
      } catch {
        // The local record form remains available if a temporary capture expired.
      }
    }

    void loadCapturedPhoto();
    return () => {
      cancelled = true;
    };
  }, [quickCaptureId]);

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
    let cancelled = false;
    async function loadCandidates() {
      if (!detail?.archive.category) {
        setSystemNameCandidates([]);
        setCandidatesLoading(false);
        return;
      }

      setCandidatesLoading(true);
      const candidates = await getSystemNameCandidates({
        category: detail.archive.category,
        currentValue: detail.archive.system_name || detail.archive.species_name,
        mode: "local",
        supabase,
        includeOtherCategories: true,
        limit: null,
      });
      if (cancelled) return;
      setSystemNameCandidates(candidates);
      setCandidatesLoading(false);
    }

    void loadCandidates();
    return () => { cancelled = true; };
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
        alt: item.original_filename || `${recordCopy.local_image_alt} ${index + 1}`,
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
    const { accepted, rejectedCount } = limitRecordPhotoBatch(images);

    if (rejectedCount > 0) {
      showToast(
        `${recordCopy.photo_batch_trimmed_prefix} ${MAX_RECORD_PHOTOS_PER_ADD} ${recordCopy.photo_batch_trimmed_suffix}`,
      );
    }

    setSelectedFiles((current) => [...current, ...accepted]);
  }

  async function handleAddRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!archiveId || saving) return;

    const nowISO = new Date().toISOString();
    const customRecordTime =
      timeMode === "custom" && customTime ? new Date(customTime) : null;
    if (customRecordTime && Number.isNaN(customRecordTime.getTime())) {
      showToast(recordCopy.invalid_time);
      return;
    }

    setSaving(true);
    const preparedPhotos: TimedRecordPhoto<File>[] = await Promise.all(
      selectedFiles.map(async (file) => {
        const capturedAt = await readImageCapturedAt(file);
        const recordTimeISO =
          timeMode === "exif" && capturedAt
            ? capturedAt
            : customRecordTime?.toISOString() || nowISO;

        return {
          file,
          capturedAt,
          recordTimeISO,
        };
      }),
    );
    const photoGroups = buildRecordPhotoGroups(preparedPhotos, mergeMode);
    const groupsToSave =
      photoGroups.length > 0
        ? photoGroups
        : [
            {
              photos: [] as TimedRecordPhoto<File>[],
              recordTimeISO: customRecordTime?.toISOString() || nowISO,
            },
          ];

    const activeCycles = detail?.archive.cycle_enabled
      ? [...(detail.archive.cycles || [])]
      .filter((cycle) => cycle.status === "active")
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      : [];
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
      groupsToSave.some((group) =>
        isLocalDateBefore(group.recordTimeISO, selectedActiveCycle.started_at),
      )
    ) {
      showToast(cycleTerminology.recordDateBeforeStartMessage);
      setSaving(false);
      return;
    }

    try {
      for (const [index, group] of groupsToSave.entries()) {
        await createLocalRecord({
          archive_id: archiveId,
          cycle_id: effectiveCycleId || null,
          end_cycle_after_record:
            endSelectedCycleAfterSave &&
            Boolean(effectiveCycleId) &&
            index === groupsToSave.length - 1,
          note,
          image_files: group.photos.map((photo) => photo.file),
          image_captured_at: group.photos.map((photo) => photo.capturedAt),
          record_time: group.recordTimeISO,
        });
      }
      setNote("");
      setSelectedFiles([]);
      setTimeMode("exif");
      setCustomTime("");
      setMergeMode(true);
      setSelectedCycleId(undefined);
      setEndSelectedCycleAfterSave(false);
      setAddRecordOpen(false);
      if (quickCaptureId) {
        await deleteQuickCapture(quickCaptureId).catch(() => undefined);
        loadedQuickCaptureIdRef.current = "";
      }
      showToast(
        groupsToSave.length > 1
          ? `${recordCopy.local_saved_split_prefix} ${groupsToSave.length} ${recordCopy.local_saved_split_suffix}`
          : recordCopy.local_saved,
      );
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : recordCopy.local_save_failed);
    } finally {
      setSaving(false);
    }
  }

  async function startLocalCycle(startedAt: string) {
    if (!archiveId || cycleBusy) return;
    setCycleBusy(true);
    try {
      const cycle = await createLocalArchiveCycle(
        archiveId,
        startedAt,
        ownerContext
      );
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
      showToast(err instanceof Error ? err.message : recordCopy.adjust_failed);
    } finally {
      setCycleBusy(false);
    }
  }

  async function renameLocalCycle(cycle: ArchiveCycle, displayName: string) {
    if (!archiveId || cycleBusy) return;
    setCycleBusy(true);
    try {
      await updateLocalArchiveCycleName(
        archiveId,
        cycle.id,
        displayName,
        ownerContext
      );
      showToast(archiveCopy.cycle_name_saved);
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : archiveCopy.cycle_name_failed);
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
      showToast(recordCopy.delete_failed);
      return false;
    } finally {
      setCycleBusy(false);
    }
  }

  async function restoreLocalCycle(trashEntryId: string) {
    if (!archiveId || cycleBusy) return;
    setCycleBusy(true);
    try {
      await restoreLocalArchiveCycle(archiveId, trashEntryId, ownerContext);
      showToast(archiveCopy.cycle_restored);
      await loadDetail();
    } catch (err) {
      console.error("restore local archive cycle failed", err);
      showToast(
        err instanceof Error ? err.message : archiveCopy.cycle_restore_failed
      );
    } finally {
      setCycleBusy(false);
    }
  }

  async function confirmDeleteRecord() {
    if (!recordToDelete) return;

    try {
      const deletedRecordId = recordToDelete.id;
      await deleteLocalRecord(recordToDelete.id);
      showToast(recordCopy.local_record_deleted);
      setRecordToDelete(null);
      if (localLightboxRecord?.id === deletedRecordId) {
        closeLocalLightbox();
      }
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : recordCopy.local_record_delete_failed);
    }
  }

  async function confirmDeleteArchive() {
    if (!archiveId) return;

    try {
      await deleteLocalArchive(archiveId);
      showToast(archiveCopy.local_project_deleted);
      router.push("/archive?source=local");
    } catch (err) {
      showToast(err instanceof Error ? err.message : archiveCopy.local_project_delete_failed);
    }
  }

  async function markCurrentLocalArchiveAsMine() {
    if (!archiveId || !ownerContext?.userId) {
      showToast(archiveCopy.ownership_login_required);
      return;
    }

    try {
      await markLocalArchiveForOwner(archiveId, {
        userId: ownerContext.userId,
        email: ownerContext.email || null,
      });
      showToast(archiveCopy.ownership_marked);
      await loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : archiveCopy.ownership_failed);
    }
  }

  function openTransferPrompt() {
    if (!detail) return;

    setTransferError("");
    setTransferErrorDetail("");
    setShowTransferErrorReason(false);

    if (!ownerContext?.userId) {
      setTransferError(archiveCopy.transfer_login_required);
      setTransferPromptOpen(false);
      return;
    }

    if (!detail.archive.title?.trim()) {
      setTransferError(`${archiveCopy.project_name_empty}.`);
      setTransferPromptOpen(false);
      return;
    }

    if (!(detail.archive.system_name || detail.archive.species_name)?.trim()) {
      setTransferError(`${archiveCopy.system_name_empty}.`);
      setTransferPromptOpen(false);
      return;
    }

    if (detail.archive.migration_status === "migrating") {
      setTransferError(archiveCopy.transfer_migrating);
      setTransferPromptOpen(false);
      return;
    }

    setTransferVisibility(detail.archive.migration_visibility || "private");
    setTransferPromptOpen(true);
  }

  async function confirmTransferToCloud() {
    if (!archiveId || !ownerContext?.userId || transferRunning) {
      if (!ownerContext?.userId) {
        setTransferError(archiveCopy.transfer_login_required);
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
        showToast(archiveCopy.transferred_to_cloud);
        return;
      }

      setTransferError(archiveCopy.transfer_incomplete);
      setTransferErrorDetail(result.error);
      await loadDetail();
    } catch (err) {
      setTransferError(archiveCopy.transfer_incomplete);
      setTransferErrorDetail(
        err instanceof Error ? err.message : archiveCopy.transfer_failed
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
      showToast(err instanceof Error ? err.message : archiveCopy.local_update_failed);
      throw err;
    }
  }

  async function saveLocalCycleSettings({
    enabled,
  }: {
    enabled: boolean;
  }) {
    if (!archiveId || cycleSettingsSaving) return;
    setCycleSettingsSaving(true);
    try {
      const nextArchive = await updateLocalArchiveFields(
        archiveId,
        {
          cycle_enabled: enabled,
          next_cycle_name: null,
        },
        ownerContext
      );
      setDetail((current) => current ? { ...current, archive: nextArchive } : current);
      showToast(archiveCopy.cycle_setting_saved);
    } catch (err) {
      showToast(err instanceof Error ? err.message : archiveCopy.cycle_setting_failed);
    } finally {
      setCycleSettingsSaving(false);
    }
  }

  async function saveLocalArchiveProfileField(change: ArchiveProfileFieldSave) {
    if (!detail) return;

    const updates: Parameters<typeof updateLocalArchiveFields>[1] = {};

    if (change.field === "title") {
      const cleanTitle = change.value.trim();
      if (!cleanTitle) throw new Error(archiveCopy.project_name_empty);
      if (cleanTitle !== (detail.archive.title || "")) updates.title = cleanTitle;
    }

    if (change.field === "category") {
      if (change.value !== detail.archive.category) {
        const currentName = detail.archive.system_name || detail.archive.species_name || "";
        const exact = resolveExactSystemNameCandidate(systemNameCandidates, currentName);
        updates.category = change.value;
        updates.subcategory = null;
        updates.group_name = null;
        updates.system_name = currentName;
        updates.species_name = change.value === "plant" ? currentName : null;
        updates.plant_id = change.value === "plant" && exact?.category === "plant" ? exact.plantId || null : null;
        updates.plant_slug = change.value === "plant" && exact?.category === "plant" ? exact.plantSlug || null : null;
      }
    }

    if (change.field === "systemName") {
      const cleanName = change.value.name.trim();
      if (!cleanName) throw new Error(archiveCopy.system_name_empty);
      const binding = resolveSystemNameSelection(systemNameCandidates, change.value, detail.archive.category);
      updates.system_name = binding.name;
      updates.category = binding.category;
      updates.species_name = binding.category === "plant" ? binding.name : null;
      updates.plant_id = binding.plantId;
      updates.plant_slug = binding.plantSlug;
      if (binding.category !== detail.archive.category) {
        updates.subcategory = null;
        updates.group_name = null;
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
    await updateLocalArchiveProfile(updates, archiveCopy.local_profile_updated);
  }

  if (loading) {
    return <main style={pageStyle}>{archiveCopy.local_reading}</main>;
  }

  if (transferredCloudArchiveId) {
    return (
      <main style={pageStyle}>
        <section style={transferSuccessPanelStyle}>
          <h1 style={transferSuccessTitleStyle}>{archiveCopy.transferred_to_cloud}</h1>
          <div style={transferSuccessActionsStyle}>
            <Link
              href={`/archive/${transferredCloudArchiveId}`}
              style={transferPrimaryLinkStyle}
            >
              {archiveCopy.view_cloud_project}
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
          <p style={{ margin: 0 }}>{error || archiveCopy.local_not_found}</p>
          <Link href="/archive?source=local" style={backButtonStyle}>
            {archiveCopy.back_to_local_projects}
          </Link>
        </section>
      </main>
    );
  }

  const { archive, records } = detail;
  const cycles = archive.cycles || [];
  const cycleEnabled = typeof archive.cycle_enabled === "boolean"
    ? archive.cycle_enabled
    : cycles.length > 0;
  const activeCycles = (cycleEnabled ? cycles : [])
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
  const cycleOptions = [...(cycleEnabled ? cycles : [])]
    .sort((a, b) => b.cycle_no - a.cycle_no)
    .map((cycle) => ({
      id: cycle.id,
      label: `${cycle.display_name || cycleTerminology.cycleLabel(cycle.cycle_no)} (${cycle.status === "active" ? archiveCopy.ongoing : archiveCopy.ended} · ${formatLocalCycleDate(cycle.started_at)})`,
    }));
  const startTime = records.length
    ? records[records.length - 1]?.record_time || archive.created_at
    : archive.created_at;
  const latestUpdate = records[0]?.record_time || archive.updated_at || archive.created_at;
  const ongoingDays = getOngoingDays(archive.created_at);
  const categoryDepth = getArchiveCategoryDepth(categoryDepths, archive.category);
  const localSystemNameLabel =
    archive.category === "plant"
      ? archiveCopy.system_plant_name_required
      : archiveCopy.system_name_required;
  const localCategoryLabel =
    archive.category === "plant"
      ? archiveCopy.categories.plant_label
      : archive.category === "system"
        ? archiveCopy.categories.system_label
        : archive.category === "insect_fish"
          ? archiveCopy.categories.insect_fish_label
          : archiveCopy.categories.other_label;
  const durationText = ongoingDays
    ? `${archiveCopy.ongoing_days_prefix} ${ongoingDays} ${archiveCopy.days_suffix}`
    : archiveCopy.none;
  const projectView: ArchiveProjectView = {
    id: archive.id,
    mode: "local",
    title: archive.title || archiveCopy.unnamed_project,
    category: archive.category,
    plantId: archive.plant_id,
    plantSlug: archive.plant_slug,
    categoryLabel: localCategoryLabel,
    categoryIcon: getArchiveCategoryIcon(archive.category),
    systemName: archive.system_name || archive.species_name || archiveCopy.not_filled,
    subcategoryLabel: categoryDepth >= 2 ? archive.subcategory : null,
    groupLabel: categoryDepth >= 3 ? archive.group_name : null,
    visibilityLabel: null,
    visibilityTone: "neutral",
    storageLabel: archiveCopy.device,
    storageTone: "device",
  };
  const localProfileRows = [
    {
      label: archiveCopy.project_name_required,
      value: archive.title || archiveCopy.unnamed_project,
      field: "title" as const,
    },
    {
      label: localSystemNameLabel,
      value: archive.system_name || archive.species_name || archiveCopy.not_filled,
      field: "systemName" as const,
    },
    {
      label: archiveCopy.category_required,
      value: localCategoryLabel,
      field: "category" as const,
    },
    {
      label: archiveCopy.source,
      value: archive.source || archiveCopy.not_filled,
      field: "source" as const,
    },
    {
      label: archiveCopy.note,
      value: archive.note || archiveCopy.not_filled,
      field: "note" as const,
    },
    {
      label: archiveCopy.summary,
      value: archive.archive_summary || archiveCopy.not_filled,
      field: "archiveSummary" as const,
    },
    { label: archiveCopy.created_time, value: formatDate(archive.created_at) || archiveCopy.none },
    { label: archiveCopy.latest_update, value: formatDate(latestUpdate) || archiveCopy.none },
    { label: archiveCopy.record_count, value: `${records.length}` },
    { label: archiveCopy.duration_days, value: durationText },
  ];
  const localArchiveRecordShell: ArchiveDetailArchive = {
    id: archive.id,
    user_id: archive.local_owner_user_id || "local",
    title: archive.title || archiveCopy.local_project,
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
    ? `${localLightboxRecordIndex === 0 ? `${archiveCopy.latest_update} · ` : ""}${recordCopy.day_prefix} ${getDayNumber(
        startTime,
        localLightboxRecord.record_time
      )}${recordCopy.day_suffix ? ` ${recordCopy.day_suffix}` : ""} · ${formatDate(localLightboxRecord.record_time)}`
    : "";

  return (
    <main style={pageStyle}>
      <section style={headerStyle}>
        <Link href="/archive?source=local" style={backLinkStyle}>
          {archiveCopy.back_to_local_projects}
        </Link>
        <ArchiveDetailHeaderView
          project={projectView}
          eyebrow={archiveCopy.local_archive}
          latestUpdateText={
            `${archiveCopy.latest_update} ${formatDate(latestUpdate) || archiveCopy.none}`
          }
          recordCountText={`${archiveCopy.records} ${records.length}`}
          durationText={ongoingDays ? durationText : undefined}
          hint={archiveCopy.local_hint}
          actionSlot={
            <div style={headerActionSlotStyle}>
              {!archive.local_owner_user_id && ownerContext?.userId ? (
                <button
                  type="button"
                  onClick={markCurrentLocalArchiveAsMine}
                  style={markOwnerButtonStyle}
                >
                  {archiveCopy.mark_owner}
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
                {archiveCopy.transfer_to_cloud}
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
            systemNameMode: "candidate",
            systemNameCandidates,
            systemNameCandidatesLoading: candidatesLoading,
            systemNameHint: archiveCopy.system_name_helper,
          }}
          profileActions={
            <div style={localProfileActionsStyle}>
              <button type="button" onClick={() => setDeleteArchiveOpen(true)} style={localProfileDangerButtonStyle}>
                {archiveCopy.delete_local_project}
              </button>
            </div>
          }
          profileExtra={
            <div style={localCycleProfileExtraStyle}>
              <ArchiveCycleSettings
                key={archive.id}
                enabled={cycleEnabled}
                busy={cycleSettingsSaving}
                onSave={saveLocalCycleSettings}
              />
              {(archive.trashed_cycles || []).length > 0 ? (
                <section style={localCycleTrashStyle}>
                  <div style={localCycleTrashTitleStyle}>
                    {archiveCopy.deleted_cycles}（{archive.trashed_cycles?.length || 0}）
                  </div>
                  <div style={localCycleTrashHintStyle}>
                    {archiveCopy.deleted_cycles_hint}
                  </div>
                  <div style={localCycleTrashListStyle}>
                    {(archive.trashed_cycles || []).map((item) => (
                      <div key={item.id} style={localCycleTrashRowStyle}>
                        <div style={localCycleTrashNameStyle}>
                          <strong>
                            {item.cycle.display_name ||
                              cycleTerminology.cycleLabel(item.cycle.cycle_no)}
                          </strong>
                          <span>
                            {formatLocalCycleDate(item.cycle.started_at)} · {item.record_ids.length}
                            {language === "en" ? ` ${archiveCopy.records}` : `条${archiveCopy.records}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => restoreLocalCycle(item.id)}
                          disabled={cycleBusy}
                          style={localCycleRestoreButtonStyle}
                        >
                          {archiveCopy.restore_cycle}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
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
                {showTransferErrorReason ? archiveCopy.hide_reason : archiveCopy.view_reason}
              </button>
              {showTransferErrorReason ? (
                <div style={transferReasonTextStyle}>{transferErrorDetail}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : archive.migration_status === "failed" && archive.migration_error ? (
        <div style={transferErrorStyle}>
          <div>{archiveCopy.transfer_incomplete}</div>
          <button
            type="button"
            onClick={() => setShowTransferErrorReason((current) => !current)}
            style={transferReasonButtonStyle}
          >
            {showTransferErrorReason ? archiveCopy.hide_reason : archiveCopy.view_reason}
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
                {archiveCopy.transfer_to_cloud}
              </h2>
            </div>
            <p style={transferTextStyle}>
              {archiveCopy.transfer_description}
              <br />
              {archiveCopy.transfer_photos_safe}
            </p>
            <div style={transferVisibilityGroupStyle} aria-label={archiveCopy.cloud_visibility}>
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
                  <strong>{archiveCopy.private_only}</strong>
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
                  <strong>{archiveCopy.public_discover}</strong>
                  <small>{archiveCopy.transfer_public_hint}</small>
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
                {transferRunning ? archiveCopy.transferring_to_cloud : archiveCopy.transfer_to_cloud}
              </button>
              <button
                type="button"
                onClick={() => setTransferPromptOpen(false)}
                disabled={transferRunning}
                style={transferSecondaryButtonStyle}
              >
                {t.cancel}
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
              placeholder={recordCopy.placeholder}
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
                      {cycle.display_name || cycleTerminology.cycleLabel(cycle.cycle_no)} ({formatLocalCycleDate(cycle.started_at)} {cycleTerminology.startDateSuffix})
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
                onChange={(event) => {
                  const value = event.target.value;
                  setTimeMode(
                    value === "custom"
                      ? "custom"
                      : value === "now"
                        ? "now"
                        : "exif",
                  );
                }}
                style={recordSelectStyle}
              >
                <option value="exif">{t.photo_time}</option>
                <option value="now">{t.current_time}</option>
                <option value="custom">{t.custom_time}</option>
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
                {recordCopy.choose_photos}
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
                {recordCopy.take_photo}
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
                  {recordCopy.clear_photos}
                </button>
              ) : null}
            </div>

            {selectedFiles.length > 0 ? (
              <div style={selectedFilesStyle}>
                {recordCopy.selected_photos_prefix} {selectedFiles.length} {recordCopy.selected_photos_suffix}
                {selectedSizeLabel ? ` · ${recordCopy.raw_size} ${selectedSizeLabel}` : ""}
                <br />
                {recordCopy.photo_limit_prefix} {MAX_RECORD_PHOTOS_PER_ADD} {recordCopy.photo_limit_suffix}
                <br />
                {recordCopy.local_standard_photo_hint}
              </div>
            ) : null}

            {selectedFiles.length > 1 ? (
              <div style={selectedFilesStyle}>
                <label>
                  <input
                    type="checkbox"
                    checked={mergeMode}
                    onChange={(event) => setMergeMode(event.target.checked)}
                  />{" "}
                  {recordCopy.merge_photos}
                </label>
                {!mergeMode ? (
                  <>
                    <br />
                    {recordCopy.split_photos_hint}
                  </>
                ) : null}
              </div>
            ) : null}

            <div style={submitRowStyle}>
              <button type="submit" disabled={saving} style={submitButtonStyle}>
                {saving ? t.saving : recordCopy.save_record}
              </button>
            </div>
          </form>
      </ArchiveRecordComposer>

      <ArchiveCycleTimeline
        cycles={cycleEnabled ? cycles : []}
        records={localRecordItems}
        category={archive.category}
        mobileMode={isMobileViewport}
        canManage={cycleEnabled}
        busy={cycleBusy}
        onStartCycle={cycleEnabled ? startLocalCycle : undefined}
        onEndCycle={cycleEnabled ? endLocalCycle : undefined}
        onUpdateCycleDates={cycleEnabled ? updateLocalCycleDates : undefined}
        onRenameCycle={cycleEnabled ? renameLocalCycle : undefined}
        onDeleteCycle={cycleEnabled ? deleteLocalCycle : undefined}
        emptyState={
          <div style={emptyRecordsStyle}>
            <div>{recordCopy.no_local_records}</div>
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
                      : recordCopy.adjust_failed
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
          {recordCopy.add_record_short}
        </button>
      ) : null}

      <ConfirmDialog
        open={Boolean(recordToDelete)}
        title={recordCopy.delete_local_record_title}
        message={recordCopy.delete_local_record_message}
        confirmText={recordCopy.confirm_delete}
        danger
        onClose={() => setRecordToDelete(null)}
        onConfirm={confirmDeleteRecord}
      />

      <ConfirmDialog
        open={deleteArchiveOpen}
        title={archiveCopy.delete_local_project}
        message={archiveCopy.delete_local_project_message}
        confirmText={archiveCopy.confirm_delete_project}
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

const localCycleProfileExtraStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const localCycleTrashStyle = {
  borderTop: "1px solid #e4eadf",
  paddingTop: 12,
} satisfies CSSProperties;

const localCycleTrashTitleStyle = {
  color: "#344b32",
  fontSize: 14,
  fontWeight: 850,
} satisfies CSSProperties;

const localCycleTrashHintStyle = {
  marginTop: 4,
  color: "#7b8878",
  fontSize: 12,
  lineHeight: 1.55,
} satisfies CSSProperties;

const localCycleTrashListStyle = {
  display: "grid",
  gap: 7,
  marginTop: 9,
} satisfies CSSProperties;

const localCycleTrashRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  border: "1px solid #e0e7dc",
  borderRadius: 12,
  background: "#fbfcf9",
  padding: "9px 10px",
} satisfies CSSProperties;

const localCycleTrashNameStyle = {
  minWidth: 0,
  display: "grid",
  gap: 2,
  color: "#657062",
  fontSize: 12,
} satisfies CSSProperties;

const localCycleRestoreButtonStyle = {
  flex: "0 0 auto",
  border: "1px solid #cbdcc4",
  borderRadius: 999,
  background: "#fff",
  color: "#41643c",
  fontSize: 13,
  fontWeight: 800,
  padding: "6px 11px",
  cursor: "pointer",
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
  bottom: "calc(78px + var(--app-safe-area-bottom))",
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
