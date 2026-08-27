"use client";

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import {
  archiveCategoryOptions,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import SystemNameSelector from "@/components/archive/SystemNameSelector";
import { useLanguage } from "@/lib/i18n/useLanguage";
import type { ArchiveProjectView } from "@/components/archive-ui/types";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon from "@/components/ui/UiIcon";

export type ArchiveProfileEditableField =
  | "title"
  | "category"
  | "systemName"
  | "source"
  | "note"
  | "archiveSummary";

export type ArchiveProfileRow = {
  label: string;
  value?: ReactNode;
  field?: ArchiveProfileEditableField;
};

export type ArchiveSystemNameCandidate = {
  id?: string | null;
  label: string;
  description?: ReactNode;
};

export type ArchiveProfileFormValues = {
  title: string;
  category: ArchiveCategory;
  systemName: string;
  source: string;
  note: string;
  archiveSummary: string;
};

export type ArchiveProfileSystemNameValue = {
  name: string;
  candidateId?: string | null;
  isNewCandidate?: boolean;
};

export type ArchiveProfileFieldSave =
  | { field: "title"; value: string }
  | { field: "category"; value: ArchiveCategory }
  | { field: "systemName"; value: ArchiveProfileSystemNameValue }
  | { field: "source"; value: string }
  | { field: "note"; value: string }
  | { field: "archiveSummary"; value: string };

export type ArchiveProfileEditorConfig = {
  values: ArchiveProfileFormValues;
  onSaveField: (change: ArchiveProfileFieldSave) => Promise<void> | void;
  systemNameMode?: "candidate" | "text";
  systemNameCandidates?: ArchiveSystemNameCandidate[];
  systemNameHint?: ReactNode;
};

type Props = {
  project: ArchiveProjectView;
  eyebrow?: ReactNode;
  latestUpdateText?: string;
  recordCountText?: string;
  durationText?: string;
  encyclopediaHref?: string | null;
  actionSlot?: ReactNode;
  hint?: string;
  profileRows?: ArchiveProfileRow[];
  profileActions?: ReactNode;
  profileExtra?: ReactNode;
  profileEditor?: ArchiveProfileEditorConfig;
  profileAlwaysOpen?: boolean;
  showSystemNameInTitle?: boolean;
};

export default function ArchiveDetailHeaderView({
  project,
  eyebrow,
  latestUpdateText,
  recordCountText,
  durationText,
  encyclopediaHref,
  actionSlot,
  hint,
  profileRows = [],
  profileActions,
  profileExtra,
  profileEditor,
  profileAlwaysOpen = false,
  showSystemNameInTitle = true,
}: Props) {
  const { t } = useLanguage();
  const copy = t.archive;
  const [profileOpen, setProfileOpen] = useState(profileAlwaysOpen);
  const [editingField, setEditingField] = useState<ArchiveProfileEditableField | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<ArchiveCategory>(project.category);
  const [selectedSystemCandidate, setSelectedSystemCandidate] =
    useState<ArchiveSystemNameCandidate | null>(null);
  const [fieldError, setFieldError] = useState("");
  const [savingField, setSavingField] = useState<ArchiveProfileEditableField | null>(null);
  const cancelEditRef = useRef(false);

  const categoryItems = [
    project.categoryLabel,
    project.subcategoryLabel,
    project.groupLabel,
  ].filter(Boolean) as string[];
  const summaryItems = [recordCountText, durationText, latestUpdateText].filter(Boolean) as string[];
  const hasStructuredSummary =
    project.recordCount !== undefined ||
    project.durationDays !== undefined ||
    Boolean(project.latestTime);

  const systemNameMode = profileEditor?.systemNameMode || "candidate";
  const systemCandidates = profileEditor?.systemNameCandidates || [];
  const filteredSystemCandidates = useMemo(() => {
    const keyword = textDraft.trim().toLowerCase();
    if (!keyword) return systemCandidates.slice(0, 8);

    return systemCandidates
      .filter((candidate) => {
        const label = candidate.label.toLowerCase();
        const description =
          typeof candidate.description === "string"
            ? candidate.description.toLowerCase()
            : "";
        return label.includes(keyword) || description.includes(keyword);
      })
      .slice(0, 8);
  }, [systemCandidates, textDraft]);
  const hasExactSystemCandidate = systemCandidates.some(
    (candidate) => candidate.label.trim().toLowerCase() === textDraft.trim().toLowerCase()
  );

  function beginFieldEdit(field: ArchiveProfileEditableField) {
    if (!profileEditor) return;

    cancelEditRef.current = false;
    setFieldError("");
    setSelectedSystemCandidate(null);
    setEditingField(field);

    if (field === "category") {
      setCategoryDraft(profileEditor.values.category);
      return;
    }

    if (field === "title") setTextDraft(profileEditor.values.title);
    if (field === "systemName") setTextDraft(profileEditor.values.systemName);
    if (field === "source") setTextDraft(profileEditor.values.source);
    if (field === "note") setTextDraft(profileEditor.values.note);
    if (field === "archiveSummary") setTextDraft(profileEditor.values.archiveSummary);
  }

  function cancelFieldEdit() {
    setEditingField(null);
    setFieldError("");
    setTextDraft("");
    setSelectedSystemCandidate(null);
  }

  function cancelFieldEditFromInput() {
    cancelEditRef.current = true;
    cancelFieldEdit();
  }

  async function saveField(
    override?:
      | { field: "category"; value: ArchiveCategory }
      | { field: "systemName"; candidate: ArchiveSystemNameCandidate | null; value?: string }
  ) {
    const activeField = override?.field || editingField;
    if (!profileEditor || !activeField || savingField || cancelEditRef.current) return;

    setFieldError("");
    setSavingField(activeField);

    try {
      if (activeField === "title") {
        const value = textDraft.trim();
        if (!value) {
          setFieldError(copy.project_name_empty);
          return;
        }
        await profileEditor.onSaveField({ field: "title", value });
      } else if (activeField === "category") {
        const value = override?.field === "category" ? override.value : categoryDraft;
        await profileEditor.onSaveField({ field: "category", value });
      } else if (activeField === "systemName") {
        const overrideCandidate = override?.field === "systemName" ? override.candidate : undefined;
        const overrideValue = override?.field === "systemName" ? override.value : undefined;
        const nextCandidate =
          overrideCandidate !== undefined ? overrideCandidate : selectedSystemCandidate;
        const value = (nextCandidate?.label || overrideValue || textDraft).trim();
        if (!value) {
          setFieldError(copy.system_name_empty);
          return;
        }
        await profileEditor.onSaveField({
          field: "systemName",
          value: {
            name: value,
            candidateId: nextCandidate?.id || null,
            isNewCandidate: systemNameMode === "candidate" && !nextCandidate,
          },
        });
      } else if (activeField === "source") {
        await profileEditor.onSaveField({ field: "source", value: textDraft.trim() });
      } else if (activeField === "note") {
        await profileEditor.onSaveField({ field: "note", value: textDraft.trim() });
      } else if (activeField === "archiveSummary") {
        await profileEditor.onSaveField({ field: "archiveSummary", value: textDraft.trim() });
      }

      cancelFieldEdit();
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : t.error);
    } finally {
      setSavingField(null);
    }
  }

  function handleTextKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelFieldEditFromInput();
      return;
    }

    if (event.key === "Enter" && event.currentTarget instanceof HTMLInputElement) {
      event.preventDefault();
      void saveField();
    }
  }

  function handleNoteKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelFieldEditFromInput();
      return;
    }

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void saveField();
    }
  }

  function renderFieldEditor(field: ArchiveProfileEditableField) {
    if (field === "category") {
      return (
        <div style={cellEditorStyle}>
          <select
            value={categoryDraft}
            onChange={(event) => {
              const nextCategory = event.target.value as ArchiveCategory;
              setCategoryDraft(nextCategory);
              void saveField({ field: "category", value: nextCategory });
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelFieldEditFromInput();
              }
            }}
            autoFocus
            style={profileInputStyle}
          >
            {archiveCategoryOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field === "systemName") {
      return (
        <div style={cellEditorStyle}>
          <SystemNameSelector
            value={textDraft}
            onChange={(event) => {
              setTextDraft(event);
              setSelectedSystemCandidate(null);
            }}
            candidates={systemNameMode === "candidate" ? filteredSystemCandidates : []}
            suggestionsOpen={systemNameMode === "candidate"}
            selectedValue={selectedSystemCandidate?.label || ""}
            hasExactMatch={hasExactSystemCandidate}
            onSelect={(candidate) => {
              const nextCandidate = {
                id: candidate.id,
                label: candidate.label,
                description: candidate.description,
              };
              setSelectedSystemCandidate(nextCandidate);
              setTextDraft(candidate.label);
              void saveField({ field: "systemName", candidate: nextCandidate });
            }}
            onUseCustom={(value) => {
              setSelectedSystemCandidate(null);
              setTextDraft(value);
              void saveField({ field: "systemName", candidate: null, value });
            }}
            onBlur={() => {
              if (!cancelEditRef.current) void saveField();
            }}
            onKeyDown={handleTextKeyDown}
            autoFocus
            placeholder={
                systemNameMode === "text"
                  ? copy.input_system_name
                  : copy.search_system_candidates
            }
            inputStyle={profileInputStyle}
            panelStyle={candidatePanelStyle}
            optionStyle={(candidate, selected) => candidateButtonStyle(selected)}
            customOptionStyle={candidateNewButtonStyle}
            emptyStyle={candidateEmptyStyle}
            idleText={copy.candidate_idle}
            emptyText={copy.candidate_empty}
            customActionLabel={(inputValue) => `${copy.use_as_system_name}: ${inputValue}`}
          />
          {systemNameMode === "text" && profileEditor?.systemNameHint ? (
            <span style={profileFloatingHintStyle}>{profileEditor.systemNameHint}</span>
          ) : null}

        </div>
      );
    }

    if (field === "note" || field === "archiveSummary") {
      return (
        <div style={cellEditorStyle}>
          <textarea
            value={textDraft}
            onChange={(event) => setTextDraft(event.target.value)}
            onBlur={() => {
              if (!cancelEditRef.current) void saveField();
            }}
            onKeyDown={handleNoteKeyDown}
            autoFocus
            rows={1}
            style={profileInlineTextareaStyle}
          />
        </div>
      );
    }

    return (
      <div style={cellEditorStyle}>
        <input
          value={textDraft}
          onChange={(event) => setTextDraft(event.target.value)}
          onBlur={() => {
            if (!cancelEditRef.current) void saveField();
          }}
          onKeyDown={handleTextKeyDown}
          autoFocus
          style={profileInputStyle}
        />
      </div>
    );
  }

  return (
    <section style={headerStyle}>
      <div style={topRowStyle}>
        <div style={titleWrapStyle}>
          {eyebrow ? (
            profileAlwaysOpen ? (
              <span style={eyebrowStaticStyle}>{eyebrow}</span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((open) => !open);
                  cancelFieldEdit();
                }}
                style={eyebrowButtonStyle}
                aria-expanded={profileOpen}
                title={copy.open_project_archive}
              >
                {eyebrow}
              </button>
            )
          ) : null}
          <span style={projectIdentityStyle}>
            <span style={titleTextDisplayStyle}>
              {project.title}
            </span>
            {showSystemNameInTitle && project.systemName ? <span style={titleDividerStyle}> · </span> : null}
            {showSystemNameInTitle && project.systemName && encyclopediaHref ? (
              <a href={encyclopediaHref} style={systemNameLinkStyle}>
                {project.systemName}
              </a>
            ) : showSystemNameInTitle && project.systemName ? (
              <span style={systemNameStyle}>{project.systemName}</span>
            ) : null}
            {project.storageLabel ? (
              <span
                role="img"
                aria-label={project.storageTone === "device" ? copy.local_project : copy.cloud_project}
                title={project.storageTone === "device" ? copy.local_project : copy.cloud_project}
                style={storageIconStyle(project.storageTone)}
              >
                <ArchiveStorageIcon tone={project.storageTone} />
              </span>
            ) : null}
          </span>
        </div>

        <div style={statusWrapStyle}>
          {project.visibilityLabel ? (
            <span style={visibilityBadgeStyle(project.visibilityTone)}>{project.visibilityLabel}</span>
          ) : null}
          {actionSlot}
        </div>
      </div>

      <div style={metaRowStyle}>
        <div style={categoryRowStyle}>
          {categoryItems.map((item) => (
            <span key={item} style={categoryChipStyle}>
              {item}
            </span>
          ))}
        </div>
        {hasStructuredSummary ? (
          <ProjectMetaLine
            recordCount={project.recordCount}
            durationDays={project.durationDays}
            ended={Boolean(project.ended)}
            updatedAt={project.latestTime}
            className={undefined}
          />
        ) : summaryItems.length ? (
          <div style={summaryStyle}>
            {summaryItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
      </div>

      {hint ? <div style={hintStyle}>{hint}</div> : null}

      {profileAlwaysOpen || profileOpen ? (
        <>
          <div style={profilePanelStyle}>
            {profileRows.map((row) => {
              const editable = Boolean(profileEditor && row.field);
              const editing = editingField === row.field;
              const primary = row.field === "title" || row.field === "category" || row.field === "systemName";
              const fullWidth =
                row.field === "source" ||
                row.field === "note" ||
                row.field === "archiveSummary";
              const meta = !row.field;

              return (
                <div
                  key={row.label}
                  role={editable ? "button" : undefined}
                  tabIndex={editable ? 0 : undefined}
                  onClick={() => {
                    if (editable && row.field && !editing) beginFieldEdit(row.field);
                  }}
                  onKeyDown={(event) => {
                    if (!editable || !row.field || editing) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      beginFieldEdit(row.field);
                    }
                  }}
                  style={{
                    ...profileRowStyle,
                    ...(primary ? profileRowPrimaryStyle : {}),
                    ...(fullWidth ? profileRowFullWidthStyle : {}),
                    ...(meta ? profileRowMetaStyle : {}),
                    ...(editable ? profileRowEditableStyle : {}),
                    ...(editing ? profileRowEditingStyle : {}),
                  }}
                >
                  <span style={profileLabelStyle}>{row.label}</span>
                  {editing && row.field ? (
                    renderFieldEditor(row.field)
                  ) : (
                    <span
                      style={{
                        ...profileValueStyle,
                        ...(meta ? profileMetaValueStyle : {}),
                      }}
                    >
                      {row.value || copy.not_filled}
                    </span>
                  )}
                  {editing && fieldError ? <span style={profileErrorStyle}>{fieldError}</span> : null}
                  {editing && savingField === row.field ? (
                    <span style={profileSavingStyle}>{copy.saving}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          {profileActions ? <div style={profileActionsStyle}>{profileActions}</div> : null}
          {profileExtra}
        </>
      ) : null}
    </section>
  );
}

function ArchiveStorageIcon({ tone }: { tone?: "cloud" | "device" }) {
  return (
    <UiIcon
      name={tone === "device" ? "cloud-off" : "cloud"}
      size={16}
      strokeWidth={2}
      style={{ color: tone === "device" ? "#6f7b69" : "#2f6f3a" }}
    />
  );
}

const headerStyle: CSSProperties = {
  border: "1px solid #e4e9df",
  borderRadius: 18,
  background: "#fff",
  padding: "14px 16px 13px",
  boxShadow: "0 8px 28px rgba(30, 48, 29, 0.045)",
  marginBottom: 12,
};

const topRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const titleWrapStyle: CSSProperties = {
  flex: "1 1 260px",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 0,
};

const titleTextDisplayStyle: CSSProperties = {
  minWidth: 0,
  color: "#1f2d1f",
  fontSize: 21,
  fontWeight: 830,
  lineHeight: 1.2,
  overflowWrap: "anywhere",
};

const projectIdentityStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  flexWrap: "nowrap",
  flex: "0 1 auto",
  minWidth: 0,
  maxWidth: "100%",
};

const eyebrowButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: 0,
  border: 0,
  background: "transparent",
  color: "#71826d",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
  marginRight: 10,
  cursor: "pointer",
};

const eyebrowStaticStyle: CSSProperties = {
  ...eyebrowButtonStyle,
  cursor: "default",
};

const titleDividerStyle: CSSProperties = {
  margin: "0 4px",
  color: "#9aa493",
  fontWeight: 600,
};

function storageIconStyle(tone?: "cloud" | "device"): CSSProperties {
  const isDevice = tone === "device";

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
    marginLeft: 6,
    color: isDevice ? "#6f7b69" : "#2f6f3a",
    lineHeight: 1,
  };
}

const systemNameStyle: CSSProperties = {
  minWidth: 0,
  color: "#53694d",
  fontWeight: 740,
  fontSize: 21,
  lineHeight: 1.2,
  overflowWrap: "anywhere",
};

const systemNameLinkStyle: CSSProperties = {
  ...systemNameStyle,
  color: "#356f39",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

const statusWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
};

const metaRowStyle: CSSProperties = {
  marginTop: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const categoryRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const categoryChipStyle: CSSProperties = {
  padding: "3px 9px",
  borderRadius: 999,
  border: "1px solid #dde8d7",
  background: "#f7fbf4",
  color: "#5e7258",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.35,
};

function visibilityBadgeStyle(tone?: "public" | "private" | "neutral"): CSSProperties {
  if (tone === "neutral") {
    return {
      borderRadius: 999,
      border: "1px solid #d8ddd4",
      background: "#f4f5f2",
      color: "#6d7569",
      fontSize: 12,
      fontWeight: 800,
      lineHeight: 1,
      padding: "5px 8px",
      whiteSpace: "nowrap",
    };
  }

  return {
    borderRadius: 999,
    border: tone === "public" ? "1px solid #b7dfbb" : "1px solid #ddd",
    background: tone === "public" ? "#f1fff1" : "#fff",
    color: tone === "public" ? "#2f8f2f" : "#777",
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1,
    padding: "5px 8px",
    whiteSpace: "nowrap",
  };
}

const summaryStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  color: "#6f7b69",
  fontSize: 13,
  lineHeight: 1.5,
};

const hintStyle: CSSProperties = {
  marginTop: 8,
  color: "#8a9584",
  fontSize: 12,
  lineHeight: 1.6,
};

const profilePanelStyle: CSSProperties = {
  marginTop: 12,
  borderTop: "1px solid #e8eee3",
  paddingTop: 11,
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  columnGap: 22,
  rowGap: 7,
  alignItems: "flex-start",
};

const profileRowStyle: CSSProperties = {
  minWidth: 0,
  maxWidth: "100%",
  border: "none",
  borderRadius: 0,
  background: "transparent",
  padding: "3px 0",
  display: "inline-grid",
  gridTemplateColumns: "76px minmax(0, auto)",
  columnGap: 12,
  rowGap: 3,
  alignItems: "center",
  alignContent: "start",
  outline: "none",
};

const profileRowPrimaryStyle: CSSProperties = {
  gridColumn: "span 4",
  gridTemplateColumns: "76px minmax(0, 1fr)",
};

const profileRowFullWidthStyle: CSSProperties = {
  gridColumn: "1 / -1",
  gridTemplateColumns: "76px minmax(0, 1fr)",
};

const profileRowMetaStyle: CSSProperties = {
  gridColumn: "span 3",
  gridTemplateColumns: "auto max-content",
  marginTop: 2,
};

const profileRowEditableStyle: CSSProperties = {
  cursor: "pointer",
};

const profileRowEditingStyle: CSSProperties = {
  cursor: "text",
};

const profileLabelStyle: CSSProperties = {
  color: "#7b8975",
  fontSize: 11,
  fontWeight: 760,
  lineHeight: "23px",
  whiteSpace: "nowrap",
};

const profileValueStyle: CSSProperties = {
  color: "#223020",
  fontSize: 13,
  lineHeight: "23px",
  minHeight: 23,
  display: "inline-flex",
  alignItems: "center",
  wordBreak: "break-word",
};

const profileMetaValueStyle: CSSProperties = {
  whiteSpace: "nowrap",
  wordBreak: "normal",
};

const profileActionsStyle: CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #eef2ea",
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const cellEditorStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  alignContent: "start",
  minWidth: 0,
  minHeight: 23,
  position: "relative",
};

const profileInputStyle: CSSProperties = {
  width: "100%",
  height: 23,
  border: "1px solid #cfdcc8",
  borderRadius: 8,
  padding: "0 7px",
  background: "#fbfdf9",
  color: "#263326",
  outline: "none",
  boxSizing: "border-box",
  fontSize: 13,
};

const profileInlineTextareaStyle: CSSProperties = {
  ...profileInputStyle,
  height: 23,
  padding: "2px 7px",
  resize: "none",
  overflow: "hidden",
  lineHeight: 1.4,
};

const profileFloatingHintStyle: CSSProperties = {
  position: "absolute",
  top: 29,
  left: 0,
  zIndex: 25,
  padding: "5px 8px",
  borderRadius: 8,
  background: "#f7faf2",
  border: "1px solid #e2eadc",
  color: "#6c7b66",
  fontSize: 12,
  lineHeight: 1.4,
  boxShadow: "0 8px 18px rgba(25, 43, 24, 0.08)",
  pointerEvents: "none",
};

const candidatePanelStyle: CSSProperties = {
  position: "absolute",
  top: 29,
  left: 0,
  right: 0,
  zIndex: 30,
  border: "1px solid #e5eadf",
  borderRadius: 10,
  background: "#fff",
  maxHeight: 160,
  overflow: "auto",
  padding: 6,
  display: "grid",
  gap: 6,
  boxShadow: "0 12px 24px rgba(25, 43, 24, 0.14)",
};

function candidateButtonStyle(active: boolean): CSSProperties {
  return {
    textAlign: "left",
    padding: "7px 9px",
    borderRadius: 8,
    border: active ? "1px solid #4CAF50" : "1px solid transparent",
    background: active ? "#f0fff4" : "#fafafa",
    color: "#263326",
    cursor: "pointer",
    fontSize: 12,
    display: "grid",
    gap: 2,
  };
}

const candidateDescriptionStyle: CSSProperties = {
  color: "#7d8a76",
  fontSize: 11,
  lineHeight: 1.35,
};

const candidateNewButtonStyle: CSSProperties = {
  textAlign: "left",
  padding: "7px 9px",
  borderRadius: 8,
  border: "1px dashed #4CAF50",
  background: "#fff",
  color: "#3f7d3d",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
};

const candidateEmptyStyle: CSSProperties = {
  color: "#8a9584",
  fontSize: 12,
  padding: "4px 2px",
};

const profileErrorStyle: CSSProperties = {
  gridColumn: "2 / -1",
  color: "#b4544d",
  fontSize: 12,
};

const profileSavingStyle: CSSProperties = {
  gridColumn: "2 / -1",
  color: "#7d8a76",
  fontSize: 12,
};
