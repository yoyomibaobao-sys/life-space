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

const DEFAULT_ARCHIVE_IS_PUBLIC = false;
const DEFAULT_RECORD_VISIBILITY = "private";

export default function NewArchivePage() {
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
          加载中...
        </main>
      }
    >
      <NewArchiveContent />
    </Suspense>
  );
}

function NewArchiveContent() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ArchiveCategory>("plant");

  const [systemCandidates, setSystemCandidates] = useState<SystemNameCandidate[]>([]);
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [pendingSpeciesName, setPendingSpeciesName] = useState<string | null>(
    null
  );
  const [speciesSearch, setSpeciesSearch] = useState("");

  const [systemSearch, setSystemSearch] = useState("");
  const [systemName, setSystemName] = useState("");
  const [plantSuggestionsOpen, setPlantSuggestionsOpen] = useState(false);
  const [systemSuggestionsOpen, setSystemSuggestionsOpen] = useState(false);

  const [source, setSource] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);

  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSpeciesId = searchParams.get("species");
  const selectedPlanId = searchParams.get("plan");
  const preselectedCategory = searchParams.get("category");
  const validPreselectedCategory = archiveCategoryOptions.some(
    (option) => option.value === preselectedCategory
  )
    ? (preselectedCategory as ArchiveCategory)
    : null;

  useEffect(() => {
    if (!validPreselectedCategory || preselectedSpeciesId) return;
    switchCategory(validPreselectedCategory);
  }, [validPreselectedCategory, preselectedSpeciesId]);

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
            current || (selected.label ? `我的${selected.label}` : "")
          );
        }
      }
    }

    void loadCandidates();
  }, [category, preselectedSpeciesId]);

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

  const contentBlocked = membership?.can_create_content === false;

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
      showToast("请输入候选植物名称");
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
      showToast(getCreateContentBlockedText(membership));
      return;
    }

    if (!title.trim()) {
      showToast("请输入项目名称");
      return;
    }

    const cleanSystemName =
      category === "plant" ? speciesSearch.trim() : systemName.trim() || systemSearch.trim();

    if (!cleanSystemName) {
      showToast("请填写系统名");
      return;
    }

    const cleanObjectName = source.trim();

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showToast("未登录");
      setLoading(false);
      return;
    }

    if (category === "plant" && !speciesId && !pendingSpeciesName) {
      await supabase.from("plant_species_pending").insert([
        {
          user_id: user.id,
          submitted_name: cleanSystemName,
          language_code: "zh",
          status: "pending",
        },
      ]);
    }

    const selectedSpecies = systemCandidates.find((s) => s.plantId === speciesId || s.id === speciesId);
    const speciesNameSnapshot =
      category === "plant"
        ? pendingSpeciesName ||
          selectedSpecies?.label ||
          cleanSystemName
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

    if (error) {
      setLoading(false);
      showToast("创建失败");
      return;
    }

    if (selectedPlanId && createdArchive?.id) {
      const { error: planError } = await supabase
        .from("user_plant_plans")
        .update({
          status: "started",
          created_archive_id: createdArchive.id,
        })
        .eq("id", selectedPlanId)
        .eq("user_id", user.id);

      if (planError) {
        setLoading(false);
        showToast(
          "项目已创建，计划未同步"
        );
        router.push(`/archive/${createdArchive.id}`);
        return;
      }
    }

    setLoading(false);

    if (createdArchive?.id) {
      router.push(`/archive/${createdArchive.id}`);
    } else {
      router.push("/archive");
    }
  }

  return (
    <ArchiveNewProjectFormShell
      backHref="/archive"
      backLabel="返回我的空间"
      eyebrow="云空间"
      title="新建项目"
      subtitle="表单结构与本地离线一致；保存后进入云空间，可用于多设备、公开发现、求助和集市等云端能力。"
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
                const name = species.label || "未命名植物";
                setSpeciesId(species.plantId || species.id || null);
                setPendingSpeciesName(null);
                setSpeciesSearch(name);
                setPlantSuggestionsOpen(false);
              }}
              onUseCustom={() => submitPendingSpeciesName()}
              placeholder="输入后点选系统植物，或新增候选名"
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
              emptyText="没有找到匹配植物"
              customActionLabel={(inputValue) => `+ 新增候选植物：${inputValue}`}
            />
            {pendingSpeciesName ? (
              <span style={archiveNewProjectHelperTextStyle}>
                当前使用候选植物：<strong>{pendingSpeciesName}</strong>
              </span>
            ) : null}
          </>
        ) : category === "other" ? (
          <input
            placeholder="其他种类没有预设系统名，直接输入"
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
              placeholder={`输入后点选，例如：${systemOptions[0]?.label || "补光灯"}`}
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
              emptyText="没有找到匹配名称"
              customActionLabel={(inputValue) => `+ 新增为系统名：${inputValue}`}
            />
          </>
        )
      }
      sourceControl={
        <input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="可选，例如：市场购买、朋友分享、育苗记录"
          style={archiveNewProjectInputStyle}
        />
      }
      note={note}
      onNoteChange={setNote}
      notice="保存到云空间。当前默认仅自己可见；后续可在项目或记录中切换公开发现。子分类和分组可在项目列表或项目档案中继续整理。"
      submitText="创建项目"
      loadingText="创建中..."
      submitting={loading}
      disabled={membershipLoading || contentBlocked}
      disabledNotice={
        contentBlocked ? (
          <>
            <span>{getCreateContentBlockedText(membership)}</span>{" "}
            <Link href="/membership" style={{ color: "#5d7c2f", fontWeight: 700 }}>
              查看云空间
            </Link>
          </>
        ) : null
      }
      onSubmit={handleCreate}
    />
  );
}
