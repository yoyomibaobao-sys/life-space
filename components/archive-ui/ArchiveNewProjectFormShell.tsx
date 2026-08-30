"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import {
  archiveCategoryOptions,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "@/components/archive-ui/ArchiveNewProjectFormShell.module.css";

type Props = {
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  storageMode?: "cloud" | "local";
  cloudHref?: string;
  localHref?: string;
  category: ArchiveCategory | null;
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
  storageMode,
  cloudHref,
  localHref,
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
  const { t } = useLanguage();
  const copy = t.archive;
  const translatedCategoryOptions = archiveCategoryOptions.map((option) => {
    const categoryCopy = {
      plant: {
        label: copy.categories.plant_label,
        description: copy.categories.plant_description,
      },
      system: {
        label: copy.categories.system_label,
        description: copy.categories.system_description,
      },
      insect_fish: {
        label: copy.categories.insect_fish_label,
        description: copy.categories.insect_fish_description,
      },
      other: {
        label: copy.categories.other_label,
        description: copy.categories.other_description,
      },
    }[option.value];

    return { ...option, ...categoryCopy };
  });
  const systemNameLabel = copy.system_name_required;
  const systemNameHelper = copy.system_name_helper;

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <header className={styles.intro}>
          <Link href={backHref} style={backLinkStyle}>
            {backLabel}
          </Link>
          <div style={eyebrowStyle}>{eyebrow}</div>
          <h1 style={titleStyle}>{title}</h1>
          {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
        </header>

        {storageMode ? (
          <div style={storageModeRowStyle}>
            <span style={storageModeLabelStyle}>{copy.storage_location}</span>
            {storageMode === "cloud" ? (
              <span style={storageModeActiveStyle}>{copy.cloud_default}</span>
            ) : cloudHref ? (
              <Link href={cloudHref} style={storageModeLinkStyle}>{copy.cloud_default}</Link>
            ) : null}
            {storageMode === "local" ? (
              <span style={storageModeActiveStyle}>{copy.local_device}</span>
            ) : localHref ? (
              <Link href={localHref} style={storageModeLinkStyle}>{copy.local_device}</Link>
            ) : null}
          </div>
        ) : null}

        {disabledNotice ? <div style={disabledNoticeStyle}>{disabledNotice}</div> : null}

        <form onSubmit={onSubmit} className={styles.form}>

          <ArchiveNewProjectField label={copy.project_name_required}>
            <input
              value={projectTitle}
              required
              aria-label={copy.project_name_required}
              onChange={(event) => onProjectTitleChange(event.target.value)}
              placeholder={copy.project_name_placeholder}
              style={archiveNewProjectInputStyle}
            />
          </ArchiveNewProjectField>

          <ArchiveNewProjectField
            label={systemNameLabel}
            helper={systemNameHelper}
          >
            {systemControl}
          </ArchiveNewProjectField>

          <ArchiveNewProjectField label={copy.category_required}>
            <div className={styles.categoryGrid} role="radiogroup" aria-label={copy.category_required} aria-required="true">
              {translatedCategoryOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={category === option.value}
                  onClick={() => onCategoryChange(option.value)}
                  className={`${styles.categoryButton} ${
                    category === option.value ? styles.categoryButtonActive : ""
                  }`}
                >
                  <strong className={styles.categoryLabel}>{option.label}</strong>
                  <span className={styles.categoryDescription}>{option.description}</span>
                </button>
              ))}
            </div>
          </ArchiveNewProjectField>

          <ArchiveNewProjectField label={copy.source}>
            {sourceControl}
          </ArchiveNewProjectField>

          <ArchiveNewProjectField label={copy.note_label}>
            <textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder={copy.note_placeholder}
              rows={4}
              style={archiveNewProjectTextareaStyle}
            />
          </ArchiveNewProjectField>

          <section className={styles.notice}>{notice}</section>

          <div style={actionRowStyle}>
            <Link href={backHref} style={cancelButtonStyle}>
              {copy.cancel}
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

const storageModeRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  marginTop: 12,
  padding: "8px 10px",
  border: "1px solid #e2e9de",
  borderRadius: 12,
  background: "#f8fbf6",
  flexWrap: "wrap",
};

const storageModeLabelStyle: CSSProperties = {
  marginRight: 2,
  color: "#6f7d6c",
  fontSize: 12,
  fontWeight: 700,
};

const storageModeActiveStyle: CSSProperties = {
  padding: "5px 10px",
  borderRadius: 999,
  background: "#4f7f4b",
  color: "#fff",
  fontSize: 12,
  fontWeight: 750,
};

const storageModeLinkStyle: CSSProperties = {
  padding: "5px 10px",
  border: "1px solid #d4e0d0",
  borderRadius: 999,
  color: "#4e654c",
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
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
