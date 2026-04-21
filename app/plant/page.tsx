"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const categoryLabels: Record<string, string> = {
  all: "全部",
  vegetable: "蔬菜 / 蔬果",
  fruit: "果树 / 果类",
  herb: "香草 / 药草",
  flower: "花卉",
  houseplant: "观叶植物",
  succulent: "多肉 / 仙人掌",
  grain: "谷物 / 作物",
  field_crop: "谷物 / 作物",
  tree: "乔木 / 灌木",
};

const subCategoryLabels: Record<string, string> = {
  leafy_vegetable: "叶菜类",
  leafy: "叶菜类",
  fruiting_vegetable: "茄果 / 瓜果类",
  root_vegetable: "根茎 / 块茎类",
  root: "根茎类",
  legume: "豆类",
  allium: "葱蒜类",
  cucurbit: "瓜类",
  citrus: "柑橘类",
  berry: "浆果类",
  berry_vine_fruit: "浆果 / 藤本果类",
  pome_stone_fruit: "仁果 / 核果类",
  tropical_subtropical_fruit: "热带 / 亚热带果类",
  tree_fruit: "果树类",
  herb: "香草类",
  flowering_shrub: "花灌木",
  flowering_tree: "观花树木",
  annual_flower: "一年生花卉",
  perennial_flower: "多年生花卉",
  flower: "花卉类",
  houseplant: "观叶类",
  foliage: "观叶",
  succulent: "多肉类",
  cactus: "仙人掌",
  field_crop: "田园作物",
  grain: "谷物类",
};

type PlantItem = {
  id: string;
  slug?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  family?: string | null;
  category?: string | null;
  sub_category?: string | null;
  description?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
};

type AliasItem = {
  species_id: string;
  alias_name: string;
};

type CareGuide = {
  plant_id: string;
  summary?: string | null;
};

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function categoryLabel(value?: string | null) {
  if (!value) return "未分类";
  return categoryLabels[value] || value;
}

function subCategoryLabel(value?: string | null) {
  if (!value) return "";
  return subCategoryLabels[value] || value;
}

