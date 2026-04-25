"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import ArchiveCard from "@/components/archive/ArchiveCard";
import ArchiveFiltersPanel from "@/components/archive/ArchiveFiltersPanel";
import ArchiveGroupPanel from "@/components/archive/ArchiveGroupPanel";
import ArchiveOverviewCards from "@/components/archive/ArchiveOverviewCards";
import ArchiveToolbar from "@/components/archive/ArchiveToolbar";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  getDefaultSystemNames,
  isNonPlantArchiveCategory,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type {
  ArchiveItem,
  GroupTagItem,
  PlantInterestItem,
  PlantPlanItem,
  PlantSpeciesOption,
  SortMode,
  SubTagItem,
} from "@/lib/archive-page-types";
import type { PlantSpeciesAliasSearchRow } from "@/lib/domain-types";
import {
  buildArchiveSearchText,
  getArchiveSortTime,
} from "@/lib/archive-page-utils";

export default function ArchivePage() {
  const router = useRouter();
  const loadingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [groupTags, setGroupTags] = useState<GroupTagItem[]>([]);
  const [subTags, setSubTags] = useState<SubTagItem[]>([]);
  const [speciesList, setSpeciesList] = useState<PlantSpeciesOption[]>([]);
  const [plantPlans, setPlantPlans] = useState<PlantPlanItem[]>([]);
  const [plantInterests, setPlantInterests] = useState<PlantInterestItem[]>([]);

  const [editingPlantArchiveId, setEditingPlantArchiveId] = useState<string | null>(null);
  const [editingSpeciesId, setEditingSpeciesId] = useState("");
  const [editingPendingSpeciesName, setEditingPendingSpeciesName] = useState("");
  const [editingPlantSearch, setEditingPlantSearch] = useState("");
  const [editingSystemArchiveId, setEditingSystemArchiveId] = useState<string | null>(null);
  const [editingSystemSearch, setEditingSystemSearch] = useState("");
  const [editingSystemName, setEditingSystemName] = useState("");
  const [plantSuggestionsOpen, setPlantSuggestionsOpen] = useState(false);
  const [systemSuggestionsOpen, setSystemSuggestionsOpen] = useState(false);

  const [activeCategory, setActiveCategory] = useState<ArchiveCategory | null>(null);
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [activeGroupTag, setActiveGroupTag] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("created");
  const [deleteArchiveTarget, setDeleteArchiveTarget] = useState<ArchiveItem | null>(null);
  const [deletingArchiveId, setDeletingArchiveId] = useState<string | null>(null);

  function shouldIgnoreCardNavigation(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;

    return Boolean(
      target.closest('button, input, textarea, select, a, [data-no-card-nav="true"]')
    );
  }

  function updateFilterWithoutJump(action: () => void) {
    const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
    action();
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY });
    });
  }

  async function loadData() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      const [
        { data: archivesData },
        { data: groupTagsData },
        { data: subTagsData },
        { data: speciesData },
        { data: aliasData },
        { data: plansData },
        { data: interestsData },
      ] = await Promise.all([
        supabase.from("archives").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("group_tags").select("*").eq("user_id", user.id),
        supabase.from("sub_tags").select("*").eq("user_id", user.id),
        supabase
          .from("plant_species")
          .select("id, common_name, scientific_name, slug, category, is_active")
          .eq("is_active", true)
          .order("common_name", { ascending: true }),
        supabase.from("plant_species_aliases").select("species_id, alias_name, normalized_name"),
        supabase.from("user_plant_plans").select("id, status, created_archive_id").eq("user_id", user.id),
        supabase.from("user_plant_interests").select("id").eq("user_id", user.id),
      ]);

      const aliasesBySpecies = new Map<string, string[]>();
      ((aliasData || []) as PlantSpeciesAliasSearchRow[]).forEach((alias) => {
        const list = aliasesBySpecies.get(alias.species_id) || [];
        if (alias.alias_name) list.push(alias.alias_name);
        if (alias.normalized_name && alias.normalized_name !== alias.alias_name) {
          list.push(alias.normalized_name);
        }
        aliasesBySpecies.set(alias.species_id, list);
      });

      const speciesRows: PlantSpeciesOption[] = ((speciesData || []) as PlantSpeciesOption[]).map((species) => {
        const aliases = Array.from(new Set(aliasesBySpecies.get(species.id) || []));
        const displayName = species.common_name || species.scientific_name || "未命名植物";

        return {
          ...species,
          aliases,
          display_name: displayName,
          search_text: [
            displayName,
            species.common_name,
            species.scientific_name,
            species.slug,
            ...aliases,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        };
      });

      const speciesMap = new Map(speciesRows.map((item) => [item.id, item.display_name]));

      const enrichedArchives: ArchiveItem[] = ((archivesData || []) as ArchiveItem[]).map((item) => ({
        ...item,
        status: item.status || "active",
        species_display_name:
          item.category === "plant"
            ? item.species_name_snapshot || (item.species_id ? speciesMap.get(item.species_id) : null) || null
            : null,
      }));

      setArchives(enrichedArchives);
      setGroupTags((groupTagsData || []) as GroupTagItem[]);
      setSubTags((subTagsData || []) as SubTagItem[]);
      setSpeciesList(speciesRows);
      setPlantPlans((plansData || []) as PlantPlanItem[]);
      setPlantInterests((interestsData || []) as PlantInterestItem[]);
    } finally {
      loadingRef.current = false;
    }
  }

  function beginEditPlant(item: ArchiveItem) {
    setEditingPlantArchiveId(item.id);
    setEditingSpeciesId(item.species_id || "");
    setEditingPendingSpeciesName("");
    setEditingPlantSearch(item.species_display_name || item.species_name_snapshot || "");
    setPlantSuggestionsOpen(false);
  }

  function submitPendingSpeciesName(name?: string) {
    const pendingName = (name ?? editingPlantSearch).trim();
    if (!pendingName) {
      showToast("请输入候选植物名称");
      return;
    }

    setEditingSpeciesId("");
    setEditingPendingSpeciesName(pendingName);
    setEditingPlantSearch(pendingName);
    setPlantSuggestionsOpen(false);
  }

  const plantSearchResults = useMemo(() => {
    const keyword = editingPlantSearch.trim().toLowerCase();
    if (!keyword) return speciesList.slice(0, 8);
    return speciesList.filter((species) => species.search_text.includes(keyword)).slice(0, 8);
  }, [editingPlantSearch, speciesList]);

  const hasExactPlantMatch = useMemo(() => {
    const keyword = editingPlantSearch.trim().toLowerCase();
    if (!keyword) return false;

    return speciesList.some((species) => {
      const names = [
        species.display_name,
        species.common_name,
        species.scientific_name,
        species.slug,
        ...(Array.isArray(species.aliases) ? species.aliases : []),
      ];

      return names
        .filter(Boolean)
        .some((name) => String(name).trim().toLowerCase() === keyword);
    });
  }, [editingPlantSearch, speciesList]);

  async function savePlantSelection(item: ArchiveItem) {
    const pendingName = editingPendingSpeciesName.trim();

    if (!editingSpeciesId && !pendingName) {
      showToast("请选择植物，或提交一个候选植物");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (pendingName) {
      await supabase.from("plant_species_pending").insert([
        {
          user_id: user?.id || null,
          submitted_name: pendingName,
          language_code: "zh",
          status: "pending",
        },
      ]);

      const { error } = await supabase
        .from("archives")
        .update({ species_id: null, species_name_snapshot: pendingName })
        .eq("id", item.id);

      if (error) {
        showToast("保存失败");
        return;
      }

      setArchives((prev) =>
        prev.map((archive) =>
          archive.id === item.id
            ? {
                ...archive,
                species_id: null,
                species_name_snapshot: pendingName,
                species_display_name: pendingName,
              }
            : archive
        )
      );

      cancelPlantEditing();
      showToast("已使用候选植物");
      return;
    }

    const selectedSpecies = speciesList.find((item) => item.id === editingSpeciesId);
    if (!selectedSpecies) {
      showToast("请选择植物");
      return;
    }

    const speciesName = selectedSpecies.common_name || selectedSpecies.scientific_name || "未命名植物";

    const { error } = await supabase
      .from("archives")
      .update({ species_id: selectedSpecies.id, species_name_snapshot: speciesName })
      .eq("id", item.id);

    if (error) {
      showToast("保存失败");
      return;
    }

    setArchives((prev) =>
      prev.map((archive) =>
        archive.id === item.id
          ? {
              ...archive,
              species_id: selectedSpecies.id,
              species_name_snapshot: speciesName,
              species_display_name: speciesName,
            }
          : archive
      )
    );

    cancelPlantEditing();
    showToast("已更新植物");
  }

  function cancelPlantEditing() {
    setEditingPlantArchiveId(null);
    setEditingSpeciesId("");
    setEditingPendingSpeciesName("");
    setEditingPlantSearch("");
    setPlantSuggestionsOpen(false);
  }

  function beginEditSystem(item: ArchiveItem) {
    setEditingSystemArchiveId(item.id);
    setEditingSystemSearch(item.system_name || "");
    setEditingSystemName(item.system_name || "");
    setSystemSuggestionsOpen(false);
  }

  function getSystemNameOptions(category: ArchiveCategory | null, keyword = editingSystemSearch) {
    if (!isNonPlantArchiveCategory(category)) return [];

    const normalizedKeyword = keyword.trim().toLowerCase();
    const names = new Set<string>();
    getDefaultSystemNames(category).forEach((name) => names.add(name));
    archives.forEach((archive) => {
      if (archive.category === category && archive.system_name) {
        names.add(archive.system_name);
      }
    });

    const allNames = Array.from(names);
    if (!normalizedKeyword) return allNames.slice(0, 6);
    return allNames.filter((name) => name.toLowerCase().includes(normalizedKeyword)).slice(0, 6);
  }

  function hasExactSystemNameMatch(category: ArchiveCategory | null) {
    if (!isNonPlantArchiveCategory(category)) return false;

    const keyword = editingSystemSearch.trim().toLowerCase();
    if (!keyword) return false;

    const names = new Set<string>();
    getDefaultSystemNames(category).forEach((name) => names.add(name));
    archives.forEach((archive) => {
      if (archive.category === category && archive.system_name) {
        names.add(archive.system_name);
      }
    });

    return Array.from(names).some((name) => name.trim().toLowerCase() === keyword);
  }

  async function saveSystemSelection(item: ArchiveItem) {
    const systemName = editingSystemName.trim();
    if (!systemName) {
      showToast("请从匹配结果中点选系统名，或点击作为备选系统名");
      return;
    }

    const { error } = await supabase
      .from("archives")
      .update({ system_name: systemName })
      .eq("id", item.id);

    if (error) {
      showToast("保存失败");
      return;
    }

    setArchives((prev) =>
      prev.map((archive) => (archive.id === item.id ? { ...archive, system_name: systemName } : archive))
    );

    cancelSystemEditing();
    showToast("已更新系统名");
  }

  function cancelSystemEditing() {
    setEditingSystemArchiveId(null);
    setEditingSystemSearch("");
    setEditingSystemName("");
    setSystemSuggestionsOpen(false);
  }

  async function createSubTag(category: ArchiveCategory) {
    const name = prompt(`新增${getArchiveCategoryLabel(category)}分类`);
    if (!name?.trim()) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from("sub_tags")
      .insert([{ user_id: user.id, name: name.trim(), category }])
      .select()
      .single();

    if (error) {
      showToast("新增分类失败");
      return;
    }

    if (data) {
      setSubTags((prev) => [...prev, data as SubTagItem]);
    }
  }

  async function renameSubTag(tag: SubTagItem) {
    const name = prompt("修改分类名称", tag.name);
    if (!name?.trim()) return;

    const { error } = await supabase.from("sub_tags").update({ name: name.trim() }).eq("id", tag.id);
    if (error) {
      showToast("修改分类失败");
      return;
    }

    setSubTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, name: name.trim() } : item)));
  }

  async function deleteSubTag(tag: SubTagItem) {
    if (!confirm("删除后，该分类下的项目会回到对应类型，确认？")) return;

    await supabase.from("archives").update({ sub_tag_id: null, group_tag_id: null }).eq("sub_tag_id", tag.id);
    await supabase.from("group_tags").delete().eq("sub_tag_id", tag.id);
    await supabase.from("sub_tags").delete().eq("id", tag.id);

    setArchives((prev) =>
      prev.map((item) =>
        item.sub_tag_id === tag.id ? { ...item, sub_tag_id: null, group_tag_id: null } : item
      )
    );
    setGroupTags((prev) => prev.filter((item) => item.sub_tag_id !== tag.id));
    setSubTags((prev) => prev.filter((item) => item.id !== tag.id));

    if (activeSubTag === tag.id) {
      setActiveSubTag(null);
      setActiveGroupTag(null);
    }
  }

  async function createGroupTag() {
    if (!activeSubTag) return;

    const name = prompt("新增分组");
    if (!name?.trim()) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from("group_tags")
      .insert([{ user_id: user.id, name: name.trim(), sub_tag_id: activeSubTag }])
      .select()
      .single();

    if (error) {
      showToast("新增分组失败");
      return;
    }

    if (data) {
      setGroupTags((prev) => [...prev, data as GroupTagItem]);
    }
  }

  async function renameGroupTag(tag: GroupTagItem) {
    const name = prompt("修改分组名称", tag.name);
    if (!name?.trim()) return;

    const { error } = await supabase.from("group_tags").update({ name: name.trim() }).eq("id", tag.id);
    if (error) {
      showToast("修改分组失败");
      return;
    }

    setGroupTags((prev) => prev.map((item) => (item.id === tag.id ? { ...item, name: name.trim() } : item)));
  }

  async function deleteGroupTag(tag: GroupTagItem) {
    if (!confirm("删除该分组？")) return;

    await supabase.from("archives").update({ group_tag_id: null }).eq("group_tag_id", tag.id);
    await supabase.from("group_tags").delete().eq("id", tag.id);

    setArchives((prev) =>
      prev.map((item) => (item.group_tag_id === tag.id ? { ...item, group_tag_id: null } : item))
    );
    setGroupTags((prev) => prev.filter((item) => item.id !== tag.id));

    if (activeGroupTag === tag.id) {
      setActiveGroupTag(null);
    }
  }

  async function updateArchiveStatus(item: ArchiveItem, nextStatus: "active" | "ended") {
    const isEnding = nextStatus === "ended";

    if (isEnding && !confirm("确认将这个项目标记为已结束吗？之后仍可查看，也可以恢复。")) {
      return;
    }

    const { error } = await supabase.rpc(
      isEnding ? "mark_archive_ended" : "restore_archive_active",
      { p_archive_id: item.id }
    );

    if (error) {
      showToast(isEnding ? "标记结束失败" : "恢复失败");
      return;
    }

    await loadData();
    showToast(isEnding ? "已标记为结束" : "已恢复为进行中");
  }

  async function toggleArchivePublic(item: ArchiveItem) {
    const newValue = !item.is_public;

    const { error } = await supabase.from("archives").update({ is_public: newValue }).eq("id", item.id);
    if (error) {
      showToast("更新可见状态失败");
      return;
    }

    if (!newValue) {
      await supabase.from("records").update({ visibility: "private" }).eq("archive_id", item.id);
    }

    setArchives((prev) =>
      prev.map((archive) => (archive.id === item.id ? { ...archive, is_public: newValue } : archive))
    );
    showToast(newValue ? "已公开到发现" : "已设为仅自己可见");
  }

  async function updateArchiveCategory(item: ArchiveItem, value: string) {
    if (archiveCategoryOptions.some((option) => option.value === value)) {
      await supabase.from("archives").update({ category: value, sub_tag_id: null, group_tag_id: null }).eq("id", item.id);
      setArchives((prev) =>
        prev.map((archive) =>
          archive.id === item.id
            ? { ...archive, category: value as ArchiveCategory, sub_tag_id: null, group_tag_id: null }
            : archive
        )
      );
      return;
    }

    const sub = subTags.find((tag) => String(tag.id) === value);
    if (!sub) return;

    await supabase
      .from("archives")
      .update({ category: sub.category, sub_tag_id: sub.id, group_tag_id: null })
      .eq("id", item.id);

    setArchives((prev) =>
      prev.map((archive) =>
        archive.id === item.id
          ? { ...archive, category: sub.category, sub_tag_id: sub.id, group_tag_id: null }
          : archive
      )
    );
  }

  async function updateArchiveGroupTag(item: ArchiveItem, value: string) {
    await supabase.from("archives").update({ group_tag_id: value || null }).eq("id", item.id);
    setArchives((prev) =>
      prev.map((archive) => (archive.id === item.id ? { ...archive, group_tag_id: value || null } : archive))
    );
  }

  async function deleteArchive(item: ArchiveItem) {
    setDeleteArchiveTarget(item);
  }

  async function confirmDeleteArchive() {
    if (!deleteArchiveTarget || deletingArchiveId) return;

    setDeletingArchiveId(deleteArchiveTarget.id);
    const { error } = await supabase.from("archives").delete().eq("id", deleteArchiveTarget.id);
    setDeletingArchiveId(null);

    if (error) {
      showToast("删除项目失败");
      return;
    }

    setDeleteArchiveTarget(null);
    showToast("项目已删除");
    await loadData();
  }

  function renameArchiveTitle(item: ArchiveItem) {
    const name = prompt("修改名称", item.title || "");
    if (!name?.trim()) return;

    supabase.from("archives").update({ title: name.trim() }).eq("id", item.id).then(() => {
      loadData();
    });
  }

  useEffect(() => {
    let isMounted = true;

    async function safeLoad() {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user) {
          router.push("/login");
          return;
        }

        if (!isMounted) return;
        await loadData();
      } catch (error) {
        console.error("loadData error:", error);
      } finally {
        if (isMounted) setReady(true);
      }
    }

    safeLoad();

    return () => {
      isMounted = false;
    };
  }, []);

  const archiveCount = archives.length;
  const publicArchiveCount = archives.filter((item) => item.is_public).length;
  const privateArchiveCount = archiveCount - publicArchiveCount;
  const endedArchiveCount = archives.filter((item) => item.status === "ended").length;

  const plantSubTags = subTags.filter((tag) => tag.category === "plant");
  const methodFacilitySubTags = subTags.filter((tag) => tag.category === "system");
  const insectFishSubTags = subTags.filter((tag) => tag.category === "insect_fish");
  const otherSubTags = subTags.filter((tag) => tag.category === "other");

  const currentSubTag = subTags.find((tag) => tag.id === activeSubTag) || null;
  const visibleGroupTags = activeSubTag && currentSubTag
    ? groupTags.filter((tag) => tag.sub_tag_id === activeSubTag)
    : [];

  const subTagNameMap = new Map(subTags.map((tag) => [tag.id, tag.name]));
  const groupTagNameMap = new Map(groupTags.map((tag) => [tag.id, tag.name]));

  const filteredArchives = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    const filtered = archives.filter((item) => {
      if (activeGroupTag && item.group_tag_id !== activeGroupTag) return false;
      if (activeSubTag && item.sub_tag_id !== activeSubTag) return false;
      if (!activeSubTag && activeCategory && item.category !== activeCategory) return false;
      if (!keyword) return true;

      return buildArchiveSearchText(item, subTagNameMap, groupTagNameMap).includes(keyword);
    });

    const sorted = [...filtered];

    if (sortMode === "name") {
      const collator = new Intl.Collator("zh-CN");
      return sorted.sort((a, b) => collator.compare(a.title || "", b.title || ""));
    }

    if (sortMode === "updated") {
      return sorted.sort((a, b) => getArchiveSortTime(b, "updated") - getArchiveSortTime(a, "updated"));
    }

    return sorted.sort((a, b) => getArchiveSortTime(b, "created") - getArchiveSortTime(a, "created"));
  }, [
    archives,
    activeCategory,
    activeSubTag,
    activeGroupTag,
    searchKeyword,
    sortMode,
    subTagNameMap,
    groupTagNameMap,
  ]);

  const activeArchives = filteredArchives.filter((item) => item.status !== "ended");
  const endedArchives = filteredArchives.filter((item) => item.status === "ended");

  if (!ready) return null;

  return (
    <main
      style={{
        padding: "22px 18px 42px",
        maxWidth: 1080,
        margin: "0 auto",
      }}
    >
      <section
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 10,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              color: "#1f2d1f",
              fontWeight: 700,
            }}
          >
            我的空间
          </h1>
        </div>
      </section>

      <div
        style={{
          fontSize: 14,
          color: "#6f7b6a",
          marginBottom: 18,
        }}
      >
        我的项目 {archiveCount} 个 · 公开 {publicArchiveCount} · 私密 {privateArchiveCount}
        {endedArchiveCount > 0 ? ` · 已结束 ${endedArchiveCount}` : ""}
      </div>

      <ArchiveOverviewCards
        plantPlans={plantPlans}
        plantInterests={plantInterests}
        onOpenPlans={() => router.push("/archive/plans")}
        onOpenInterests={() => router.push("/archive/interests")}
      />

      <ArchiveToolbar
        searchKeyword={searchKeyword}
        sortMode={sortMode}
        onSearchKeywordChange={setSearchKeyword}
        onSortModeChange={setSortMode}
        onCreateArchive={() => router.push("/archive/new")}
      />

      <ArchiveFiltersPanel
        activeCategory={activeCategory}
        activeSubTag={activeSubTag}
        visibleGroupTagCount={visibleGroupTags.length}
        plantSubTags={plantSubTags}
        methodFacilitySubTags={methodFacilitySubTags}
        insectFishSubTags={insectFishSubTags}
        otherSubTags={otherSubTags}
        onReset={() =>
          updateFilterWithoutJump(() => {
            setActiveCategory(null);
            setActiveSubTag(null);
            setActiveGroupTag(null);
          })
        }
        onSelectCategory={(category) =>
          updateFilterWithoutJump(() => {
            setActiveCategory(category);
            setActiveSubTag(null);
            setActiveGroupTag(null);
          })
        }
        onSelectSubTag={(category, id) =>
          updateFilterWithoutJump(() => {
            setActiveCategory(category);
            setActiveSubTag(id);
            setActiveGroupTag(null);
          })
        }
        onRenameSubTag={renameSubTag}
        onDeleteSubTag={deleteSubTag}
        onCreateSubTag={createSubTag}
      />

      <ArchiveGroupPanel
        activeGroupTag={activeGroupTag}
        activeSubTag={activeSubTag}
        visibleGroupTags={visibleGroupTags}
        onReset={() =>
          updateFilterWithoutJump(() => {
            setActiveGroupTag(null);
          })
        }
        onToggleGroupTag={(id) =>
          updateFilterWithoutJump(() => {
            setActiveGroupTag(activeGroupTag === id ? null : id);
          })
        }
        onRenameGroupTag={renameGroupTag}
        onDeleteGroupTag={deleteGroupTag}
        onCreateGroupTag={createGroupTag}
      />

      <section>
        {activeArchives.length === 0 && endedArchives.length === 0 ? (
          <div
            style={{
              border: "1px dashed #d9e6d0",
              borderRadius: 18,
              padding: 26,
              textAlign: "center",
              color: "#7a857a",
              background: "#fcfdfb",
            }}
          >
            还没有找到项目。
          </div>
        ) : (
          activeArchives.map((item) => (
            <ArchiveCard
              key={item.id}
              item={item}
              ended={false}
              subTags={subTags}
              groupTags={groupTags}
              editingPlantArchiveId={editingPlantArchiveId}
              editingSpeciesId={editingSpeciesId}
              editingPendingSpeciesName={editingPendingSpeciesName}
              editingPlantSearch={editingPlantSearch}
              plantSuggestionsOpen={plantSuggestionsOpen}
              plantSearchResults={plantSearchResults}
              hasExactPlantMatch={hasExactPlantMatch}
              editingSystemArchiveId={editingSystemArchiveId}
              editingSystemSearch={editingSystemSearch}
              editingSystemName={editingSystemName}
              systemSuggestionsOpen={systemSuggestionsOpen}
              systemNameOptions={getSystemNameOptions(item.category)}
              hasExactSystemNameMatch={hasExactSystemNameMatch(item.category)}
              onNavigate={(id) => router.push(`/archive/${id}`)}
              shouldIgnoreCardNavigation={shouldIgnoreCardNavigation}
              onRenameTitle={renameArchiveTitle}
              onBeginEditPlant={beginEditPlant}
              onPlantSearchChange={(value) => {
                setEditingPlantSearch(value);
                setEditingPendingSpeciesName("");
                setEditingSpeciesId("");
                setPlantSuggestionsOpen(true);
              }}
              onSelectPlantSpecies={(species) => {
                setEditingSpeciesId(species.id);
                setEditingPendingSpeciesName("");
                setEditingPlantSearch(species.display_name || species.common_name || species.scientific_name || "未命名植物");
                setPlantSuggestionsOpen(false);
              }}
              onSubmitPendingSpecies={() => submitPendingSpeciesName()}
              onSavePlantSelection={savePlantSelection}
              onCancelPlantEditing={cancelPlantEditing}
              onBeginEditSystem={beginEditSystem}
              onSystemSearchChange={(value) => {
                setEditingSystemSearch(value);
                setEditingSystemName("");
                setSystemSuggestionsOpen(true);
              }}
              onSelectSystemName={(name) => {
                setEditingSystemName(name);
                setEditingSystemSearch(name);
                setSystemSuggestionsOpen(false);
              }}
              onSaveSystemSelection={saveSystemSelection}
              onCancelSystemEditing={cancelSystemEditing}
              onUpdateArchiveStatus={updateArchiveStatus}
              onTogglePublic={toggleArchivePublic}
              onUpdateArchiveCategory={updateArchiveCategory}
              onUpdateArchiveGroupTag={updateArchiveGroupTag}
              onDeleteArchive={deleteArchive}
            />
          ))
        )}
      </section>

      {endedArchives.length > 0 && (
        <section style={{ marginTop: activeArchives.length > 0 ? 26 : 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
              color: "#777",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>已结束</h2>
            <span style={{ fontSize: 13 }}>这些项目已经告一段落，仍然保存在你的空间里。</span>
          </div>

          {endedArchives.map((item) => (
            <ArchiveCard
              key={item.id}
              item={item}
              ended
              subTags={subTags}
              groupTags={groupTags}
              editingPlantArchiveId={editingPlantArchiveId}
              editingSpeciesId={editingSpeciesId}
              editingPendingSpeciesName={editingPendingSpeciesName}
              editingPlantSearch={editingPlantSearch}
              plantSuggestionsOpen={plantSuggestionsOpen}
              plantSearchResults={plantSearchResults}
              hasExactPlantMatch={hasExactPlantMatch}
              editingSystemArchiveId={editingSystemArchiveId}
              editingSystemSearch={editingSystemSearch}
              editingSystemName={editingSystemName}
              systemSuggestionsOpen={systemSuggestionsOpen}
              systemNameOptions={getSystemNameOptions(item.category)}
              hasExactSystemNameMatch={hasExactSystemNameMatch(item.category)}
              onNavigate={(id) => router.push(`/archive/${id}`)}
              shouldIgnoreCardNavigation={shouldIgnoreCardNavigation}
              onRenameTitle={renameArchiveTitle}
              onBeginEditPlant={beginEditPlant}
              onPlantSearchChange={(value) => {
                setEditingPlantSearch(value);
                setEditingPendingSpeciesName("");
                setEditingSpeciesId("");
                setPlantSuggestionsOpen(true);
              }}
              onSelectPlantSpecies={(species) => {
                setEditingSpeciesId(species.id);
                setEditingPendingSpeciesName("");
                setEditingPlantSearch(species.display_name || species.common_name || species.scientific_name || "未命名植物");
                setPlantSuggestionsOpen(false);
              }}
              onSubmitPendingSpecies={() => submitPendingSpeciesName()}
              onSavePlantSelection={savePlantSelection}
              onCancelPlantEditing={cancelPlantEditing}
              onBeginEditSystem={beginEditSystem}
              onSystemSearchChange={(value) => {
                setEditingSystemSearch(value);
                setEditingSystemName("");
                setSystemSuggestionsOpen(true);
              }}
              onSelectSystemName={(name) => {
                setEditingSystemName(name);
                setEditingSystemSearch(name);
                setSystemSuggestionsOpen(false);
              }}
              onSaveSystemSelection={saveSystemSelection}
              onCancelSystemEditing={cancelSystemEditing}
              onUpdateArchiveStatus={updateArchiveStatus}
              onTogglePublic={toggleArchivePublic}
              onUpdateArchiveCategory={updateArchiveCategory}
              onUpdateArchiveGroupTag={updateArchiveGroupTag}
              onDeleteArchive={deleteArchive}
            />
          ))}
        </section>
      )}
      <ConfirmDialog
        open={Boolean(deleteArchiveTarget)}
        title="删除项目"
        message={`确定删除“${deleteArchiveTarget?.title || "这个项目"}”吗？项目内的记录会一起删除，删除后无法恢复。`}
        confirmText={deletingArchiveId ? "删除中..." : "删除"}
        cancelText="取消"
        danger
        onClose={() => {
          if (!deletingArchiveId) setDeleteArchiveTarget(null);
        }}
        onConfirm={confirmDeleteArchive}
      />

    </main>
  );
}
