"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  type EnvironmentFilters,
  type PlantParameterLite,
  getEnvironmentTags,
  matchesEnvironmentFilters,
} from "@/lib/plant-env";

const categoryLabels: Record<string, string> = {
  all: "全部",
  vegetable: "蔬菜 / 蔬果",
  fruit: "果树 / 果类",
  herb: "香草 / 药草",
  medicinal: "香草 / 药草",
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

const lightOptions = [
  { value: "all", label: "全部光照" },
  { value: "sun", label: "喜阳" },
  { value: "part_shade", label: "半阴可种" },
  { value: "shade", label: "耐阴" },
];

const waterOptions = [
  { value: "all", label: "全部水分" },
  { value: "moist", label: "喜湿" },
  { value: "drought", label: "耐旱" },
];

const temperatureOptions = [
  { value: "all", label: "全部温度" },
  { value: "heat", label: "喜热" },
  { value: "cool", label: "喜凉" },
  { value: "cold", label: "耐寒" },
  { value: "frost_sensitive", label: "怕霜冻" },
];

const sceneOptions = [
  { value: "all", label: "全部场景" },
  { value: "container", label: "可盆栽" },
  { value: "balcony", label: "阳台友好" },
];

const indoorOptions = [
  { value: "all", label: "全部室内参考" },
  { value: "not_indoor", label: "不适合室内" },
  { value: "temporary_only", label: "可短期室内" },
  { value: "winter_only", label: "可室内过冬" },
  { value: "long_term_ok", label: "可长期室内" },
];




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

function normalizePlantCategoryKey(value?: string | null) {
  const key = String(value || "").trim().toLowerCase();

  if (key === "medicinal") return "herb";
  if (key === "field_crop") return "grain";

  return key;
}

function categoryLabel(value?: string | null) {
  if (!value) return "未分类";
  const key = normalizePlantCategoryKey(value);
  return categoryLabels[key] || key || "未分类";
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, color: "#777" }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          height: 38,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: "0 12px",
          background: "#fff",
          color: "#333",
          fontSize: 14,
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function PlantIndexPage() {
  const [plants, setPlants] = useState<PlantItem[]>([]);
  const [aliases, setAliases] = useState<AliasItem[]>([]);
  const [careGuides, setCareGuides] = useState<CareGuide[]>([]);
  const [parameters, setParameters] = useState<PlantParameterLite[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<EnvironmentFilters>({
    light: "all",
    water: "all",
    temperature: "all",
    scene: "all",
    indoor: "all",
  });

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [
        { data: plantData },
        { data: aliasData },
        { data: guideData },
        { data: parameterData },
      ] = await Promise.all([
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

        supabase.from("plant_parameters").select(
          "species_id, sun_score, soil_moisture_score, drought_score, optimal_growth_temp_min, optimal_growth_temp_max, frost_damage_temp, lethal_low_temp, shade_tolerance, drought_tolerance, container_friendly_score, indoor_friendly_score, balcony_friendly_score, air_flow_score, soil_aeration_score, soil_fertility_score"
        ),
      ]);

      setPlants(plantData || []);
      setAliases(aliasData || []);
      setCareGuides(guideData || []);
      setParameters(parameterData || []);
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

  const parameterMap = useMemo(() => {
    const map: Record<string, PlantParameterLite> = {};

    parameters.forEach((item: any) => {
      if (item?.species_id) {
        map[item.species_id] = item;
      }
    });

    return map;
  }, [parameters]);

  const categories = useMemo(() => {
    const existing = Array.from(
      new Set(
        plants
          .map((plant) => normalizePlantCategoryKey(plant.category))
          .filter(Boolean) as string[]
      )
    );

    const preferred = [
      "vegetable",
      "fruit",
      "herb",
      "flower",
      "houseplant",
      "succulent",
      "grain",
      "tree",
    ];

    return [
      "all",
      ...preferred.filter((item) => existing.includes(item)),
      ...existing.filter((item) => !preferred.includes(item)),
    ];
  }, [plants]);

  const categoryFilterOptions = useMemo(
    () => categories.map((category) => ({ value: category, label: categoryLabel(category) })),
    [categories]
  );

  const filteredPlants = useMemo(() => {
    const keyword = normalize(query);

    return plants.filter((plant) => {
      const plantAliases = aliasMap[plant.id] || [];
      const inCategory =
        activeCategory === "all" || normalizePlantCategoryKey(plant.category) === activeCategory;

      if (!inCategory) return false;
      if (!matchesEnvironmentFilters(parameterMap[plant.id], filters)) return false;

      if (!keyword) return true;

      const searchable = [
        plant.common_name,
        plant.scientific_name,
        plant.family,
        plant.slug,
        plant.category,
        normalizePlantCategoryKey(plant.category),
        plant.sub_category,
        ...plantAliases,
      ];

      return searchable.some((item) => normalize(item).includes(keyword));
    });
  }, [plants, aliasMap, query, activeCategory, parameterMap, filters]);

  const hasActiveEnvironmentFilters =
    filters.light !== "all" ||
    filters.water !== "all" ||
    filters.temperature !== "all" ||
    filters.scene !== "all" ||
    filters.indoor !== "all";

  function updateFilter<K extends keyof EnvironmentFilters>(key: K, value: EnvironmentFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    setFilters({
      light: "all",
      water: "all",
      temperature: "all",
      scene: "all",
      indoor: "all",
    });
  }

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

        <div style={{ marginTop: 16 }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入搜索植物"
            style={{
              width: "100%",
              height: 44,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              padding: "0 14px",
              fontSize: 14,
            }}
          />
        </div>

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

        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid #f0f0f0",
            display: "grid",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>环境筛选</div>
            {hasActiveEnvironmentFilters && (
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  border: "1px solid #eee",
                  background: "#fff",
                  borderRadius: 999,
                  padding: "6px 12px",
                  fontSize: 12,
                  color: "#666",
                  cursor: "pointer",
                }}
              >
                清空环境筛选
              </button>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <FilterSelect
              label="类别"
              value={activeCategory}
              onChange={setActiveCategory}
              options={categoryFilterOptions}
            />
            <FilterSelect
              label="光照"
              value={filters.light}
              onChange={(value) => updateFilter("light", value)}
              options={lightOptions}
            />
            <FilterSelect
              label="水分"
              value={filters.water}
              onChange={(value) => updateFilter("water", value)}
              options={waterOptions}
            />
            <FilterSelect
              label="温度"
              value={filters.temperature}
              onChange={(value) => updateFilter("temperature", value)}
              options={temperatureOptions}
            />
            <FilterSelect
              label="场景"
              value={filters.scene}
              onChange={(value) => updateFilter("scene", value)}
              options={sceneOptions}
            />
            <FilterSelect
              label="室内辅助参考"
              value={filters.indoor}
              onChange={(value) => updateFilter("indoor", value)}
              options={indoorOptions}
            />
          </div>
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            gap: 12,
            flexWrap: "wrap",
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
              lineHeight: 1.75,
            }}
          >
            没有找到匹配植物。可以放宽环境条件，或先在创建项目时提交候选植物。
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
              const envTags = getEnvironmentTags(parameterMap[plant.id], {
                includeIndoor: true,
              }).slice(0, 6);

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
                    minHeight: 196,
                    boxShadow: "0 4px 14px rgba(0,0,0,0.03)",
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
                    <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.35 }}>
                      {plant.common_name ||
                        plant.scientific_name ||
                        "未命名植物"}
                    </h3>

                    <span
                      style={{
                        whiteSpace: "nowrap",
                        fontSize: 12,
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "#f0fff4",
                        color: "#2e7d32",
                        flexShrink: 0,
                      }}
                    >
                      {categoryLabel(plant.category)}
                    </span>
                  </div>

                  {plant.scientific_name && (
                    <div
                      style={{
                        marginTop: 6,
                        color: "#666",
                        fontSize: 13,
                        fontStyle: "italic",
                        lineHeight: 1.6,
                      }}
                    >
                      学名：{plant.scientific_name}
                    </div>
                  )}

                  {plantAliases.length > 0 && (
                    <div
                      style={{
                        marginTop: 4,
                        color: "#777",
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                    >
                      别名：{plantAliases.join("、")}
                    </div>
                  )}

                  {envTags.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        marginTop: 12,
                      }}
                    >
                      {envTags.slice(0, 5).map((tag) => (
                        <span
                          key={`${plant.id}-${tag}`}
                          style={{
                            fontSize: 12,
                            color: "#2e7d32",
                            background: "#f6fbf6",
                            border: "1px solid #dfeedd",
                            borderRadius: 999,
                            padding: "3px 8px",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <p
                    style={{
                      margin: "12px 0 0",
                      color: summary ? "#444" : "#999",
                      fontSize: 14,
                      lineHeight: 1.65,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {summary || plant.description || "种植卡待补充。"}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