function uniqueTextList(items: unknown[]) {
  const seen = new Set<string>();

  return items
    .map((item) => String(item ?? "").trim())
    .filter((item) => {
      if (!item) return false;

      const key = item.toLowerCase();
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

export default function PlantIndexPage() {
  const [plants, setPlants] = useState<PlantItem[]>([]);
  const [aliases, setAliases] = useState<AliasItem[]>([]);
  const [careGuides, setCareGuides] = useState<CareGuide[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [{ data: plantData }, { data: aliasData }, { data: guideData }] =
        await Promise.all([
          supabase
            .from("plant_species")
            .select(
              "id, slug, common_name, scientific_name, family, category, sub_category, description, sort_order, is_active"
            )
            .eq("is_active", true)
            .order("sort_order", { ascending: true, nullsFirst: false })
            .order("common_name", { ascending: true }),

          supabase
            .from("plant_species_aliases")
            .select("species_id, alias_name")
            .order("alias_name", { ascending: true }),

          supabase
            .from("plant_care_guides")
            .select("plant_id, summary")
            .eq("language_code", "zh"),
        ]);

      setPlants(plantData || []);
      setAliases(aliasData || []);
      setCareGuides(guideData || []);
      setLoading(false);
    }

    load();
  }, []);

  const aliasMap = useMemo(() => {
    const map: Record<string, string[]> = {};

    aliases.forEach((alias) => {
      if (!alias.species_id || !alias.alias_name) return;

      if (!map[alias.species_id]) {
        map[alias.species_id] = [];
      }

      map[alias.species_id].push(alias.alias_name);
    });

    Object.keys(map).forEach((plantId) => {
      map[plantId] = uniqueTextList(map[plantId]);
    });

    return map;
  }, [aliases]);

  const guideMap = useMemo(() => {
    const map: Record<string, CareGuide> = {};

    careGuides.forEach((guide) => {
      if (guide.plant_id) {
        map[guide.plant_id] = guide;
      }
    });

    return map;
  }, [careGuides]);

  const categories = useMemo(() => {
    const existing = Array.from(
      new Set(plants.map((plant) => plant.category).filter(Boolean) as string[])
    );

    const preferred = [
      "vegetable",
      "fruit",
      "herb",
      "flower",
      "houseplant",
      "succulent",
      "grain",
      "field_crop",
    ];

    return [
      "all",
      ...preferred.filter((item) => existing.includes(item)),
      ...existing.filter((item) => !preferred.includes(item)),
    ];
  }, [plants]);

  const filteredPlants = useMemo(() => {
    const keyword = normalize(query);

    return plants.filter((plant) => {
      const plantAliases = aliasMap[plant.id] || [];
      const inCategory =
        activeCategory === "all" || plant.category === activeCategory;

      if (!inCategory) return false;
      if (!keyword) return true;

      const searchable = [
        plant.common_name,
        plant.scientific_name,
        plant.family,
        plant.slug,
        plant.category,
        plant.sub_category,
        ...plantAliases,
      ];

      return searchable.some((item) => normalize(item).includes(keyword));
    });
  }, [plants, aliasMap, query, activeCategory]);

  return (
    <main style={{ padding: "16px", maxWidth: 1080, margin: "0 auto" }}>
      <section
        style={{
          padding: 22,
          border: "1px solid #eee",
          borderRadius: 20,
          background: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ color: "#4CAF50", fontSize: 13, marginBottom: 8 }}>
          植物百科
        </div>

        <h1 style={{ margin: 0, fontSize: 28 }}>系统植物索引库</h1>

        <p style={{ margin: "10px 0 0", color: "#666", lineHeight: 1.7 }}>
          按植物名称、别名、学名和分类查找。不同地区季节不同，请优先参考温度、霜期、光照和植物阶段。
        </p>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索植物名、别名、学名，例如：西红柿、桔子、绿萼梅"
          style={{
            marginTop: 18,
            width: "100%",
            boxSizing: "border-box",
            border: "1px solid #ddd",
            borderRadius: 14,
            padding: "12px 14px",
            fontSize: 15,
            outline: "none",
          }}
        />

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 14,
          }}
        >
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              style={{
                border:
                  activeCategory === category
                    ? "1px solid #4CAF50"
                    : "1px solid #eee",
                background:
                  activeCategory === category ? "#f0fff4" : "#fafafa",
                color: activeCategory === category ? "#2e7d32" : "#333",
                borderRadius: 999,
                padding: "7px 12px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {categoryLabel(category)}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>全部植物</h2>

          <div style={{ fontSize: 13, color: "#888" }}>
            {loading ? "加载中..." : `${filteredPlants.length} 个结果`}
          </div>
        </div>

        {loading ? (
          <div
            style={{
              padding: 20,
              border: "1px solid #eee",
              borderRadius: 16,
              background: "#fff",
              color: "#888",
            }}
          >
            加载中...
          </div>
        ) : filteredPlants.length === 0 ? (
          <div
            style={{
              padding: 20,
              border: "1px solid #eee",
              borderRadius: 16,
              background: "#fff",
              color: "#888",
            }}
          >
            没有找到匹配植物。可以先在创建项目时提交候选植物。
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {filteredPlants.map((plant) => {
              const plantAliases = uniqueTextList(aliasMap[plant.id] || []);
              const summary = guideMap[plant.id]?.summary;

              return (
                <Link
                  key={plant.id}
                  href={`/plant/${plant.id}`}
                  style={{
                    display: "block",
                    border: "1px solid #eee",
                    borderRadius: 18,
                    background: "#fff",
                    padding: 16,
                    color: "inherit",
                    textDecoration: "none",
                    minHeight: 150,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0, fontSize: 18 }}>
                        {plant.common_name ||
                          plant.scientific_name ||
                          "未命名植物"}
                      </h3>

                      {plant.scientific_name && (
                        <div
                          style={{
                            marginTop: 4,
                            color: "#777",
                            fontSize: 13,
                            fontStyle: "italic",
                          }}
                        >
                          {plant.scientific_name}
                        </div>
                      )}
                    </div>

                    <span
                      style={{
                        whiteSpace: "nowrap",
                        fontSize: 12,
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "#f0fff4",
                        color: "#2e7d32",
                      }}
                    >
                      {categoryLabel(plant.category)}
                    </span>
                  </div>

                  {plant.sub_category && (
                    <div style={{ marginTop: 8, color: "#999", fontSize: 13 }}>
                      {subCategoryLabel(plant.sub_category)}
                    </div>
                  )}

                  {summary ? (
                    <p
                      style={{
                        margin: "10px 0 0",
                        color: "#444",
                        fontSize: 14,
                        lineHeight: 1.65,
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {summary}
                    </p>
                  ) : (
                    <p
                      style={{
                        margin: "10px 0 0",
                        color: "#999",
                        fontSize: 14,
                        lineHeight: 1.65,
                      }}
                    >
                      种植卡待补充。
                    </p>
                  )}

                  {plantAliases.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        marginTop: 12,
                      }}
                    >
                      {plantAliases.slice(0, 4).map((alias, index) => (
                        <span
                          key={`${plant.id}-alias-${index}-${alias}`}
                          style={{
                            fontSize: 12,
                            color: "#666",
                            background: "#f7f7f7",
                            border: "1px solid #eee",
                            borderRadius: 999,
                            padding: "3px 7px",
                          }}
                        >
                          {alias}
                        </span>
                      ))}

                      {plantAliases.length > 4 && (
                        <span style={{ fontSize: 12, color: "#aaa" }}>
                          +{plantAliases.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}