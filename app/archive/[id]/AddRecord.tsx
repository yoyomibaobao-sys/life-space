"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import exifr from "exifr";
import { t } from "@/lib/i18n";
import { showToast } from "@/components/Toast";
import {
  canCreateMembershipContent,
  canUploadWithinStorageLimit,
  formatStorageBytes,
  getCreateContentBlockedText,
  getStorageLimitExceededText,
  getStorageRemainingBytes,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";

type RecordVisibility = "public" | "private";

type Props = {
  archiveId: string;
  archiveIsPublic: boolean;
  placeholder?: string;
  onRecordCreated?: () => void;
};

export default function AddRecord({
  archiveId,
  archiveIsPublic,
  placeholder,
  onRecordCreated,
}: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [timeMode, setTimeMode] = useState("exif");
  const [customTime, setCustomTime] = useState("");
  const [mergeMode, setMergeMode] = useState(true);
  const [recordVisibility, setRecordVisibility] =
    useState<RecordVisibility>("public");
  const [isHelpRecord, setIsHelpRecord] = useState(false);
  const [loading, setLoading] = useState(false);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [membershipLoading, setMembershipLoading] = useState(true);

  const router = useRouter();
  const contentBlocked = membership?.can_create_content === false;
  const selectedFileBytes = files.reduce((total, file) => total + file.size, 0);
  const storageLimitBytes = Number(membership?.storage_limit_bytes || 0);
  const storageRemainingBytes = getStorageRemainingBytes({
    usedBytes: storageUsedBytes,
    limitBytes: storageLimitBytes,
  });
  const uploadWouldExceedStorage =
    selectedFileBytes > 0 &&
    !canUploadWithinStorageLimit({
      usedBytes: storageUsedBytes,
      limitBytes: storageLimitBytes,
      uploadBytes: selectedFileBytes,
    });

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

  async function addStorageUsed(userId: string, sizeBytes: number) {
    const nextStorageUsed = Math.max(0, storageUsedBytes + sizeBytes);
    setStorageUsedBytes(nextStorageUsed);

    const { error } = await supabase
      .from("profiles")
      .update({ storage_used: nextStorageUsed })
      .eq("id", userId);

    if (error) {
      console.error("update storage used error:", error);
      void refreshStorageUsed(userId);
    }
  }

  async function uploadMedia(recordId: string, userId: string, file: File) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const fileName = `${userId}/${recordId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(fileName, file);

    if (uploadError) {
      console.error("媒体上传失败", uploadError);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("media")
      .getPublicUrl(fileName);

    const { error: mediaError } = await supabase.from("media").insert([
      {
        record_id: recordId,
        type: "image",
        url: urlData.publicUrl,
        user_id: userId,
        size_mb: file.size / (1024 * 1024),
      },
    ]);

    if (mediaError) {
      console.error("media 写入失败", mediaError);
      return;
    }

    await addStorageUsed(userId, file.size);
  }

  async function handleAdd() {
    if (loading) return;
    if (!text.trim() && files.length === 0) return;

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

      const finalVisibility: RecordVisibility = archiveIsPublic
        ? recordVisibility
        : "private";
      const finalStatusTag = isHelpRecord ? "help" : null;

      if (files.length > 0) {
        if (mergeMode) {
          let exifTime = null;

          if (timeMode === "exif") {
            try {
              const exifData = await exifr.parse(files[0]);
              if (exifData?.DateTimeOriginal) {
                exifTime = exifData.DateTimeOriginal;
              }
            } catch {}
          }

          const recordTimeISO = resolveTime({
            timeMode,
            customTime,
            exifTime,
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

          for (const file of files) {
            await uploadMedia(record.id, user.id, file);
          }
        } else {
          for (const file of files) {
            let exifTime = null;

            if (timeMode === "exif") {
              try {
                const exifData = await exifr.parse(file);
                if (exifData?.DateTimeOriginal) {
                  exifTime = exifData.DateTimeOriginal;
                }
              } catch {}
            }

            const recordTimeISO = resolveTime({
              timeMode,
              customTime,
              exifTime,
            });

            const record = await createRecord({
              archiveId,
              userId: user.id,
              note: text.trim(),
              recordTimeISO,
              visibility: finalVisibility,
              statusTag: finalStatusTag,
            });

            if (!record) continue;

            await uploadMedia(record.id, user.id, file);
          }
        }
      } else {
        const recordTimeISO = resolveTime({
          timeMode,
          customTime,
        });

        await createRecord({
          archiveId,
          userId: user.id,
          note: text.trim(),
          recordTimeISO,
          visibility: finalVisibility,
          statusTag: finalStatusTag,
        });
      }

      setText("");
      setFiles([]);
      setCustomTime("");
      setRecordVisibility("public");
      setIsHelpRecord(false);

      onRecordCreated?.();
      router.refresh();
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
            查看年度使用权
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
          <option value="public">公开记录</option>
          <option value="private">仅自己可见</option>
        </select>
      ) : (
        <span style={{ marginLeft: 8, fontSize: 12, color: "#888" }}>
          项目私密，记录仅自己可见
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
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        {selectedFileBytes > 0 ? (
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: uploadWouldExceedStorage ? "#9a4a14" : "#777",
              lineHeight: 1.6,
            }}
          >
            本次选择约 {formatStorageBytes(selectedFileBytes)}。
            {storageRemainingBytes !== null
              ? ` 当前剩余约 ${formatStorageBytes(storageRemainingBytes)}。`
              : ""}
            {uploadWouldExceedStorage ? (
              <>
                <br />
                当前容量不足，请减少图片、删除旧图片释放空间，或{" "}
                <Link href="/membership" style={{ color: "#5d7c2f", fontWeight: 700 }}>
                  查看年度使用权
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
            {t.merge_as_one_record ?? "多图合并为一条记录"}
          </label>
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={loading || membershipLoading || contentBlocked || uploadWouldExceedStorage}
        style={{
          marginTop: "12px",
          padding: "8px 14px",
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
