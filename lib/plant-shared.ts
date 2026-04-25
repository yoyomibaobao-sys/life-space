import type { EnvironmentFilters } from "@/lib/plant-env";

export type PlantSelectOption = {
  value: string;
  label: string;
};

export const plantCategoryLabels: Record<string, string> = {
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

export const plantSubCategoryLabels: Record<string, string> = {
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

export const plantLightOptions: PlantSelectOption[] = [
  { value: "all", label: "全部光照" },
  { value: "sun", label: "喜阳" },
  { value: "part_shade", label: "半阴可种" },
  { value: "shade", label: "耐阴" },
];

export const plantWaterOptions: PlantSelectOption[] = [
  { value: "all", label: "全部水分" },
  { value: "moist", label: "喜湿" },
  { value: "drought", label: "耐旱" },
];

export const plantTemperatureOptions: PlantSelectOption[] = [
  { value: "all", label: "全部温度" },
  { value: "heat", label: "喜热" },
  { value: "cool", label: "喜凉" },
  { value: "cold", label: "耐寒" },
  { value: "frost_sensitive", label: "怕霜冻" },
];

export const plantSceneOptions: PlantSelectOption[] = [
  { value: "all", label: "全部场景" },
  { value: "container", label: "可盆栽" },
  { value: "balcony", label: "阳台友好" },
];

export const plantIndoorOptions: PlantSelectOption[] = [
  { value: "all", label: "全部室内参考" },
  { value: "not_indoor", label: "不适合室内" },
  { value: "temporary_only", label: "可短期室内" },
  { value: "winter_only", label: "可室内过冬" },
  { value: "long_term_ok", label: "可长期室内" },
];

export const defaultPlantEnvironmentFilters: EnvironmentFilters = {
  light: "all",
  water: "all",
  temperature: "all",
  scene: "all",
  indoor: "all",
};

export function normalizePlantCategoryKey(value?: string | null) {
  const key = String(value || "").trim().toLowerCase();

  if (key === "medicinal") return "herb";
  if (key === "field_crop") return "grain";

  return key;
}

export function getPlantCategoryLabel(value?: string | null) {
  if (!value) return "未分类";
  const key = normalizePlantCategoryKey(value);
  return plantCategoryLabels[key] || key || "未分类";
}

export function getPlantSubCategoryLabel(value?: string | null) {
  if (!value) return "";
  return plantSubCategoryLabels[value] || value;
}

export function uniqueTextList(items: unknown[]) {
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
