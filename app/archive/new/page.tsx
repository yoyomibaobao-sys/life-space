"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { showToast } from "@/components/Toast";
import ArchiveNewProjectFormShell, {
  archiveNewProjectHelperTextStyle,
  archiveNewProjectInputStyle,
  archiveNewProjectSuggestionButtonStyle,
  archiveNewProjectSuggestionPanelStyle,
} from "@/components/archive-ui/ArchiveNewProjectFormShell";
import SystemNameSelector, { type SystemNameSelectorCandidate } from "@/components/archive/SystemNameSelector";
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
  filterSystemNameCandidates,
  hasExactSystemNameCandidate,
  resolveExactSystemNameCandidate,
  type SystemNameCandidate,
} from "@/lib/system-name-candidates";
import { useLanguage } from "@/lib/i18n/useLanguage";
import {
  CloudQuickCaptureError,
  saveQuickCaptureAsFirstCloudRecord,
} from "@/lib/cloud-quick-capture-record";

const DEFAULT_ARCHIVE_IS_PUBLIC = true;
const DEFAULT_RECORD_VISIBILITY = "public";

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
  const [category, setCategory] = useState<ArchiveCategory | null>(
    validPreselectedCategory && !preselectedSpeciesId
      ? validPreselectedCategory
      : preselectedSpeciesId ? "plant" : null
  );

  const [systemCandidates, setSystemCandidates] = useState<SystemNameCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const guideEditedRef = useRef(false);
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [pendingSpeciesName, setPendingSpeciesName] = useState<string | null>(
    null
  );
  const [speciesSearch, setSpeciesSearch] = useState(preselectedSystemName);

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
    const params = new URLSearchParams(category ? { category } : {});
    const currentSpeciesId = speciesId || preselectedSpeciesId || "";
    const currentSystemName =
      category === "plant" ? speciesSearch : systemName || systemSearch;
    if (currentSpeciesId) params.set("plant_id", currentSpeciesId);
    if (currentSystemName.trim()) params.set("system_name", currentSystemName.trim());
    if (quickCaptureId) params.set("quickCapture", quickCaptureId);
    return `/local/archive/new?${params.toString()}`;
  }, [category, preselectedSpeciesId, quickCaptureId, speciesId, speciesSearch, systemName, systemSearch]);

  useEffect(() => {
    let cancelled = false;
    async function loadCandidates() {
      setCandidatesLoading(true);
      const candidates = await getSystemNameCandidates({
        category: validPreselectedCategory,
        supabase,
        includeOtherCategories: true,
        limit: null,
      });
      if (cancelled) return;
      setSystemCandidates(candidates);
      setCandidatesLoading(false);

      if (preselectedSpeciesId && !guideEditedRef.current) {
        const selected = candidates.find((item) => item.plantId === preselectedSpeciesId);

        if (selected) {
          setCategory("plant");
          setSpeciesId(selected.plantId || null);
          setPendingSpeciesName(null);
          setSpeciesSearch(selected.label);
          setSystemSearch(selected.label);
          setSystemName(selected.label);
          setTitle((current) =>
            current || (selected.label ? `${copy.my_project_prefix}${selected.label}` : "")
          );
        }
      }
    }

    void loadCandidates();
    return () => { cancelled = true; };
  }, [copy.my_project_prefix, preselectedSpeciesId, validPreselectedCategory]);

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

  const guideSearch = category === "plant" ? speciesSearch : systemSearch;
  const systemOptions = filterSystemNameCandidates(systemCandidates, guideSearch, category);

  function switchCategory(nextCategory: ArchiveCategory) {
    guideEditedRef.current = true;
    setSpeciesSearch(guideSearch);
    setSystemSearch(guideSearch);
    setCategory(nextCategory);
    const exact = resolveExactSystemNameCandidate(systemCandidates, guideSearch);
    const nextPlantId = nextCategory === "plant" && exact?.category === "plant" ? exact.plantId || null : null;
    setSpeciesId(nextPlantId);
    setPendingSpeciesName(nextCategory === "plant" && !nextPlantId ? guideSearch.trim() : null);
    setPlantSuggestionsOpen(false);
    setSystemSuggestionsOpen(false);
  }

  function associateGuide(candidate: SystemNameSelectorCandidate) {
    if (!candidate.category) return;
    setCategory(candidate.category);
    const nextPlantId = candidate.category === "plant" ? candidate.plantId || null : null;
    setSpeciesId(nextPlantId);
    setPendingSpeciesName(candidate.category === "plant" && !nextPlantId ? candidate.label : null);
    setSystemName(candidate.label);
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

    if (!category) {
      showToast(copy.category_required_error);
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
      const selectedSpecies = speciesId ? systemCandidates.find((s) => s.plantId === speciesId) : null;
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
        <>
          <SystemNameSelector
            value={guideSearch}
            onChange={(value) => {
              guideEditedRef.current = true;
              setSpeciesSearch(value);
              setSystemSearch(value);
              setSystemName("");
              setSpeciesId(null);
              setPendingSpeciesName(null);
              setPlantSuggestionsOpen(true);
              setSystemSuggestionsOpen(true);
            }}
            candidates={systemOptions}
            resolutionCandidates={systemCandidates}
            selectedValue={systemName}
            suggestionsOpen={plantSuggestionsOpen || systemSuggestionsOpen}
            onSuggestionsOpenChange={(open) => {
              setPlantSuggestionsOpen(open);
              setSystemSuggestionsOpen(open);
            }}
            hasExactMatch={hasExactSystemNameCandidate(systemCandidates, guideSearch)}
            onResolveCandidate={associateGuide}
            onSelect={(candidate) => {
              guideEditedRef.current = true;
              associateGuide(candidate);
              setSpeciesSearch(candidate.label);
              setSystemSearch(candidate.label);
              setSystemName(candidate.label);
              setPlantSuggestionsOpen(false);
              setSystemSuggestionsOpen(false);
            }}
            onUseCustom={(name) => {
              guideEditedRef.current = true;
              setSpeciesSearch(name);
              setSystemSearch(name);
              setSystemName(name);
              setSpeciesId(null);
              setPendingSpeciesName(category === "plant" ? name : null);
              setPlantSuggestionsOpen(false);
              setSystemSuggestionsOpen(false);
            }}
            loading={candidatesLoading}
            required
            showCategory
            placeholder={copy.guide_selector_placeholder}
            inputStyle={archiveNewProjectInputStyle}
            panelStyle={archiveNewProjectSuggestionPanelStyle}
            optionStyle={(candidate, selected) => archiveNewProjectSuggestionButtonStyle(selected)}
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
          {!category ? <span style={archiveNewProjectHelperTextStyle}>{copy.guide_category_manual_hint}</span> : null}
        </>
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
