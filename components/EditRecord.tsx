"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function EditRecord({
  id,
  initialText,
  readOnly = false,
}: {
  id: string;
  initialText: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initialText);
  const [loading, setLoading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const router = useRouter();

  // 自动聚焦 + 自动高度
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      autoResize();
    }
  }, [editing]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  async function save() {
    if (loading) return;

    // 没变化不提交
    if (text === initialText) {
      setEditing(false);
      return;
    }

    setLoading(true);

    await supabase
      .from("records")
      .update({ note: text })
      .eq("id", id);

    setLoading(false);
    setEditing(false);

    router.refresh();
  }

  function cancel() {
    setText(initialText);
    setEditing(false);
  }

  // 👀 只读模式
  if (readOnly) {
    return <div>{text}</div>;
  }

  // 👤 阅读态
  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        style={{
          cursor: "text",
          whiteSpace: "pre-wrap",
        }}
      >
        {text || (
          <span style={{ color: "#999" }}>
            点击添加内容
          </span>
        )}
      </div>
    );
  }

  // ✏️ 编辑态（Notion风格）
  return (
    <div style={{ position: "relative" }}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          autoResize();
        }}
        onBlur={save}
        autoFocus
        placeholder="输入内容..."
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          resize: "none",
          fontSize: "14px",
          lineHeight: "1.6",
          background: "transparent",
        }}
        onKeyDown={(e) => {
          // Enter 保存
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }

          // ESC 取消
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
      />

      {/* 状态提示 */}
      {loading && (
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: "-18px",
            fontSize: "12px",
            color: "#999",
          }}
        >
          保存中...
        </div>
      )}
    </div>
  );
}