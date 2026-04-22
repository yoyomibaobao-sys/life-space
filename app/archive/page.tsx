"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/Toast";

type SortMode = "created" | "name" | "updated";

const DEFAULT_SYSTEM_NAMES = [
  "补光灯",
  "花盆",
  "育苗盘",
  "支架",
  "爬藤架",
  "灌溉系统",
  "滴灌",
  "喷雾器",
  "温湿度计",
  "遮阳网",
  "防虫网",
  "土壤",
  "肥料",
  "营养液",
  "基质",
];

export default function ArchivePage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [archives, setArchives] = useState<any[]>([]);
  const [groupTags, setGroupTags] = useState<any[]>([]);
  const [subTags, setSubTags] = useState<any[]>([]);
  const [speciesList, setSpeciesList] = useState<any[]>([]);
  const [plantPlans, setPlantPlans] = useState<any[]>([]);
  const [plantInterests, setPlantInterests] = useState<any[]>([]);

  const [editingPlantArchiveId, setEditingPlantArchiveId] =
    useState<string | null>(null);
  const [editingSpeciesId, setEditingSpeciesId] = useState("");
  const [editingPendingSpeciesName, setEditingPendingSpeciesName] =
    useState("");
  const [editingPlantSearch, setEditingPlantSearch] = useState("");
  const [editingSystemArchiveId, setEditingSystemArchiveId] =
    useState<string | null>(null);
  const [editingSystemSearch, setEditingSystemSearch] = useState("");
  const [editingSystemName, setEditingSystemName] = useState("");
  const [plantSuggestionsOpen, setPlantSuggestionsOpen] = useState(false);
  const [systemSuggestionsOpen, setSystemSuggestionsOpen] = useState(false);

  const [activeCategory, setActiveCategory] = useState<"plant" | "system" | null>(null);
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [activeGroupTag, setActiveGroupTag] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("created");

  const loadingRef = useRef(false);

  function shouldIgnoreCardNavigation(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;

    return Boolean(
      target.closest(
        'button, input, textarea, select, a, [data-no-card-nav="true"]'
      )
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
        supabase
          .from("archives")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),

        supabase.from("group_tags").select("*").eq("user_id", user.id),

        supabase.from("sub_tags").select("*").eq("user_id", user.id),

        supabase
          .from("plant_species")
          .select("id, common_name, scientific_name, slug, category, is_active")
          .eq("is_active", true)
          .order("common_name", { ascending: true }),

        supabase
          .from("plant_species_aliases")
          .select("species_id, alias_name, normalized_name"),

        supabase
          .from("user_plant_plans")
          .select("id, status, created_archive_id")
          .eq("user_id", user.id),

        supabase
          .from("user_plant_interests")
          .select("id")
          .eq("user_id", user.id),
      ]);

      const aliasRows = aliasData || [];
      const aliasesBySpecies = new Map<string, string[]>();

      aliasRows.forEach((alias: any) => {
        const list = aliasesBySpecies.get(alias.species_id) || [];
        if (alias.alias_name) list.push(alias.alias_name);
        if (alias.normalized_name && alias.normalized_name !== alias.alias_name) {
          list.push(alias.normalized_name);
        }
        aliasesBySpecies.set(alias.species_id, list);
      });

      const speciesRows = (speciesData || []).map((species: any) => {
        const aliases = Array.from(new Set(aliasesBySpecies.get(species.id) || []));
        const displayName =
          species.common_name || species.scientific_name || "未命名植物";

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

      const speciesMap = new Map(
        speciesRows.map((s: any) => [
          s.id,
          s.display_name || s.common_name || s.scientific_name || "未命名植物",
        ])
      );

      const enrichedArchives = (archivesData || []).map((item: any) => ({
        ...item,
        status: item.status || "active",
        species_display_name:
          item.category === "plant"
            ? item.species_name_snapshot ||
              speciesMap.get(item.species_id) ||
              null
            : null,
      }));

      setArchives(enrichedArchives);
      setGroupTags(groupTagsData || []);
      setSubTags(subTagsData || []);
      setSpeciesList(speciesRows);
      setPlantPlans(plansData || []);
      setPlantInterests(interestsData || []);
    } finally {
      loadingRef.current = false;
    }
  }

  function beginEditPlant(item: any) {
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

  function getPlantSearchResults() {
    const keyword = editingPlantSearch.trim().toLowerCase();

    if (!keyword) {
      return speciesList.slice(0, 8);
    }

    return speciesList
      .filter((species: any) => species.search_text?.includes(keyword))
      .slice(0, 8);
  }

  function hasExactPlantMatch() {
    const keyword = editingPlantSearch.trim().toLowerCase();
    if (!keyword) return false;

    return speciesList.some((species: any) => {
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
  }

  async function savePlantSelection(item: any) {
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
        .update({
          species_id: null,
          species_name_snapshot: pendingName,
        })
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

      setEditingPlantArchiveId(null);
      setEditingPendingSpeciesName("");
      setEditingSpeciesId("");
      setEditingPlantSearch("");
      setPlantSuggestionsOpen(false);
      showToast("已使用候选植物");
      return;
    }

    const selectedSpecies = speciesList.find((s) => s.id === editingSpeciesId);

    if (!selectedSpecies) {
      showToast("请选择植物");
      return;
    }

    const speciesName =
      selectedSpecies.common_name ||
      selectedSpecies.scientific_name ||
      "未命名植物";

    const { error } = await supabase
      .from("archives")
      .update({
        species_id: selectedSpecies.id,
        species_name_snapshot: speciesName,
      })
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

    setEditingPlantArchiveId(null);
    setEditingPendingSpeciesName("");
    setEditingSpeciesId("");
    setEditingPlantSearch("");
    setPlantSuggestionsOpen(false);
    showToast("已更新植物");
  }

  function beginEditSystem(item: any) {
    setEditingSystemArchiveId(item.id);
    setEditingSystemSearch(item.system_name || "");
    setEditingSystemName(item.system_name || "");
    setSystemSuggestionsOpen(false);
  }

  function getSystemNameOptions(keyword = editingSystemSearch) {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) {
      return [];
    }

    const names = new Set<string>();

    DEFAULT_SYSTEM_NAMES.forEach((name) => names.add(name));

    archives.forEach((archive) => {
      if (archive.category === "system" && archive.system_name) {
        names.add(archive.system_name);
      }
    });

    return Array.from(names)
      .filter((name) => name.toLowerCase().includes(normalizedKeyword))
      .slice(0, 6);
  }

  function hasExactSystemNameMatch() {
    const keyword = editingSystemSearch.trim().toLowerCase();
    if (!keyword) return false;

    const names = new Set<string>();

    DEFAULT_SYSTEM_NAMES.forEach((name) => names.add(name));

    archives.forEach((archive) => {
      if (archive.category === "system" && archive.system_name) {
        names.add(archive.system_name);
      }
    });

    return Array.from(names).some(
      (name) => name.trim().toLowerCase() === keyword
    );
  }

  async function saveSystemSelection(item: any) {
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
      prev.map((archive) =>
        archive.id === item.id
          ? {
              ...archive,
              system_name: systemName,
            }
          : archive
      )
    );

    setEditingSystemArchiveId(null);
    setEditingSystemSearch("");
    setEditingSystemName("");
    setSystemSuggestionsOpen(false);
    showToast("已更新系统名");
  }

  async function createSubTag(category: "plant" | "system") {
    const name = prompt(category === "plant" ? "新增种植分类" : "新增配套设施分类");
    if (!name?.trim()) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from("sub_tags")
      .insert([
        {
          user_id: user.id,
          name: name.trim(),
          category,
        },
      ])
      .select()
      .single();

    if (error) {
      showToast("新增分类失败");
      return;
    }

    if (data) {
      setSubTags((prev) => [...prev, data]);
    }
  }

  async function renameSubTag(tag: any) {
    const name = prompt("修改分类名称", tag.name);
    if (!name?.trim()) return;

    const { error } = await supabase
      .from("sub_tags")
      .update({ name: name.trim() })
      .eq("id", tag.id);

    if (error) {
      showToast("修改分类失败");
      return;
    }

    setSubTags((prev) =>
      prev.map((item) => (item.id === tag.id ? { ...item, name: name.trim() } : item))
    );
  }

  async function deleteSubTag(tag: any) {
    if (!confirm("删除后，该分类下的项目会回到对应类型，确认？")) return;

    await supabase
      .from("archives")
      .update({ sub_tag_id: null, group_tag_id: null })
      .eq("sub_tag_id", tag.id);

    await supabase.from("group_tags").delete().eq("sub_tag_id", tag.id);
    await supabase.from("sub_tags").delete().eq("id", tag.id);

    setArchives((prev) =>
      prev.map((item) =>
        item.sub_tag_id === tag.id
          ? { ...item, sub_tag_id: null, group_tag_id: null }
          : item
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
      .insert([
        {
          user_id: user.id,
          name: name.trim(),
          sub_tag_id: activeSubTag,
        },
      ])
      .select()
      .single();

    if (error) {
      showToast("新增分组失败");
      return;
    }

    if (data) {
      setGroupTags((prev) => [...prev, data]);
    }
  }

  async function renameGroupTag(tag: any) {
    const name = prompt("修改分组名称", tag.name);
    if (!name?.trim()) return;

    const { error } = await supabase
      .from("group_tags")
      .update({ name: name.trim() })
      .eq("id", tag.id);

    if (error) {
      showToast("修改分组失败");
      return;
    }

    setGroupTags((prev) =>
      prev.map((item) => (item.id === tag.id ? { ...item, name: name.trim() } : item))
    );
  }

  async function deleteGroupTag(tag: any) {
    if (!confirm("删除该分组？")) return;

    await supabase
      .from("archives")
      .update({ group_tag_id: null })
      .eq("group_tag_id", tag.id);

    await supabase.from("group_tags").delete().eq("id", tag.id);

    setArchives((prev) =>
      prev.map((item) =>
        item.group_tag_id === tag.id ? { ...item, group_tag_id: null } : item
      )
    );
    setGroupTags((prev) => prev.filter((item) => item.id !== tag.id));

    if (activeGroupTag === tag.id) {
      setActiveGroupTag(null);
    }
  }

  async function updateArchiveStatus(item: any, nextStatus: "active" | "ended") {
    const isEnding = nextStatus === "ended";

    if (
      isEnding &&
      !confirm("确认将这个项目标记为已结束吗？之后仍可查看，也可以恢复。")
    ) {
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
      } catch (err) {
        console.error("loadData error:", err);
      } finally {
        if (isMounted) setReady(true);
      }
    }

    safeLoad();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!ready) return null;

  const archiveCount = archives.length;
  const publicArchiveCount = archives.filter((item) => item.is_public).length;
  const privateArchiveCount = archiveCount - publicArchiveCount;
  const endedArchiveCount = archives.filter((item) => item.status === "ended").length;
  const activePlanCount = plantPlans.filter((item) => item.status !== "abandoned").length;
  const startedPlanCount = plantPlans.filter(
    (item) => item.status === "started" || item.created_archive_id
  ).length;

  const plantSubTags = subTags.filter((tag) => tag.category === "plant");
  const systemSubTags = subTags.filter((tag) => tag.category === "system");

  const currentSubTag = subTags.find((tag) => tag.id === activeSubTag) || null;
  const visibleGroupTags =
    activeSubTag && currentSubTag
      ? groupTags.filter((tag) => tag.sub_tag_id === activeSubTag)
      : [];

  const subTagNameMap = new Map(subTags.map((tag) => [tag.id, tag.name]));
  const groupTagNameMap = new Map(groupTags.map((tag) => [tag.id, tag.name]));

  function getArchiveSystemName(item: any) {
    if (item.category === "plant") {
      return item.species_display_name || item.species_name_snapshot || "未选择植物";
    }

    return item.system_name || "未填写配套设施";
  }

  function getCategoryLabel(item: any) {
    return item.category === "system" ? "配套设施" : "种植";
  }

  function formatDate(value?: string | null) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("zh-CN", {
      month: "numeric",
      day: "numeric",
    });
  }

  function getSortTime(item: any, field: "created" | "updated") {
    if (field === "created") {
      return new Date(item.created_at || 0).getTime();
    }

    return new Date(item.last_record_time || item.created_at || 0).getTime();
  }

  function archiveMatchesKeyword(item: any) {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return true;

    const searchText = [
      item.title,
      item.system_name,
      item.species_display_name,
      item.species_name_snapshot,
      item.note,
      getCategoryLabel(item),
      subTagNameMap.get(item.sub_tag_id),
      groupTagNameMap.get(item.group_tag_id),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchText.includes(keyword);
  }

  function filterArchives(list: any[]) {
    return list.filter((item) => {
      if (activeGroupTag) {
        return item.group_tag_id === activeGroupTag && archiveMatchesKeyword(item);
      }

      if (activeSubTag) {
        return item.sub_tag_id === activeSubTag && archiveMatchesKeyword(item);
      }

      if (activeCategory) {
        return item.category === activeCategory && archiveMatchesKeyword(item);
      }

      return archiveMatchesKeyword(item);
    });
  }

  function sortArchives(list: any[]) {
    const sorted = [...list];

    if (sortMode === "name") {
      const collator = new Intl.Collator("zh-CN");
      return sorted.sort((a, b) => collator.compare(a.title || "", b.title || ""));
    }

    if (sortMode === "updated") {
      return sorted.sort((a, b) => getSortTime(b, "updated") - getSortTime(a, "updated"));
    }

    return sorted.sort((a, b) => getSortTime(b, "created") - getSortTime(a, "created"));
  }

  const filteredArchives = sortArchives(filterArchives(archives));
  const activeArchives = filteredArchives.filter((item) => item.status !== "ended");
  const endedArchives = filteredArchives.filter((item) => item.status === "ended");


  function renderSubTagChip(tag: any) {
    const active = activeSubTag === tag.id;

    return (
      <span
        key={tag.id}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginRight: 3,
          marginBottom: 4,
        }}
      >
        <button
          type="button"
          onClick={() =>
            updateFilterWithoutJump(() => {
              setActiveCategory(tag.category);
              setActiveSubTag(tag.id);
              setActiveGroupTag(null);
            })
          }
          onDoubleClick={() => renameSubTag(tag)}
          style={{
            border: active ? "1px solid #2f6d2f" : "1px solid #dfe7d9",
            background: active ? "#2f6d2f" : "#fff",
            color: active ? "#fff" : "#374437",
            borderRadius: 999,
            padding: "7px 13px",
            fontSize: 15,
            fontWeight: active ? 700 : 500,
            cursor: "pointer",
            lineHeight: 1.3,
            boxShadow: active ? "0 6px 14px rgba(63,125,61,0.18)" : "none",
          }}
          title="双击可修改名称"
        >
          {tag.name}
        </button>

        <button
          type="button"
          onClick={() => deleteSubTag(tag)}
          style={{
            border: "none",
            background: "transparent",
            color: "#b7b7b7",
            cursor: "pointer",
            fontSize: 13,
            padding: 0,
            lineHeight: 1,
          }}
          title="删除分类"
        >
          ×
        </button>
      </span>
    );
  }

  function renderSystemNameEditor(item: any) {
    const options = getSystemNameOptions();

    return (
      <span
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          position: "relative",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative" }}>
          <input
            value={editingSystemSearch}
            onChange={(e) => {
              setEditingSystemSearch(e.target.value);
              setEditingSystemName("");
              setSystemSuggestionsOpen(true);
            }}
            placeholder="输入关键词后点选"
            style={{
              fontSize: 12,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid #ddd",
              minWidth: 160,
            }}
          />

          {systemSuggestionsOpen && (
            <div
              style={{
                position: "absolute",
                top: 30,
                left: 0,
                width: 220,
              maxHeight: 190,
              overflow: "auto",
              background: "#fff",
              border: "1px solid #e5e5e5",
              borderRadius: 10,
              padding: 8,
              boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {options.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setEditingSystemName(name);
                  setEditingSystemSearch(name);
                  setSystemSuggestionsOpen(false);
                }}
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border:
                    editingSystemName === name
                      ? "1px solid #4CAF50"
                      : "1px solid transparent",
                  background: editingSystemName === name ? "#f0fff4" : "#fafafa",
                  cursor: "pointer",
                  color: "#222",
                }}
              >
                {name}
              </button>
            ))}

            {editingSystemSearch.trim() && options.length === 0 && (
              <div style={{ fontSize: 12, color: "#999", padding: 6 }}>
                没有找到匹配系统名
              </div>
            )}

            {editingSystemSearch.trim() && !hasExactSystemNameMatch() && (
              <button
                type="button"
                onClick={() => {
                  const name = editingSystemSearch.trim();
                  setEditingSystemName(name);
                  setEditingSystemSearch(name);
                  setSystemSuggestionsOpen(false);
                }}
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px dashed #4CAF50",
                  background: "#fff",
                  color: "#4CAF50",
                  cursor: "pointer",
                }}
              >
                + 作为备选系统名：{editingSystemSearch.trim()}
              </button>
            )}

            {!editingSystemSearch.trim() && (
              <div style={{ fontSize: 12, color: "#999", padding: 6 }}>
                输入关键词后，从结果中点选
              </div>
            )}
          </div>
          )}
        </div>

        <button type="button" onClick={() => saveSystemSelection(item)} style={{ fontSize: 12 }}>
          保存
        </button>

        <button
          type="button"
          onClick={() => {
            setEditingSystemArchiveId(null);
            setEditingSystemSearch("");
            setEditingSystemName("");
          }}
          style={{ fontSize: 12 }}
        >
          取消
        </button>
      </span>
    );
  }

  function renderArchiveCard(item: any, ended = false) {
    const cover = item.cover_image_url || "";
    const systemName = getArchiveSystemName(item);
    const updateDate = formatDate(item.last_record_time || item.created_at);

    return (
      <div
        key={item.id}
        onClick={(event) => {
          if (shouldIgnoreCardNavigation(event.target)) return;
          router.push(`/archive/${item.id}`);
        }}
        style={{
          display: "flex",
          cursor: "pointer",
          gap: 12,
          border: "1px solid #e4e6df",
          borderRadius: 16,
          padding: 12,
          marginBottom: 12,
          background: ended ? "#fafafa" : "#fff",
          opacity: ended ? 0.84 : 1,
          boxShadow: ended ? "none" : "0 8px 22px rgba(44, 74, 38, 0.04)",
        }}
      >
        <div style={{ width: 100, height: 100, flexShrink: 0 }}>
          {cover ? (
            <img
              src={cover}
              alt={item.title || "项目封面"}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: 12,
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(135deg, #f4f7f1, #eef4ed)",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9aaa9a",
                fontSize: 24,
              }}
            >
              {item.category === "system" ? "🛠" : "🌿"}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "nowrap",
              marginBottom: 4,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: item.category === "system" ? "#6c6c7a" : "#4b7244",
                background: item.category === "system" ? "#f1f1f5" : "#edf6e9",
                borderRadius: 999,
                padding: "3px 8px",
                lineHeight: 1.3,
                flexShrink: 0,
              }}
            >
              {getCategoryLabel(item)}
            </span>

            <div
              data-no-card-nav="true"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                minWidth: 0,
                flex: 1,
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  color: ended ? "#777" : "#1f2d1f",
                  minWidth: 0,
                  overflow:
                    editingPlantArchiveId === item.id || editingSystemArchiveId === item.id
                      ? "visible"
                      : "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace:
                    editingPlantArchiveId === item.id || editingSystemArchiveId === item.id
                      ? "normal"
                      : "nowrap",
                  flex: 1,
                  position: "relative",
                  zIndex:
                    editingPlantArchiveId === item.id || editingSystemArchiveId === item.id
                      ? 50
                      : "auto",
                }}
              >
                <span
                  onClick={async (e) => {
                    e.stopPropagation();
                    const name = prompt("修改名称", item.title);
                    if (!name?.trim()) return;

                    await supabase
                      .from("archives")
                      .update({ title: name.trim() })
                      .eq("id", item.id);

                    loadData();
                  }}
                  style={{ cursor: "pointer" }}
                  title="点击可修改名称"
                >
                  {item.title}
                </span>

                <span style={{ color: "#9a9a9a", fontWeight: 400 }}> · </span>

                {editingPlantArchiveId === item.id && item.category === "plant" ? (
                  <span
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ position: "relative" }}>
                      <input
                        value={editingPlantSearch}
                        onChange={(e) => {
                          setEditingPlantSearch(e.target.value);
                          setEditingPendingSpeciesName("");
                          setEditingSpeciesId("");
                          setPlantSuggestionsOpen(true);
                        }}
                        placeholder="输入关键词后点选"
                        style={{
                          fontSize: 12,
                          padding: "4px 6px",
                          borderRadius: 6,
                          border: "1px solid #ddd",
                          minWidth: 180,
                        }}
                      />

                      {plantSuggestionsOpen && (
                        <div
                          style={{
                            position: "absolute",
                            top: 30,
                            left: 0,
                            width: 280,
                          maxHeight: 210,
                          overflow: "auto",
                          background: "#fff",
                          border: "1px solid #e5e5e5",
                          borderRadius: 10,
                          padding: 8,
                          boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
                          zIndex: 1000,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {getPlantSearchResults().map((species: any) => (
                          <button
                            key={species.id}
                            type="button"
                            onClick={() => {
                              setEditingSpeciesId(species.id);
                              setEditingPendingSpeciesName("");
                              setEditingPlantSearch(
                                species.display_name ||
                                  species.common_name ||
                                  species.scientific_name ||
                                  "未命名植物"
                              );
                              setPlantSuggestionsOpen(false);
                            }}
                            style={{
                              textAlign: "left",
                              fontSize: 12,
                              padding: "6px 8px",
                              borderRadius: 8,
                              border:
                                editingSpeciesId === species.id
                                  ? "1px solid #4CAF50"
                                  : "1px solid transparent",
                              background:
                                editingSpeciesId === species.id ? "#f0fff4" : "#fafafa",
                              cursor: "pointer",
                              color: "#222",
                            }}
                          >
                            <strong style={{ color: "#222" }}>
                              {species.display_name ||
                                species.common_name ||
                                species.scientific_name ||
                                "未命名植物"}
                            </strong>
                            {species.scientific_name && (
                              <span style={{ color: "#888", marginLeft: 6 }}>
                                {species.scientific_name}
                              </span>
                            )}
                            {Array.isArray(species.aliases) &&
                              species.aliases.length > 0 && (
                                <div style={{ color: "#999", marginTop: 2 }}>
                                  别名：{species.aliases.slice(0, 4).join("、")}
                                </div>
                              )}
                          </button>
                        ))}

                        {getPlantSearchResults().length === 0 && (
                          <div style={{ fontSize: 12, color: "#999", padding: 6 }}>
                            没有找到匹配植物
                          </div>
                        )}

                        {editingPlantSearch.trim() && !hasExactPlantMatch() && (
                          <button
                            type="button"
                            onClick={() => submitPendingSpeciesName()}
                            style={{
                              textAlign: "left",
                              fontSize: 12,
                              padding: "6px 8px",
                              borderRadius: 8,
                              border: "1px dashed #4CAF50",
                              background: "#fff",
                              color: "#4CAF50",
                              cursor: "pointer",
                            }}
                          >
                            + 新增候选植物：{editingPlantSearch.trim()}
                          </button>
                        )}
                      </div>
                      )}
                    </div>

                    {editingPendingSpeciesName && (
                      <span style={{ fontSize: 12, color: "#666" }}>
                        候选：{editingPendingSpeciesName}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => savePlantSelection(item)}
                      style={{ fontSize: 12 }}
                    >
                      保存
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlantArchiveId(null);
                        setEditingSpeciesId("");
                        setEditingPendingSpeciesName("");
                        setEditingPlantSearch("");
                        setPlantSuggestionsOpen(false);
                      }}
                      style={{ fontSize: 12 }}
                    >
                      取消
                    </button>
                  </span>
                ) : item.category === "plant" ? (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      beginEditPlant(item);
                    }}
                    style={{
                      cursor: "pointer",
                      color: ended ? "#888" : "#546b4e",
                      fontWeight: 500,
                    }}
                    title="点击可修改系统植物名"
                  >
                    {systemName}
                  </span>
                ) : editingSystemArchiveId === item.id ? (
                  renderSystemNameEditor(item)
                ) : (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      beginEditSystem(item);
                    }}
                    style={{
                      cursor: "pointer",
                      color: ended ? "#888" : "#546b4e",
                      fontWeight: 500,
                    }}
                    title="点击可修改系统名"
                  >
                    {systemName}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateArchiveStatus(item, ended ? "active" : "ended");
                }}
                style={{
                  border: ended ? "1px solid #d8ddd4" : "1px solid #cfe3c8",
                  background: ended ? "#f3f3f3" : "#f3faf0",
                  color: ended ? "#777" : "#3f7d3d",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "3px 8px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
                title={ended ? "点击恢复为进行中" : "点击标记为已结束"}
              >
                {ended ? "已结束" : "进行中"}
              </button>
            </div>
          </div>

          <div
            data-no-card-nav="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              marginTop: 8,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              fontSize: 12,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              title={item.is_public ? "点击设为私密" : "点击公开到发现"}
              onClick={async (e) => {
                e.stopPropagation();
                const newValue = !item.is_public;

                const { error } = await supabase
                  .from("archives")
                  .update({ is_public: newValue })
                  .eq("id", item.id);

                if (error) {
                  showToast("更新可见状态失败");
                  return;
                }

                if (!newValue) {
                  await supabase
                    .from("records")
                    .update({ visibility: "private" })
                    .eq("archive_id", item.id);
                }

                setArchives((prev) =>
                  prev.map((archive) =>
                    archive.id === item.id
                      ? { ...archive, is_public: newValue }
                      : archive
                  )
                );

                showToast(newValue ? "已公开到发现" : "已设为仅自己可见");
              }}
              style={{
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 999,
                border: item.is_public ? "1px solid #b7dfbb" : "1px solid #ddd",
                background: item.is_public ? "#f1fff3" : "#f7f7f7",
                color: item.is_public ? "#2f6f3a" : "#666",
                cursor: "pointer",
                lineHeight: 1.4,
              }}
            >
              {item.is_public ? "公开" : "私密"}
            </button>

            <span style={{ position: "relative", display: "inline-flex" }}>
              <select
                onClick={(e) => e.stopPropagation()}
                value={item.sub_tag_id || item.category || ""}
                onChange={async (e) => {
                  e.stopPropagation();

                  const value = e.target.value;

                  if (value === "plant" || value === "system") {
                    await supabase
                      .from("archives")
                      .update({
                        category: value,
                        sub_tag_id: null,
                        group_tag_id: null,
                      })
                      .eq("id", item.id);

                    setArchives((prev) =>
                      prev.map((archive) =>
                        archive.id === item.id
                          ? {
                              ...archive,
                              category: value,
                              sub_tag_id: null,
                              group_tag_id: null,
                            }
                          : archive
                      )
                    );

                    return;
                  }

                  const sub = subTags.find((tag) => String(tag.id) === value);
                  if (!sub) return;

                  await supabase
                    .from("archives")
                    .update({
                      category: sub.category,
                      sub_tag_id: sub.id,
                      group_tag_id: null,
                    })
                    .eq("id", item.id);

                  setArchives((prev) =>
                    prev.map((archive) =>
                      archive.id === item.id
                        ? {
                            ...archive,
                            category: sub.category,
                            sub_tag_id: sub.id,
                            group_tag_id: null,
                          }
                        : archive
                    )
                  );
                }}
                style={{
                  appearance: "none",
                  WebkitAppearance: "none",
                  border: "1px solid #edf0e8",
                  borderRadius: 999,
                  background: "#fbfcfa",
                  color: "#667066",
                  fontSize: 12,
                  padding: "3px 18px 3px 8px",
                  cursor: "pointer",
                }}
              >
                <option value="plant">种植</option>
                {subTags
                  .filter((tag) => tag.category === "plant")
                  .map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      └ {tag.name}
                    </option>
                  ))}

                <option value="system">配套设施</option>
                {subTags
                  .filter((tag) => tag.category === "system")
                  .map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      └ {tag.name}
                    </option>
                  ))}
              </select>
              <span
                style={{
                  position: "absolute",
                  right: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#999",
                  pointerEvents: "none",
                  fontSize: 10,
                }}
              >
                ▾
              </span>
            </span>

            {item.sub_tag_id &&
              groupTags.some(
                (tag) => String(tag.sub_tag_id) === String(item.sub_tag_id)
              ) && (
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <select
                    onClick={(e) => e.stopPropagation()}
                    value={item.group_tag_id || ""}
                    onChange={async (e) => {
                      e.stopPropagation();
                      const value = e.target.value;

                      await supabase
                        .from("archives")
                        .update({
                          group_tag_id: value || null,
                        })
                        .eq("id", item.id);

                      setArchives((prev) =>
                        prev.map((archive) =>
                          archive.id === item.id
                            ? { ...archive, group_tag_id: value || null }
                            : archive
                        )
                      );
                    }}
                    style={{
                      appearance: "none",
                      WebkitAppearance: "none",
                      border: "1px solid #edf0e8",
                      borderRadius: 999,
                      background: "#fbfcfa",
                      color: "#667066",
                      fontSize: 12,
                      padding: "3px 18px 3px 8px",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">未分组</option>

                    {groupTags
                      .filter(
                        (tag) => String(tag.sub_tag_id) === String(item.sub_tag_id)
                      )
                      .map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          └ {tag.name}
                        </option>
                      ))}
                  </select>
                  <span
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#999",
                      pointerEvents: "none",
                      fontSize: 10,
                    }}
                  >
                    ▾
                  </span>
                </span>
              )}
          </div>

          <div
            style={{
              fontSize: 12,
              color: "#999",
              marginTop: 8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            更新 {updateDate || "暂无"} · 共 {item.record_count || 0} 条记录 · 浏览{" "}
            {item.view_count || 0}
            {typeof item.follower_count !== "undefined"
              ? ` · 关注 ${item.follower_count || 0}`
              : ""}
          </div>
        </div>

        <div
          data-no-card-nav="true"
          onClick={(e) => e.stopPropagation()}
          style={{
            minWidth: 42,
            marginLeft: 10,
            paddingLeft: 12,
            borderLeft: "1px solid #f0f0ec",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            alignItems: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={async () => {
              if (!confirm("确定删除？")) return;

              await supabase.from("archives").delete().eq("id", item.id);
              loadData();
            }}
            style={{
              border: "none",
              background: "transparent",
              color: "#d66",
              cursor: "pointer",
              fontSize: 12,
              padding: 0,
              whiteSpace: "nowrap",
            }}
          >
            删除
          </button>
        </div>
      </div>
    );
  }

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
        我的项目 {archiveCount} 个 · 公开 {publicArchiveCount} · 私密{" "}
        {privateArchiveCount}
        {endedArchiveCount > 0 ? ` · 已结束 ${endedArchiveCount}` : ""}
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/archive/plans")}
          style={{
            textAlign: "left",
            padding: 16,
            borderRadius: 16,
            border: "1px solid #e6ecdf",
            background: "#f8fff8",
            cursor: "pointer",
            color: "#1f2d1f",
          }}
        >
          <div style={{ fontSize: 17, marginBottom: 6, color: "#1f2d1f" }}>
            我的种植计划
          </div>
          <div style={{ fontSize: 13, color: "#5f7f5f", lineHeight: 1.6 }}>
            {activePlanCount} 个计划 · {startedPlanCount} 个已开始
          </div>
        </button>

        <button
          type="button"
          onClick={() => router.push("/archive/interests")}
          style={{
            textAlign: "left",
            padding: 16,
            borderRadius: 16,
            border: "1px solid #e6ecdf",
            background: "#fff",
            cursor: "pointer",
            color: "#1f2d1f",
          }}
        >
          <div style={{ fontSize: 17, marginBottom: 6, color: "#1f2d1f" }}>
            我感兴趣的植物
          </div>
          <div style={{ fontSize: 13, color: "#777", lineHeight: 1.6 }}>
            {plantInterests.length} 个植物
          </div>
        </button>
      </section>

      <section
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/archive/new")}
          style={{
            padding: "10px 16px",
            borderRadius: 999,
            border: "1px solid #cfe3c8",
            background: "#3f7d3d",
            color: "#fff",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          新建项目
        </button>

        <input
          value={searchKeyword}
          onChange={(event) => setSearchKeyword(event.target.value)}
          placeholder="搜索我的项目"
          style={{
            flex: "0 1 240px",
            width: 240,
            maxWidth: "100%",
            border: "1px solid #dfe7d9",
            borderRadius: 999,
            padding: "10px 14px",
            fontSize: 14,
            outline: "none",
            background: "#fff",
          }}
        />

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "#777",
            fontSize: 14,
          }}
        >
          排序：
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            style={{
              border: "1px solid #dfe7d9",
              borderRadius: 999,
              padding: "9px 12px",
              fontSize: 14,
              background: "#fff",
              color: "#3d4a3d",
              cursor: "pointer",
            }}
          >
            <option value="created">新建顺序</option>
            <option value="name">按名字</option>
            <option value="updated">最近更新</option>
          </select>
        </label>
      </section>

      <section
        style={{
          marginBottom: visibleGroupTags.length > 0 ? 8 : 18,
          padding: "12px 14px",
          border: "1px solid #edf0e8",
          borderRadius: 16,
          background: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() =>
              updateFilterWithoutJump(() => {
                setActiveCategory(null);
                setActiveSubTag(null);
                setActiveGroupTag(null);
              })
            }
            style={{
              border:
                activeCategory || activeSubTag
                  ? "1px solid #cfe3c8"
                  : "1px solid #3f7d3d",
              background: activeCategory || activeSubTag ? "#f8fbf5" : "#3f7d3d",
              color: activeCategory || activeSubTag ? "#335033" : "#fff",
              borderRadius: 999,
              padding: "7px 14px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            全部
          </button>

          <button
            type="button"
            onClick={() =>
              updateFilterWithoutJump(() => {
                setActiveCategory("plant");
                setActiveSubTag(null);
                setActiveGroupTag(null);
              })
            }
            style={{
              border:
                activeCategory === "plant" && !activeSubTag
                  ? "1px solid #3f7d3d"
                  : "1px solid #cfe3c8",
              background:
                activeCategory === "plant" && !activeSubTag ? "#dff2da" : "#f4faf1",
              color:
                activeCategory === "plant" && !activeSubTag ? "#235d24" : "#3f633a",
              borderRadius: 999,
              padding: "7px 12px",
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            种植：
          </button>
          {plantSubTags.map((tag) => renderSubTagChip(tag))}
          <button
            type="button"
            onClick={() => createSubTag("plant")}
            style={{
              border: "1px dashed #cbdcc2",
              background: "#fbfdf9",
              color: "#4CAF50",
              borderRadius: 999,
              padding: "5px 10px",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ＋
          </button>

          <button
            type="button"
            onClick={() =>
              updateFilterWithoutJump(() => {
                setActiveCategory("system");
                setActiveSubTag(null);
                setActiveGroupTag(null);
              })
            }
            style={{
              border:
                activeCategory === "system" && !activeSubTag
                  ? "1px solid #3f7d3d"
                  : "1px solid #cfe3c8",
              background:
                activeCategory === "system" && !activeSubTag ? "#dff2da" : "#f4faf1",
              color:
                activeCategory === "system" && !activeSubTag ? "#235d24" : "#3f633a",
              borderRadius: 999,
              padding: "7px 12px",
              marginLeft: 8,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            配套设施：
          </button>
          {systemSubTags.map((tag) => renderSubTagChip(tag))}
          <button
            type="button"
            onClick={() => createSubTag("system")}
            style={{
              border: "1px dashed #cbdcc2",
              background: "#fbfdf9",
              color: "#4CAF50",
              borderRadius: 999,
              padding: "5px 10px",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ＋
          </button>
        </div>
      </section>

      {visibleGroupTags.length > 0 && (
        <section
          style={{
            marginBottom: 18,
            padding: "10px 14px",
            borderRadius: 16,
            background: "#fafbf8",
            border: "1px solid #edf0e8",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              updateFilterWithoutJump(() => {
                setActiveGroupTag(null);
              })
            }
            style={{
              border: activeGroupTag ? "1px solid #cfe3c8" : "1px solid #3f7d3d",
              background: activeGroupTag ? "#f4faf1" : "#dff2da",
              color: "#2f6d2f",
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              padding: "6px 12px",
            }}
            title="点击显示当前分类下全部项目"
          >
            分组：
          </button>

          {visibleGroupTags.map((tag) => (
            <span
              key={tag.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginRight: 4,
              }}
            >
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  updateFilterWithoutJump(() => {
                    setActiveGroupTag(activeGroupTag === tag.id ? null : tag.id);
                  })
                }
                onDoubleClick={() => renameGroupTag(tag)}
                style={{
                  border:
                    activeGroupTag === tag.id
                      ? "1px solid #3f7d3d"
                      : "1px solid #e1e8dc",
                  background: activeGroupTag === tag.id ? "#3f7d3d" : "#fff",
                  color: activeGroupTag === tag.id ? "#fff" : "#374437",
                  borderRadius: 999,
                  padding: "6px 12px",
                  fontSize: 15,
                  cursor: "pointer",
                  lineHeight: 1.3,
                }}
                title="双击可修改名称"
              >
                {tag.name}
              </button>

              <button
                type="button"
                onClick={() => deleteGroupTag(tag)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#b7b7b7",
                  cursor: "pointer",
                  fontSize: 13,
                  padding: 0,
                  lineHeight: 1,
                }}
                title="删除分组"
              >
                ×
              </button>
            </span>
          ))}

          {activeSubTag && (
            <button
              type="button"
              onClick={() => createGroupTag()}
              style={{
                border: "1px dashed #cbdcc2",
                background: "#fbfdf9",
                color: "#4CAF50",
                borderRadius: 999,
                padding: "5px 10px",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ＋
            </button>
          )}
        </section>
      )}

      {activeSubTag && visibleGroupTags.length === 0 && (
        <section
          style={{
            marginBottom: 18,
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <button
            type="button"
            onClick={() => createGroupTag()}
            style={{
              border: "1px dashed #d9e6d0",
              background: "#fbfdf9",
              color: "#6f9b63",
              borderRadius: 999,
              padding: "5px 10px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ＋ 新增分组
          </button>
        </section>
      )}

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
          activeArchives.map((item) => renderArchiveCard(item, false))
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
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              已结束
            </h2>
            <span style={{ fontSize: 13 }}>
              这些项目已经告一段落，仍然保存在你的空间里。
            </span>
          </div>

          {endedArchives.map((item) => renderArchiveCard(item, true))}
        </section>
      )}
    </main>
  );
}
