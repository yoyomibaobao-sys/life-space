"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import {
  archiveCategoryOptions,
  getArchiveCategoryDescription,
  type ArchiveCategory,
} from "@/lib/archive-categories";

type Props = {
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  category: ArchiveCategory;
  onCategoryChange: (category: ArchiveCategory) => void;
  projectTitle: string;
  onProjectTitleChange: (value: string) => void;
  systemControl: ReactNode;
  sourceControl: ReactNode;
  note: string;
  onNoteChange: (value: string) => void;
  notice: ReactNode;
  submitText: string;
  loadingText: string;
  submitting?: boolean;
  disabled?: boolean;
  disabledNotice?: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function ArchiveNewProjectFormShell({
  backHref,
  backLabel,
  eyebrow,
  title,
  subtitle,
  category,
  onCategoryChange,
  projectTitle,
  onProjectTitleChange,
  systemControl,
  sourceControl,
  note,
  onNoteChange,
  notice,
  submitText,
  loadingText,
  submitting = false,
  disabled = false,
  disabledNotice,
  onSubmit,
}: Props) {
  const systemNameLabel = category === "plant" ? "系统植物名 *" : "系统名 *";
  const systemNameHelper =
    category === "plant"
      ? "系统植物名用于和植物指引、项目档案关联，例如：蓝莓 · 薄雾、月季、小麦。"
      : category === "other"
        ? "其他种类没有预设系统名，直接输入。"
      : "系统名用于项目档案归类，例如：滴灌架、生态缸、蚯蚓塔。";

  return (
    <main style={pageStyle}>
      <section style={panelStyle}>
        <Link href={backHref} style={backLinkStyle}>
          {backLabel}
        </Link>
        <div style={eyebrowStyle}>{eyebrow}</div>
        <h1 style={titleStyle}>{title}</h1>
        {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}

        {disabledNotice ? <div style={disabledNoticeStyle}>{disabledNotice}</div> : null}

        <form onSubmit={onSubmit} style={formStyle}>
          <ArchiveNewProjectField label="大类 *">
            <div style={categoryGridStyle}>
              {archiveCategoryOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onCategoryChange(option.value)}
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
            <span style={helperTextStyle}>{getArchiveCategoryDescription(category)}</span>
          </ArchiveNewProjectField>

          <ArchiveNewProjectField label="项目名称 *">
            <input
              value={projectTitle}
              onChange={(event) => onProjectTitleChange(event.target.value)}
              placeholder="例如：阳台蓝莓、南院育苗架"
              style={archiveNewProjectInputStyle}
            />
          </ArchiveNewProjectField>

          <ArchiveNewProjectField
            label={systemNameLabel}
            helper={systemNameHelper}
          >
            {systemControl}
          </ArchiveNewProjectField>

          <ArchiveNewProjectField label="来源">
            {sourceControl}
          </ArchiveNewProjectField>

          <ArchiveNewProjectField label="位置备注 / 项目备注">
            <textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="例如：南阳台、东侧花盆、院子里的种植床"
              rows={4}
              style={archiveNewProjectTextareaStyle}
            />
          </ArchiveNewProjectField>

          <section style={noticeStyle}>{notice}</section>

          <div style={actionRowStyle}>
            <Link href={backHref} style={cancelButtonStyle}>
              取消
            </Link>
            <button
              type="submit"
              disabled={submitting || disabled}
              style={{
                ...submitButtonStyle,
                ...(submitting || disabled ? submitButtonDisabledStyle : {}),
              }}
            >
              {submitting ? loadingText : submitText}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export function ArchiveNewProjectField({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      {children}
      {helper ? <span style={helperTextStyle}>{helper}</span> : null}
    </div>
  );
}

export const archiveNewProjectInputStyle: CSSProperties = {
  width: "100%",
  height: 44,
  border: "1px solid #dbe5d4",
  borderRadius: 12,
  padding: "0 12px",
  background: "#fff",
  color: "#263326",
  outline: "none",
  boxSizing: "border-box",
  fontSize: 14,
};

export const archiveNewProjectTextareaStyle: CSSProperties = {
  ...archiveNewProjectInputStyle,
  height: "auto",
  minHeight: 96,
  padding: 12,
  resize: "vertical",
  lineHeight: 1.6,
};

export const archiveNewProjectSelectStyle: CSSProperties = {
  ...archiveNewProjectInputStyle,
  cursor: "pointer",
};

export const archiveNewProjectHelperTextStyle: CSSProperties = {
  color: "#7d8a76",
  fontSize: 12,
  lineHeight: 1.5,
};

export const archiveNewProjectSuggestionPanelStyle: CSSProperties = {
  marginTop: 8,
  border: "1px solid #e5eadf",
  borderRadius: 12,
  background: "#fff",
  maxHeight: 250,
  overflow: "auto",
  padding: 8,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

export function archiveNewProjectSuggestionButtonStyle(active = false): CSSProperties {
  return {
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 8,
    border: active ? "1px solid #4CAF50" : "1px solid transparent",
    background: active ? "#f0fff4" : "#fafafa",
    color: "#263326",
    cursor: "pointer",
    fontSize: 13,
  };
}

const pageStyle: CSSProperties = {
  minHeight: "calc(100vh - 70px)",
  padding: "24px 16px 48px",
  background: "#fbfcf7",
  color: "#263326",
};

const panelStyle: CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  padding: 20,
  borderRadius: 18,
  border: "1px solid #e2eadc",
  background: "#fff",
  boxShadow: "0 10px 28px rgba(42, 66, 34, 0.06)",
};

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  color: "#617258",
  fontSize: 13,
  textDecoration: "none",
  marginBottom: 12,
};

const eyebrowStyle: CSSProperties = {
  color: "#6f7b69",
  fontSize: 13,
  fontWeight: 700,
};

const titleStyle: CSSProperties = {
  margin: "4px 0 8px",
  fontSize: 26,
  lineHeight: 1.2,
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  color: "#5d6a56",
  fontSize: 14,
  lineHeight: 1.7,
};

const disabledNoticeStyle: CSSProperties = {
  marginTop: 16,
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid #ead9b8",
  background: "#fff8ea",
  color: "#7a5c24",
  fontSize: 13,
  lineHeight: 1.7,
};

const formStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  marginTop: 20,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const labelStyle: CSSProperties = {
  color: "#334033",
  fontSize: 14,
  fontWeight: 700,
};

const helperTextStyle: CSSProperties = {
  color: "#7d8a76",
  fontSize: 12,
  lineHeight: 1.5,
};

const categoryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const categoryButtonStyle: CSSProperties = {
  minHeight: 84,
  padding: 12,
  borderRadius: 14,
  border: "1px solid #dfe8d7",
  background: "#fbfdf8",
  color: "#394639",
  textAlign: "left",
  display: "grid",
  gap: 4,
  cursor: "pointer",
};

const categoryButtonActiveStyle: CSSProperties = {
  borderColor: "#91b587",
  background: "#f0f7ec",
  color: "#285425",
};

const noticeStyle: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e5ead5",
  background: "#f7faf2",
  color: "#5f6d58",
  fontSize: 13,
  lineHeight: 1.7,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
};

const cancelButtonStyle: CSSProperties = {
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
};

const submitButtonStyle: CSSProperties = {
  height: 42,
  padding: "0 18px",
  borderRadius: 999,
  border: "1px solid #b7d2b0",
  background: "#3f7d3d",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const submitButtonDisabledStyle: CSSProperties = {
  background: "#9da89b",
  borderColor: "#9da89b",
  cursor: "not-allowed",
};
