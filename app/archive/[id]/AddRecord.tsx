"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { showToast } from "@/components/Toast";
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
  cancelStorageUploadReservation,
  reconcileMediaUploadCommit,
  reserveStorageUpload,
  settleStorageUploadReservation,
} from "@/lib/storage-usage";
import {
  isStorageUploadMaintenance,
  STORAGE_UPLOAD_MAINTENANCE_RECORD_NOT_SAVED_MESSAGE,
  STORAGE_UPLOAD_MAINTENANCE_TEXT_SAVED_MESSAGE,
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
  buildRecordPhotoGroups,
  limitRecordPhotoBatch,
  MAX_RECORD_PHOTOS_PER_ADD,
  type TimedRecordPhoto,
} from "@/lib/record-photo-batches";
import {
  isMissingDatabaseColumn,
  withoutCapturedAt,
} from "@/lib/supabase-schema-compat";
import AppIcon from "@/components/ui/AppIcon";

type RecordVisibility = "public" | "private";

type Props = {
  archiveId: string;
  archiveCategory?: string | null;
  archiveIsPublic: boolean;
  archiveDefaultRecordVisibility?: RecordVisibility;
  activeCycles?: ArchiveCycle[];
  placeholder?: string;
  onRecordCreated?: () => void | Promise<void>;
  mobileMode?: boolean;
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
  archiveDefaultRecordVisibility = "private",
  activeCycles = [],
  placeholder,
  onRecordCreated,
  mobileMode = false,
}: Props) {
  const terminology = getArchiveCycleTerminology(archiveCategory);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<SelectedPreview[]>([]);
  const [timeMode, setTimeMode] = useState("exif");
  const [customTime, setCustomTime] = useState("");
  const [mergeMode, setMergeMode] = useState(true);
  const [recordVisibility, setRecordVisibility] =
    useState<RecordVisibility>(
      archiveDefaultRecordVisibility === "public" ? "public" : "private"
    );
  const [isHelpRecord, setIsHelpRecord] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>(undefined);
  const [endSelectedCycleAfterSave, setEndSelectedCycleAfterSave] = useState(false);
  const [loading, setLoading] = useState(false);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipNotice, setMembershipNotice] = useState("");

  const chooseInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const filePreviewsRef = useRef<SelectedPreview[]>([]);
  const router = useRouter();
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
    !membershipLoading && !canCreateMembershipContent(membership);
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
      setRecordVisibility(
        archiveDefaultRecordVisibility === "public" ? "public" : "private"
      );
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [archiveDefaultRecordVisibility]);

  useEffect(() => {
    async function loadMembership() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setMembership(null);
        setMembershipLoading(false);
        return;
      }

      const [membershipResult, profileResult] = await Promise.all([
        supabase.rpc("get_my_membership"),
        supabase.from("profiles").select("storage_used").eq("id", user.id).maybeSingle(),
      ]);

      if (membershipResult.error) {
        console.error("load membership error:", membershipResult.error);
        setMembership(null);
      } else {
        setMembership(normalizeMembershipRpcResult(membershipResult.data));
      }

      if (profileResult.error) {
        console.error("load profile storage error:", profileResult.error);
        setStorageUsedBytes(0);
      } else {
        setStorageUsedBytes(Number(profileResult.data?.storage_used || 0));
      }

      setMembershipLoading(false);
    }

    void loadMembership();
  }, []);

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
        const capturedAt = await readImageCapturedAt(file);

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

  function appendFiles(nextFiles: File[]) {
    if (nextFiles.length === 0) return;
    const { accepted, rejectedCount } = limitRecordPhotoBatch(nextFiles);

    if (rejectedCount > 0) {
      showToast(
        `每次最多添加 ${MAX_RECORD_PHOTOS_PER_ADD} 张，已加入前 ${MAX_RECORD_PHOTOS_PER_ADD} 张；可以再次添加。`,
      );
    }

    const previews = accepted.map((file, index) => ({
      key: buildFileKey(file, files.length + index),
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    filePreviewsRef.current = [...filePreviewsRef.current, ...previews];
    setFiles((prev) => [...prev, ...accepted]);
    setFilePreviews((prev) => [...prev, ...previews]);
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

    const { data: record, error } = await supabase
      .from("records")
      .insert([
        {
          archive_id: params.archiveId,
          cycle_id: effectiveCycleId || null,
          note,
          user_id: params.userId,
          visibility: params.visibility,
          photo_time: params.recordTimeISO,
          record_time: params.recordTimeISO,
          upload_time: new Date().toISOString(),
          status_tag: params.statusTag,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("record 创建失败", error);
      return null;
    }

    return record;
  }

  async function refreshStorageUsed(userId: string) {
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
    const compressed = await standardizeRecordPhotoFile(file);
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
        });
        setMembershipNotice(message);
        showToast(message);
      } else if (reserveResult.message === "membership_inactive") {
        const message = getCreateContentBlockedText(membership);
        setMembershipNotice(message);
        showToast(message);
      } else if (reserveResult.message === "upload_maintenance") {
        setMembershipNotice(STORAGE_UPLOAD_MAINTENANCE_TEXT_SAVED_MESSAGE);
        showToast(STORAGE_UPLOAD_MAINTENANCE_TEXT_SAVED_MESSAGE);
      } else {
        setMembershipNotice("容量检查失败");
        showToast("容量检查失败");
      }

      return 0;
    }

    const reservation = {
      reservation_id: reserveResult.reservation_id,
      reservation_mode: reserveResult.reservation_mode,
      reserved_bytes: reservedBytes,
    } as const;

    setStorageUsedBytes(reserveResult.storage_used);

    const { error: uploadError } = await uploadMediaStorageObject(
      fileName,
      uploadFile,
      {
        contentType: uploadFile.type || "image/jpeg",
      }
    );

    if (uploadError) {
      console.error("媒体上传失败", uploadError);
      await supabase.storage
        .from("media")
        .remove([fileName, thumbName].filter((path): path is string => Boolean(path)));
      const cancelResult = await cancelStorageUploadReservation(reservation);
      setStorageUsedBytes(cancelResult.storage_used);
      if (await isStorageUploadMaintenance()) {
        setMembershipNotice(STORAGE_UPLOAD_MAINTENANCE_TEXT_SAVED_MESSAGE);
        showToast(STORAGE_UPLOAD_MAINTENANCE_TEXT_SAVED_MESSAGE);
      }
      return 0;
    }

    let uploadedThumbPath: string | null = null;
    let uploadedThumbBytes = 0;

    if (thumbFile && thumbName) {
      const { error: thumbUploadError } = await uploadMediaStorageObject(
        thumbName,
        thumbFile,
        {
          contentType: thumbFile.type || "image/jpeg",
        }
      );

      if (thumbUploadError) {
        console.error("缩略图上传失败", thumbUploadError);
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
      const reconciliation = await reconcileMediaUploadCommit({ storagePath: fileName });

      if (reconciliation.status === "found") {
        mediaId = reconciliation.mediaId;
      } else if (reconciliation.status === "missing") {
        await supabase.storage
          .from("media")
          .remove([fileName, uploadedThumbPath].filter((path): path is string => Boolean(path)));
        const cancelResult = await cancelStorageUploadReservation(reservation);
        setStorageUsedBytes(cancelResult.storage_used);
        return 0;
      } else {
        showToast("图片保存状态待确认，请刷新后查看。为避免误删，已保留上传内容。");
        return 0;
      }
    }

    const settleResult = await settleStorageUploadReservation({
      reservation,
      targetType: "media",
      targetId: mediaId,
      legacyActualBytes: actualBytes,
    });
    if (settleResult.ok) setStorageUsedBytes(settleResult.storage_used);

    return actualBytes;
  }

  async function handleAdd() {
    if (loading) return;
    if (!text.trim() && files.length === 0) return;

    if (files.length > 0 && (await isStorageUploadMaintenance())) {
      setMembershipNotice(STORAGE_UPLOAD_MAINTENANCE_RECORD_NOT_SAVED_MESSAGE);
      showToast(STORAGE_UPLOAD_MAINTENANCE_RECORD_NOT_SAVED_MESSAGE);
      return;
    }
    setMembershipNotice("");

    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership));
      return;
    }

    if (uploadWouldExceedStorage) {
      showToast(
        getStorageLimitExceededText({
          usedBytes: storageUsedBytes,
          limitBytes: storageLimitBytes,
          uploadBytes: selectedFileBytes,
        })
      );
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        showToast(t.please_login);
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
      let cycleEndRecordTime: string | null = null;
      const preparedPhotos =
        files.length > 0 ? await prepareSelectedPhotos() : [];
      const photoGroups = buildRecordPhotoGroups(preparedPhotos, mergeMode);

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

      if (finalStatusTag === "help" && finalVisibility !== "public") {
        const confirmed = confirm(
          "求助需要公开这条记录和相关图片。你的其他记录不会公开。确认后，这条记录会进入公开发现和求助流。"
        );

        if (!confirmed) {
          setLoading(false);
          return;
        }

        const { error: archiveError } = await supabase
          .from("archives")
          .update({ is_public: true, help_status: "open", help_updated_at: new Date().toISOString() })
          .eq("id", archiveId)
          .eq("user_id", user.id);

        if (archiveError) {
          showToast("公开项目壳失败，暂不能发起求助");
          setLoading(false);
          return;
        }

        finalVisibility = "public";
        archiveHelpStateUpdated = true;
      }

      if (finalStatusTag === "help" && !archiveHelpStateUpdated) {
        await supabase
          .from("archives")
          .update({ help_status: "open", help_updated_at: new Date().toISOString() })
          .eq("id", archiveId)
          .eq("user_id", user.id);
      }

      if (photoGroups.length > 0) {
        for (const group of photoGroups) {
          const record = await createRecord({
            archiveId,
            userId: user.id,
            note: text.trim(),
            recordTimeISO: group.recordTimeISO,
            visibility: finalVisibility,
            statusTag: finalStatusTag,
          });

          if (!record) continue;
          createdRecordCount += 1;

          for (const photo of group.photos) {
            uploadedBytes += await uploadMedia(
              record.id,
              user.id,
              photo.file,
              photo.capturedAt,
            );
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

      setText("");
      clearSelectedFiles();
      setCustomTime("");
      setRecordVisibility(archiveDefaultRecordVisibility === "public" ? "public" : "private");
      setIsHelpRecord(false);
      setSelectedCycleId(undefined);
      setEndSelectedCycleAfterSave(false);

      await onRecordCreated?.();
      router.refresh();
      if (cycleEndFailed) {
        showToast(terminology.endAfterSaveFailureMessage);
      }
    } catch (err) {
      console.log(err);
      showToast(t.error);
    }

    setLoading(false);
  }

  return (
    <div style={{ marginBottom: "20px" }}>
      {contentBlocked ? (
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
          <span>{getCreateContentBlockedText(membership)}</span>{" "}
          <Link href="/membership" style={{ color: "#5d7c2f", fontWeight: 700 }}>
            查看云空间
          </Link>
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
          <Link href="/membership" style={{ color: "#5d7c2f", fontWeight: 700 }}>
            查看云空间
          </Link>
        </div>
      ) : null}

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder || t.add_record_placeholder}
        style={{
          padding: "10px",
          width: "100%",
          boxSizing: "border-box",
        }}
      />

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
                {terminology.cycleLabel(cycle.cycle_no)}（{formatLocalCycleDate(cycle.started_at)}开始）
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

      <select
        value={timeMode}
        onChange={(e) => setTimeMode(e.target.value)}
        style={{ marginTop: "10px", padding: "6px" }}
      >
        <option value="exif">{t.photo_time ?? "照片时间"}</option>
        <option value="custom">{t.custom_time ?? "自定义时间"}</option>
        <option value="now">{t.current_time ?? "当前时间"}</option>
      </select>

      {archiveIsPublic ? (
        <select
          value={recordVisibility}
          onChange={(e) =>
            setRecordVisibility(e.target.value as RecordVisibility)
          }
          style={{ marginTop: "10px", marginLeft: 8, padding: "6px" }}
        >
          <option value="public">公开发现</option>
          <option value="private">仅自己可见</option>
        </select>
      ) : (
        <span style={{ marginLeft: 8, fontSize: 12, color: "#888" }}>
          项目和记录仅自己可见
        </span>
      )}

      <div style={{ marginTop: "10px" }}>
        <label style={{ fontSize: 13, color: "#555" }}>
          <input
            type="checkbox"
            checked={isHelpRecord}
            onChange={(e) => setIsHelpRecord(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          求助！
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
          <button
            type="button"
            onClick={() => chooseInputRef.current?.click()}
            disabled={loading || membershipLoading || contentBlocked}
            aria-label="添加图片或拍照"
            title="添加图片或拍照"
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              border: "1px solid #dfe6dc",
              background: "#fff",
              color: "#4f684b",
              fontSize: 24,
              lineHeight: 1,
              cursor: loading || membershipLoading || contentBlocked ? "not-allowed" : "pointer",
            }}
          >
            +
          </button>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => chooseInputRef.current?.click()}
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
              选择照片
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
              拍照
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

        <div style={{ marginTop: 6, fontSize: 12, color: "#777", lineHeight: 1.6 }}>
          每次最多添加 {MAX_RECORD_PHOTOS_PER_ADD} 张，可分多次继续添加；单条记录累计照片不设上限。
          <br />
          保存前自动生成最长边不超过 1800px、质量 82% 的标准版；小图不放大。
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
                <Image
                  src={preview.url}
                  alt={preview.name || `待上传图片 ${index + 1}`}
                  fill
                  unoptimized
                  sizes="(max-width: 760px) 25vw, 120px"
                  style={{
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
                  aria-label="移除这张图片"
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
                  <AppIcon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {selectedFileBytes > 0 ? (
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: uploadWouldExceedStorage ? "#9a4a14" : "#777",
              lineHeight: 1.6,
            }}
          >
            本次原图约 {formatStorageBytes(selectedFileBytes)}，上传时会自动压缩后再占用容量。
            {storageRemainingBytes !== null
              ? ` 当前剩余约 ${formatStorageBytes(storageRemainingBytes)}。`
              : ""}
            {uploadWouldExceedStorage ? (
              <>
                <br />
                空间不足，无法上传。{" "}
                <Link href="/membership" style={{ color: "#5d7c2f", fontWeight: 700 }}>
                  查看云空间
                </Link>
                。
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {files.length > 1 && (
        <div style={{ marginTop: "10px" }}>
          <label>
            <input
              type="checkbox"
              checked={mergeMode}
              onChange={(e) => setMergeMode(e.target.checked)}
            />{" "}
            不按照片日期拆分，合并为一条记录（采用最新照片日期）
          </label>
          {!mergeMode ? (
            <div style={{ marginTop: 4, fontSize: 12, color: "#777", lineHeight: 1.6 }}>
              将按照片日期生成记录；同一天的照片归入同一条记录。
            </div>
          ) : null}
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={loading || membershipLoading || contentBlocked || uploadWouldExceedStorage}
        style={{
          marginTop: "12px",
          padding: "10px 16px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          background: "#fff",
          cursor:
            loading || membershipLoading || contentBlocked || uploadWouldExceedStorage
              ? "not-allowed"
              : "pointer",
        }}
      >
        {loading ? (t.submitting ?? "提交中...") : t.submit ?? "发布记录"}
      </button>
    </div>
  );
}

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
