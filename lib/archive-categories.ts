import type { UiIconName } from "@/components/ui/UiIcon";
import type { Language } from "@/lib/i18n";

export type ArchiveCategory = "plant" | "system" | "insect_fish" | "other";

export type NonPlantArchiveCategory = Exclude<ArchiveCategory, "plant">;

export const archiveCategoryOptions: {
  value: ArchiveCategory;
  label: string;
  description: string;
}[] = [
  {
    value: "plant",
    label: "种植",
    description: "花草、蔬果、树木、菌菇、苔藓等植物的种植栽培记录",
  },
  {
    value: "system",
    label: "农法设施",
    description: "堆肥、架子、灌溉系统、温室等设施制作及无土、永续、免耕等农法实践",
  },
  {
    value: "insect_fish",
    label: "虫鱼生态",
    description: "水草、水族、庭院动物与昆虫鸟类等生态观察和照护记录",
  },
  {
    value: "other",
    label: "其他",
    description: "美食制作及其他自然生活相关项目",
  },
];

export const defaultSystemNamesByCategory: Record<
  NonPlantArchiveCategory,
  string[]
> = {
  system: [
    "土壤改良",
    "堆肥",
    "种植箱",
    "高床",
    "育苗架",
    "爬藤架",
    "保温棚",
    "遮阳棚",
    "防虫网棚",
    "雨水收集",
    "蓄水设施",
    "排水系统",
    "鱼缸鱼池",
    "水循环过滤",
    "鸡舍",
    "鸭舍",
    "兔舍",
    "围栏",
    "堆肥箱",
    "嫁接",
    "高压繁殖",
    "扦插",
    "免耕",
    "覆盖",
    "轮作与混种",
    "自然农法",
    "土培",
    "水培",
    "半水培",
    "无土栽培",
    "鱼菜共生",
    "补光灯",
    "育苗盒",
    "花架",
    "温室/小棚",
    "滴灌",
  ],
  insect_fish: [
    "水草",
    "鱼虾蟹",
    "螺贝",
    "蛙类",
    "龟蛇",
    "虫蝶",
    "蜘蛛",
    "鸟类",
    "庭院动物",
    "孔雀鱼",
    "斗鱼",
    "红绿灯鱼",
    "瓢虫",
    "蚜虫",
    "白粉虱",
    "蜗牛",
    "米虾",
  ],
  other: [
    "果酱",
    "梅子蜜",
    "果汁",
    "腌渍",
    "干制",
    "臭卤菜",
    "腐乳",
    "豆豉",
    "豆瓣酱",
    "酱油",
    "醋",
    "果酒",
    "米酒",
    "其他",
  ],
};

export function getArchiveCategoryLabel(
  value?: string | null,
  language: Language = "zh"
) {
  if (language === "en") {
    if (value === "plant") return "Plants";
    if (value === "system") return "Methods";
    if (value === "insect_fish") return "Ecology";
    if (value === "other") return "Other";
    return "Project";
  }
  const match = archiveCategoryOptions.find((item) => item.value === value);

  return match?.label || "项目";
}

export function getArchiveCategoryIcon(value?: string | null): UiIconName {
  if (value === "system") return "wrench";
  if (value === "insect_fish") return "fish";
  if (value === "other") return "shapes";
  return "sprout";
}

export function isPlantArchiveCategory(value?: string | null) {
  return value === "plant";
}

export function isNonPlantArchiveCategory(
  value?: string | null
): value is NonPlantArchiveCategory {
  return value === "system" || value === "insect_fish" || value === "other";
}

export function getArchiveNamePlaceholder(
  value?: string | null,
  language: Language = "zh"
) {
  if (language === "en") {
    if (value === "system") return "Methods & facilities";
    if (value === "insect_fish") return "Insects & aquatic life";
    if (value === "other") return "Other";
    return "Cultivation";
  }
  if (value === "system") return "农法设施";
  if (value === "insect_fish") return "虫鱼生态";
  if (value === "other") return "其他";
  return "种植";
}

export function getArchiveCategoryDescription(
  value?: string | null,
  language: Language = "zh"
) {
  if (language === "en") {
    if (value === "plant") {
      return "Cultivation records for flowers, vegetables, fruit, trees, fungi, mosses, and aquatic plants";
    }
    if (value === "system") {
      return "Methods and facilities such as composting, irrigation, greenhouses, hydroponics, and no-till practice";
    }
    if (value === "insect_fish") {
      return "Aquatic plants, fish, shrimp, crabs, amphibians, reptiles, insects, birds, and backyard habitats";
    }
    if (value === "other") return "Food making and other projects related to natural living";
    return "Create an archive for something you care for over time";
  }
  const match = archiveCategoryOptions.find((item) => item.value === value);

  return match?.description || "为一个长期照料的项目建立档案";
}

export function getDefaultSystemNames(
  value?: string | null
): string[] {
  if (!isNonPlantArchiveCategory(value)) return [];
  return defaultSystemNamesByCategory[value];
}
