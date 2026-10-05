import type { ArchiveCategory } from "@/lib/archive-categories";
import { getAquaticTemperatureMatches, getAquaticTemperatureReference, matchesAquaticTemperature } from "./aquatic-guide-temperature";

export type PublicGuideLanguage = "zh" | "en";

export type PublicGuideSection = {
  id: string;
  category: ArchiveCategory;
  slug: string;
  name: string;
  name_en?: string | null;
  summary?: string | null;
  summary_en?: string | null;
  sort_order?: number | null;
};

export type PublicGuideEntry = {
  id: string;
  category: ArchiveCategory;
  name: string;
  name_en?: string | null;
  source: "preset" | "approved";
  section_id?: string | null;
  summary?: string | null;
  summary_en?: string | null;
  content_template?: string | null;
  content?: unknown;
  content_en?: unknown;
  sort_order?: number | null;
  is_active?: boolean | null;
};

export type PublicGuideParameter = {
  label: string;
  value: string;
  note?: string;
};

export type PublicGuideStage = {
  label: string;
  duration: string;
  note?: string;
};

export type PublicGuideCycle = {
  title: string;
  total: string;
  note?: string;
  stages: PublicGuideStage[];
};

export type PublicGuideContentSection = {
  title: string;
  intro?: string;
  items: string[];
};

export type PublicGuideContent = {
  overview?: string;
  parameters: PublicGuideParameter[];
  cycle?: PublicGuideCycle | null;
  sections: PublicGuideContentSection[];
  cautions: string[];
  sources?: Array<{ title: string; url: string }>;
};

export type PublicGuideFilterTraits = {
  light?: string;
  temperature?: string;
  growthForm?: string;
  difficulty?: string;
};

export type PublicGuideFilterKey = keyof PublicGuideFilterTraits;
export type PublicGuideFilters = Record<PublicGuideFilterKey, string | readonly string[]>;

export const publicGuideCopy = {
  zh: {
    publicLibrary: "公共指引库",
    newProject: "新建项目",
    searchPlaceholder: "搜索指引",
    notice:
      "平台预设指引直接公开。你新增的关联指引可立即用于自己的项目；达到使用量后进入管理员审核，通过后加入公共指引库。",
    loading: "加载中…",
    noMatch: "没有匹配的公共指引。",
    empty: "这个板块暂时还没有公共指引。",
    allCategories: "全部类别",
    category: "类别",
    categoryFilter: "类别筛选",
    waterPlantFilters: "水草筛选",
    showFilters: "筛选",
    hideFilters: "收起筛选",
    clearFilters: "清除筛选",
    light: "光照",
    temperature: "水温（℃）",
    referenceTemperature: "参考水温范围",
    temperatureReferenceNote: "资料所列范围，并非全程最适温度。",
    multiSelect: "可多选",
    waterFilterHint: "同一条件选中任一项即可，不同条件同时满足。水温按资料范围初筛，结果标出实际匹配部分，不代表整个区间都适合。",
    growthForm: "生长方式",
    difficulty: "难度",
    overviewPractice: "概要与实操",
    experienceCards: "经验卡",
    relatedProjects: "关联项目",
    noExperienceCards: "暂时没有与这条指引关联的公开经验卡。",
    noRelatedProjects: "暂时没有与这条指引关联的项目。",
    registerForOverview: "登录／注册以了解完整指引",
    membershipForFull: "Plus 云端用户可见",
    learnMembership: "了解云会员",
    otherGuides: "其他公开指引",
    preset: "平台预设",
    approved: "已审核公开",
    open: "打开指引",
    overview: "概要",
    keyParameters: "关键参考",
    referenceCycle: "参考周期",
    cautions: "注意事项",
    back: "返回指引",
    notFound: "没有找到这条指引，或它暂时未公开。",
    contentPending: "这条公共指引已建立，详细内容仍在持续补充。",
    frameworkNote: "以下为通用起步框架，具体参数应结合物种、材料、环境和当地规范调整。",
  },
  en: {
    publicLibrary: "Public guide library",
    newProject: "New project",
    searchPlaceholder: "Search",
    notice:
      "Platform presets are public. A guide name you add can be used in your own project immediately; commonly used names enter administrator review before becoming public.",
    loading: "Loading…",
    noMatch: "No matching public guides.",
    empty: "There are no public guides in this section yet.",
    allCategories: "All types",
    category: "Category",
    categoryFilter: "Category filter",
    waterPlantFilters: "Aquatic-plant filters",
    showFilters: "Filters",
    hideFilters: "Hide filters",
    clearFilters: "Clear filters",
    light: "Light",
    temperature: "Water temperature (°C)",
    referenceTemperature: "Reference water-temperature range",
    temperatureReferenceNote: "Published range, not an optimum throughout.",
    multiSelect: "Select multiple",
    waterFilterHint: "Match any choice within a condition and every selected condition. Temperature results show the actual overlap with the published range, not suitability throughout the selected band.",
    growthForm: "Growth form",
    difficulty: "Difficulty",
    overviewPractice: "Overview & practice",
    experienceCards: "Experience cards",
    relatedProjects: "Related projects",
    noExperienceCards: "There are no public experience cards linked to this guide yet.",
    noRelatedProjects: "There are no projects linked to this guide yet.",
    registerForOverview: "Log in / register for full guidance",
    membershipForFull: "Available to Plus cloud members",
    learnMembership: "About cloud membership",
    otherGuides: "Other public guides",
    preset: "Platform preset",
    approved: "Approved public guide",
    open: "Open guide",
    overview: "Overview",
    keyParameters: "Key references",
    referenceCycle: "Reference cycle",
    cautions: "Important notes",
    back: "Back to Guides",
    notFound: "This guide could not be found or is not currently public.",
    contentPending: "This public guide exists, and detailed content is still being developed.",
    frameworkNote: "This is a general starting framework. Adjust it for the species, materials, environment, and local requirements.",
  },
} as const;

