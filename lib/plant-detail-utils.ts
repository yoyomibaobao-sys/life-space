import { getPlantCategoryLabel, normalizePlantCategoryKey, uniqueTextList } from "@/lib/plant-shared";

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

export function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

export function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function formatRange(min: unknown, max: unknown, suffix = "") {
  if (isEmpty(min) && isEmpty(max)) return null;

  if (!isEmpty(min) && !isEmpty(max)) {
    if (String(min) === String(max)) return `${min}${suffix}`;
    return `${min}–${max}${suffix}`;
  }

  if (!isEmpty(min)) return `${min}${suffix}以上`;
  return `${max}${suffix}以下`;
}

export function scoreLabel(value: unknown) {
  if (isEmpty(value)) return null;
  return `${value}/10`;
}

export function phRequirementLabel(value: unknown) {
  if (isEmpty(value)) return null;

  const score = Number(value);
  if (Number.isNaN(score)) return null;

  if (score <= 2) return "适应范围很宽";
  if (score <= 4) return "适应范围较宽";
  if (score <= 6) return "中等敏感";
  if (score <= 8) return "较敏感";
  return "很敏感";
}

export function phRequirementText(parameters: any) {
  const sensitivity = phRequirementLabel(parameters?.ph_sensitivity_score);
  const phRange = formatRange(parameters?.ph_min, parameters?.ph_max);

  if (!sensitivity && !phRange) return null;
  if (sensitivity && phRange) return `${sensitivity}（pH ${phRange}）`;
  if (sensitivity) return sensitivity;
  return `适宜 pH ${phRange}`;
}

export function difficultyMeta(value: unknown) {
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

export const categoryLabel = getPlantCategoryLabel;

export function guideTitle(plant: any) {
  const category = normalizePlantCategoryKey(plant?.category);
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

export function getPhotoperiodTypeLabel(value?: string | null) {
  if (!value || value === "unknown") return null;
  return photoperiodLabels[value] || value;
}

export function getPhotoperiodStageLabel(value?: string[] | null) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.map((stage) => stageLabels[stage] || stage).join("、");
}
