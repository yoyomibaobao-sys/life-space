"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/Toast";

export default function ArchivePage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [archives, setArchives] = useState<any[]>([]);
  const [groupTags, setGroupTags] = useState<any[]>([]);
  const [subTags, setSubTags] = useState<any[]>([]);
  const [speciesList, setSpeciesList] = useState<any[]>([]);
  const [editingPlantArchiveId, setEditingPlantArchiveId] =
    useState<string | null>(null);
  const [editingSpeciesId, setEditingSpeciesId] = useState("");
  const [editingPendingSpeciesName, setEditingPendingSpeciesName] =
    useState("");
  const [editingPlantSearch, setEditingPlantSearch] = useState("");

  const [activeCategory, setActiveCategory] = useState<"all" | "plant" | "system">("all");
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [activeGroupTag, setActiveGroupTag] = useState<string | null>(null);

  const loadingRef = useRef(false);

  function shouldIgnoreCardNavigation(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;

    return Boolean(
      target.closest(
        'button, input, textarea, select, a, [data-no-card-nav="true"]'
      )
    );
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
    } finally {
      loadingRef.current = false;
    }
  }

  function beginEditPlant(item: any) {
    setEditingPlantArchiveId(item.id);
    setEditingSpeciesId(item.species_id || "");
    setEditingPendingSpeciesName("");
    setEditingPlantSearch(item.species_display_name || item.species_name_snapshot || "");
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
      showToast("请选择植物，或新增候选植物");
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
      showToast("已更新植物");
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
    showToast("已更新植物");
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

  return (
    <main style={{ padding: 14 }}>
      <h2 style={{ marginBottom: 14 }}>我 · 空间</h2>

      {/* ===== 分类 + 子分类 ===== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        {/* 全部 */}
        <div
          onClick={() => {
            setActiveCategory("all");
            setActiveSubTag(null);
            setActiveGroupTag(null);
          }}
          style={{
            cursor: "pointer",
            fontWeight: activeCategory === "all" ? 600 : 400,
          }}
        >
          全部
        </div>

        {/* 植物 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            onClick={() => {
              setActiveCategory("plant");
              setActiveSubTag(null);
              setActiveGroupTag(null);
            }}
            style={{
              cursor: "pointer",
              fontWeight: activeCategory === "plant" ? 600 : 400,
            }}
          >
            🌿 植物：
          </div>

          {subTags
            .filter((t) => t.category === "plant")
            .map((t) => (
              <div
                key={t.id}
                style={{ display: "flex", alignItems: "center", gap: 2 }}
              >
                <div
                  onClick={() => {
                    setActiveCategory("plant");
                    setActiveSubTag(t.id);
                    setActiveGroupTag(null);
                  }}
                  onDoubleClick={async () => {
                    const name = prompt("修改名称", t.name);
                    if (!name) return;

                    await supabase.from("sub_tags").update({ name }).eq("id", t.id);

                    setSubTags((prev) =>
                      prev.map((x) => (x.id === t.id ? { ...x, name } : x))
                    );
                  }}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: activeSubTag === t.id ? "#333" : "#eee",
                    color: activeSubTag === t.id ? "#fff" : "#333",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  {t.name}
                </div>

                <span
                  onClick={async () => {
                    if (!confirm("删除后归入植物，确认？")) return;

                    await supabase
                      .from("archives")
                      .update({ sub_tag_id: null })
                      .eq("sub_tag_id", t.id);

                    await supabase.from("sub_tags").delete().eq("id", t.id);

                    setSubTags((prev) => prev.filter((x) => x.id !== t.id));
                  }}
                  style={{
                    fontSize: 10,
                    color: "#bbb",
                    cursor: "pointer",
                  }}
                >
                  ×
                </span>
              </div>
            ))}

          <div
            onClick={async () => {
              const name = prompt("新增植物子分类");
              if (!name) return;

              const {
                data: { session },
              } = await supabase.auth.getSession();

              const user = session?.user;
              if (!user) return;

              const { data } = await supabase
                .from("sub_tags")
                .insert([
                  {
                    user_id: user.id,
                    name,
                    category: "plant",
                  },
                ])
                .select()
                .single();

              if (data) {
                setSubTags((prev) => [...prev, data]);
              }
            }}
            style={{
              color: "#4CAF50",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ＋
          </div>
        </div>

        {/* 设施 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            onClick={() => {
              setActiveCategory("system");
              setActiveSubTag(null);
              setActiveGroupTag(null);
            }}
            style={{
              cursor: "pointer",
              fontWeight: activeCategory === "system" ? 600 : 400,
            }}
          >
            🛠 设施：
          </div>

          {subTags
            .filter((t) => t.category === "system")
            .map((t) => (
              <div
                key={t.id}
                style={{ display: "flex", alignItems: "center", gap: 2 }}
              >
                <div
                  onClick={() => {
                    setActiveCategory("system");
                    setActiveSubTag(t.id);
                    setActiveGroupTag(null);
                  }}
                  onDoubleClick={async () => {
                    const name = prompt("修改名称", t.name);
                    if (!name) return;

                    await supabase.from("sub_tags").update({ name }).eq("id", t.id);

                    setSubTags((prev) =>
                      prev.map((x) => (x.id === t.id ? { ...x, name } : x))
                    );
                  }}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: activeSubTag === t.id ? "#333" : "#eee",
                    color: activeSubTag === t.id ? "#fff" : "#333",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  {t.name}
                </div>

                <span
                  onClick={async () => {
                    if (!confirm("删除后归入设施，确认？")) return;

                    await supabase
                      .from("archives")
                      .update({ sub_tag_id: null })
                      .eq("sub_tag_id", t.id);

                    await supabase.from("sub_tags").delete().eq("id", t.id);

                    setSubTags((prev) => prev.filter((x) => x.id !== t.id));
                  }}
                  style={{
                    fontSize: 10,
                    color: "#bbb",
                    cursor: "pointer",
                  }}
                >
                  ×
                </span>
              </div>
            ))}

          <div
            onClick={async () => {
              const name = prompt("新增设施子分类");
              if (!name) return;

              const {
                data: { session },
              } = await supabase.auth.getSession();

              const user = session?.user;
              if (!user) return;

              const { data } = await supabase
                .from("sub_tags")
                .insert([
                  {
                    user_id: user.id,
                    name,
                    category: "system",
                  },
                ])
                .select()
                .single();

              if (data) {
                setSubTags((prev) => [...prev, data]);
              }
            }}
            style={{
              color: "#4CAF50",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ＋
          </div>
        </div>
      </div>

      {/* ===== 分组 ===== */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: "#666", marginRight: 6 }}>分组：</span>

        {activeSubTag &&
          groupTags
            .filter((t) => t.sub_tag_id === activeSubTag && t.sub_tag_id)
            .map((t) => (
              <span
                key={t.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  marginRight: 6,
                }}
              >
                <span
                  onClick={() => {
                    if (activeGroupTag === t.id) {
                      setActiveGroupTag(null);
                    } else {
                      setActiveGroupTag(t.id);
                    }
                  }}
                  onDoubleClick={async () => {
                    const name = prompt("修改分组名称", t.name);
                    if (!name) return;

                    await supabase.from("group_tags").update({ name }).eq("id", t.id);

                    setGroupTags((prev) =>
                      prev.map((x) => (x.id === t.id ? { ...x, name } : x))
                    );
                  }}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: activeGroupTag === t.id ? "#333" : "#eee",
                    color: activeGroupTag === t.id ? "#fff" : "#333",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  {t.name}
                </span>

                <span
                  onClick={async () => {
                    if (!confirm("删除该分组？")) return;

                    await supabase
                      .from("archives")
                      .update({ group_tag_id: null })
                      .eq("group_tag_id", t.id);

                    await supabase.from("group_tags").delete().eq("id", t.id);

                    setGroupTags((prev) => prev.filter((x) => x.id !== t.id));
                  }}
                  style={{
                    fontSize: 10,
                    color: "#bbb",
                    cursor: "pointer",
                    marginLeft: 2,
                  }}
                >
                  ×
                </span>
              </span>
            ))}

        {activeSubTag && (
          <span
            onClick={async () => {
              const name = prompt("新增分组");
              if (!name) return;

              const {
                data: { session },
              } = await supabase.auth.getSession();

              const user = session?.user;
              if (!user) return;

              const { data } = await supabase
                .from("group_tags")
                .insert([
                  {
                    user_id: user.id,
                    name,
                    sub_tag_id: activeSubTag,
                  },
                ])
                .select()
                .single();

              if (data) {
                setGroupTags((prev) => [...prev, data]);
              }
            }}
            style={{
              color: "#4CAF50",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ＋
          </span>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push("/archive/new")}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px dashed #4CAF50",
            background: "#f9fff9",
            color: "#4CAF50",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ＋ 新建项目
        </button>
      </div>

      {/* ===== 卡片 ===== */}
      {archives
        .filter((item) => {
          if (activeGroupTag) {
            return item.group_tag_id === activeGroupTag;
          }

          if (activeSubTag) {
            return item.sub_tag_id === activeSubTag;
          }

          if (activeCategory !== "all") {
            return item.category === activeCategory;
          }

          return true;
        })
        .map((item) => {
          const cover = item.cover_image_url || "";
          const days = Math.floor(
            (Date.now() - new Date(item.created_at).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          const itemDisplayName =
            item.category === "plant"
              ? item.species_display_name || "未选择植物"
              : item.system_name || "未填写设施";

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
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                background: "#fff",
              }}
            >
              {/* 图片 */}
              <div style={{ width: 100, height: 100, flexShrink: 0 }}>
                {cover ? (
                  <img
                    src={cover}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: 8,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "linear-gradient(135deg, #f4f7f1, #eef4ed)",
                      borderRadius: 8,
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

              {/* 右侧 */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }} data-no-card-nav="true">
                  <span
                    onClick={async (e) => {
                      e.stopPropagation();
                      const name = prompt("修改名称", item.title);
                      if (!name) return;

                      await supabase
                        .from("archives")
                        .update({ title: name })
                        .eq("id", item.id);

                      loadData();
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {item.title}
                  </span>

                  {" · "}

                  {editingPlantArchiveId === item.id &&
                  item.category === "plant" ? (
                    <span
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "inline-flex",
                        gap: 6,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          display: "inline-flex",
                          flexDirection: "column",
                          gap: 6,
                          minWidth: 220,
                        }}
                      >
                        <input
                          value={editingPlantSearch}
                          onChange={(e) => {
                            setEditingPlantSearch(e.target.value);
                            setEditingSpeciesId("");
                            setEditingPendingSpeciesName("");
                          }}
                          placeholder="输入植物名 / 学名 / 别名"
                          style={{
                            fontSize: 12,
                            padding: "6px 8px",
                            border: "1px solid #ddd",
                            borderRadius: 8,
                          }}
                        />

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            padding: 6,
                            border: "1px solid #eee",
                            borderRadius: 10,
                            background: "#fff",
                            maxHeight: 220,
                            overflowY: "auto",
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
                                  editingSpeciesId === species.id
                                    ? "#f0fff4"
                                    : "#fafafa",
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
                        }}
                        style={{ fontSize: 12 }}
                      >
                        取消
                      </button>
                    </span>
                  ) : (
                    <span
                      onClick={async (e) => {
                        e.stopPropagation();

                        if (item.category === "plant") {
                          beginEditPlant(item);
                          return;
                        }

                        const name = prompt(
                          "修改设施名称",
                          item.system_name || ""
                        );
                        if (name === null) return;

                        const trimmed = name.trim();

                        await supabase
                          .from("archives")
                          .update({
                            system_name: trimmed || null,
                          })
                          .eq("id", item.id);

                        setArchives((prev) =>
                          prev.map((archive) =>
                            archive.id === item.id
                              ? { ...archive, system_name: trimmed || null }
                              : archive
                          )
                        );
                      }}
                      title={
                        item.category === "plant"
                          ? "点击修改植物"
                          : "点击修改设施名称"
                      }
                      style={{ cursor: "pointer", color: "#666" }}
                    >
                      {itemDisplayName}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  {item.last_record_time
                    ? new Date(item.last_record_time).toLocaleDateString("zh-CN")
                    : ""}
                </div>

                <div
                  data-no-card-nav="true"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginTop: 6,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    fontSize: 12,
                    alignItems: "center",
                  }}
                >
                  <span
                    title={item.is_public ? "公开" : "私密"}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const newValue = !item.is_public;

                      await supabase
                        .from("archives")
                        .update({ is_public: newValue })
                        .eq("id", item.id);

                      if (!newValue) {
                        await supabase
                          .from("records")
                          .update({ visibility: "private" })
                          .eq("archive_id", item.id);
                      }

                      setArchives((prev) =>
                        prev.map((a) =>
                          a.id === item.id ? { ...a, is_public: newValue } : a
                        )
                      );
                    }}
                    style={{
                      cursor: "pointer",
                      opacity: item.is_public ? 1 : 0.3,
                    }}
                  >
                    👁
                  </span>

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
                          prev.map((a) =>
                            a.id === item.id
                              ? {
                                  ...a,
                                  category: value,
                                  sub_tag_id: null,
                                  group_tag_id: null,
                                }
                              : a
                          )
                        );

                        return;
                      }

                      const sub = subTags.find((t) => String(t.id) === value);
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
                        prev.map((a) =>
                          a.id === item.id
                            ? {
                                ...a,
                                category: sub.category,
                                sub_tag_id: sub.id,
                                group_tag_id: null,
                              }
                            : a
                        )
                      );
                    }}
                  >
                    <option value="plant">🌿 植物</option>
                    {subTags
                      .filter((t) => t.category === "plant")
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          └ {t.name}
                        </option>
                      ))}

                    <option value="system">🛠 设施</option>
                    {subTags
                      .filter((t) => t.category === "system")
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          └ {t.name}
                        </option>
                      ))}
                  </select>

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
                        prev.map((a) =>
                          a.id === item.id
                            ? { ...a, group_tag_id: value || null }
                            : a
                        )
                      );
                    }}
                  >
                    <option value="">未分组</option>

                    {groupTags
                      .filter((g) => g.sub_tag_id === item.sub_tag_id)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "#999",
                    marginTop: 6,
                  }}
                >
                  已创建 {days} 天 · 共{item.record_count || 0}条记录 · 浏览
                  {item.view_count || 0} · 关注{item.follower_count || 0}
                </div>

                <div
                  data-no-card-nav="true"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm("确定删除？")) return;

                    await supabase.from("archives").delete().eq("id", item.id);
                    loadData();
                  }}
                  style={{
                    fontSize: 12,
                    color: "red",
                    marginTop: 4,
                    cursor: "pointer",
                  }}
                >
                  删除
                </div>
              </div>
            </div>
          );
        })}
    </main>
  );
}