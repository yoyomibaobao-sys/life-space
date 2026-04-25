"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { showToast } from "@/components/Toast";
import {
  type ArchiveCategory,
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  getDefaultSystemNames,
  isNonPlantArchiveCategory,
} from "@/lib/archive-categories";
import type { PlantSpeciesOption } from "@/lib/archive-page-types";
import type { PlantSpeciesAliasSearchRow } from "@/lib/domain-types";

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

  const [speciesList, setSpeciesList] = useState<PlantSpeciesOption[]>([]);
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

  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSpeciesId = searchParams.get("species");
  const selectedPlanId = searchParams.get("plan");

  useEffect(() => {
    async function loadSpecies() {
      const [{ data: speciesData }, { data: aliasData }] = await Promise.all([
        supabase
          .from("plant_species")
          .select("id, common_name, scientific_name, slug, is_active")
          .eq("is_active", true)
          .order("common_name", { ascending: true }),

        supabase
          .from("plant_species_aliases")
          .select("species_id, alias_name, normalized_name"),
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

      const list: PlantSpeciesOption[] = ((speciesData || []) as PlantSpeciesOption[]).map((species) => {
        const aliases = Array.from(
          new Set(aliasesBySpecies.get(species.id) || [])
        );
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

      setSpeciesList(list);

      if (preselectedSpeciesId) {
        const selected = list.find((s) => s.id === preselectedSpeciesId);

        if (selected) {
          const selectedName =
            selected.display_name ||
            selected.common_name ||
            selected.scientific_name ||
            "";

          setCategory("plant");
          setSpeciesId(selected.id);
          setPendingSpeciesName(null);
          setSpeciesSearch(selectedName);
          setTitle((current) =>
            current || (selectedName ? `我的${selectedName}` : "")
          );
        }
      }
    }

    loadSpecies();
  }, [preselectedSpeciesId]);

  const systemOptions = useMemo(() => {
    if (!isNonPlantArchiveCategory(category)) return [];

    const keyword = systemSearch.trim().toLowerCase();
    const presetNames = getDefaultSystemNames(category);

    if (!keyword) {
      return presetNames.slice(0, 10);
    }

    return presetNames
      .filter((name) => name.toLowerCase().includes(keyword))
      .slice(0, 10);
  }, [category, systemSearch]);

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
      return speciesList.slice(0, 10);
    }

    return speciesList
      .filter((species) => species.search_text?.includes(keyword))
      .slice(0, 10);
  }

  function hasExactPlantMatch() {
    const keyword = speciesSearch.trim().toLowerCase();
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
    const keyword = systemSearch.trim().toLowerCase();
    if (!keyword || !isNonPlantArchiveCategory(category)) return false;

    return getDefaultSystemNames(category).some(
      (name) => name.trim().toLowerCase() === keyword
    );
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    if (!title.trim()) {
      showToast("请输入项目名称");
      return;
    }

    if (category === "plant" && !speciesId && !pendingSpeciesName) {
      showToast("请选择系统名，或新增一个候选植物");
      return;
    }

    if (category !== "plant" && !systemName.trim()) {
      showToast(`请选择或添加${getArchiveCategoryLabel(category)}候选系统名`);
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showToast("未登录");
      setLoading(false);
      return;
    }

    if (category === "plant" && pendingSpeciesName) {
      await supabase.from("plant_species_pending").insert([
        {
          user_id: user.id,
          submitted_name: pendingSpeciesName,
          language_code: "zh",
          status: "pending",
        },
      ]);
    }

    const selectedSpecies = speciesList.find((s) => s.id === speciesId);
    const speciesNameSnapshot =
      category === "plant"
        ? pendingSpeciesName ||
          selectedSpecies?.display_name ||
          selectedSpecies?.common_name ||
          selectedSpecies?.scientific_name ||
          null
        : null;

    const { data: createdArchive, error } = await supabase
      .from("archives")
      .insert([
        {
          title: title.trim(),
          category,
          species_id: category === "plant" ? speciesId : null,
          species_name_snapshot: speciesNameSnapshot,
          system_name: category === "plant" ? null : systemName.trim(),
          source: source.trim() || null,
          note: note.trim() || null,
          user_id: user.id,
          is_public: false,
        },
      ])
      .select("id")
      .single();

    if (error) {
      setLoading(false);
      showToast("创建失败：" + error.message);
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
          "项目已创建，但种植计划状态没有自动更新：" + planError.message
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
    <main
      style={{
        padding: "26px 20px",
        maxWidth: 480,
        margin: "0 auto",
        color: "#263326",
      }}
    >
      <h2 style={{ margin: "0 0 20px", color: "#1f2d1f" }}>新建项目</h2>

      <form onSubmit={handleCreate}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>项目名称 *</div>

          <input
            placeholder="例如：阳台迷迭香"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              padding: "10px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>种类 *</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            {archiveCategoryOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => switchCategory(option.value)}
                style={{
                  padding: "10px",
                  borderRadius: 999,
                  border:
                    category === option.value
                      ? "1px solid #3f7d3d"
                      : "1px solid #ddd",
                  background: category === option.value ? "#3f7d3d" : "#fff",
                  color: category === option.value ? "#fff" : "#333",
                  cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {category === "plant" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>系统名 *</div>

            <div style={{ position: "relative" }}>
              <input
                placeholder="输入植物名 / 学名 / 别名后点选"
                value={speciesSearch}
                onChange={(e) => {
                  setSpeciesSearch(e.target.value);
                  setSpeciesId(null);
                  setPendingSpeciesName(null);
                  setPlantSuggestionsOpen(true);
                }}
                style={{
                  padding: "10px",
                  width: "100%",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  fontSize: 14,
                  color: "#263326",
                  background: "#fff",
                  boxSizing: "border-box",
                }}
              />

              {plantSuggestionsOpen && (
                <div
                  style={{
                    marginTop: 8,
                    border: "1px solid #eee",
                    borderRadius: 12,
                    background: "#fff",
                    maxHeight: 250,
                    overflow: "auto",
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {getPlantSearchResults().map((species) => (
                    <button
                      key={species.id}
                      type="button"
                      onClick={() => {
                        const name =
                          species.display_name ||
                          species.common_name ||
                          species.scientific_name ||
                          "未命名植物";

                        setSpeciesId(species.id);
                        setPendingSpeciesName(null);
                        setSpeciesSearch(name);
                        setPlantSuggestionsOpen(false);
                      }}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border:
                          speciesId === species.id
                            ? "1px solid #4CAF50"
                            : "1px solid transparent",
                        background:
                          speciesId === species.id ? "#f0fff4" : "#fafafa",
                        color: "#263326",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      <strong style={{ color: "#263326" }}>
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
                    <div style={{ color: "#999", fontSize: 13, padding: 8 }}>
                      没有找到匹配植物
                    </div>
                  )}

                  {speciesSearch.trim() && !hasExactPlantMatch() && (
                    <button
                      type="button"
                      onClick={submitPendingSpeciesName}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px dashed #4CAF50",
                        background: "#fff",
                        color: "#4CAF50",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      + 新增候选植物：{speciesSearch.trim()}
                    </button>
                  )}
                </div>
              )}
            </div>

            {pendingSpeciesName && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#666",
                  lineHeight: 1.6,
                }}
              >
                当前使用候选植物：
                <strong>{pendingSpeciesName}</strong>
              </div>
            )}
          </div>
        )}

        {category !== "plant" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>候选系统名 *</div>

            <input
              placeholder={
                category === "other"
                  ? "输入候选系统名"
                  : `输入后点选，例如：${systemOptions[0] || "补光灯"}`
              }
              value={systemSearch}
              onChange={(e) => {
                setSystemSearch(e.target.value);
                setSystemName("");
                setSystemSuggestionsOpen(true);
              }}
              onFocus={() => setSystemSuggestionsOpen(true)}
              style={{
                padding: "10px",
                width: "100%",
                border: "1px solid #ddd",
                borderRadius: "8px",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />

            {systemSuggestionsOpen && (
              <div
                style={{
                  marginTop: 8,
                  border: "1px solid #eee",
                  borderRadius: 12,
                  background: "#fff",
                  maxHeight: 220,
                  overflow: "auto",
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {systemOptions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setSystemName(name);
                      setSystemSearch(name);
                      setSystemSuggestionsOpen(false);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border:
                        systemName === name
                          ? "1px solid #4CAF50"
                          : "1px solid transparent",
                      background: systemName === name ? "#f0fff4" : "#fafafa",
                      color: "#263326",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {name}
                  </button>
                ))}

                {systemOptions.length === 0 && category !== "other" && (
                  <div style={{ color: "#999", fontSize: 13, padding: 8 }}>
                    没有找到匹配候选系统名
                  </div>
                )}

                {systemSearch.trim() && !hasExactSystemNameMatch() && (
                  <button
                    type="button"
                    onClick={() => {
                      const name = systemSearch.trim();
                      setSystemName(name);
                      setSystemSearch(name);
                      setSystemSuggestionsOpen(false);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px dashed #4CAF50",
                      background: "#fff",
                      color: "#4CAF50",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    + 作为候选系统名：{systemSearch.trim()}
                  </button>
                )}

                {!systemSearch.trim() && category === "other" && (
                  <div style={{ color: "#999", fontSize: 13, padding: 8 }}>
                    其他不设预设名，直接输入即可。
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>来源（选填）</div>

          <input
            placeholder="例如：市场购买 / 朋友分享"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={{
              padding: "8px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: 13,
              color: "#263326",
              background: "#fff",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>备注（选填）</div>

          <textarea
            placeholder="简单记录一下背景..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              padding: "8px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "8px",
              fontSize: 13,
              color: "#263326",
              background: "#fff",
              minHeight: 60,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#f7f7f7",
            border: "1px solid #eee",
            fontSize: 12,
            color: "#666",
            lineHeight: 1.6,
          }}
        >
          新建项目默认仅自己可见，之后可以在项目详情页选择公开到发现。
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            background: loading ? "#999" : "#4CAF50",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "创建中..." : "创建"}
        </button>
      </form>
    </main>
  );
}
