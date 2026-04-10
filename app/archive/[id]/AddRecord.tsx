"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import exifr from "exifr";

// ⭐新增 Props 类型
type Props = {
  archiveId: string;
  placeholder?: string;
};

export default function AddRecord({ archiveId, placeholder }: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [timeMode, setTimeMode] = useState("exif");
  const [customTime, setCustomTime] = useState("");
  const [mergeMode, setMergeMode] = useState(true);
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

    if (timeMode === "custom") {
      return new Date(customTime).toISOString();
    }

    return new Date().toISOString();
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
        alert("请先登录");
        setLoading(false);
        return;
      }

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

          const { data: record } = await supabase
            .from("records")
            .insert([
              {
                archive_id: archiveId,
                note: text.trim(),
                user_id: user.id,
                visibility: "community",
                photo_time: recordTimeISO,
                record_time: recordTimeISO,
                upload_time: new Date().toISOString(),
              },
            ])
            .select()
            .single();

          if (!record) {
            setLoading(false);
            return;
          }

          for (const file of files) {
            const fileName = `${Date.now()}-${file.name}`;

            await supabase.storage.from("media").upload(fileName, file);

            const { data: urlData } = supabase.storage
              .from("media")
              .getPublicUrl(fileName);

            await supabase.from("media").insert([
              {
                record_id: record.id,
                type: "image",
                url: urlData.publicUrl,
                user_id: user.id,
              },
            ]);
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

            const { data: record } = await supabase
              .from("records")
              .insert([
                {
                  archive_id: archiveId,
                  note: text.trim(),
                  user_id: user.id,
                  visibility: "community",
                  photo_time: recordTimeISO,
                  record_time: recordTimeISO,
                  upload_time: new Date().toISOString(),
                },
              ])
              .select()
              .single();

            if (!record) continue;

            const fileName = `${Date.now()}-${file.name}`;

            await supabase.storage.from("media").upload(fileName, file);

            const { data: urlData } = supabase.storage
              .from("media")
              .getPublicUrl(fileName);

            await supabase.from("media").insert([
              {
                record_id: record.id,
                type: "image",
                url: urlData.publicUrl,
                user_id: user.id,
              },
            ]);
          }
        }
      } else {
        const recordTimeISO = resolveTime({
          timeMode,
          customTime,
        });

        await supabase.from("records").insert([
          {
            archive_id: archiveId,
            note: text.trim(),
            user_id: user.id,
            visibility: "community",
            photo_time: recordTimeISO,
            record_time: recordTimeISO,
            upload_time: new Date().toISOString(),
          },
        ]);
      }

      setText("");
      setFiles([]);
      setCustomTime("");

      router.refresh();
    } catch (err) {
      console.log(err);
      alert("发生异常");
    }

    setLoading(false);
  }

  return (
    <div style={{ marginBottom: "20px" }}>
      {/* 文本 */}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder || "记录今天发生的变化"} // ⭐关键修复
        style={{
          padding: "10px",
          width: "100%",
          boxSizing: "border-box",
        }}
      />

      {/* 时间选择 */}
      <select
        value={timeMode}
        onChange={(e) => setTimeMode(e.target.value)}
        style={{ marginTop: "10px", padding: "6px" }}
      >
        <option value="exif">拍摄时间</option>
        <option value="now">当前时间</option>
        <option value="custom">自定义时间</option>
      </select>

      {timeMode === "custom" && (
        <input
          type="datetime-local"
          value={customTime}
          onChange={(e) => setCustomTime(e.target.value)}
          style={{ marginTop: "10px", padding: "6px" }}
        />
      )}

      {/* 合并开关 */}
      <label style={{ display: "block", marginTop: "10px" }}>
        <input
          type="checkbox"
          checked={!mergeMode}
          onChange={(e) => setMergeMode(!e.target.checked)}
        />
        每张图一条记录
      </label>

      {/* 上传按钮 */}
      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
        <button
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.capture = "environment";

            input.onchange = (e: any) => {
              const newFiles = Array.from(e.target.files || []) as File[];
              setFiles((prev) => [...prev, ...newFiles]);
            };

            input.click();
          }}
        >
          📷 拍照
        </button>

        <button
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";

            input.onchange = (e: any) => {
              if (e.target.files?.length > 0) {
                setFiles((prev) => [...prev, e.target.files[0]]);
              }
            };

            input.click();
          }}
        >
          🖼️ 相册
        </button>
      </div>

      {/* 预览 */}
      {files.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {files.map((file, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img
                src={URL.createObjectURL(file)}
                style={{
                  width: 80,
                  height: 80,
                  objectFit: "cover",
                  borderRadius: 6,
                }}
              />
              <div
                onClick={() =>
                  setFiles((prev) => prev.filter((_, idx) => idx !== i))
                }
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  background: "#f44336",
                  color: "#fff",
                  borderRadius: "50%",
                  width: 18,
                  height: 18,
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                ×
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 提交 */}
      <button
        onClick={handleAdd}
        disabled={loading}
        style={{
          marginTop: "10px",
          width: "100%",
          padding: "12px",
          background: loading ? "#ccc" : "#4CAF50",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
        }}
      >
        {loading ? "提交中..." : "添加"}
      </button>
    </div>
  );
}