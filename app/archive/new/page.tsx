"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PlantingRegionField from "@/components/archive/PlantingRegionField";
import { usePlantingRegionDraft } from "@/lib/use-planting-region";
import { normalizePlantingRegion } from "@/lib/planting-region";
import { useRouter, useSearchParams } from "next/navigation";
import { showToast } from "@/components/Toast";
import ArchiveNewProjectFormShell, {
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
  inferProjectGuide,
  hasExactSystemNameCandidate,
  resolveExactSystemNameCandidate,
  type SystemNameCandidate,
} from "@/lib/system-name-candidates";
import { useLanguage } from "@/lib/i18n/useLanguage";
import {
  CloudQuickCaptureError,
  saveQuickCaptureAsFirstCloudRecord,
} from "@/lib/cloud-quick-capture-record";

const DEFAULT_RECORD_VISIBILITY = "public";

function canCreatePublicCloudProject(membership: MyMembership | null, userId?: string | null) {
  return membership?.can_create_content === true && (!userId || membership.user_id === userId);
}

function resolveCloudProjectVisibility(manualChoice: boolean | null, plusAllowed: boolean) {
  return manualChoice ?? plusAllowed;
}

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

  const { plantingRegion, changePlantingRegion } = usePlantingRegionDraft();
  const [title, setTitle] = useState(preselectedSystemName);
  const [category, setCategory] = useState<ArchiveCategory | null>(
    validPreselectedCategory && !preselectedSpeciesId
      ? validPreselectedCategory
      : preselectedSpeciesId ? "plant" : null
  );

  const [systemCandidates, setSystemCandidates] = useState<SystemNameCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const guideEditedRef = useRef(Boolean(preselectedSystemName));
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
  // null means no manual choice: Free defaults private; active Plus defaults public.
  // An explicit choice persists across asynchronous membership refreshes.
  const [visibilityChoice, setVisibilityChoice] = useState<boolean | null>(null);

  const [loading, setLoading] = useState(false);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [createdArchiveId, setCreatedArchiveId] = useState("");
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
  const publicAllowed = !membershipLoading && canCreatePublicCloudProject(membership);
  const archiveIsPublic = resolveCloudProjectVisibility(visibilityChoice, publicAllowed);
  const guideSearch = category === "plant" ? speciesSearch : systemSearch;
  const categoryCandidates = systemCandidates.filter((candidate) => candidate.category === category);
  const systemOptions = guideSearch.trim() ? filterSystemNameCandidates(categoryCandidates, guideSearch, category) : [];
  useEffect(() => {
    if (guideEditedRef.current || !category || (preselectedSpeciesId && candidatesLoading)) return;
    const inferred = inferProjectGuide(systemCandidates, title, category);
    const name = inferred?.label || title.trim();
    setSpeciesSearch(name);
    setSystemSearch(name);
    setSystemName(name);
    setSpeciesId(category === "plant" ? inferred?.plantId || null : null);
    setPendingSpeciesName(category === "plant" && !inferred?.plantId ? name || null : null);
  }, [title, category, systemCandidates, preselectedSpeciesId, candidatesLoading]);

  function switchCategory(nextCategory: ArchiveCategory) {
    guideEditedRef.current = false;
    setCategory(nextCategory);
    const inferred = inferProjectGuide(systemCandidates, title, nextCategory);
    const name = inferred?.label || title.trim();
    setSpeciesSearch(name);
    setSystemSearch(name);
    setSystemName(name);
    const nextPlantId = nextCategory === "plant" ? inferred?.plantId || null : null;
    setSpeciesId(nextPlantId);
    setPendingSpeciesName(nextCategory === "plant" && !nextPlantId ? name || null : null);
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

    if (loading || membershipLoading) return;

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

    if (category === "plant" && !normalizePlantingRegion(plantingRegion)) {
      showToast(language === "en" ? "Enter the planting country and city / district." : "请填写项目实际种植的国家及城市／区县。");
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

    // Refresh owner and membership at submit time: expiry, refund and account
    // switch must not permit a stale Plus selection to reach create_project.
    const { data: freshData, error: membershipError } = await supabase.rpc("get_my_membership");
    const freshMembership = normalizeMembershipRpcResult(freshData);
    const { data: currentAuth } = await supabase.auth.getUser();
    if (membershipError || !freshMembership || freshMembership.user_id !== user.id ||
        currentAuth.user?.id !== user.id || !canCreateMembershipContent(freshMembership)) {
      setLoading(false);
      showToast(language === "en" ? "Account or membership status changed. Please reopen this form." : "账号或会员状态已变化，请重新打开创建页面。");
      return;
    }
    // Refresh the displayed default after a legitimate refund/expiry response.
    // visibilityChoice remains untouched, so a manual preference is preserved.
    setMembership(freshMembership);
    let archiveId = createdArchiveId;
    const recordVisibility = archiveIsPublic ? DEFAULT_RECORD_VISIBILITY : "private";
    if (!archiveId) {
      const selectedSpecies = speciesId ? systemCandidates.find((s) => s.plantId === speciesId) : null;
      const speciesNameSnapshot =
        category === "plant"
          ? pendingSpeciesName || selectedSpecies?.label || cleanSystemName
          : null;

      const { data: createdArchive, error } = await supabase.rpc("create_project", {
        p_project: {
          title: title.trim(), category,
          species_id: category === "plant" ? speciesId : null,
          species_name_snapshot: speciesNameSnapshot,
          system_name: category === "plant" ? null : cleanSystemName,
          source: cleanObjectName || null, note: note.trim() || null,
          planting_region: normalizePlantingRegion(plantingRegion),
          is_public: archiveIsPublic,
          default_record_visibility: recordVisibility,
        },
      });

      if (error || typeof createdArchive !== "string" || !createdArchive) {
        setLoading(false);
        showToast(copy.create_failed);
        return;
      }
      archiveId = createdArchive;
      setCreatedArchiveId(archiveId);
    }

    // The RPC may have committed even when a follow-up read fails.
    // Retain the returned ID so retrying cannot create a duplicate.
    const { data: savedArchive, error: readError } = await supabase
      .from("archives")
      .select("id,user_id,is_public,default_record_visibility")
      .eq("id", archiveId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError || !savedArchive || savedArchive.user_id !== user.id || savedArchive.is_public !== archiveIsPublic || savedArchive.default_record_visibility !== recordVisibility) {
      setLoading(false);
      showToast(language === "en"
        ? "Project created, but its visibility could not be confirmed. Check My Space before retrying."
        : "项目已创建，但无法确认公开状态，请先在我的空间核对后再重试。");
      return;
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
        const result = await saveQuickCaptureAsFirstCloudRecord({
          archiveId,
          userId: user.id,
          quickCaptureId,
          visibility: recordVisibility,
        });
        if (result === null) {
          setLoading(false);
          router.push(`/archive/${archiveId}?quickCapture=${encodeURIComponent(quickCaptureId)}#add-record`);
          return;
        }
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
            resolutionCandidates={categoryCandidates}
            selectedValue={systemName}
            suggestionsOpen={plantSuggestionsOpen || systemSuggestionsOpen}
            onSuggestionsOpenChange={(open) => {
              setPlantSuggestionsOpen(open);
              setSystemSuggestionsOpen(open);
            }}
            hasExactMatch={hasExactSystemNameCandidate(categoryCandidates, guideSearch)}
            onResolveCandidate={(candidate) => { if (candidate.category === category) associateGuide(candidate); }}
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
            placeholder={language === "zh" ? "自动关联，亦可搜索或输入自定义名称" : "Auto-linked; search or enter a custom name"}
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
        </>
      }
      plantingRegionControl={category === "plant" ? <PlantingRegionField value={plantingRegion} onChange={changePlantingRegion} language={language} required /> : null}
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
      visibilityControl={
        <fieldset style={{ minWidth: 0, margin: 0, padding: "12px 14px", border: "1px solid #dce5d8", borderRadius: 12 }}>
          <legend style={{ padding: "0 5px", fontWeight: 650 }}>
            {language === "en" ? "Project visibility" : "项目可见性"}
          </legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="radio" name="cloud-project-visibility" value="public"
                checked={archiveIsPublic} disabled={Boolean(createdArchiveId) || membershipLoading}
                onChange={() => setVisibilityChoice(true)} />
              {copy.public_discover}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="radio" name="cloud-project-visibility" value="private"
                checked={!archiveIsPublic} disabled={Boolean(createdArchiveId) || membershipLoading}
                onChange={() => setVisibilityChoice(false)} />
              {copy.private_only}
            </label>
          </div>
        </fieldset>
      }
      notice={null}
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
