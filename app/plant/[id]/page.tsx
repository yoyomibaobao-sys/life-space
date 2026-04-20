"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const categoryLabels: Record<string, string> = {
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

const photoperiodLabels: Record<string, string> = {
  long_day: "长日照",
  short_day: "短日照",
  day_neutral: "日中性",
  intermediate_day: "中日照",
  cultivar_dependent: "品种相关",
};

const stageLabels: Record<string, string> = {
  flowering: "开花",
  fruiting: "结果",
  bolting: "抽薹",
  tuberization: "块茎形成",
  bulb_formation: "鳞茎膨大",
  dormancy: "休眠",
  flower_bud_init: "花芽分化",
};

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function formatRange(min: unknown, max: unknown, suffix = "") {
  if (isEmpty(min) && isEmpty(max)) return null;

  if (!isEmpty(min) && !isEmpty(max)) {
    if (String(min) === String(max)) return `${min}${suffix}`;
    return `${min}–${max}${suffix}`;
  }

  if (!isEmpty(min)) return `${min}${suffix}以上`;
  return `${max}${suffix}以下`;
}

function scoreLabel(value: unknown) {
  if (isEmpty(value)) return null;
  return `${value}/10`;
}

function phRequirementLabel(value: unknown) {
  if (isEmpty(value)) return null;

  const score = Number(value);
  if (Number.isNaN(score)) return null;

  if (score <= 2) return "适应范围很宽";
  if (score <= 4) return "适应范围较宽";
  if (score <= 6) return "中等敏感";
  if (score <= 8) return "较敏感";
  return "很敏感";
}

function phRequirementText(parameters: any) {
  const sensitivity = phRequirementLabel(parameters?.ph_sensitivity_score);
  const phRange = formatRange(parameters?.ph_min, parameters?.ph_max);

  if (!sensitivity && !phRange) return null;
  if (sensitivity && phRange) return `${sensitivity}（pH ${phRange}）`;
  if (sensitivity) return sensitivity;
  return `适宜 pH ${phRange}`;
}