export const publicGuideWaterFilterOptions = {
  zh: {
    light: [
      { value: "all", label: "全部光照" },
      { value: "low", label: "弱光" },
      { value: "medium", label: "中光" },
      { value: "high", label: "强光" },
    ],
    temperature: [
      { value: "all", label: "全部水温" },
      { value: "c0_10", label: "0–10℃" },
      { value: "c10_18", label: "10–18℃" },
      { value: "c18_22", label: "18–22℃" },
      { value: "c22_26", label: "22–26℃" },
      { value: "c26_30", label: "26–30℃" },
      { value: "c30_plus", label: "30℃以上" },
      { value: "unknown", label: "水温待确认" },
    ],
    growthForm: [
      { value: "all", label: "全部生长方式" },
      { value: "epiphyte", label: "附生" },
      { value: "rooted", label: "扎根" },
      { value: "carpet", label: "前景铺地" },
      { value: "stem", label: "茎草" },
      { value: "floating", label: "漂浮" },
      { value: "stem_floating", label: "茎生／漂浮" },
    ],
    difficulty: [
      { value: "all", label: "全部难度" },
      { value: "easy", label: "容易" },
      { value: "medium", label: "中等" },
      { value: "hard", label: "较难" },
    ],
  },
  en: {
    light: [
      { value: "all", label: "All light levels" },
      { value: "low", label: "Low light" },
      { value: "medium", label: "Medium light" },
      { value: "high", label: "High light" },
    ],
    temperature: [
      { value: "all", label: "All temperatures" },
      { value: "c0_10", label: "0–10°C" },
      { value: "c10_18", label: "10–18°C" },
      { value: "c18_22", label: "18–22°C" },
      { value: "c22_26", label: "22–26°C" },
      { value: "c26_30", label: "26–30°C" },
      { value: "c30_plus", label: "Above 30°C" },
      { value: "unknown", label: "Range unverified" },
    ],
    growthForm: [
      { value: "all", label: "All growth forms" },
      { value: "epiphyte", label: "Epiphyte" },
      { value: "rooted", label: "Rooted" },
      { value: "carpet", label: "Carpet" },
      { value: "stem", label: "Stem plant" },
      { value: "floating", label: "Floating" },
      { value: "stem_floating", label: "Stem / floating" },
    ],
    difficulty: [
      { value: "all", label: "All difficulties" },
      { value: "easy", label: "Easy" },
      { value: "medium", label: "Moderate" },
      { value: "hard", label: "Advanced" },
    ],
  },
} as const;

function localizedText(
  language: PublicGuideLanguage,
  zh?: string | null,
  en?: string | null,
) {
  if (language === "en") return en?.trim() || zh?.trim() || "";
  return zh?.trim() || en?.trim() || "";
}

export function getPublicGuideName(
  entry: Pick<PublicGuideEntry, "name" | "name_en">,
  language: PublicGuideLanguage,
) {
  return localizedText(language, entry.name, entry.name_en);
}

