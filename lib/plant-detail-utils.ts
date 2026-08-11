import { normalizePlantCategoryKey } from "@/lib/plant-shared";
import { getTranslations, type Language } from "@/lib/i18n";

type PlantPhParameters = {
  ph_sensitivity_score?: unknown;
  ph_min?: unknown;
  ph_max?: unknown;
};

type PlantGuideSource = {
  category?: string | null;
  sub_category?: string | null;
};

export function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

export function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function formatRange(
  min: unknown,
  max: unknown,
  suffix = "",
  language: Language = "zh"
) {
  const copy = getTranslations(language).plant.detail;
  if (isEmpty(min) && isEmpty(max)) return null;

  if (!isEmpty(min) && !isEmpty(max)) {
    if (String(min) === String(max)) return `${min}${suffix}`;
    return `${min}–${max}${suffix}`;
  }

  if (!isEmpty(min)) {
    return `${copy.range_min_prefix}${min}${suffix}${copy.range_min_suffix}`;
  }
  return `${copy.range_max_prefix}${max}${suffix}${copy.range_max_suffix}`;
}

export function scoreLabel(value: unknown) {
  if (isEmpty(value)) return null;
  return `${value}/10`;
}

export function phRequirementLabel(value: unknown, language: Language = "zh") {
  const copy = getTranslations(language).plant.detail;
  if (isEmpty(value)) return null;

  const score = Number(value);
  if (Number.isNaN(score)) return null;

  if (score <= 2) return copy.ph_very_broad;
  if (score <= 4) return copy.ph_broad;
  if (score <= 6) return copy.ph_moderate;
  if (score <= 8) return copy.ph_sensitive;
  return copy.ph_very_sensitive;
}

export function phRequirementText(
  parameters?: PlantPhParameters | null,
  language: Language = "zh"
) {
  const copy = getTranslations(language).plant.detail;
  const sensitivity = phRequirementLabel(parameters?.ph_sensitivity_score, language);
  const phRange = formatRange(parameters?.ph_min, parameters?.ph_max, "", language);

  if (!sensitivity && !phRange) return null;
  if (sensitivity && phRange) return `${sensitivity}（pH ${phRange}）`;
  if (sensitivity) return sensitivity;
  return `${copy.suitable_ph} ${phRange}`;
}

export function difficultyMeta(value: unknown, language: Language = "zh") {
  const copy = getTranslations(language).plant.detail;
  if (isEmpty(value)) return null;

  const score = Number(value);
  if (Number.isNaN(score)) return null;

  if (score <= 1) return { rating: 0, label: copy.difficulty_wild, detail: `${score}/10` };
  if (score <= 3) return { rating: 1, label: copy.difficulty_very_easy, detail: `${score}/10` };
  if (score <= 5) return { rating: 2, label: copy.difficulty_easy, detail: `${score}/10` };
  if (score <= 7) return { rating: 3, label: copy.difficulty_moderate, detail: `${score}/10` };
  if (score <= 9) return { rating: 4, label: copy.difficulty_hard, detail: `${score}/10` };

  return { rating: 5, label: copy.difficulty_professional, detail: `${score}/10` };
}

export function categoryLabel(value?: string | null, language: Language = "zh") {
  const plantCopy = getTranslations(language).plant;
  if (!value) return plantCopy.uncategorized;
  return (plantCopy.categories as Record<string, string>)[value] || value;
}

export function guideTitle(
  plant?: PlantGuideSource | null,
  language: Language = "zh"
) {
  const labels = getTranslations(language).plant.detail.guide_titles;
  const category = normalizePlantCategoryKey(plant?.category);
  const subCategory = plant?.sub_category;

  if (category === "flower") {
    return subCategory === "flowering_tree" || subCategory === "flowering_shrub"
      ? labels.flowering_pruning
      : labels.flowering;
  }

  if (category === "houseplant") return labels.foliage_propagation;
  if (category === "succulent") return labels.propagation;
  if (category === "fruit") return labels.harvest_pruning;

  return labels.harvest;
}

export function getPhotoperiodTypeLabel(
  value?: string | null,
  language: Language = "zh"
) {
  if (!value || value === "unknown") return null;
  const labels = getTranslations(language).plant.detail.photoperiod_types;
  return (labels as Record<string, string>)[value] || value;
}

export function getPhotoperiodStageLabel(
  value?: string[] | null,
  language: Language = "zh"
) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const plantCopy = getTranslations(language).plant;
  const labels = plantCopy.detail.photoperiod_stages;
  return value
    .map((stage) => (labels as Record<string, string>)[stage] || stage)
    .join(plantCopy.alias_separator);
}
