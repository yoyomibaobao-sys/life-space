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
    description: "花草、蔬果、树木、菌菇、苔藓、水草等植物的种植栽培记录",
  },
  {
    value: "system",
    label: "农法设施",
    description: "堆肥、架子、灌溉系统、温室等设施制作及无土、永续、免耕等农法实践",
  },
  {
    value: "insect_fish",
    label: "虫鱼生态",
    description: "蚯蚓、黑水虻等昆虫饲养及鱼缸、虾缸等小生态、微景观的养成",
  },
  {
    value: "other",
    label: "其他",
    description: "其他自然生活相关项目",
  },
];

export const defaultSystemNamesByCategory: Record<
  NonPlantArchiveCategory,
  string[]
> = {
  system: [
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
    "孔雀鱼",
    "斗鱼",
    "红绿灯鱼",
    "瓢虫",
    "蚜虫",
    "白粉虱",
    "蜗牛",
    "米虾",
  ],
  other: [],
};

export function getArchiveCategoryLabel(
  value?: string | null,
  language: Language = "zh"
) {
  if (language === "en") {
    if (value === "plant") return "Cultivation";
    if (value === "system") return "Methods & facilities";
    if (value === "insect_fish") return "Insects & aquatic life";
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
      return "Insects, fish, shrimp, small aquatic ecosystems, and miniature habitats";
    }
    if (value === "other") return "Other projects related to natural living";
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
