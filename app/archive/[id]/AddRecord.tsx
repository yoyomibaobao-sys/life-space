"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { getAndroidAuthSnapshot, isConfirmedInvalidAndroidSession } from "@/lib/android-auth-state";
import InternalLink from "@/components/navigation/InternalLink";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getBehaviorRestrictionErrorText } from "@/lib/behavior-restriction-errors";
import { showToast } from "@/components/Toast";
import UiIcon from "@/components/ui/UiIcon";
import SegmentedChoice from "@/components/ui/SegmentedChoice";
import {
  canCreateMembershipContent,
  formatStorageBytes,
  getCreateContentBlockedText,
  getStorageLimitExceededText,
  getStorageRemainingBytes,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import {
  createImageThumbnailFile,
  standardizeRecordPhotoFile,
} from "@/lib/image-compression";
import { uploadMediaStorageObject } from "@/lib/media-storage-upload";
import {
  bindRecoveryRecord, completeRecovery, eraseRecovery, markRecoveryUnknown,
  readRecovery, stageRecovery, type RecoveryEntry,
} from "@/lib/cloud-record-photo-recovery";
import {
  cancelStorageUploadReservation,
  reconcileMediaUploadCommit,
  reserveStorageUpload,
  settleStorageUploadReservation,
} from "@/lib/storage-usage";
import {
  isStorageUploadMaintenance,
} from "@/lib/storage-upload-maintenance";
import type { ArchiveCycle } from "@/lib/archive-detail-types";
import {
  formatLocalCycleDate,
  isLocalDateBefore,
  toLocalDateEndIso,
} from "@/lib/archive-cycle-dates";
import { getArchiveCycleTerminology } from "@/lib/archive-cycle-terminology";
import { readImageCapturedAt } from "@/lib/photo-metadata";
import {
  isAndroidRecordGallery,
  pickAndroidRecordPhotos,
  readRestoredAndroidRecordPhotos,
  consumeCloudPickerResume,
  clearCloudPickerResume,
  peekCloudPickerResume,
  saveCloudPickerResume,
  type CloudPickerFields,
} from "@/lib/android-record-gallery";
import { toLocalDateTimeInputValue } from "@/lib/date-time";
import {
  buildRecordPhotoGroups,
  limitRecordPhotoBatch,
  MAX_RECORD_PHOTOS_PER_ADD,
  type TimedRecordPhoto,
} from "@/lib/record-photo-batches";
import {
  isMissingDatabaseColumn,
  withoutCapturedAt,
} from "@/lib/supabase-schema-compat";
import {
  deleteQuickCapture,
  getQuickCapture,
  quickCaptureToFiles,
} from "@/lib/quick-capture";

type RecordVisibility = "public" | "private";

type Props = {
  publicationAccess?: {
    ownerId: string;
    scope?: object;
    state: "checking" | "allowed" | "unknown" | "denied";
    isCurrent: () => boolean;
    revalidate: () => Promise<boolean>;
  };
  archiveId: string;
  archiveCategory?: string | null;
  archiveIsPublic: boolean;
  activeCycles?: ArchiveCycle[];
  placeholder?: string;
  onRecordCreated?: () => void | Promise<void>;
  mobileMode?: boolean;
  initialFiles?: File[];
  initialCapturedAt?: (string | null)[];
  initialNote?: string;
};

type SelectedPreview = {
  key: string;
  url: string;
  name: string;
};

function buildFileKey(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

export default function AddRecord({
  archiveId,
  archiveCategory,
  archiveIsPublic,
  activeCycles = [],
  placeholder,
  onRecordCreated,
  mobileMode = false,
  initialFiles = [],
  initialCapturedAt = [],
  initialNote = "",
  publicationAccess,
}: Props) {
  const { language, t } = useLanguage();
  const copy = t.record;
  const terminology = getArchiveCycleTerminology(archiveCategory, language);
  const [text, setText] = useState(initialNote);
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<SelectedPreview[]>([]);
  const [timeMode, setTimeMode] = useState("exif");
  const [customTime, setCustomTime] = useState("");
  const [splitByDate, setSplitByDate] = useState(false);
  const [recordVisibility, setRecordVisibility] =
    useState<RecordVisibility>(archiveIsPublic ? "public" : "private");
  const [isHelpRecord, setIsHelpRecord] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>(undefined);
  const [endSelectedCycleAfterSave, setEndSelectedCycleAfterSave] = useState(false);
  const [loading, setLoading] = useState(false);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipNotice, setMembershipNotice] = useState("");
  const [restoreNotice, setRestoreNotice] = useState("");
  const [submissionNeedsReview, setSubmissionNeedsReview] = useState(false);
  const [recoveringPhoto, setRecoveringPhoto] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");

  const chooseInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const filePreviewsRef = useRef<SelectedPreview[]>([]);
  const loadedQuickCaptureIdRef = useRef("");
  const quickCaptureId = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("quickCapture") || "";
  const initialFilesLoaded = useRef(false);
  useEffect(() => {
    if (initialFilesLoaded.current || !initialFiles.length) return;
    initialFilesLoaded.current = true;
    appendFiles(initialFiles);
    // Initial files belong to this composer instance; the owner keeps the draft on failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);
  // Only an interrupted native cloud picker is recoverable, once, on the next
  // authenticated open of the same cloud project. This is not a drafts system.
  const restoreCheckedRef = useRef(false);
  const restoredVisibilityRef = useRef(false);
  useEffect(() => {
    if (restoreCheckedRef.current || !mobileMode || !isAndroidRecordGallery() ||
      initialFiles.length > 0 || quickCaptureId) return;
    let disposed = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (disposed || restoreCheckedRef.current || !user || !membershipScope.current.live || membershipScope.current.revoked ||
          (membershipScope.current.ownerId && user.id !== membershipScope.current.ownerId) ||
          (publicationAccessRef.current && !publicationAccessRef.current.isCurrent())) return;
      restoreCheckedRef.current = true;
      const interrupted = consumeCloudPickerResume(user.id, archiveId);
      if (!interrupted || disposed) return;
      restoredVisibilityRef.current = true;
      const restored = interrupted.fields;
      setText(restored.text);
      setTimeMode(restored.timeMode);
      setCustomTime(restored.customTime);
      setSplitByDate(restored.splitByDate);
      setRecordVisibility(archiveIsPublic ? restored.visibility : "private");
      setIsHelpRecord(restored.isHelpRecord);
      setSelectedCycleId(restored.selectedCycleId ?? undefined);
      setEndSelectedCycleAfterSave(restored.endSelectedCycleAfterSave);
      if (interrupted.phase === "submitting-unknown" || interrupted.phase === "reconcile-only") {
        setSubmissionNeedsReview(true);
        setRestoreNotice(language === "zh"
          ? "上次发布结果尚未确认，请先核对云端记录；不会自动再次发布。"
          : "The last publication is unconfirmed. Check cloud records before trying again.");
        return;
      }
      if (interrupted.phase === "selected" && interrupted.result?.requestId === interrupted.requestId) {
        try {
          const recovered = await readRestoredAndroidRecordPhotos(interrupted.result);
          if (disposed || !membershipScope.current.live || membershipScope.current.revoked ||
              membershipScope.current.archiveId !== archiveId ||
              (membershipScope.current.ownerId && membershipScope.current.ownerId !== user.id) ||
              (activePicker.current && activePicker.current !== interrupted.requestId)) return;
          activePicker.current = interrupted.requestId;
          pendingPicker.current = { requestId: interrupted.requestId, ownerId: user.id,
            files: recovered.files, truncated: recovered.truncated };
          await acceptPendingPicker();
          setRestoreNotice(restored.previousPhotoCount > 0
            ? (language === "zh" ? "编辑内容与本次选图已恢复；此前选过的照片需重新选择。" : "Editor and returned photos restored. Earlier photos need reselecting.")
            : (language === "zh" ? "已恢复上次编辑内容和实际可读取的照片。" : "Editor and readable photos restored."));
          if (recovered.truncated) showToast(copy.photo_batch_trimmed_prefix + " " + MAX_RECORD_PHOTOS_PER_ADD + " " + copy.photo_batch_trimmed_suffix);
          return;
        } catch {
          // A restored count or URI never proves image bytes are readable.
        }
      }
      if (interrupted.phase === "canceled" && restored.previousPhotoCount === 0) {
        setRestoreNotice(language === "zh"
          ? "已恢复编辑内容；上次选图已取消，没有新增照片。"
          : "Editor restored. The previous photo selection was canceled.");
        return;
      }
      setRestoreNotice(language === "zh"
        ? "已恢复上次编辑内容；照片未能可靠恢复，请重新选择。"
        : "The editor was restored, but photos could not be read. Select them again.");
    })().catch(() => {
      if (!disposed) setRestoreNotice(language === "zh"
        ? "无法读取上次选图状态，请重新选择照片。" : "Could not restore the previous selection. Select photos again.");
    });
    return () => { disposed = true; };
    // This only runs for the first mount of the cloud composer, never on edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveId, mobileMode, quickCaptureId, initialFiles.length, publicationAccess?.state]);

  function getPickerFields(): CloudPickerFields {
    return {
      text, timeMode, customTime,
      visibility: recordVisibility, splitByDate, isHelpRecord,
      selectedCycleId: selectedCycleId ?? null, endSelectedCycleAfterSave,
      previousPhotoCount: files.length,
    };
  }

  const sortedActiveCycles = [...activeCycles].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
  const defaultCycleId = sortedActiveCycles[0]?.id || "";
  const effectiveCycleId =
    selectedCycleId === undefined
      ? defaultCycleId
      : selectedCycleId === "" || sortedActiveCycles.some((cycle) => cycle.id === selectedCycleId)
        ? selectedCycleId
        : defaultCycleId;
  const selectedActiveCycle = sortedActiveCycles.find(
    (cycle) => cycle.id === effectiveCycleId
  ) || null;
  const activeCycleIdsKey = sortedActiveCycles.map((cycle) => cycle.id).join("|");

  useEffect(() => {
    if (
      selectedCycleId === undefined ||
      selectedCycleId === "" ||
      activeCycleIdsKey.split("|").includes(selectedCycleId)
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSelectedCycleId(undefined);
      setEndSelectedCycleAfterSave(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeCycleIdsKey, selectedCycleId]);

  const contentBlocked =
    !canCreateMembershipContent(membership) || (publicationAccess !== undefined && publicationAccess.state !== "allowed");
  const selectedFileBytes = files.reduce((total, file) => total + file.size, 0);
  const storageLimitBytes = Number(membership?.storage_limit_bytes || 0);
  const storageRemainingBytes = getStorageRemainingBytes({
    usedBytes: storageUsedBytes,
    limitBytes: storageLimitBytes,
  });
  // 图片会在上传前压缩，因此这里不再用“原图大小”提前拦截。
  // 真正的容量检查在 uploadMedia 内按压缩后的大小创建单次上传预留。
  const uploadWouldExceedStorage = false;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (restoredVisibilityRef.current && archiveIsPublic) return;
      setRecordVisibility(archiveIsPublic ? "public" : "private");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [archiveIsPublic]);

  const membershipScope = useRef({ live: true, revoked: false, paused: false, epoch: 0, archiveId, ownerId: publicationAccess?.ownerId || "", boundary: publicationAccess?.scope, pausedAuthority: null as ReturnType<typeof getAndroidAuthSnapshot> | null });
  const membershipRequest = useRef(0);
  const publicationBusy = useRef(false);
  const photoRecoveryBusy = useRef(false);
  const galleryPickerBusy = useRef(false);
  const membershipFlight = useRef<Promise<MyMembership | null> | null>(null);
  const publicationAccessRef = useRef(publicationAccess);
  publicationAccessRef.current = publicationAccess;
  const [identityBlocked, setIdentityBlocked] = useState(false);
  const [authPaused, setAuthPaused] = useState(false);
  const membershipProof = useRef({ epoch: -1, allowed: false });
  const pendingPicker = useRef<{ requestId: string; ownerId: string; files: File[]; truncated: boolean } | null>(null);
  const activePicker = useRef<string | null>(null);
  const writeAttempt = useRef<{ epoch: number; boundary: object | undefined; authority: ReturnType<typeof getAndroidAuthSnapshot> | null } | null>(null);
  if (membershipScope.current.boundary !== publicationAccess?.scope) {
    // Render-time fence: old asynchronous preparation cannot survive a parent
    // identity/access generation, even before effects have had a chance to run.
    membershipScope.current.boundary = publicationAccess?.scope;
    membershipScope.current.epoch += 1;
    membershipScope.current.paused = true;
    membershipRequest.current += 1;
    membershipFlight.current = null;
    membershipProof.current.allowed = false;
  }
  const currentAuth = publicationAccess ? getAndroidAuthSnapshot() : null;
  const confirmedIdentityRejection = Boolean(currentAuth && (currentAuth.explicitSignedOut ||
    currentAuth.status === "signed-out" || currentAuth.verification === "invalid-session" ||
    currentAuth.verification === "no-session" ||
    (currentAuth.status === "signed-in" && currentAuth.sessionUserId !== membershipScope.current.ownerId)));
  if (confirmedIdentityRejection || membershipScope.current.archiveId !== archiveId ||
      (publicationAccess && membershipScope.current.ownerId && publicationAccess.ownerId !== membershipScope.current.ownerId)) membershipScope.current.revoked = true;
  const editorPaused = authPaused || membershipScope.current.paused ||
    Boolean(publicationAccess && !publicationAccess.isCurrent());

  const [membershipRetry, setMembershipRetry] = useState(0);
  const membershipUnknown = !membershipLoading && (!membership || typeof membership.can_create_content !== "boolean");
  function assertPublicationCurrent() {
    const scope = membershipScope.current, attempt = writeAttempt.current;
    const parent = publicationAccessRef.current;
    if (!attempt || !scope.live || scope.revoked || scope.paused ||
        scope.archiveId !== archiveId || scope.epoch !== attempt.epoch ||
        parent?.scope !== attempt.boundary ||
        (parent && (!parent.isCurrent() || parent.state !== "allowed" ||
          getAndroidAuthSnapshot() !== attempt.authority))) {
      throw new Error("publication_authority_changed");
    }
  }


  const verifyMembership = useCallback((): Promise<MyMembership | null> => {
    if (membershipFlight.current) return membershipFlight.current;
    const scope = membershipScope.current;
    const parent = publicationAccessRef.current;
    if (!scope.live || scope.revoked || (parent && !parent.isCurrent())) return Promise.resolve(null);
    const authority = parent ? getAndroidAuthSnapshot() : null;
    if (authority && (authority === scope.pausedAuthority || authority.status !== "signed-in" ||
        authority.verification !== "verified" || authority.explicitSignedOut ||
        authority.sessionUserId !== scope.ownerId)) return Promise.resolve(null);
    const epoch = scope.epoch;
    const request = ++membershipRequest.current;
    const accept = () => scope.live && !scope.revoked && scope.epoch === epoch &&
      membershipRequest.current === request && scope.archiveId === archiveId &&
      (!publicationAccessRef.current || (publicationAccessRef.current.isCurrent() &&
        getAndroidAuthSnapshot() === authority));
    setMembershipLoading(true);
    setMembership(null);
    membershipProof.current.allowed = false;
    const promise = (async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!accept()) return null;
        if (error) { if (isConfirmedInvalidAndroidSession(error)) { scope.revoked = true; setIdentityBlocked(true); } return null; }
        if (!user || (scope.ownerId && scope.ownerId !== user.id) ||
            (parent && parent.ownerId !== user.id)) {
          scope.revoked = true;
          scope.epoch += 1;
          setIdentityBlocked(true);
          return null;
        }
        scope.ownerId = user.id;
        const [member, profile] = await Promise.all([
          supabase.rpc("get_my_membership"),
          supabase.from("profiles").select("storage_used").eq("id", user.id).maybeSingle(),
        ]);
        if (!accept()) return null;
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
        if (!accept()) return null;
        if (authError) { if (isConfirmedInvalidAndroidSession(authError)) { scope.revoked = true; setIdentityBlocked(true); } return null; }
        if (currentUser?.id !== user.id) {
          scope.revoked = true;
          scope.epoch += 1;
          setIdentityBlocked(true);
          return null;
        }
        const next = member.error ? null : normalizeMembershipRpcResult(member.data);
        membershipProof.current = { epoch, allowed: canCreateMembershipContent(next) };
        if (parent && next?.can_create_content === false) {
          scope.revoked = true;
          pendingPicker.current = null;
          activePicker.current = null;
          setIdentityBlocked(true);
        }
        if (membershipProof.current.allowed) {
          scope.paused = false;
          scope.pausedAuthority = null;
          setAuthPaused(false);
        }
        setMembership(next);
        if (!profile.error) setStorageUsedBytes(Number(profile.data?.storage_used || 0));
        return next;
      } catch {
        if (accept()) setMembership(null);
        return null;
      } finally {
        if (scope.live && scope.epoch === epoch && membershipRequest.current === request) setMembershipLoading(false);
      }
    })();
    membershipFlight.current = promise;
    void promise.finally(() => { if (membershipFlight.current === promise) membershipFlight.current = null; });
    return promise;
  }, [archiveId]);

  useEffect(() => {
    const scope = membershipScope.current;
    scope.live = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_OUT" && (!session?.user?.id || !scope.ownerId || session.user.id === scope.ownerId)) return;
      scope.epoch += 1;
      membershipRequest.current += 1;
      membershipFlight.current = null;
      membershipProof.current.allowed = false;
      const parent = publicationAccessRef.current;
      const current = parent ? getAndroidAuthSnapshot() : null;
      const terminal = !parent || (session?.user?.id && scope.ownerId && session.user.id !== scope.ownerId) ||
        current?.explicitSignedOut || current?.status === "signed-out" ||
        current?.verification === "invalid-session" || current?.verification === "no-session";
      if (terminal) {
        scope.revoked = true;
        pendingPicker.current = null;
        activePicker.current = null;
        setIdentityBlocked(true);
      } else {
        scope.paused = true;
        scope.pausedAuthority = current;
        setAuthPaused(true);
      }
      setMembership(null);
      setMembershipLoading(false);
    });
    return () => {
      scope.live = false;
      scope.epoch += 1;
      pendingPicker.current = null;
      activePicker.current = null;
      membershipRequest.current += 1;
      subscription.unsubscribe();
    };
  }, [archiveId]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let attempts = 0;
    const run = async () => {
      attempts += 1;
      const next = await verifyMembership();
      if (!active || membershipScope.current.revoked || typeof next?.can_create_content === "boolean") return;
      // At most three sequential checks per mount or explicit retry; no polling.
      if (attempts < 3) timer = window.setTimeout(() => { void run(); }, attempts * 500);
    };
    void run();
    return () => { active = false; window.clearTimeout(timer); };
  }, [verifyMembership, membershipRetry, publicationAccess?.state, publicationAccess?.scope]);

  async function retryMembership() {
    if (membershipLoading || membershipScope.current.revoked) return;
    try {
      const parent = publicationAccessRef.current;
      if (parent && !(await parent.revalidate())) return;
      if (!membershipScope.current.live || membershipScope.current.revoked) return;
      setMembershipRetry((value) => value + 1);
    } catch {
      // Preserve the editor; a failed read grants no permission.
    }
  }

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
        appendAcceptedFiles(quickCaptureToFiles(capture));
      } catch {
        // The record form remains usable if a temporary capture expired.
      }
    }

    void loadCapturedPhoto();
    return () => {
      cancelled = true;
    };
    // The accumulated quick capture was already limited per add operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickCaptureId]);

  useEffect(() => {
    return () => {
      filePreviewsRef.current.forEach((preview) =>
        URL.revokeObjectURL(preview.url)
      );
      filePreviewsRef.current = [];
    };
  }, []);

  function resolveTime({
    timeMode,
    customTime,
    exifTime,
  }: {
    timeMode: string;
    customTime: string;
    exifTime?: Date | null;
  }) {
    if (timeMode === "exif" && exifTime) {
      return new Date(exifTime).toISOString();
    }

    if (timeMode === "custom" && customTime) {
      return new Date(customTime).toISOString();
    }

    return new Date().toISOString();
  }

  async function prepareSelectedPhotos(): Promise<TimedRecordPhoto<File>[]> {
    return Promise.all(
      files.map(async (file) => {
        const capturedAt = (await readImageCapturedAt(file)) ||
          (initialFiles.includes(file) ? initialCapturedAt[initialFiles.indexOf(file)] || null : null);

        return {
          file,
          capturedAt,
          recordTimeISO: resolveTime({
            timeMode,
            customTime,
            exifTime: capturedAt ? new Date(capturedAt) : null,
          }),
        };
      }),
    );
  }

  function appendAcceptedFiles(accepted: File[]) {
    if (accepted.length === 0) return;
    const previews = accepted.map((file, index) => ({
      key: buildFileKey(file, files.length + index),
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    filePreviewsRef.current = [...filePreviewsRef.current, ...previews];
    setFiles((prev) => [...prev, ...accepted]);
    setFilePreviews((prev) => [...prev, ...previews]);
  }

  async function acceptPendingPicker() {
    const result = pendingPicker.current;
    const scope = membershipScope.current;
    const parent = publicationAccessRef.current;
    if (!result || !scope.live || scope.revoked || scope.paused ||
        scope.archiveId !== archiveId || scope.ownerId !== result.ownerId ||
        activePicker.current !== result.requestId ||
        !membershipProof.current.allowed || membershipProof.current.epoch !== scope.epoch ||
        (parent && (!parent.isCurrent() || parent.state !== "allowed"))) return;
    const epoch = scope.epoch;
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!scope.live || scope.revoked || scope.paused || scope.epoch !== epoch ||
        pendingPicker.current !== result || activePicker.current !== result.requestId ||
        (publicationAccessRef.current && !publicationAccessRef.current.isCurrent())) return;
    if (error) {
      if (isConfirmedInvalidAndroidSession(error)) { scope.revoked = true; setIdentityBlocked(true); }
      return;
    }
    if (user?.id !== result.ownerId) {
      scope.revoked = true;
      pendingPicker.current = null;
      activePicker.current = null;
      setIdentityBlocked(true);
      return;
    }
    pendingPicker.current = null;
    activePicker.current = null;
    appendFiles(result.files);
    if (result.truncated) showToast(copy.photo_batch_trimmed_prefix + " " + MAX_RECORD_PHOTOS_PER_ADD + " " + copy.photo_batch_trimmed_suffix);
  }

  useEffect(() => {
    void acceptPendingPicker().catch(() => undefined);
    // In-memory returned bytes can only join their original, reverified instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership, authPaused, publicationAccess?.state, publicationAccess?.scope]);

  async function chooseFromGallery() {
    const scope = membershipScope.current;
    const parent = publicationAccessRef.current;
    if (!scope.live || scope.revoked || scope.paused ||
        (parent && (!parent.isCurrent() || parent.state !== "allowed"))) return;
    const epoch = scope.epoch;
    if (!isAndroidRecordGallery()) {
      chooseInputRef.current?.click();
      return;
    }
    if (submissionNeedsReview || galleryPickerBusy.current || pendingPicker.current) return;
    galleryPickerBusy.current = true;
    let ownerId = "";
    let requestId = "";
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!scope.live || scope.revoked || scope.paused || scope.epoch !== epoch ||
          (parent && !parent.isCurrent()) || !user || (scope.ownerId && user.id !== scope.ownerId)) {
        showToast(t.please_login);
        return;
      }
      // An unresolved remote write must not be hidden by starting a new picker.
      const pendingPublication = peekCloudPickerResume(user.id, archiveId);
      if (pendingPublication?.phase === "submitting-unknown" || pendingPublication?.phase === "reconcile-only") {
        setSubmissionNeedsReview(true);
        setRestoreNotice(language === "zh"
          ? "云端发布结果仍待核账，暂不能开始新的选择或发布。"
          : "Cloud publication is unconfirmed. Reconcile before selecting or publishing again.");
        return;
      }
      ownerId = user.id;
      requestId = crypto.randomUUID();
      activePicker.current = requestId;
      // localStorage.setItem is synchronous: finish the small editor snapshot
      // BEFORE opening another Activity. Failure leaves the editor untouched.
      saveCloudPickerResume({
        version: 1, ownerId, archiveId, requestId,
        phase: "picking", fields: getPickerFields(),
      });
      const { files: selected, truncated } = await pickAndroidRecordPhotos({ requestId });
      if (!scope.live || scope.revoked || scope.archiveId !== archiveId ||
          scope.ownerId !== ownerId || activePicker.current !== requestId) return;
      pendingPicker.current = { requestId, ownerId, files: selected, truncated };
      await acceptPendingPicker();
    } catch {
      showToast(language === "zh" ? "无法读取图库照片或保护选图状态。" : "Unable to read or protect selected photos.");
    } finally {
      galleryPickerBusy.current = false;
      if (ownerId && requestId) clearCloudPickerResume(ownerId, archiveId, requestId);
    }
  }

  function appendFiles(nextFiles: File[]) {
    if (nextFiles.length === 0) return;
    const { accepted, rejectedCount } = limitRecordPhotoBatch(nextFiles);

    if (rejectedCount > 0) {
      showToast(
        `${copy.photo_batch_trimmed_prefix} ${MAX_RECORD_PHOTOS_PER_ADD} ${copy.photo_batch_trimmed_suffix}`,
      );
    }

    appendAcceptedFiles(accepted);
  }

  function removeSelectedFile(index: number) {
    const preview = filePreviewsRef.current[index];
    if (preview) URL.revokeObjectURL(preview.url);
    filePreviewsRef.current = filePreviewsRef.current.filter(
      (_, itemIndex) => itemIndex !== index
    );
    setFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setFilePreviews((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  function clearSelectedFiles() {
    filePreviewsRef.current.forEach((preview) =>
      URL.revokeObjectURL(preview.url)
    );
    filePreviewsRef.current = [];
    setFiles([]);
    setFilePreviews([]);
  }

  async function createRecord(params: {
    archiveId: string;
    userId: string;
    note: string;
    recordTimeISO: string;
    visibility: RecordVisibility;
    statusTag: "help" | null;
  }) {
    const note = params.note.trim();

    assertPublicationCurrent();
    const { data: record, error } = await supabase.rpc("create_record_with_location", {
      p_archive_id: params.archiveId, p_cycle_id: effectiveCycleId || null,
      p_note: note, p_record_time: params.recordTimeISO, p_visibility: params.visibility,
      p_status_tag: params.statusTag, p_location: null,
    }).single();

    if (error) {
      console.error("record 创建失败", error);
      const restrictionMessage = getBehaviorRestrictionErrorText(error, language);
      if (restrictionMessage) showToast(restrictionMessage);
      return null;
    }

    return record as { id: string };
  }

  async function refreshStorageUsed(userId: string) {
    assertPublicationCurrent();
    const { data, error } = await supabase
      .from("profiles")
      .select("storage_used")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("refresh storage used error:", error);
      return;
    }

    setStorageUsedBytes(Number(data?.storage_used || 0));
  }

  async function uploadMedia(
    recordId: string,
    userId: string,
    file: File,
    capturedAt: string | null,
  ) {
    const compressed = await standardizeRecordPhotoFile(file, { requireSanitized: true });
    const uploadFile = compressed.file;
    const thumbnail = await createImageThumbnailFile(uploadFile);
    const thumbFile = thumbnail.wasGenerated ? thumbnail.file : null;
    const uploadBytes = uploadFile.size;
    const thumbBytes = thumbFile?.size || 0;
    const reservedBytes = uploadBytes + thumbBytes;

    const safeName = uploadFile.name.replace(/[^\w.\-]+/g, "_");
    const uploadKey = crypto.randomUUID();
    const targetMediaId = crypto.randomUUID();
    const fileName = `${userId}/${recordId}/${uploadKey}-${safeName}`;
    const thumbSafeName = thumbFile?.name.replace(/[^\w.\-]+/g, "_") || null;
    const thumbName = thumbFile && thumbSafeName
      ? `${userId}/${recordId}/thumbs/${uploadKey}-${thumbSafeName}`
      : null;

    assertPublicationCurrent();
    const reserveResult = await reserveStorageUpload({
      targetType: "media",
      targetId: targetMediaId,
      targetParentId: recordId,
      storagePath: fileName,
      storageBytes: uploadBytes,
      thumbPath: thumbName,
      thumbBytes,
    });

    if (!reserveResult.ok) {
      if (reserveResult.message === "storage_limit_exceeded") {
        const message = getStorageLimitExceededText({
          usedBytes: reserveResult.storage_used,
          limitBytes: reserveResult.storage_limit_bytes,
          uploadBytes: reservedBytes,
          language,
        });
        setMembershipNotice(message);
        showToast(message);
      } else if (reserveResult.message === "membership_inactive") {
        const message = getCreateContentBlockedText(membership, language);
        setMembershipNotice(message);
        showToast(message);
      } else if (reserveResult.message === "upload_maintenance") {
        setMembershipNotice(copy.maintenance_text_saved);
        showToast(copy.maintenance_text_saved);
      } else {
        setMembershipNotice(copy.capacity_check_failed);
        showToast(copy.capacity_check_failed);
      }

      return 0;
    }

    const reservation = {
      reservation_id: reserveResult.reservation_id,
      reservation_mode: reserveResult.reservation_mode,
      reserved_bytes: reservedBytes,
    } as const;

    setStorageUsedBytes(reserveResult.storage_used);

    assertPublicationCurrent();
    const { error: uploadError } = await uploadMediaStorageObject(
      fileName,
      uploadFile,
      {
        contentType: uploadFile.type || "image/jpeg",
      }
    );

    if (uploadError) {
      console.error("媒体上传失败", uploadError);
      assertPublicationCurrent();
      await supabase.storage
        .from("media")
        .remove([fileName, thumbName].filter((path): path is string => Boolean(path)));
      assertPublicationCurrent();
      const cancelResult = await cancelStorageUploadReservation(reservation);
      setStorageUsedBytes(cancelResult.storage_used);
      if (await isStorageUploadMaintenance()) {
        setMembershipNotice(copy.maintenance_text_saved);
        showToast(copy.maintenance_text_saved);
      }
      return 0;
    }

    let uploadedThumbPath: string | null = null;
    let uploadedThumbBytes = 0;

    if (thumbFile && thumbName) {
      assertPublicationCurrent();
      const { error: thumbUploadError } = await uploadMediaStorageObject(
        thumbName,
        thumbFile,
        {
          contentType: thumbFile.type || "image/jpeg",
        }
      );

      if (thumbUploadError) {
        console.error("缩略图上传失败", thumbUploadError);
        assertPublicationCurrent();
        await supabase.storage.from("media").remove([thumbName]);
      } else {
        uploadedThumbPath = thumbName;
        uploadedThumbBytes = thumbBytes;
      }
    }

    const actualBytes = uploadBytes + uploadedThumbBytes;

    const mediaPayload = {
      id: targetMediaId,
      record_id: recordId,
      type: "image",
      url: null,
      user_id: userId,
      size_mb: actualBytes / (1024 * 1024),
      size_bytes: actualBytes,
      storage_path: fileName,
      thumb_url: null,
      thumb_path: uploadedThumbPath,
      mime_type: uploadFile.type || "image/jpeg",
      width: compressed.width ?? null,
      height: compressed.height ?? null,
      original_filename: file.name,
      captured_at: capturedAt,
      storage_class: "hot",
      ...(reservation.reservation_id
        ? { upload_reservation_id: reservation.reservation_id }
        : {}),
    };
    assertPublicationCurrent();
    let mediaInsertResult = await supabase
      .from("media")
      .insert([mediaPayload])
      .select("id")
      .single();

    if (
      isMissingDatabaseColumn(
        mediaInsertResult.error,
        "media",
        "captured_at"
      )
    ) {
      assertPublicationCurrent();
      mediaInsertResult = await supabase
        .from("media")
        .insert([withoutCapturedAt(mediaPayload)])
        .select("id")
        .single();
    }

    const { data: mediaRow, error: mediaError } = mediaInsertResult;
    let mediaId = mediaRow?.id ? String(mediaRow.id) : null;

    if (mediaError || !mediaId) {
      console.error("media 写入失败", mediaError);
      assertPublicationCurrent();
      const reconciliation = await reconcileMediaUploadCommit({ storagePath: fileName });

      if (reconciliation.status === "found") {
        mediaId = reconciliation.mediaId;
      } else if (reconciliation.status === "missing") {
        assertPublicationCurrent();
        await supabase.storage
          .from("media")
          .remove([fileName, uploadedThumbPath].filter((path): path is string => Boolean(path)));
        assertPublicationCurrent();
        const cancelResult = await cancelStorageUploadReservation(reservation);
        setStorageUsedBytes(cancelResult.storage_used);
        return 0;
      } else {
        showToast(copy.save_state_pending);
        return 0;
      }
    }

    assertPublicationCurrent();
    const settleResult = await settleStorageUploadReservation({
      reservation,
      targetType: "media",
      targetId: mediaId,
      legacyActualBytes: actualBytes,
    });
    if (settleResult.ok) setStorageUsedBytes(settleResult.storage_used);

    return actualBytes;
  }

  async function recoverConfirmedRecordPhoto() {
    if (photoRecoveryBusy.current || !submissionNeedsReview ||
        !mobileMode || !isAndroidRecordGallery()) return;
    photoRecoveryBusy.current = true;
    setRecoveringPhoto(true);
    setRecoveryError("");
    let journal: RecoveryEntry | null = null;
    try {
      const parent = publicationAccessRef.current;
      if (!membershipScope.current.live || membershipScope.current.revoked ||
          membershipScope.current.paused || (parent && !(await parent.revalidate()))) {
        throw new Error("recovery_owner_authority_not_verified");
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user || (parent && (!parent.isCurrent() || parent.ownerId !== user.id)) ||
          user.id !== membershipScope.current.ownerId) {
        throw new Error("recovery_session_owner_mismatch");
      }
      const marker = peekCloudPickerResume(user.id, archiveId);
      if (!marker || !["submitting-unknown", "reconcile-only"].includes(marker.phase) ||
          !marker.requestId) throw new Error("recovery_original_request_missing");
      const candidate = await readRecovery(user.id, archiveId, marker.requestId);
      // Only the original create RPC can populate this request-scoped proof.
      if (!candidate?.recordId || candidate.recordProof !== "create-receipt") {
        setRecoveryError(language === "zh"
          ? "当前无法确认补图目标。已保留附件及待核状态，请核对原发布结果。"
          : "The original record cannot be confirmed. Attachments and the pending review are preserved.");
        return;
      }
      journal = candidate;
      const verified = await completeRecovery(journal);
      if (verified.phase !== "media-confirmed") throw new Error("recovery_not_fully_confirmed");
      clearCloudPickerResume(user.id, archiveId, marker.requestId);
      await eraseRecovery(user.id, archiveId, marker.requestId);
      setSubmissionNeedsReview(false);
      setRestoreNotice(language === "zh"
        ? "已核对原云端记录并仅补传缺失图片，没有重复创建记录。"
        : "Original cloud record verified; only the missing photo was uploaded.");
      setText("");
      clearSelectedFiles();
      await onRecordCreated?.();
    } catch (cause) {
      if (journal) await markRecoveryUnknown(journal, cause).catch(() => undefined);
      const unconfirmed = !journal || (cause instanceof Error &&
        ["recovery_record_owner_denied", "recovery_auth_owner_mismatch",
          "recovery_record_id_not_confirmed"].includes(cause.message));
      setRecoveryError(unconfirmed
        ? (language === "zh" ? "当前无法确认补图目标。已保留附件及待核状态。"
          : "The original record cannot be confirmed. Attachments and the pending review are preserved.")
        : (language === "zh" ? "补图尚未确认，已保留附件，可重试核对。"
          : "Photo recovery is unconfirmed. Attachments were preserved for retry."));
    } finally {
      photoRecoveryBusy.current = false;
      setRecoveringPhoto(false);
    }
  }

  async function handleAdd() {
    if (publicationBusy.current || loading || membershipLoading || contentBlocked || submissionNeedsReview || membershipScope.current.revoked || membershipScope.current.paused ||
        (publicationAccessRef.current && !publicationAccessRef.current.isCurrent())) return;
    if (!text.trim() && files.length === 0) return;

    // Fence same-render duplicate clicks while asynchronous permission checks run.
    publicationBusy.current = true;
    writeAttempt.current = { epoch: membershipScope.current.epoch,
      boundary: publicationAccessRef.current?.scope,
      authority: publicationAccessRef.current ? getAndroidAuthSnapshot() : null };
    try {
    if (files.length > 0 && (await isStorageUploadMaintenance())) {
      setMembershipNotice(copy.maintenance_record_not_saved);
      showToast(copy.maintenance_record_not_saved);
      return;
    }
    setMembershipNotice("");

    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership, language));
      return;
    }

    if (uploadWouldExceedStorage) {
      showToast(
        getStorageLimitExceededText({
          usedBytes: storageUsedBytes,
          limitBytes: storageLimitBytes,
          uploadBytes: selectedFileBytes,
          language,
        })
      );
      return;
    }

    setLoading(true);
    let submissionRequestId: string | null = null;
    let submissionOwnerId: string | null = null;
    let stagedSinglePhoto: RecoveryEntry | null = null;

    try {
      const {
        data: { user }, error: publicationIdentityError,
      } = await supabase.auth.getUser();

      if (publicationIdentityError || !user) {
        setMembership(null);
        setMembershipLoading(false);
        if (!publicationIdentityError || isConfirmedInvalidAndroidSession(publicationIdentityError)) {
          membershipScope.current.revoked = true;
          membershipScope.current.epoch += 1;
          setIdentityBlocked(true);
        }
        showToast(t.please_login);
        setLoading(false);
        return;
      }

      assertPublicationCurrent();
      if (membershipScope.current.revoked || user.id !== membershipScope.current.ownerId ||
          (publicationAccessRef.current && user.id !== publicationAccessRef.current.ownerId)) {
        setLoading(false);
        return;
      }
      const publicationEpoch = membershipScope.current.epoch;

      // The persisted uncertainty gate also applies during the brief window
      // before the recovery useEffect has set React button state.
      if (mobileMode && isAndroidRecordGallery() &&
          ["submitting-unknown", "reconcile-only"].includes(peekCloudPickerResume(user.id, archiveId)?.phase || "")) {
        setSubmissionNeedsReview(true);
        setRestoreNotice(language === "zh"
          ? "发布结果未确认，请先核对云端记录，不能重复发布。"
          : "Publication is unconfirmed. Check cloud records before resubmitting.");
        setLoading(false);
        return;
      }

      let finalVisibility: RecordVisibility = archiveIsPublic
        ? recordVisibility
        : "private";
      const finalStatusTag = isHelpRecord ? "help" : null;
      let uploadedBytes = 0;
      let archiveHelpStateUpdated = false;
      let createdRecordCount = 0;
      let uploadedPhotoCount = 0;
      let cycleEndRecordTime: string | null = null;
      const preparedPhotos =
        files.length > 0 ? await prepareSelectedPhotos() : [];
      const photoGroups = buildRecordPhotoGroups(preparedPhotos, !splitByDate);

      if (endSelectedCycleAfterSave && selectedActiveCycle) {
        cycleEndRecordTime =
          photoGroups[photoGroups.length - 1]?.recordTimeISO ||
          resolveTime({ timeMode, customTime });
        const hasRecordBeforeCycleStart =
          photoGroups.length > 0
            ? photoGroups.some((group) =>
                isLocalDateBefore(
                  group.recordTimeISO,
                  selectedActiveCycle.started_at,
                ),
              )
            : isLocalDateBefore(
                cycleEndRecordTime,
                selectedActiveCycle.started_at,
              );

        if (hasRecordBeforeCycleStart) {
          showToast(terminology.recordDateBeforeStartMessage);
          setLoading(false);
          return;
        }
      }

      if (finalStatusTag === "help" && finalVisibility !== "public" &&
          !confirm(copy.help_public_confirm)) {
        setLoading(false);
        return;
      }

      // Revalidate immediately before the first mutation, after photo preparation.
      const freshMembership = await verifyMembership();
      const parent = publicationAccessRef.current;
      if (!canCreateMembershipContent(freshMembership) ||
          (parent && !(await parent.revalidate())) ||
          membershipScope.current.revoked || !membershipScope.current.live ||
          membershipScope.current.epoch !== publicationEpoch ||
          user.id !== membershipScope.current.ownerId || (parent && !parent.isCurrent())) {
        setLoading(false);
        return;
      }
      const { data: { user: publicationUser }, error: publicationAuthError } = await supabase.auth.getUser();
      if (isConfirmedInvalidAndroidSession(publicationAuthError) || (!publicationAuthError && publicationUser?.id !== user.id)) {
        membershipScope.current.revoked = true;
        membershipScope.current.epoch += 1;
        setIdentityBlocked(true);
      }
      if (publicationAuthError || publicationUser?.id !== user.id ||
          membershipScope.current.epoch !== publicationEpoch || membershipScope.current.revoked ||
          !membershipScope.current.live || (parent && !parent.isCurrent())) {
        setLoading(false);
        return;
      }

      assertPublicationCurrent();

      // This is not a queued record: it only fences a *user-initiated* cloud
      // publish whose HTTP result might become unknown after process death.
      // It must be committed before the first cloud mutation.
      if (mobileMode && isAndroidRecordGallery()) {
        try {
          const requestId = crypto.randomUUID();
          // The single-record/single-photo path is durable before RPC create.
          // Unsupported images now fail *before* any record can be created.
          if (photoGroups.length === 1 && photoGroups[0].photos.length === 1 &&
              files.length === 1) {
            stagedSinglePhoto = await stageRecovery({
              ownerId: user.id, archiveId, requestId, note: text.trim(),
              files: [photoGroups[0].photos[0].file],
            });
          }
          saveCloudPickerResume({
            version: 1, ownerId: user.id, archiveId,
            requestId, phase: "submitting-unknown",
            fields: getPickerFields(),
          });
          submissionOwnerId = user.id;
          submissionRequestId = requestId;
        } catch {
          showToast(language === "zh" ? "无法保护本次发布状态，请稍后再试。" : "Unable to protect this publication state. Try later.");
          setLoading(false);
          return;
        }
      }

      if (finalStatusTag === "help" && finalVisibility !== "public") {
        assertPublicationCurrent();
        const { data: publicationResult, error: archiveError } = await supabase.rpc(
          "make_my_archive_public",
          { p_archive_id: archiveId }
        );

        if (archiveError || publicationResult !== true) {
          showToast(getBehaviorRestrictionErrorText(archiveError, language) || copy.publish_shell_failed);
          setLoading(false);
          return;
        }

        assertPublicationCurrent();
        const { error: helpStateError } = await supabase
          .from("archives")
          .update({ help_status: "open", help_updated_at: new Date().toISOString() })
          .eq("id", archiveId)
          .eq("user_id", user.id);

        if (helpStateError) {
          showToast(copy.publish_shell_failed);
          setLoading(false);
          return;
        }

        finalVisibility = "public";
        archiveHelpStateUpdated = true;
      }

      if (finalStatusTag === "help" && !archiveHelpStateUpdated) {
        assertPublicationCurrent();
        await supabase
          .from("archives")
          .update({ help_status: "open", help_updated_at: new Date().toISOString() })
          .eq("id", archiveId)
          .eq("user_id", user.id);
      }

      if (photoGroups.length > 0) {
        for (const [groupIndex, group] of photoGroups.entries()) {
          const record = await createRecord({
            archiveId,
            userId: user.id,
            note: groupIndex === 0 ? text.trim() : "",
            recordTimeISO: group.recordTimeISO,
            visibility: finalVisibility,
            statusTag: finalStatusTag,
          });

          if (!record) continue;
          createdRecordCount += 1;

          if (stagedSinglePhoto) {
            stagedSinglePhoto = await bindRecoveryRecord(stagedSinglePhoto, record);
            const completed = await completeRecovery(stagedSinglePhoto);
            uploadedPhotoCount += completed.photos.length;
            uploadedBytes += completed.photos.reduce(
              (total, photo) => total + photo.image.size + (photo.thumbnail?.size || 0), 0);
            continue;
          }

          for (const photo of group.photos) {
            const bytes = await uploadMedia(
              record.id,
              user.id,
              photo.file,
              photo.capturedAt,
            );
            uploadedBytes += bytes;
            if (bytes > 0) uploadedPhotoCount += 1;
          }
        }
      } else {
        const recordTimeISO = resolveTime({
          timeMode,
          customTime,
        });

        const record = await createRecord({
          archiveId,
          userId: user.id,
          note: text.trim(),
          recordTimeISO,
          visibility: finalVisibility,
          statusTag: finalStatusTag,
        });
        if (!record) {
          setLoading(false);
          return;
        }
        createdRecordCount += 1;
      }

      if (uploadedBytes > 0) {
        await refreshStorageUsed(user.id);
      }

      let cycleEndFailed = false;
      if (
        endSelectedCycleAfterSave &&
        selectedActiveCycle &&
        cycleEndRecordTime &&
        createdRecordCount > 0
      ) {
        assertPublicationCurrent();
        const { data: endedCycle, error: cycleEndError } = await supabase
          .from("archive_cycles")
          .update({
            status: "ended",
            ended_at: toLocalDateEndIso(cycleEndRecordTime),
          })
          .eq("id", selectedActiveCycle.id)
          .eq("archive_id", archiveId)
          .eq("status", "active")
          .select("id")
          .maybeSingle();

        cycleEndFailed = Boolean(cycleEndError || !endedCycle);
        if (cycleEndError) {
          console.error("end selected archive cycle after record failed", cycleEndError);
        }
      }

      // Never discard or blindly retry a potentially partial cloud publish.
      // The original picker recovery marker is not an upload queue entry.
      if (submissionRequestId && (createdRecordCount !== (photoGroups.length || 1) ||
          uploadedPhotoCount !== files.length || cycleEndFailed)) {
        setSubmissionNeedsReview(true);
        setRestoreNotice(language === "zh"
          ? "部分发布结果尚未确认，请先查看云端记录，不要重复发布。"
          : "Some publication results are unconfirmed. Check cloud records before retrying.");
        setLoading(false);
        return;
      }
      if (submissionOwnerId && submissionRequestId) {
        clearCloudPickerResume(submissionOwnerId, archiveId, submissionRequestId);
        if (stagedSinglePhoto) {
          await eraseRecovery(submissionOwnerId, archiveId, submissionRequestId).catch(() => undefined);
        }
      }

      assertPublicationCurrent();
      setText("");
      clearSelectedFiles();
      setCustomTime("");
      setRecordVisibility(archiveIsPublic ? "public" : "private");
      setIsHelpRecord(false);
      setSelectedCycleId(undefined);
      setEndSelectedCycleAfterSave(false);

      await onRecordCreated?.();
      if (quickCaptureId && createdRecordCount > 0) {
        await deleteQuickCapture(quickCaptureId).catch(() => undefined);
        loadedQuickCaptureIdRef.current = "";
      }
      if (cycleEndFailed) {
        showToast(terminology.endAfterSaveFailureMessage);
      }
    } catch (err) {
      console.log(err);
      if (stagedSinglePhoto) {
        await markRecoveryUnknown(stagedSinglePhoto, err).catch(() => undefined);
      }
      if (submissionRequestId) {
        setSubmissionNeedsReview(true);
        setRestoreNotice(language === "zh"
          ? "发布结果未知，必须先核对云端记录，不能自动重试。"
          : "Publication outcome unknown. Check cloud records before retrying.");
      }
      showToast(t.error);
    }

    setLoading(false);
    } finally {
      publicationBusy.current = false;
      writeAttempt.current = null;
    }
  }

  if (identityBlocked || membershipScope.current.revoked || membershipScope.current.archiveId !== archiveId ||
      (publicationAccess && membershipScope.current.ownerId && publicationAccess.ownerId !== membershipScope.current.ownerId)) return <p role="alert">{language === "zh" ? "请重新验证当前账号。" : "Verify the current account again."}</p>;

  return (
    <div hidden={editorPaused} aria-hidden={editorPaused || undefined}
      data-cloud-editor-paused={editorPaused ? "true" : "false"}
      style={{ marginBottom: "20px", display: editorPaused ? "none" : undefined }}
      onClickCapture={(event) => { if (membershipScope.current.paused || membershipScope.current.revoked || (publicationAccessRef.current && !publicationAccessRef.current.isCurrent())) { event.preventDefault(); event.stopPropagation(); } }}
      onSubmitCapture={(event) => { if (membershipScope.current.paused || membershipScope.current.revoked || (publicationAccessRef.current && !publicationAccessRef.current.isCurrent())) { event.preventDefault(); event.stopPropagation(); } }}>
      {membershipUnknown || (publicationAccess && publicationAccess.state !== "allowed" && publicationAccess.state !== "denied") ? (
        <p role="status">
          {language === "zh" ? "权益暂未核验，编辑内容已保留，暂不能发布。" : "Entitlement is unverified. Your editor is retained; publishing is paused."}{" "}
          <button type="button" onClick={() => { void retryMembership(); }} disabled={membershipLoading}>
            {language === "zh" ? "重新验证" : "Verify again"}
          </button>
        </p>
      ) : null}
      {contentBlocked && !membershipLoading && !membershipUnknown &&
        (!publicationAccess || publicationAccess.state === "allowed" || publicationAccess.state === "denied") ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ead9b8",
            background: "#fff8ea",
            color: "#7a5c24",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <span>{getCreateContentBlockedText(membership, language)}</span>{" "}
          <InternalLink href="/membership" style={{ color: "#5d7c2f", fontWeight: 700 }}>
            {t.archive.learn_cloud_membership}
          </InternalLink>
        </div>
      ) : null}

      {!contentBlocked && membershipNotice ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ead9b8",
            background: "#fff8ea",
            color: "#7a5c24",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <span>{membershipNotice}</span>{" "}
          <InternalLink href="/membership" style={{ color: "#5d7c2f", fontWeight: 700 }}>
            {t.archive.learn_cloud_membership}
          </InternalLink>
        </div>
      ) : null}

      {mobileMode ? (
        <label style={mobileFieldStyle}>
          <span style={mobileFieldLabelStyle}>{language === "zh" ? "记录内容" : "Record"}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder || t.add_record_placeholder}
            rows={5}
            style={mobileTextAreaStyle}
          />
        </label>
      ) : (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder || t.add_record_placeholder}
          style={{ padding: "10px", width: "100%", boxSizing: "border-box" }}
        />
      )}

      {sortedActiveCycles.length > 0 ? (
        <label style={cycleSelectLabelStyle}>
          <span>{terminology.assignLabel}</span>
          <select
            value={effectiveCycleId}
            onChange={(event) => {
              setSelectedCycleId(event.target.value);
              if (!event.target.value) setEndSelectedCycleAfterSave(false);
            }}
            style={cycleSelectStyle}
          >
            {sortedActiveCycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.display_name || terminology.cycleLabel(cycle.cycle_no)} ({formatLocalCycleDate(cycle.started_at)} {terminology.startDateSuffix})
              </option>
            ))}
            <option value="">{terminology.unassignedOption}</option>
          </select>
        </label>
      ) : null}

      {selectedActiveCycle ? (
        <label style={endCycleAfterSaveStyle}>
          <input
            type="checkbox"
            checked={endSelectedCycleAfterSave}
            onChange={(event) => setEndSelectedCycleAfterSave(event.target.checked)}
          />
          {terminology.selectedEndAction}
        </label>
      ) : null}

      <div style={mobileMode ? mobileOptionGridStyle : undefined}>
        <label style={mobileMode ? mobileFieldStyle : undefined}>
          {mobileMode ? <span style={mobileFieldLabelStyle}>{language === "zh" ? "时间" : "Time"}</span> : null}
          <select
            value={timeMode}
            onChange={(e) => setTimeMode(e.target.value)}
            style={mobileMode ? mobileControlStyle : { marginTop: "10px", padding: "6px" }}
          >
            <option value="exif">{language === "zh" ? "照片时间" : "Photo time"}</option>
            <option value="now">{language === "zh" ? "记录时间" : "Record time"}</option>
            <option value="custom">{language === "zh" ? "自定义时间" : "Custom time"}</option>
          </select>
        </label>

        {archiveIsPublic ? (
          <div style={mobileMode ? mobileFieldStyle : undefined}>
            {mobileMode ? <span style={mobileFieldLabelStyle}>{language === "zh" ? "公开范围" : "Visibility"}</span> : null}
            <SegmentedChoice
              label={language === "zh" ? "公开范围" : "Visibility"}
              value={recordVisibility}
              options={[
                { value: "private", label: language === "zh" ? "仅自己可见" : "Only me" },
                { value: "public", label: language === "zh" ? "公开" : "Public" },
              ]}
              onChange={(value) => setRecordVisibility(value as RecordVisibility)}
            />
          </div>
        ) : (
          <div style={mobileMode ? mobilePrivateNoticeStyle : { marginLeft: 8, fontSize: 12, color: "#888" }}>
            {mobileMode ? <span style={mobileFieldLabelStyle}>{language === "zh" ? "公开范围" : "Visibility"}</span> : null}
            <span>{copy.project_private}</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: "10px" }}>
        <label style={{ fontSize: 13, color: "#555" }}>
          <input
            type="checkbox"
            checked={isHelpRecord}
            onChange={(e) => setIsHelpRecord(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          {copy.ask_for_help}
        </label>
      </div>

      {timeMode === "custom" && (
        <div style={{ marginTop: "10px" }}>
          <input
            type="datetime-local"
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
            style={{ padding: "6px" }}
          />
        </div>
      )}

      <div style={{ marginTop: "10px" }}>
        {mobileMode ? (
          <div style={mobilePhotoSectionStyle}>
            <div style={mobilePhotoHeadingStyle}>
              <strong>{language === "zh" ? `照片（最多 ${MAX_RECORD_PHOTOS_PER_ADD} 张）` : `Photos (max ${MAX_RECORD_PHOTOS_PER_ADD})`}</strong>
              <span>{files.length} {language === "zh" ? "张照片" : "photos"}</span>
            </div>
            <div style={mobilePhotoActionsStyle}>
              <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={loading || membershipLoading || contentBlocked} style={mobilePhotoButtonStyle}>
                {copy.take_photo}
              </button>
              <button type="button" onClick={() => { void chooseFromGallery(); }} disabled={loading || membershipLoading || contentBlocked} style={mobilePhotoButtonStyle}>
                {copy.choose_photos}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => { void chooseFromGallery(); }}
              disabled={loading || membershipLoading || contentBlocked}
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: "1px solid #dfe6dc",
                background: "#fff",
                color: "#52614f",
                cursor: loading || membershipLoading || contentBlocked ? "not-allowed" : "pointer",
              }}
            >
              {copy.choose_photos}
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={loading || membershipLoading || contentBlocked}
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: "1px solid #dfe6dc",
                background: "#f7faf6",
                color: "#52614f",
                cursor: loading || membershipLoading || contentBlocked ? "not-allowed" : "pointer",
              }}
            >
              {copy.take_photo}
            </button>
          </div>
        )}

        <input
          ref={chooseInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => {
            appendFiles(Array.from(e.target.files || []));
            e.currentTarget.value = "";
          }}
          style={{ display: "none" }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            appendFiles(Array.from(e.target.files || []));
            e.currentTarget.value = "";
          }}
          style={{ display: "none" }}
        />

        <div style={{ marginTop: 6, fontSize: 12, color: "#777", lineHeight: 1.55 }}>
          {copy.photo_limit_prefix} {MAX_RECORD_PHOTOS_PER_ADD} {copy.photo_limit_suffix}
          <br />
          {copy.standard_photo_hint}
        </div>

        {filePreviews.length > 0 ? (
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
              gap: 8,
            }}
          >
            {filePreviews.map((preview, index) => (
              <div
                key={preview.key}
                style={{ position: "relative", aspectRatio: "1 / 1" }}
              >
                <img
                  src={preview.url}
                  alt={preview.name || `${copy.pending_photo_alt} ${index + 1}`}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "1px solid #edf1ea",
                    background: "#f4f7f2",
                    display: "block",
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeSelectedFile(index)}
                  aria-label={copy.remove_photo}
                  style={{
                    position: "absolute",
                    top: 5,
                    right: 5,
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    border: "none",
                    background: "rgba(0,0,0,0.55)",
                    color: "#fff",
                    cursor: "pointer",
                    lineHeight: "30px",
                  }}
                >
                  <UiIcon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

      </div>

      {files.length > 1 && (
        <label style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={splitByDate}
            onChange={(e) => setSplitByDate(e.target.checked)}
          />
          <span>{language === "zh" ? "按日期分开生成多条记录" : "Create separate records by date"}</span>
        </label>
      )}

      {restoreNotice ? <p role="status" style={{ marginTop: 12, color: "#805d26", lineHeight: 1.6 }}>
        {restoreNotice}
      </p> : null}

      {mobileMode && submissionNeedsReview && isAndroidRecordGallery() ? (
        <section data-r21-photo-recovery="media-only" style={{ marginTop: 12, padding: 12, border: "1px solid #bdbb88", borderRadius: 10 }}>
          <strong>{language === "zh" ? "核对原记录并恢复缺失图片" : "Reconcile the original record and missing photo"}</strong>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            {language === "zh"
              ? "不会新建第二条记录。仅在原记录身份、归属和已有图片均可核实时，才补传缺失图片。"
              : "No new record is created. The original record, its ownership and existing media must be verified before uploading a missing photo."}
          </p>
          <button type="button" onClick={() => { void recoverConfirmedRecordPhoto(); }}
            disabled={recoveringPhoto || membershipLoading || contentBlocked}
            style={{ display: "block", marginTop: 10, padding: "10px 14px" }}>
            {recoveringPhoto
              ? (language === "zh" ? "正在核对并补传..." : "Reconciling...")
              : (language === "zh" ? "核对后只补传图片" : "Reconcile and upload photo only")}
          </button>
          {recoveryError ? <p role="alert" data-r21-recovery-error="true" style={{ color: "#a33622" }}>
            {recoveryError}
          </p> : null}
        </section>
      ) : null}

      <button
        onClick={handleAdd}
        disabled={loading || membershipLoading || contentBlocked || uploadWouldExceedStorage || submissionNeedsReview}
        style={{
          marginTop: "12px",
          padding: "10px 16px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          background: "#fff",
          cursor:
            loading || membershipLoading || contentBlocked || uploadWouldExceedStorage || submissionNeedsReview
              ? "not-allowed"
              : "pointer",
        }}
      >
        {loading ? t.submitting : t.submit}
      </button>
    </div>
  );
}

const mobileFieldStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  marginTop: 14,
};

const mobileFieldLabelStyle: CSSProperties = {
  color: "#344633",
  fontSize: 15,
  fontWeight: 750,
};

const mobileTextAreaStyle: CSSProperties = {
  width: "100%",
  minHeight: 142,
  resize: "vertical",
  boxSizing: "border-box",
  border: "1px solid #ccd5c8",
  borderRadius: 16,
  background: "#fff",
  padding: "12px 13px",
  color: "#263426",
  fontSize: 16,
  lineHeight: 1.55,
};

const mobileOptionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const mobileControlStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  boxSizing: "border-box",
  border: "1px solid #d4ddd0",
  borderRadius: 12,
  background: "#fff",
  padding: "8px 10px",
  color: "#344633",
  fontSize: 14,
};

const mobilePrivateNoticeStyle: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 7,
  marginTop: 14,
  color: "#758071",
  fontSize: 13,
};

const mobilePhotoSectionStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 4,
};

const mobilePhotoHeadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 10,
  color: "#344633",
  fontSize: 14,
};

const mobilePhotoActionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const mobilePhotoButtonStyle: CSSProperties = {
  minHeight: 46,
  border: "1px solid #d6dfd2",
  borderRadius: 999,
  background: "#fff",
  color: "#356033",
  fontSize: 15,
  fontWeight: 750,
};

const cycleSelectLabelStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 10,
  color: "#5b6b58",
  fontSize: 13,
} as const;

const cycleSelectStyle = {
  minWidth: 150,
  maxWidth: "100%",
  padding: "6px 8px",
  border: "1px solid #dfe6dc",
  borderRadius: 8,
  background: "#fff",
  color: "#3f513d",
} as const;

const endCycleAfterSaveStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginTop: 8,
  color: "#5b6b58",
  fontSize: 13,
} as const;
