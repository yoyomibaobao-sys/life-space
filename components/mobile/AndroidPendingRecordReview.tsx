"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppConfirmDialog from "@/components/mobile/AppConfirmDialog";
import {
  cancelNeverUploadedCloudRecord,
  getLocalArchiveDetail,
  isPendingCloudSyncStatus,
  type LocalArchiveDetail,
  type LocalArchiveOwnerContext,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";

function pendingRecord(record: LocalRecordWithImages) {
  return isPendingCloudSyncStatus(record.sync.status) ||
    record.images.some((image) => isPendingCloudSyncStatus(image.sync.status));
}

// A new record may be cancelled only before ANY server attempt or cloud receipt.
// The local storage operation re-validates these conditions atomically.
function safelyCancelable(record: LocalRecordWithImages) {
  return record.sync.status === "pending-cloud-sync" &&
    record.sync.operation_kind === "create-record" &&
    (record.sync.attempt_count || 0) === 0 &&
    !record.sync.cloud_record_id &&
    record.images.every((image) =>
      image.sync.status === "pending-cloud-sync" &&
      image.sync.operation_kind === "upload-image" &&
      (image.sync.attempt_count || 0) === 0 &&
      !image.sync.cloud_media_id &&
      !image.sync.cloud_media_url);
}

export default function AndroidPendingRecordReview({
  archiveId, owner, language, onChanged, defaultExpanded = false, focused = false, onUploadRecord,
}: {
  archiveId: string;
  owner: LocalArchiveOwnerContext;
  language: "zh" | "en";
  onChanged?: () => void | Promise<void>;
  defaultExpanded?: boolean;
  focused?: boolean;
  onUploadRecord?: (recordId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded || focused);
  const [detail, setDetail] = useState<LocalArchiveDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ recordId: string; archiveId: string; ownerId: string } | null>(null);
  const [error, setError] = useState("");
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    const urls = new Map<string, string>();
    for (const record of detail?.records || []) {
      if (!pendingRecord(record)) continue;
      for (const image of record.images) {
        if (isPendingCloudSyncStatus(image.sync.status) && image.blob instanceof Blob) {
          urls.set(image.id, URL.createObjectURL(image.blob));
        }
      }
    }
    setImageUrls(urls);
    return () => { for (const url of urls.values()) URL.revokeObjectURL(url); };
  }, [detail]);

  useEffect(() => {
    if (!expanded || !owner.userId) return;
    let active = true;
    setLoading(true);
    setError("");
    void getLocalArchiveDetail(archiveId, owner).then((value) => {
      if (active) setDetail(value?.archive.local_owner_user_id === owner.userId ? value : null);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to load pending records");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [expanded, archiveId, owner.userId]);

  const pending = (detail?.records || []).filter(pendingRecord);
  const confirmRecord = confirmTarget && owner.userId &&
    confirmTarget.ownerId === owner.userId && confirmTarget.archiveId === archiveId &&
    detail?.archive.id === archiveId && detail.archive.local_owner_user_id === owner.userId && !busyId
    ? pending.find((record) => record.id === confirmTarget.recordId && safelyCancelable(record))
    : undefined;

  useEffect(() => { setConfirmTarget(null); }, [archiveId, owner.userId]);
  async function upload(record: LocalRecordWithImages) {
    if (!onUploadRecord || busyId) return;
    setBusyId(record.id);
    setError("");
    try {
      await onUploadRecord(record.id);
      const next = await getLocalArchiveDetail(archiveId, owner);
      setDetail(next?.archive.local_owner_user_id === owner.userId ? next : null);
      await onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法核实上传结果，本机记录已保留。");
    } finally { setBusyId(null); }
  }

  async function cancel(record: LocalRecordWithImages) {
    if (!owner.userId || busyId || !safelyCancelable(record) ||
      detail?.archive.id !== archiveId || detail.archive.local_owner_user_id !== owner.userId) return;
    setBusyId(record.id);
    setError("");
    try {
      // Owner must be the current verified cloud user; never use remembered identity.
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || data.user?.id !== owner.userId) {
        throw Error(language === "zh" ? "登录账号未通过验证，已保留记录。" : "Account not verified; record retained.");
      }
      await cancelNeverUploadedCloudRecord(record.id, owner);
      const next = await getLocalArchiveDetail(archiveId, owner);
      setDetail(next?.archive.local_owner_user_id === owner.userId ? next : null);
      setSelectedId(null);
      await onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message :
        (language === "zh" ? "未能确认安全删除，记录已保留。" : "Cancellation was not verified; record retained."));
    } finally {
      setBusyId(null);
    }
  }

  return <section data-w5-pending-record-review="true">
    {!focused ? <button type="button" aria-expanded={expanded}
      onClick={() => { setExpanded((open) => !open); setSelectedId(null); setConfirmTarget(null); }}>
      {language === "zh"
        ? (expanded ? "收起待上传记录" : "查看待上传记录")
        : (expanded ? "Hide pending records" : "View pending records only")}
    </button> : null}
    {expanded ? (
      <div style={{ padding: "8px 0" }}>
        {loading ? <p role="status">{language === "zh" ? "正在核对待上传记录…" : "Checking pending records..."}</p> : null}
        {!loading && !error && pending.length === 0 ? (
          <p role="status">{language === "zh" ? "暂无待上传记录。" : "No pending records; project changes may still be pending."}</p>
        ) : null}
        {pending.map((record) => {
          const opened = selectedId === record.id;
          const outstandingPhotos = record.images.filter((image) =>
            isPendingCloudSyncStatus(image.sync.status)).length;
          return <div key={record.id} data-w5-pending-record-id={record.id}
            style={{ borderTop: "1px solid #dfe7dc", padding: "9px 0" }}>
            <button type="button" onClick={() => setSelectedId(opened ? null : record.id)}
              aria-expanded={opened} style={{ display: "block", textAlign: "left", width: "100%" }}>
              {(record.note || "").trim().slice(0, 45) ||
                (language === "zh" ? "未填写文字的记录" : "Record without text")}
              {" · "}{outstandingPhotos}{language === "zh" ? "张照片待上传" : " photos pending"}
              {" · "}{language === "zh" ? "待上传" : "Pending upload"}
            </button>
            {opened ? <div style={{ padding: "8px 0" }}>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {record.note || (language === "zh" ? "（仅照片记录）" : "(Photo-only record)")}
              </p>
              <p>{language === "zh" ? "记录时间：" : "Record time: "}{record.record_time}</p>
              {outstandingPhotos > 0 ? <div data-w5-pending-photo-preview="true"
                style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {record.images.filter((image) => isPendingCloudSyncStatus(image.sync.status)).map((image) => (
                  imageUrls.has(image.id) ? <img key={image.id} src={imageUrls.get(image.id)!}
                    alt={language === "zh" ? "待上传照片" : "Pending photo"}
                    style={{ maxWidth: 120, maxHeight: 120, objectFit: "contain" }} />
                    : <span key={image.id}>{language === "zh" ? "照片暂不可预览" : "Photo preview unavailable"}</span>
                ))}
              </div> : null}
              {onUploadRecord ? (
                <button type="button" disabled={Boolean(busyId)} onClick={() => void upload(record)}>
                  {language === "zh" ? "上传" : "Upload"}
                </button>
              ) : null}
              {safelyCancelable(record) ? (
                <button type="button" disabled={Boolean(busyId)}
                  onClick={() => {
                    if (owner.userId && !busyId) setConfirmTarget({ recordId: record.id, archiveId, ownerId: owner.userId });
                  }}>
                  {language === "zh" ? "删除" : "Delete"}
                </button>
              ) : (
                <p role="status">{language === "zh"
                  ? "该记录可能已经尝试上传，或属于云端记录的修改。为保护资料，暂不允许直接删除；需要先核对云端回执。"
                  : "This entry may have a previous upload attempt or cloud changes. It is protected until receipts are reconciled."}</p>
              )}
            </div> : null}
          </div>;
        })}
        {error ? <p role="alert">{error}</p> : null}
      </div>
    ) : null}
    <AppConfirmDialog
      open={Boolean(confirmRecord)}
      title={language === "zh" ? "删除待上传记录" : "Delete pending record"}
      message={language === "zh"
        ? "确定取消这条从未上传的记录及其照片？删除后不能恢复。"
        : "Cancel this never-uploaded record and photos? This cannot be undone."}
      cancelLabel={language === "zh" ? "取消" : "Cancel"}
      confirmLabel={language === "zh" ? "删除" : "Delete"}
      destructive
      onCancel={() => setConfirmTarget(null)}
      onConfirm={() => {
        const record = confirmRecord;
        setConfirmTarget(null);
        if (record) void cancel(record);
      }}
    />
  </section>;
}
