"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/Toast";
import ArchiveNewProjectFormShell, {
  archiveNewProjectInputStyle,
} from "@/components/archive-ui/ArchiveNewProjectFormShell";
import SystemNameSelector from "@/components/archive/SystemNameSelector";
import { supabase } from "@/lib/supabase";
import {
  archiveCategoryOptions,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import {
  createLocalArchive,
} from "@/lib/local-offline-db";
import {
  getSystemNameCandidates,
  type SystemNameCandidate,
} from "@/lib/system-name-candidates";
import { useLanguage } from "@/lib/i18n/useLanguage";

function normalizeInitialCategory(value: string): ArchiveCategory | null {
  return archiveCategoryOptions.some((option) => option.value === value)
    ? (value as ArchiveCategory)
    : null;
}

function getInitialSearchParam(...names: string[]) {
  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.search);
  for (const name of names) {
    const value = params.get(name);
    if (value) return value;
  }

  return "";
}

export default function NewLocalArchivePage() {
  const { t } = useLanguage();
  const copy = t.archive;
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ArchiveCategory>("plant");
  const [plantId, setPlantId] = useState("");
  const [plantSlug, setPlantSlug] = useState("");
  const [systemName, setSystemName] = useState("");
  const [systemSearch, setSystemSearch] = useState("");
  const [systemSuggestionsOpen, setSystemSuggestionsOpen] = useState(false);
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [systemCandidates, setSystemCandidates] = useState<SystemNameCandidate[]>([]);
  const [quickCaptureId, setQuickCaptureId] = useState("");

  useEffect(() => {
    const initialCategory = normalizeInitialCategory(getInitialSearchParam("category"));
    if (initialCategory) setCategory(initialCategory);
    setPlantId(getInitialSearchParam("plant_id"));
    setPlantSlug(getInitialSearchParam("plant_slug"));
    const initialSystemName = getInitialSearchParam("system_name", "plant_name", "name");
    setSystemName((current) => current || initialSystemName);
    setSystemSearch((current) => current || initialSystemName);
    setQuickCaptureId(getInitialSearchParam("quickCapture"));
  }, []);

  useEffect(() => {
    async function loadCandidates() {
      const candidates = await getSystemNameCandidates({
        category,
        currentValue: systemName || systemSearch,
        mode: "local",
        supabase,
        limit: 200,
      });
      setSystemCandidates(candidates);
    }

    void loadCandidates();
  }, [category]);

  const usesCandidateSystemName =
    category === "plant" || category === "system" || category === "insect_fish";
  const systemOptions =
    systemCandidates
      .filter((item) =>
        systemSearch.trim()
          ? String(item.searchText || item.label).toLowerCase().includes(systemSearch.trim().toLowerCase())
          : true
      )
      .slice(0, 8);
  const cloudCreateHref = (() => {
    const params = new URLSearchParams({ category });
    if (category === "plant" && plantId) params.set("species", plantId);
    return `/archive/new?${params.toString()}`;
  })();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      showToast(copy.project_name_required_error);
      return;
    }

    const cleanSystemName = (usesCandidateSystemName ? systemName || systemSearch : systemName).trim();
    if (!cleanSystemName) {
      showToast(copy.system_name_required_error);
      return;
    }

    setSaving(true);
    try {
      const archive = await createLocalArchive({
        title: cleanTitle,
        category,
        subcategory: null,
        group_name: null,
        plant_id: plantId,
        plant_slug: plantSlug,
        system_name: cleanSystemName,
        species_name: category === "plant" ? cleanSystemName : "",
        source: source.trim() || null,
        note,
      });

      showToast(copy.local_created);
      router.push(`/local/archive/${archive.id}${quickCaptureId ? `?quickCapture=${encodeURIComponent(quickCaptureId)}#add-record` : ""}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.local_create_failed);
    } finally {
      setSaving(false);
    }
  }

  function handleCategoryChange(nextCategory: ArchiveCategory) {
    setCategory(nextCategory);
    setSystemSuggestionsOpen(false);
    if (nextCategory !== "plant") {
      setPlantId("");
      setPlantSlug("");
    }
  }

  return (
    <ArchiveNewProjectFormShell
      backHref="/archive?source=local"
      backLabel={copy.back_to_space}
      eyebrow={copy.local_offline}
      title={copy.new_project}
      storageMode="local"
      cloudHref={cloudCreateHref}
      category={category}
      onCategoryChange={handleCategoryChange}
      projectTitle={title}
      onProjectTitleChange={setTitle}
      systemControl={
        usesCandidateSystemName ? (
          <div style={localSystemControlWrapStyle}>
            <SystemNameSelector
              value={systemSearch}
              onChange={(value) => {
                setSystemSearch(value);
                setSystemName("");
                setSystemSuggestionsOpen(true);
              }}
              candidates={systemOptions}
              selectedValue={systemName}
              suggestionsOpen={systemSuggestionsOpen}
              onSuggestionsOpenChange={setSystemSuggestionsOpen}
              onSelect={(option) => {
                setSystemName(option.label);
                setSystemSearch(option.label);
                setPlantId(option.plantId || option.id || "");
                setPlantSlug(option.plantSlug || "");
                setSystemSuggestionsOpen(false);
              }}
              onUseCustom={(name) => {
                setSystemName(name);
                setSystemSearch(name);
                if (category !== "plant") {
                  setPlantId("");
                  setPlantSlug("");
                }
                setSystemSuggestionsOpen(false);
              }}
              placeholder={
                category === "plant"
                  ? copy.local_candidate_placeholder
                  : `${copy.select_system_example}${systemOptions[0]?.label || copy.grow_light_example}`
              }
              inputStyle={archiveNewProjectInputStyle}
              panelStyle={localSuggestionPanelStyle}
              optionStyle={(option, selected) =>
                localSuggestionButtonStyle(selected || systemName === option.label)
              }
              customOptionStyle={localSuggestionNewButtonStyle}
              emptyStyle={localSuggestionEmptyStyle}
              idleText={copy.candidate_idle}
              emptyText={copy.candidate_empty}
              customActionLabel={(inputValue) => `${copy.use_as_system_name}: ${inputValue}`}
            />
          </div>
        ) : (
          <input
            value={systemName}
            onChange={(event) => setSystemName(event.target.value)}
            placeholder={copy.other_system_placeholder}
            style={archiveNewProjectInputStyle}
          />
        )
      }
      sourceControl={
        <input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder={copy.source_placeholder}
          style={archiveNewProjectInputStyle}
        />
      }
      note={note}
      onNoteChange={setNote}
      notice={
        <>
          {copy.local_notice}
          {plantId || plantSlug ? ` ${copy.local_guide_notice}` : ""}
        </>
      }
      submitText={copy.create_project}
      loadingText={t.saving}
      submitting={saving}
      onSubmit={handleSubmit}
    />
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

const helperTextStyle = {
  color: "#7d8a76",
  fontSize: 12,
  lineHeight: 1.5,
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

const plantLinkHintStyle = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid #e1eadb",
  background: "#fbfdf8",
  color: "#6b7a63",
  fontSize: 12,
  lineHeight: 1.6,
} satisfies CSSProperties;

const localSuggestionPanelStyle = {
  position: "absolute",
  top: 50,
  left: 0,
  right: 0,
  zIndex: 40,
  border: "1px solid #e5eadf",
  borderRadius: 12,
  background: "#fff",
  maxHeight: 230,
  overflow: "auto",
  padding: 8,
  display: "grid",
  gap: 6,
  boxShadow: "0 14px 28px rgba(25, 43, 24, 0.14)",
} satisfies CSSProperties;

const localSystemControlWrapStyle = {
  position: "relative",
} satisfies CSSProperties;

function localSuggestionButtonStyle(active = false): CSSProperties {
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

const localSuggestionNewButtonStyle = {
  textAlign: "left",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px dashed #4CAF50",
  background: "#fff",
  color: "#3f7d3d",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
} satisfies CSSProperties;

const localSuggestionEmptyStyle = {
  color: "#7d8a76",
  fontSize: 12,
  padding: 4,
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
