"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import exifr from "exifr";

export default function AddRecord({ archiveId }: { archiveId: string }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [timeMode, setTimeMode] = useState("exif");
  const [customTime, setCustomTime] = useState("");
  const [mergeMode, setMergeMode] = useState(true); // ⭐ 新增
  const [loading, setLoading] = useState(false);

  const router = useRouter();

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

        // 🟢 ===== 模式B：多图合并 =====
        if (mergeMode) {

          let photoTimeISO = null;

          // 用第一张图时间
          if (timeMode === "exif") {
            try {
              const exifData = await exifr.parse(files[0]);
              if (exifData?.DateTimeOriginal) {
                photoTimeISO = new Date(
                  exifData.DateTimeOriginal
                ).toISOString();
              }
            } catch {}
          }

          if (timeMode === "custom") {
            if (!customTime) {
              alert("请选择自定义时间");
              setLoading(false);
              return;
            }
            photoTimeISO = new Date(customTime).toISOString();
          }

          if (!photoTimeISO) {
            photoTimeISO = new Date().toISOString();
          }

          // 创建一条记录
          const { data: record } = await supabase
            .from("records")
            .insert([
              {
                archive_id: archiveId,
                note: text.trim(),
                user_id: user.id,
                visibility: "community",
                photo_time: photoTimeISO,
              },
            ])
            .select()
            .single();

          if (!record) {
            setLoading(false);
            return;
          }

          // 所有图片绑定
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

          // 🔵 ===== 模式A：一图一记录 =====
          for (const file of files) {

            let photoTimeISO = null;

            if (timeMode === "exif") {
              try {
                const exifData = await exifr.parse(file);
                if (exifData?.DateTimeOriginal) {
                  photoTimeISO = new Date(
                    exifData.DateTimeOriginal
                  ).toISOString();
                }
              } catch {}
            }

            if (timeMode === "custom") {
              if (!customTime) {
                alert("请选择自定义时间");
                setLoading(false);
                return;
              }
              photoTimeISO = new Date(customTime).toISOString();
            }

            if (!photoTimeISO) {
              photoTimeISO = new Date().toISOString();
            }

            const { data: record } = await supabase
              .from("records")
              .insert([
                {
                  archive_id: archiveId,
                  note: text.trim(),
                  user_id: user.id,
                  visibility: "community",
                  photo_time: photoTimeISO,
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
      }

      // 清空
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
        placeholder="记录今天发生的变化"
        style={{
          padding: "10px",
          width: "100%",
          boxSizing: "border-box",
        }}
      />

      {/* 时间 */}
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

      {/* ⭐ 合并模式开关 */}
    <label style={{ display: "block", marginTop: "10px" }}>
     <input
      type="checkbox"
      checked={!mergeMode}
      onChange={(e) => setMergeMode(!e.target.checked)}
      />
      每张图一条记录
    </label>

      {/* 按钮 */}
      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
        {/* 拍照 */}
        <button
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.capture = "environment";

            input.onchange = (e: any) => {
  const newFiles = Array.from(e.target.files || []) as File[];

  if (newFiles.length > 0) {
    setFiles((prev: File[]) => [...prev, ...newFiles]);
  }
};

            input.click();
          }}
          style={{
            flex: 1,
            padding: "12px",
            background: "#4CAF50",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
          }}
        >
          📷 拍照
        </button>

        {/* 相册 */}
        <button
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";

            input.onchange = (e: any) => {
              if (e.target.files && e.target.files.length > 0) {
                setFiles((prev) => [...prev, e.target.files[0]]);
              }
            };

            input.click();
          }}
          style={{
            flex: 1,
            padding: "12px",
            background: "#888",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
          }}
        >
          🖼️ 相册
        </button>
      </div>

      {/* 预览 */}
      {files.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginTop: "10px",
            overflowX: "auto",
          }}
        >
          {files.map((file, index) => (
            <div key={index} style={{ position: "relative" }}>
              <img
                src={URL.createObjectURL(file)}
                style={{
                  width: "80px",
                  height: "80px",
                  objectFit: "cover",
                  borderRadius: "6px",
                }}
              />
              <div
                onClick={() => {
                  const newFiles = [...files];
                  newFiles.splice(index, 1);
                  setFiles(newFiles);
                }}
                style={{
                  position: "absolute",
                  top: "-6px",
                  right: "-6px",
                  background: "#f44336",
                  color: "#fff",
                  borderRadius: "50%",
                  width: "18px",
                  height: "18px",
                  fontSize: "12px",
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