export function getPublicGuideSummary(
  entry: Pick<PublicGuideEntry, "summary" | "summary_en">,
  language: PublicGuideLanguage,
) {
  return localizedText(language, entry.summary, entry.summary_en);
}

export function getPublicGuideSectionName(
  section: Pick<PublicGuideSection, "name" | "name_en">,
  language: PublicGuideLanguage,
) {
  return localizedText(language, section.name, section.name_en);
}

export function getPublicGuideSectionSummary(
  section: Pick<PublicGuideSection, "summary" | "summary_en">,
  language: PublicGuideLanguage,
) {
  return localizedText(language, section.summary, section.summary_en);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function getPublicGuideFilterTraits(
  entry: Pick<PublicGuideEntry, "content">,
): PublicGuideFilterTraits {
  if (!isRecord(entry.content) || !isRecord(entry.content.filters)) return {};

  const filters = entry.content.filters;
  const light = text(filters.light);
  const temperature = text(filters.temperature);
  const growthForm = text(filters.growth_form);
  const difficulty = text(filters.difficulty);

  return {
    light: light || undefined,
    temperature: temperature || undefined,
    growthForm: growthForm || undefined,
    difficulty: difficulty || undefined,
  };
}

export function getPublicGuideFilterLabel(
  key: PublicGuideFilterKey,
  value: string | undefined,
  language: PublicGuideLanguage,
) {
  if (!value) return "";
  const option = publicGuideWaterFilterOptions[language][key].find(
    (item) => item.value === value,
  );
  const legacyLabels: Record<string, readonly [string, string]> = {
    low_medium: ["弱至中光", "Low to medium"],
    medium_high: ["中至强光", "Medium to high"],
    temperate: ["偏凉，数值待确认", "Cooler; range unverified"],
    warm: ["偏暖，数值待确认", "Warmer; range unverified"],
    temperate_warm: ["凉至暖，数值待确认", "Cool to warm; range unverified"],
    cool_warm: ["宽温，数值待确认", "Broad range; unverified"],
  };
  return option?.label || legacyLabels[value]?.[language === "en" ? 1 : 0] || value;
}

export function matchesPublicGuideFilters(
  entry: Pick<PublicGuideEntry, "content"> & Partial<PublicGuideEntry>,
  filters: PublicGuideFilters,
) {
  const traits = getPublicGuideFilterTraits(entry);
  const compatibility: Record<string, readonly string[]> = {
    low_medium: ["low", "medium"],
    medium_high: ["medium", "high"],
    stem_floating: ["stem", "floating"],
  };
  return (Object.keys(filters) as PublicGuideFilterKey[]).every((key) => {
    const selected = typeof filters[key] === "string" ? [filters[key]] : filters[key];
    if (!selected.length || selected.includes("all")) return true;
    return selected.some((value) => {
      if (key === "temperature" && (value.startsWith("c") && value !== "cool_warm" || value === "unknown")) {
        return matchesAquaticTemperature(entry, value);
      }
      if (traits[key] === value) return true;
      return key !== "temperature" && Boolean(compatibility[traits[key] || ""]?.includes(value));
    });
  });
}

export function getPublicGuideTemperatureLabel(entry: PublicGuideEntry, language: PublicGuideLanguage) {
  const range = getAquaticTemperatureReference(entry);
  return range ? `${range.min}–${range.max}${language === "en" ? "°C" : "℃"}` : language === "en" ? "Range unverified" : "水温待确认";
}

export function getPublicGuideTemperatureMatchLabel(
  entry: PublicGuideEntry,
  selected: PublicGuideFilters["temperature"],
  language: PublicGuideLanguage,
) {
  const matches = getAquaticTemperatureMatches(entry, selected);
  if (!matches.length) return "";
  const ranges = matches.map((range) => `${range.min}–${range.max}${language === "en" ? "°C" : "℃"}`);
  return language === "en" ? `Matched range: ${ranges.join(", ")}` : `本次匹配：${ranges.join("、")}`;
}

export function sortPublicGuides<T extends { sort_order?: number | null; name: string }>(
  items: T[],
) {
  return [...items].sort((left, right) => {
    const orderDifference = Number(left.sort_order ?? 1000) - Number(right.sort_order ?? 1000);
    if (orderDifference !== 0) return orderDifference;
    return left.name.localeCompare(right.name, "zh-CN");
  });
}
