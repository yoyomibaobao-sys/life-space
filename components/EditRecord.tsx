"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function EditRecord({
  id,
  initialText,
  readOnly = false,
  placeholder = "点击添加内容",
  compact = false,
  onSaved,
  onSaveOverride,
}: {
  id: string;
  initialText: string;
  readOnly?: boolean;
  placeholder?: string;
  compact?: boolean;
  onSaved?: (nextText: string) => void;
  onSaveOverride?: (nextText: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initialText);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!editing) setText(initialText);
  }, [initialText]);

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
      setError("");
      setEditing(false);
      return;
    }

    setLoading(true);
    setError("");
    const nextText = text.trim();

    let saveError: unknown = null;

    if (onSaveOverride) {
      try {
        await onSaveOverride(nextText);
      } catch (err) {
        saveError = err;
      }
    } else {
      const result = await supabase
        .from("records")
        .update({
          note: nextText,
        })
        .eq("id", id);
      saveError = result.error;
    }

    setLoading(false);

    if (saveError) {
      setError("保存失败，请稍后重试");
      return;
    }

    setText(nextText);
    onSaved?.(nextText);
    setEditing(false);

    if (!onSaveOverride) {
      router.refresh();
    }
  }

  function cancel() {
    setText(initialText);
    setError("");
    setEditing(false);
  }

  // 👀 只读模式
  if (readOnly) {
    if (!text.trim()) return null;
    return <div style={compact ? mobileReadTextStyle : undefined}>{text}</div>;
  }

  // 👤 阅读态
  if (!editing) {
    return (
      <div
        onClick={() => {
          setError("");
          setEditing(true);
        }}
        style={compact ? mobileReadTextStyle : desktopReadTextStyle}
      >
        {text || (
          <span style={compact ? mobilePlaceholderStyle : desktopPlaceholderStyle}>
            {placeholder}
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
          minHeight: compact ? 42 : undefined,
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

      {error ? (
        <div
          style={{
            marginTop: 4,
            fontSize: "12px",
            color: "#b64737",
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

const desktopReadTextStyle = {
  cursor: "text",
  whiteSpace: "pre-wrap",
  fontSize: 16,
  lineHeight: 1.6,
  fontWeight: 500,
  marginBottom: 6,
} as const;

const mobileReadTextStyle = {
  cursor: "text",
  whiteSpace: "pre-wrap",
  color: "#2e382c",
  fontSize: 14,
  lineHeight: 1.55,
  fontWeight: 500,
  wordBreak: "break-word",
  margin: "2px 0 8px",
} as const;

const desktopPlaceholderStyle = {
  color: "#999",
} as const;

const mobilePlaceholderStyle = {
  color: "#a1ab9d",
  fontWeight: 500,
} as const;
