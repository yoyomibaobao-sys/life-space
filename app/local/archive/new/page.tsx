"use client";

import Link from "next/link";
import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/Toast";
import {
  archiveCategoryOptions,
  getArchiveCategoryDescription,
  getArchiveNamePlaceholder,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import { createLocalArchive } from "@/lib/local-offline-db";

export default function NewLocalArchivePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ArchiveCategory>("plant");
  const [systemName, setSystemName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      showToast("请填写项目名");
      return;
    }

    setSaving(true);
    try {
      const archive = await createLocalArchive({
        title: cleanTitle,
        category,
        system_name: systemName,
        note,
      });

      showToast("本地项目已创建");
      router.push(`/local/archive/${archive.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "创建本地项目失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <Link href="/local/archive" style={backLinkStyle}>
          返回本地项目
        </Link>
        <div style={eyebrowStyle}>只保存在本机</div>
        <h1 style={titleStyle}>新建本地项目</h1>
        <p style={subtitleStyle}>
          本地项目不写入 Supabase，不进入发现页，也不支持公开、求助、评论和集市。
        </p>

        <form onSubmit={handleSubmit} style={formStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>项目名</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：阳台番茄"
              style={inputStyle}
            />
          </label>

          <div style={fieldStyle}>
            <span style={labelStyle}>主分类</span>
            <div style={categoryGridStyle}>
              {archiveCategoryOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCategory(option.value)}
                  style={{
                    ...categoryButtonStyle,
                    ...(category === option.value ? categoryButtonActiveStyle : {}),
                  }}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <label style={fieldStyle}>
            <span style={labelStyle}>
              {category === "plant" ? "植物 / 作物名" : getArchiveNamePlaceholder(category)}
            </span>
            <input
              value={systemName}
              onChange={(event) => setSystemName(event.target.value)}
              placeholder={
                category === "plant"
                  ? "例如：番茄、迷迭香、月季"
                  : `填写${getArchiveNamePlaceholder(category)}名称`
              }
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>备注</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={getArchiveCategoryDescription(category)}
              rows={4}
              style={textareaStyle}
            />
          </label>

          <section style={noticeStyle}>
            图片会在添加记录时保存为 App 内部缓存副本，不会默认写入系统相册。删除本地记录会删除 App 内缓存，不影响用户相册里的原图。
          </section>

          <div style={actionRowStyle}>
            <Link href="/local/archive" style={cancelButtonStyle}>
              取消
            </Link>
            <button type="submit" disabled={saving} style={submitButtonStyle}>
              {saving ? "保存中..." : "创建本地项目"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "calc(100vh - 70px)",
  padding: "24px 16px 48px",
  background: "#fbfcf7",
  color: "#263326",
} satisfies CSSProperties;

const panelStyle = {
  maxWidth: 720,
  margin: "0 auto",
  padding: 20,
  borderRadius: 18,
  border: "1px solid #e2eadc",
  background: "#fff",
  boxShadow: "0 10px 28px rgba(42, 66, 34, 0.06)",
} satisfies CSSProperties;

const backLinkStyle = {
  display: "inline-flex",
  color: "#617258",
  fontSize: 13,
  textDecoration: "none",
  marginBottom: 12,
} satisfies CSSProperties;

const eyebrowStyle = {
  color: "#6f7b69",
  fontSize: 13,
  fontWeight: 700,
} satisfies CSSProperties;

const titleStyle = {
  margin: "4px 0 8px",
  fontSize: 26,
  lineHeight: 1.2,
} satisfies CSSProperties;

const subtitleStyle = {
  margin: 0,
  color: "#5d6a56",
  fontSize: 14,
  lineHeight: 1.7,
} satisfies CSSProperties;

const formStyle = {
  display: "grid",
  gap: 16,
  marginTop: 20,
} satisfies CSSProperties;

const fieldStyle = {
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const labelStyle = {
  color: "#334033",
  fontSize: 14,
  fontWeight: 700,
} satisfies CSSProperties;

const inputStyle = {
  width: "100%",
  height: 44,
  border: "1px solid #dbe5d4",
  borderRadius: 12,
  padding: "0 12px",
  background: "#fff",
  color: "#263326",
  outline: "none",
} satisfies CSSProperties;

const textareaStyle = {
  ...inputStyle,
  height: "auto",
  minHeight: 96,
  padding: 12,
  resize: "vertical",
  lineHeight: 1.6,
} satisfies CSSProperties;

const categoryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
} satisfies CSSProperties;

const categoryButtonStyle = {
  minHeight: 84,
  padding: 12,
  borderRadius: 14,
  border: "1px solid #dfe8d7",
  background: "#fbfdf8",
  color: "#394639",
  textAlign: "left",
  display: "grid",
  gap: 4,
} satisfies CSSProperties;

const categoryButtonActiveStyle = {
  borderColor: "#91b587",
  background: "#f0f7ec",
  color: "#285425",
} satisfies CSSProperties;

const noticeStyle = {
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e5ead5",
  background: "#f7faf2",
  color: "#5f6d58",
  fontSize: 13,
  lineHeight: 1.7,
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
} satisfies CSSProperties;

const cancelButtonStyle = {
  height: 42,
  padding: "0 16px",
  borderRadius: 999,
  border: "1px solid #d6dfd1",
  color: "#52624b",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 14,
} satisfies CSSProperties;

const submitButtonStyle = {
  height: 42,
  padding: "0 18px",
  borderRadius: 999,
  border: "1px solid #b7d2b0",
  background: "#3f7d3d",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
} satisfies CSSProperties;
