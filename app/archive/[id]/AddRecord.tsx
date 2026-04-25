"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import exifr from "exifr";
import { t } from "@/lib/i18n";
import { showToast } from "@/components/Toast";

type RecordVisibility = "public" | "private";

type Props = {
  archiveId: string;
  archiveIsPublic: boolean;
  placeholder?: string;
};

export default function AddRecord({
  archiveId,
  archiveIsPublic,
  placeholder,
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

  const router = useRouter();

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
      },
    ]);

    if (mediaError) {
      console.error("media 写入失败", mediaError);
    }
  }

  async function handleAdd() {
    if (loading) return;
    if (!text.trim() && files.length === 0) return;

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

      router.refresh();
    } catch (err) {
      console.log(err);
      showToast(t.error);
    }

    setLoading(false);
  }

  return (
    <div style={{ marginBottom: "20px" }}>
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
        disabled={loading}
        style={{
          marginTop: "12px",
          padding: "8px 14px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          background: "#fff",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? (t.submitting ?? "提交中...") : t.submit ?? "发布记录"}
      </button>
    </div>
  );
}
