"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function EditRecord({
  id,
  initialText,
}: {
  id: string;
  initialText: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initialText);
  const router = useRouter();

  async function handleSave() {
    const { error } = await supabase
      .from("records")
      .update({ note: text })
      .eq("id", id);

    if (!error) {
      setEditing(false);
      router.refresh();
    } else {
      alert("更新失败");
    }
  }

  // 👉 展示模式（手机优化）
  if (!editing) {
    return (
      <div>
        <p
          style={{
            fontSize: "16px",
            lineHeight: "1.7",
            marginBottom: "8px",
          }}
        >
          {text || "（无内容）"}
        </p>

        <button
          onClick={() => setEditing(true)}
          style={{
            fontSize: "14px",
            padding: "6px 10px",
            borderRadius: "6px",
            border: "none",
            background: "#eee",
          }}
        >
          编辑
        </button>
      </div>
    );
  }

  // 👉 编辑模式（手机体验优化）
  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        style={{
          width: "100%",
          fontSize: "18px",
          lineHeight: "1.6",
          padding: "10px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          boxSizing: "border-box",
        }}
      />

      <div style={{ marginTop: "8px", display: "flex", gap: "10px" }}>
        <button
          onClick={handleSave}
          style={{
            flex: 1,
            padding: "10px",
            background: "#4CAF50",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
          }}
        >
          保存
        </button>

        <button
          onClick={() => setEditing(false)}
          style={{
            flex: 1,
            padding: "10px",
            background: "#ccc",
            border: "none",
            borderRadius: "8px",
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}