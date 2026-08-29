"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { showToast } from "@/components/Toast";
import ArchiveNewProjectFormShell, {
  archiveNewProjectHelperTextStyle,
  archiveNewProjectInputStyle,
  archiveNewProjectSuggestionButtonStyle,
  archiveNewProjectSuggestionPanelStyle,
} from "@/components/archive-ui/ArchiveNewProjectFormShell";
import SystemNameSelector from "@/components/archive/SystemNameSelector";
import {
  canCreateMembershipContent,
  getCreateContentBlockedText,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import {
  type ArchiveCategory,
  archiveCategoryOptions,
} from "@/lib/archive-categories";
import {
  getSystemNameCandidates,
  hasExactSystemNameCandidate,
  type SystemNameCandidate,
} from "@/lib/system-name-candidates";
import { useLanguage } from "@/lib/i18n/useLanguage";
import {
  CloudQuickCaptureError,
  saveQuickCaptureAsFirstCloudRecord,
} from "@/lib/cloud-quick-capture-record";

const DEFAULT_ARCHIVE_IS_PUBLIC = false;
const DEFAULT_RECORD_VISIBILITY = "private";

export default function NewArchivePage() {
  const { t } = useLanguage();

  return (
    <Suspense
      fallback={
        <main
          style={{
            padding: "30px 20px",
            maxWidth: 480,
            margin: "0 auto",
          }}
        >
          {t.archive.loading}
        </main>
      }
    >
      <NewArchiveContent />
    </Suspense>
  );
}

function NewArchiveContent() {
  const { language, t } = useLanguage();
  const copy = t.archive;
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSpeciesId = searchParams.get("species");
  const preselectedSystemName = searchParams.get("system_name")?.trim() || "";
  const selectedPlanId = searchParams.get("plan");
  const quickCaptureId = searchParams.get("quickCapture") || "";
  const preselectedCategory = searchParams.get("category");
  const validPreselectedCategory = archiveCategoryOptions.some(
    (option) => option.value === preselectedCategory
  )
    ? (preselectedCategory as ArchiveCategory)
    : null;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ArchiveCategory>(
    validPreselectedCategory && !preselectedSpeciesId
      ? validPreselectedCategory
      : "plant"
  );

  const [systemCandidates, setSystemCandidates] = useState<SystemNameCandidate[]>([]);
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [pendingSpeciesName, setPendingSpeciesName] = useState<string | null>(
    null
  );
  const [speciesSearch, setSpeciesSearch] = useState("");

  const initialSystemName =
    validPreselectedCategory && validPreselectedCategory !== "plant"
      ? preselectedSystemName
      : "";
  const [systemSearch, setSystemSearch] = useState(initialSystemName);
  const [systemName, setSystemName] = useState(initialSystemName);
  const [plantSuggestionsOpen, setPlantSuggestionsOpen] = useState(false);
  const [systemSuggestionsOpen, setSystemSuggestionsOpen] = useState(false);

  const [source, setSource] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [createdArchiveId, setCreatedArchiveId] = useState("");
  const localCreateHref = useMemo(() => {
    const params = new URLSearchParams({ category });
    const currentSpeciesId = speciesId || preselectedSpeciesId || "";
    const currentSystemName =
      category === "plant" ? speciesSearch : systemName || systemSearch;
    if (currentSpeciesId) params.set("plant_id", currentSpeciesId);
    if (currentSystemName.trim()) params.set("system_name", currentSystemName.trim());
    if (quickCaptureId) params.set("quickCapture", quickCaptureId);
    return `/local/archive/new?${params.toString()}`;
  }, [category, preselectedSpeciesId, quickCaptureId, speciesId, speciesSearch, systemName, systemSearch]);

  useEffect(() => {
    async function loadCandidates() {
      const candidates = await getSystemNameCandidates({
        category,
        supabase,
        currentValue: category === "plant" ? speciesSearch : systemName || systemSearch,
        limit: 200,
      });
      setSystemCandidates(candidates);

      if (category === "plant" && preselectedSpeciesId) {
        const selected = candidates.find((item) => item.plantId === preselectedSpeciesId || item.id === preselectedSpeciesId);

        if (selected) {
          setSpeciesId(selected.plantId || selected.id || null);
          setPendingSpeciesName(null);
          setSpeciesSearch(selected.label);
          setTitle((current) =>
            current || (selected.label ? `${copy.my_project_prefix}${selected.label}` : "")
          );
        }
      }
    }

    void loadCandidates();
  }, [category, copy.my_project_prefix, preselectedSpeciesId]);

  useEffect(() => {
    async function loadMembership() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMembership(null);
        setMembershipLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc("get_my_membership");

      if (error) {
        console.error("load membership error:", error);
        setMembership(null);
      } else {
        setMembership(normalizeMembershipRpcResult(data));
      }
      setMembershipLoading(false);
    }

    void loadMembership();
  }, []);

  const contentBlocked =
    !membershipLoading && !canCreateMembershipContent(membership);

  const systemOptions = useMemo(() => {
    const keyword = systemSearch.trim().toLowerCase();
    return systemCandidates
      .filter((candidate) =>
        keyword
          ? String(candidate.searchText || candidate.label).toLowerCase().includes(keyword)
          : true
      )
      .slice(0, 10);
  }, [systemCandidates, systemSearch]);

  function resetPlantSelection() {
    setSpeciesId(null);
    setPendingSpeciesName(null);
    setSpeciesSearch("");
    setPlantSuggestionsOpen(false);
  }

  function resetSystemSelection() {
    setSystemSearch("");
    setSystemName("");
    setSystemSuggestionsOpen(false);
  }

  function switchCategory(nextCategory: ArchiveCategory) {
    setCategory(nextCategory);

    if (nextCategory === "plant") {
      resetSystemSelection();
      return;
    }

    resetPlantSelection();
  }

  function getPlantSearchResults() {
    const keyword = speciesSearch.trim().toLowerCase();

    if (!keyword) {
      return systemCandidates.slice(0, 10);
    }

    return systemCandidates
      .filter((candidate) =>
        String(candidate.searchText || candidate.label).toLowerCase().includes(keyword)
      )
      .slice(0, 10);
  }

  function hasExactPlantMatch() {
    return hasExactSystemNameCandidate(systemCandidates, speciesSearch);
  }

  function submitPendingSpeciesName() {
    const name = speciesSearch.trim();

    if (!name) {
      showToast(copy.plant_candidate_required);
      return;
    }

    setSpeciesId(null);
    setPendingSpeciesName(name);
    setSpeciesSearch(name);
    setPlantSuggestionsOpen(false);
  }

  function hasExactSystemNameMatch() {
    return hasExactSystemNameCandidate(systemCandidates, systemSearch);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership, language));
      return;
    }

    if (!title.trim()) {
      showToast(copy.project_name_required_error);
      return;
    }

    const cleanSystemName =
      category === "plant" ? speciesSearch.trim() : systemName.trim() || systemSearch.trim();

    if (!cleanSystemName) {
      showToast(copy.system_name_required_error);
      return;
    }

    const cleanObjectName = source.trim();

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showToast(copy.not_logged_in);
      setLoading(false);
      return;
    }

    let archiveId = createdArchiveId;
    if (!archiveId) {
      const selectedSpecies = systemCandidates.find((s) => s.plantId === speciesId || s.id === speciesId);
      const speciesNameSnapshot =
        category === "plant"
          ? pendingSpeciesName || selectedSpecies?.label || cleanSystemName
          : null;

      const { data: createdArchive, error } = await supabase
        .from("archives")
        .insert([
          {
            title: title.trim(),
            category,
            species_id: category === "plant" ? speciesId : null,
            species_name_snapshot: speciesNameSnapshot,
            system_name: category === "plant" ? null : cleanSystemName,
            source: cleanObjectName || null,
            note: note.trim() || null,
            user_id: user.id,
            is_public: DEFAULT_ARCHIVE_IS_PUBLIC,
            default_record_visibility: DEFAULT_RECORD_VISIBILITY,
          },
        ])
        .select("id")
        .single();

      if (error || !createdArchive?.id) {
        setLoading(false);
        showToast(copy.create_failed);
        return;
      }
      archiveId = String(createdArchive.id);
      setCreatedArchiveId(archiveId);
    }

    if (selectedPlanId && archiveId && !createdArchiveId) {
      const { error: planError } = await supabase
        .from("user_plant_plans")
        .update({
          status: "started",
          created_archive_id: archiveId,
        })
        .eq("id", selectedPlanId)
        .eq("user_id", user.id);

      if (planError) {
        showToast(copy.plan_link_failed);
      }
    }

    if (quickCaptureId && archiveId) {
      try {
        await saveQuickCaptureAsFirstCloudRecord({
          archiveId,
          userId: user.id,
          quickCaptureId,
        });
      } catch (captureError) {
        setLoading(false);
        const code = captureError instanceof CloudQuickCaptureError ? captureError.code : "upload_failed";
        const message = code === "capture_missing"
          ? (language === "en" ? "The captured photo is missing. Take it again." : "已拍照片不存在，请重新拍照。")
          : code === "upload_maintenance"
            ? t.record.maintenance_record_not_saved
            : code === "membership_inactive"
              ? getCreateContentBlockedText(membership, language)
              : code === "storage_limit_exceeded"
                ? (language === "en" ? "Cloud storage is full. The captured photo is still available for retry." : "云空间容量不足，已拍照片仍保留，可处理容量后重试。")
                : code === "save_pending"
                  ? (language === "en" ? "Photo save status is pending. Check the project later; the capture is retained." : "照片保存状态待确认，请稍后检查项目；已拍照片仍保留。")
                  : (language === "en" ? "Could not save the photo. Tap Create project again to retry; the capture is retained." : "照片保存失败，请再次点击“创建项目”重试；已拍照片仍保留。");
        showToast(message);
        return;
      }
    }

    setLoading(false);

    if (archiveId) {
      router.push(`/archive/${archiveId}`);
    } else {
      router.push("/archive");
    }
  }

  return (
    <ArchiveNewProjectFormShell
      backHref="/archive"
      backLabel={copy.back_to_space}
      eyebrow={copy.cloud_space}
      title={copy.new_project}
      storageMode="cloud"
      localHref={localCreateHref}
      category={category}
      onCategoryChange={(nextCategory) => {
        switchCategory(nextCategory);
      }}
      projectTitle={title}
      onProjectTitleChange={setTitle}
      systemControl={
        category === "plant" ? (
          <>
            <SystemNameSelector
              value={speciesSearch}
              onChange={(value) => {
                setSpeciesSearch(value);
                setSpeciesId(null);
                setPendingSpeciesName(null);
                setPlantSuggestionsOpen(true);
              }}
              candidates={getPlantSearchResults()}
              selectedValue={speciesId || pendingSpeciesName || ""}
              suggestionsOpen={plantSuggestionsOpen}
              onSuggestionsOpenChange={setPlantSuggestionsOpen}
              hasExactMatch={hasExactPlantMatch()}
              onSelect={(species) => {
                const name = species.label || copy.unnamed_plant;
                setSpeciesId(species.plantId || species.id || null);
                setPendingSpeciesName(null);
                setSpeciesSearch(name);
                setPlantSuggestionsOpen(false);
              }}
              onUseCustom={() => submitPendingSpeciesName()}
              placeholder={copy.plant_selector_placeholder}
              inputStyle={archiveNewProjectInputStyle}
              panelStyle={archiveNewProjectSuggestionPanelStyle}
              optionStyle={(candidate, selected) =>
                archiveNewProjectSuggestionButtonStyle(
                  selected || speciesId === (candidate.plantId || candidate.id)
                )
              }
              customOptionStyle={{
                ...archiveNewProjectSuggestionButtonStyle(false),
                border: "1px dashed #4CAF50",
                background: "#fff",
                color: "#4CAF50",
              }}
              emptyStyle={{ color: "#999", fontSize: 13, padding: 8 }}
              emptyText={copy.no_matching_plant}
              customActionLabel={(inputValue) => `${copy.add_plant_candidate}${inputValue}`}
            />
            {pendingSpeciesName ? (
              <span style={archiveNewProjectHelperTextStyle}>
                {copy.current_plant_candidate}<strong>{pendingSpeciesName}</strong>
              </span>
            ) : null}
          </>
        ) : category === "other" ? (
          <input
            placeholder={copy.other_system_placeholder}
            value={systemName}
            onChange={(event) => {
              setSystemName(event.target.value);
              setSystemSearch(event.target.value);
            }}
            style={archiveNewProjectInputStyle}
          />
        ) : (
          <>
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
              hasExactMatch={hasExactSystemNameMatch()}
              onSelect={(candidate) => {
                setSystemName(candidate.label);
                setSystemSearch(candidate.label);
                setSystemSuggestionsOpen(false);
              }}
              placeholder={`${copy.select_system_example}${systemOptions[0]?.label || copy.grow_light_example}`}
              inputStyle={archiveNewProjectInputStyle}
              panelStyle={archiveNewProjectSuggestionPanelStyle}
              optionStyle={(candidate, selected) =>
                archiveNewProjectSuggestionButtonStyle(selected || systemName === candidate.label)
              }
              customOptionStyle={{
                ...archiveNewProjectSuggestionButtonStyle(false),
                border: "1px dashed #4CAF50",
                background: "#fff",
                color: "#4CAF50",
              }}
              emptyStyle={{ color: "#999", fontSize: 13, padding: 8 }}
              emptyText={copy.no_matching_name}
              customActionLabel={(inputValue) => `${copy.add_system_name}${inputValue}`}
            />
          </>
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
      notice={copy.cloud_notice}
      submitText={copy.create_project}
      loadingText={copy.creating}
      submitting={loading}
      disabled={membershipLoading || contentBlocked}
      disabledNotice={
        contentBlocked ? (
          <>
            <span>{getCreateContentBlockedText(membership, language)}</span>{" "}
            <Link href="/membership" style={{ color: "#5d7c2f", fontWeight: 700 }}>
              {copy.learn_cloud_membership}
            </Link>
          </>
        ) : null
      }
      onSubmit={handleCreate}
    />
  );
}