function difficultyMeta(value: unknown) {
  if (isEmpty(value)) return null;

  const score = Number(value);
  if (Number.isNaN(score)) return null;

  if (score <= 1) return { stars: "☆☆☆☆☆", label: "野生级", detail: `${score}/10` };
  if (score <= 3) return { stars: "★☆☆☆☆", label: "非常容易", detail: `${score}/10` };
  if (score <= 5) return { stars: "★★☆☆☆", label: "容易", detail: `${score}/10` };
  if (score <= 7) return { stars: "★★★☆☆", label: "中等", detail: `${score}/10` };
  if (score <= 9) return { stars: "★★★★☆", label: "较难", detail: `${score}/10` };

  return { stars: "★★★★★", label: "专业种植", detail: `${score}/10` };
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

function guideTitle(plant: any) {
  const category = plant?.category;
  const subCategory = plant?.sub_category;

  if (category === "flower") {
    return subCategory === "flowering_tree" || subCategory === "flowering_shrub"
      ? "观花 / 修剪"
      : "观花";
  }

  if (category === "houseplant") return "观叶 / 繁殖";
  if (category === "succulent") return "繁殖";
  if (category === "fruit") return "采收 / 修剪";

  return "采收";
}

function TextBlock({ text }: { text?: string | null }) {
  if (!hasText(text)) return null;

  return (
    <div style={{ color: "#333", lineHeight: 1.85, whiteSpace: "pre-line" }}>
      {text}
    </div>
  );
}

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string | null;
}) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === false
  ) {
    return null;
  }

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid #eee",
        borderRadius: 14,
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 650, color: "#333" }}>{value}</div>
      {hint && <div style={{ marginTop: 4, color: "#999", fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  if (!children) return null;

  return (
    <section
      style={{
        marginTop: 16,
        padding: 20,
        border: "1px solid #eee",
        borderRadius: 18,
        background: "#fff",
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{title}</h2>
      {children}
    </section>
  );
}

function TempCard({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return <Card label={label} value={value} />;
}

export default function PlantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [plant, setPlant] = useState<any>(null);
  const [i18n, setI18n] = useState<any[]>([]);
  const [aliases, setAliases] = useState<any[]>([]);
  const [parameters, setParameters] = useState<any>(null);
  const [careGuide, setCareGuide] = useState<any>(null);
  const [relatedRecords, setRelatedRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return;

      setLoading(true);

      const [
        { data: plantData },
        { data: i18nData },
        { data: aliasData },
        { data: parameterData },
        { data: careGuideData },
        { data: relatedData },
      ] = await Promise.all([
        supabase.from("plant_species").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("plant_species_i18n")
          .select("*")
          .eq("plant_id", id)
          .order("language_code", { ascending: true }),
        supabase
          .from("plant_species_aliases")
          .select("*")
          .eq("species_id", id)
          .order("alias_name", { ascending: true }),
        supabase.from("plant_parameters").select("*").eq("species_id", id).maybeSingle(),
        supabase
          .from("plant_care_guides")
          .select("*")
          .eq("plant_id", id)
          .eq("language_code", "zh")
          .maybeSingle(),
        supabase
          .from("discovery_feed_view")
          .select("*")
          .eq("species_id", id)
          .limit(6),
      ]);

      setPlant(plantData);
      setI18n(i18nData || []);
      setAliases(aliasData || []);
      setParameters(parameterData);
      setCareGuide(careGuideData);
      setRelatedRecords(relatedData || []);
      setLoading(false);
    }

    load();
  }, [id]);

  const zh = useMemo(
    () => i18n.find((item) => item.language_code === "zh"),
    [i18n]
  );

  const en = useMemo(
    () => i18n.find((item) => item.language_code === "en"),
    [i18n]
  );

  const aliasNames = useMemo(
    () => uniqueTextList(aliases.map((alias) => alias.alias_name)),
    [aliases]
  );

  const displayName =
    zh?.common_name || plant?.common_name || plant?.scientific_name || "植物百科";

  const difficulty = difficultyMeta(parameters?.management_difficulty_score);

  const parameterCards = [
    { label: "日照强度", value: scoreLabel(parameters?.sun_score) },
    { label: "空气湿度", value: scoreLabel(parameters?.air_humidity_score) },
    { label: "空气通风", value: scoreLabel(parameters?.air_flow_score) },
    { label: "土壤湿度", value: scoreLabel(parameters?.soil_moisture_score) },
    { label: "土壤通气", value: scoreLabel(parameters?.soil_aeration_score) },
    { label: "土壤肥沃度", value: scoreLabel(parameters?.soil_fertility_score) },
    { label: "土壤酸碱要求", value: phRequirementText(parameters) },
    { label: "耐旱能力", value: scoreLabel(parameters?.drought_score) },
    { label: "生长速度", value: scoreLabel(parameters?.growth_speed_score) },
    { label: "病虫害风险", value: scoreLabel(parameters?.disease_risk_score) },
    {
      label: "管理难度",
      value: difficulty
        ? `${difficulty.stars}（${difficulty.detail}，${difficulty.label}）`
        : null,
    },
  ].filter((item) => item.value);

  const temperatureCards = [
    {
      label: "最佳发芽温度",
      value: formatRange(
        parameters?.best_germ_temp_min,
        parameters?.best_germ_temp_max,
        "℃"
      ),
    },
    {
      label: "适宜生长温度",
      value: formatRange(
        parameters?.optimal_growth_temp_min,
        parameters?.optimal_growth_temp_max,
        "℃"
      ),
    },
    {
      label: "旺盛生长点",
      value: isEmpty(parameters?.vigorous_growth_temp)
        ? null
        : `${parameters.vigorous_growth_temp}℃`,
    },
    {
      label: "生长减缓点",
      value: isEmpty(parameters?.growth_slow_temp)
        ? null
        : `${parameters.growth_slow_temp}℃`,
    },
    {
      label: "冻害触发",
      value: isEmpty(parameters?.frost_damage_temp)
        ? null
        : `${parameters.frost_damage_temp}℃`,
    },
    {
      label: "致死低温",
      value: isEmpty(parameters?.lethal_low_temp)
        ? null
        : `${parameters.lethal_low_temp}℃`,
    },
    {
      label: "低温停长",
      value: isEmpty(parameters?.stop_low_temp)
        ? null
        : `${parameters.stop_low_temp}℃`,
    },
    {
      label: "高温停长",
      value: isEmpty(parameters?.stop_high_temp)
        ? null
        : `${parameters.stop_high_temp}℃`,
    },
    {
      label: "高温灼伤风险",
      value: isEmpty(parameters?.heat_scorch_temp)
        ? null
        : `${parameters.heat_scorch_temp}℃`,
    },
    {
      label: "致死高温",
      value: isEmpty(parameters?.lethal_high_temp)
        ? null
        : `${parameters.lethal_high_temp}℃`,
    },
  ].filter((item) => item.value);

  const hasTemperatureSection =
    temperatureCards.length > 0 || hasText(parameters?.temperature_note);

  const photoperiodType =
    parameters?.photoperiod_type &&
    parameters.photoperiod_type !== "unknown"
      ? photoperiodLabels[parameters.photoperiod_type] || parameters.photoperiod_type
      : null;

  const photoperiodStages =
    Array.isArray(parameters?.photoperiod_trigger_stage) &&
    parameters.photoperiod_trigger_stage.length > 0
      ? parameters.photoperiod_trigger_stage
          .map((stage: string) => stageLabels[stage] || stage)
          .join("、")
      : null;

  const photoperiodCards = [
    { label: "类型", value: photoperiodType },
    {
      label: "敏感度",
      value: scoreLabel(parameters?.photoperiod_sensitivity_score),
    },
    {
      label: "临界日长",
      value: isEmpty(parameters?.critical_day_length_hours)
        ? null
        : `${parameters.critical_day_length_hours} 小时`,
    },
    {
      label: "触发阶段",
      value: photoperiodStages,
    },
  ].filter((item) => item.value);

  const hasPhotoperiodSection =
    photoperiodCards.length > 0 || hasText(parameters?.photoperiod_note);

  if (loading) {
    return <main style={{ padding: 20 }}>加载中...</main>;
  }

  if (!plant) {
    return (
      <main style={{ padding: "16px", maxWidth: 760, margin: "0 auto" }}>
        <Link href="/plant" style={{ color: "#666", fontSize: 14 }}>
          ← 返回植物百科
        </Link>
        <div
          style={{
            marginTop: 24,
            padding: 20,
            border: "1px solid #eee",
            borderRadius: 16,
            background: "#fff",
          }}
        >
          没有找到这个植物条目。
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "16px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/plant" style={{ color: "#666", fontSize: 14 }}>
          ← 返回植物百科
        </Link>
        <Link href="/archive" style={{ color: "#666", fontSize: 14 }}>
          返回我的空间
        </Link>
      </div>

      <section
        style={{
          padding: 22,
          border: "1px solid #eee",
          borderRadius: 20,
          background: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ fontSize: 13, color: "#4CAF50", marginBottom: 8 }}>
          植物百科
        </div>

        <h1 style={{ margin: 0, fontSize: 30 }}>{displayName}</h1>

        <div style={{ marginTop: 8, color: "#666", lineHeight: 1.7 }}>
          {en?.common_name && <div>英文名：{en.common_name}</div>}
          {plant.scientific_name && <div>学名：{plant.scientific_name}</div>}
          {(zh?.family || plant.family) && <div>科属：{zh?.family || plant.family}</div>}
          <div>
            分类：{categoryLabel(plant.category)}
            {plant.sub_category ? ` · ${subCategoryLabel(plant.sub_category)}` : ""}
          </div>
        </div>

        {(careGuide?.summary || zh?.description || plant.description) && (
          <p
            style={{
              margin: "16px 0 0",
              lineHeight: 1.85,
              color: "#222",
              fontSize: 16,
              fontWeight: 550,
            }}
          >
            {careGuide?.summary || zh?.description || plant.description}
          </p>
        )}

        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 14,
            background: "#f7fbf7",
            color: "#4b6b4b",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          不同地区季节不同，请优先参考温度、霜期、光照和植物阶段；月份只作为当地经验参考。
        </div>

        {aliasNames.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
              常见别名
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {aliasNames.map((alias, index) => (
                <span
                  key={`${plant.id}-alias-${index}-${alias}`}
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: "#f5f5f5",
                    border: "1px solid #eee",
                  }}
                >
                  {alias}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {hasText(careGuide?.climate_timing_note) && (
        <Section title="气候与时机">
          <TextBlock text={careGuide.climate_timing_note} />
        </Section>
      )}

      {hasText(careGuide?.planting_guide) && (
        <Section title="种植">
          <TextBlock text={careGuide.planting_guide} />
        </Section>
      )}

      {hasText(careGuide?.care_guide) && (
        <Section title="养护">
          <TextBlock text={careGuide.care_guide} />
        </Section>
      )}

      {hasText(careGuide?.harvest_guide) && (
        <Section title={guideTitle(plant)}>
          <TextBlock text={careGuide.harvest_guide} />
        </Section>
      )}

      {hasText(careGuide?.common_problem_guide) && (
        <Section title="常见问题">
          <TextBlock text={careGuide.common_problem_guide} />
        </Section>
      )}

      {hasText(careGuide?.rotation_intercrop_guide) && (
        <Section title="轮作 / 间种 / 伴生">
          <TextBlock text={careGuide.rotation_intercrop_guide} />
        </Section>
      )}

      {parameterCards.length > 0 && (
        <Section title="参数卡">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12,
            }}
          >
            {parameterCards.map((item) => (
              <Card key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </Section>
      )}

      {hasTemperatureSection && (
        <Section title="温度节点">
          {temperatureCards.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              {temperatureCards.map((item) => (
                <TempCard key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          )}

          {hasText(parameters?.temperature_note) && (
            <div style={{ marginTop: 12, color: "#666", lineHeight: 1.7 }}>
              {parameters.temperature_note}
            </div>
          )}
        </Section>
      )}

      {hasPhotoperiodSection && (
        <Section title="光周期">
          {photoperiodCards.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              {photoperiodCards.map((item) => (
                <Card key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          )}

          {hasText(parameters?.photoperiod_note) && (
            <div style={{ marginTop: 12, color: "#666", lineHeight: 1.7 }}>
              {parameters.photoperiod_note}
            </div>
          )}
        </Section>
      )}

      <section style={{ marginTop: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>相关公开记录</h2>
          <Link
            href={`/discover/search?species=${plant.id}`}
            style={{ fontSize: 13, color: "#4CAF50", textDecoration: "none" }}
          >
            查看更多 →
          </Link>
        </div>

        {relatedRecords.length === 0 ? (
          <div
            style={{
              padding: 18,
              border: "1px solid #eee",
              borderRadius: 14,
              color: "#888",
              background: "#fff",
            }}
          >
            暂时还没有相关公开记录。
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {relatedRecords.map((record) => (
              <Link
                key={record.record_id}
                href={`/archive/${record.archive_id}?mode=viewer`}
                style={{
                  display: "block",
                  padding: 14,
                  border: "1px solid #eee",
                  borderRadius: 14,
                  background: "#fff",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                {record.primary_image_url && (
                  <img
                    src={record.primary_image_url}
                    alt=""
                    style={{
                      width: "100%",
                      maxHeight: 180,
                      objectFit: "cover",
                      borderRadius: 10,
                      marginBottom: 10,
                    }}
                  />
                )}
                <div style={{ fontWeight: 600 }}>{record.archive_title || "种植记录"}</div>
                <div
                  style={{
                    marginTop: 6,
                    color: "#555",
                    fontSize: 14,
                    lineHeight: 1.6,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {record.note || "没有文字内容"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}