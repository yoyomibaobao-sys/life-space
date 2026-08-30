import type { ArchiveCategory } from "@/lib/archive-categories";
import { getPracticalGuideContent } from "./practical-guide-content";
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

type RawGuideContent = Partial<PublicGuideContent>;

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
    registerForOverview: "登录／注册后查看基础概要",
    membershipForFull: "开通云会员后可查看完整实操、经验卡和关联项目。",
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
    searchPlaceholder: "Search guides",
    notice:
      "Platform presets are public. A guide name you add can be used in your own project immediately; commonly used names enter administrator review before becoming public.",
    loading: "Loading…",
    noMatch: "No matching public guides.",
    empty: "There are no public guides in this section yet.",
    allCategories: "All categories",
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
    registerForOverview: "Log in / register to view the basic overview",
    membershipForFull: "Cloud membership unlocks full practice guidance, experience cards, and related projects.",
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

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseParameters(value: unknown): PublicGuideParameter[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): PublicGuideParameter | null => {
      if (!isRecord(item)) return null;
      const label = text(item.label);
      const itemValue = text(item.value);
      const note = text(item.note);
      return label && itemValue ? { label, value: itemValue, ...(note ? { note } : {}) } : null;
    })
    .filter((item): item is PublicGuideParameter => item !== null);
}

function parseSections(value: unknown): PublicGuideContentSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const title = text(item.title);
      const intro = text(item.intro);
      const items = Array.isArray(item.items)
        ? item.items.map(text).filter(Boolean)
        : [];
      if (!title || items.length === 0) return null;
      return intro ? { title, intro, items } : { title, items };
    })
    .filter((item): item is PublicGuideContentSection => item !== null);
}

function parseCycle(value: unknown): PublicGuideCycle | null {
  if (!isRecord(value)) return null;
  const title = text(value.title);
  const total = text(value.total);
  const note = text(value.note);
  const stages = Array.isArray(value.stages)
    ? value.stages
        .map((item): PublicGuideStage | null => {
          if (!isRecord(item)) return null;
          const label = text(item.label);
          const duration = text(item.duration);
          const stageNote = text(item.note);
          if (!label || !duration) return null;
          return stageNote ? { label, duration, note: stageNote } : { label, duration };
        })
        .filter((item): item is PublicGuideStage => item !== null)
    : [];
  if (!title || !total || stages.length === 0) return null;
  return { title, total, note: note || undefined, stages };
}

function parseGuideContent(value: unknown): RawGuideContent {
  if (!isRecord(value)) return {};
  const cautions = Array.isArray(value.cautions)
    ? value.cautions.map(text).filter(Boolean)
    : [];
  return {
    overview: text(value.overview) || undefined,
    parameters: parseParameters(value.parameters),
    cycle: parseCycle(value.cycle),
    sections: parseSections(value.sections),
    cautions,
    sources: Array.isArray(value.sources)
      ? value.sources.flatMap((item) => {
          if (!isRecord(item)) return [];
          const title = text(item.title);
          const url = text(item.url);
          return title && /^https?:\/\//i.test(url) ? [{ title, url }] : [];
        })
      : [],
  };
}

function zhTemplates(name: string): Record<string, PublicGuideContent> {
  const recurringCycle = (title: string, total: string, stages: PublicGuideStage[]): PublicGuideCycle => ({
    title,
    total,
    stages,
    note: "周期受材料、温度、物种和管理方式影响，以实际观察记录为准。",
  });
  const aquariumFocus: Record<string, string> = {
    金鱼: "金鱼排泄负荷较高，应优先保障有效水量、溶氧和过滤维护，并避免与会啄咬长鳍的鱼混养。",
    锦鲤: "锦鲤成体大、寿命长且排泄量高，应按长期鱼池空间、深度、过滤和越冬条件规划。",
    孔雀鱼: "孔雀鱼繁殖快，需提前安排公母比例、幼鱼去向和数量控制，并避免水温水质骤变。",
    斗鱼: "斗鱼需稳定暖水和接近水面的换气空间；不同个体攻击性差异大，不默认可混养。",
    红绿灯鱼: "红绿灯鱼适合稳定成熟的水体和同类群游，入缸与换水时应减少温度和水质突变。",
    原生鱼: "原生鱼必须先准确识别并确认合法来源、温度季节性和流速需求，不能以“本地鱼”概括饲养。",
    海水鱼: "海水鱼应先建立稳定盐度、温度和成熟生物过滤，并为停电、补水与检疫预留方案。",
  };
  const crustaceanFocus: Record<string, string> = {
    米虾: "米虾适合成熟、稳定且有生物膜的水体；进出水口要防吸入，避免含铜药物。",
    水晶虾: "水晶虾对水质波动更敏感，应稳定硬度、酸碱度和温度，少量慢速调整。",
    螯虾: "螯虾会攀爬、掘动并可能夹伤同伴，需牢固上盖、独立躲避和更谨慎的混养方案。",
    螃蟹: "螃蟹的淡水、汽水、海水及水陆需求差异很大，必须先确认准确种类并重点防逃。",
  };
  const backyardFocus: Record<string, string> = {
    鸡: "鸡要有干燥通风的夜宿区、栖架和产蛋区，并重点防天敌、潮湿垫料和群体啄伤。",
    鸭: "鸭的饮水会迅速弄湿环境，应把饮水区、排水和干燥休息区分开管理。",
    鹅: "鹅需要充足活动与清洁饮水，并要管理领地性、噪声、围栏和繁殖季行为。",
    兔: "兔对高温和闷湿敏感，需要干燥通风、遮暑、足部保护、磨牙材料和持续粗纤维来源。",
    鹌鹑: "鹌鹑易受惊向上冲撞，应设置合适高度或缓冲顶面，并保持干燥垫料和防逃缝隙。",
    羊: "羊需要稳定粗饲料、清洁饮水、干燥落脚处和蹄部检查，并防止误食有毒植物。",
    猪: "猪需要结实围栏、遮阴降温、干燥休息区和可探索活动，饮水、粪污及夏季热应激要重点管理。",
    牛: "牛的长期空间、草料、饮水、围栏和粪污需求大，应持续看反刍、采食、步态和体况。",
    马: "马需要持续粗饲料、清洁饮水、足够活动、蹄部护理和安全围栏，饲料变化必须逐步进行。",
  };

  const aquariumAnimal: PublicGuideContent = {
    parameters: [
      { label: "先确认", value: "准确物种、成体体型、群居性与食性" },
      { label: "水体", value: "有效水量、温度、溶氧、氨氮与酸碱度" },
      { label: "设备", value: "成熟过滤、循环、增氧与停电预案" },
    ],
    cycle: recurringCycle("入缸与稳定参考", "先稳定系统，再逐步增加生物量", [
      { label: "空系统试运行", duration: "至少数日" },
      { label: "隔离与适应", duration: "按来源和物种决定" },
      { label: "逐步合缸", duration: "分批进行" },
    ]),
    sections: [
      { title: "入手前", items: [`查清${name}的成体大小、温度、水质、食性、群居和混养要求。`, aquariumFocus[name] || "按成体与系统承载规划，不以幼体大小或缸体标称容积估算密度。"] },
      { title: "建立与入缸", items: ["先让过滤、循环和增氧稳定运行，再分批加入生物。", "新个体先隔离观察，入缸时逐步适应温度和水质，减少一次性变化。"] },
      { title: "日常与异常", items: ["每天看呼吸、游姿、进食、体表、排泄和同伴互动；定期记录水质与设备状态。", "出现异常先复查水质、过滤、供氧和近期变动，不盲目叠加药物。"] },
    ],
    cautions: ["不要把个体、卵、幼体或缸水排入自然水体。", "药物、盐度、温度与混养处理必须核对准确物种的耐受性。"],
  };

  const crustacean: PublicGuideContent = {
    parameters: [
      { label: "关键环境", value: "稳定水质、溶氧、硬度与躲避空间" },
      { label: "重点阶段", value: "入缸、蜕壳、抱卵与幼体" },
      { label: "防护", value: "防夹伤、防捕食、防逃逸" },
    ],
    cycle: recurringCycle("适应与蜕壳观察", "连续记录多个蜕壳周期", [
      { label: "隔离适应", duration: "按来源决定" },
      { label: "稳定摄食", duration: "约数日至数周" },
      { label: "蜕壳复查", duration: "持续" },
    ]),
    sections: [
      { title: "环境准备", items: [`为${name}准备成熟过滤、充足溶氧和不易夹伤的躲避处。`, crustaceanFocus[name] || "先核对淡水、汽水或海水环境，以及硬度、底床和同伴兼容要求。"] },
      { title: "喂养与蜕壳", items: ["少量投喂并移走残饵，记录摄食、体色、活动和排泄。", "蜕壳前后减少打扰，保留安全躲避空间；不要随意移走刚蜕壳个体。"] },
      { title: "繁殖与数量", items: ["记录抱卵、幼体出现和存活，提前评估后续容量。", "检查缝隙、进出水口和上盖，防止逃逸或被设备吸入。"] },
    ],
    cautions: ["含铜药物和部分水处理剂可能伤害甲壳类，使用前必须核对。", "螯虾和部分螃蟹可能捕食、夹伤或破坏造景，不能默认适合混养。"],
  };

  const molluskAquatic: PublicGuideContent = {
    parameters: [
      { label: "水环境", value: "物种对应的淡水、汽水或海水" },
      { label: "壳体", value: "关注硬度、钙源、溶壳与破损" },
      { label: "数量", value: "记录繁殖、食物与系统承载" },
    ],
    sections: [
      { title: "确认需求", items: [`确认${name}的水域类型、成体大小、食性、温度和繁殖方式。`, "滤食性贝类不能仅靠缸壁藻类维持，先确认系统是否能稳定提供合适食物。"] },
      { title: "日常观察", items: ["记录活动、附着、摄食、壳口、壳面、死亡个体和水质变化。", "控制残饵和有机物累积，及时移走死亡个体并查找原因。"] },
      { title: "繁殖与防逃", items: ["记录卵块或幼体，数量上升时同步调整投喂和过滤。", "检查上盖、水线和进出水口；部分种类会离水活动。"] },
    ],
    cautions: ["不能把观赏螺贝、卵或缸水释放到自然环境。", "部分螺贝受保护或可能携带寄生风险，采集、食用和转移前应核对当地规定。"],
  };

  const molluskLand: PublicGuideContent = {
    parameters: [
      { label: "环境", value: "通风、湿度、温度、躲避与防逃" },
      { label: "食物", value: "先确认物种食性与安全钙源" },
      { label: "观察", value: "活动、取食、黏液、壳体或体表" },
    ],
    sections: [
      { title: "识别与边界", items: [`先判断${name}是观察对象、饲养对象还是作物危害，再决定是否干预。`, "记录出现位置、时间、湿度、食物来源和数量，不只凭单张照片识别。"] },
      { title: "环境与喂养", items: ["保持湿润但不闷湿，提供通风、躲避和可清洁的基质。", "少量提供符合物种食性的食物，及时清理腐败残饵和排泄物。"] },
      { title: "数量管理", items: ["记录产卵与幼体，提前准备容量或采用物理隔离。", "作物区优先用环境整理、诱集和屏障降低危害，避免无差别用药。"] },
    ],
    cautions: ["接触后洗手，避免接触黏液后触摸口眼或直接食用。", "外来或来源不明种类不要放生、转移到公共绿地或与本地种群混放。"],
  };

  const amphibian: PublicGuideContent = {
    parameters: [
      { label: "先确认", value: "准确物种、生活史与保护状态" },
      { label: "环境", value: "水陆比例、温湿度、水质与躲避" },
      { label: "观察", value: "皮肤、姿态、进食、排泄与变态阶段" },
    ],
    cycle: recurringCycle("生活史记录", "按物种与季节持续观察", [
      { label: "卵或幼体", duration: "按物种" },
      { label: "变态", duration: "按水温与物种" },
      { label: "成体活动", duration: "长期" },
    ]),
    sections: [
      { title: "环境建立", items: [`按${name}的生活史配置水域、陆地、攀附或躲避空间。`, "使用无刺激、易清洁的材料，稳定水质、温湿度与昼夜节律。"] },
      { title: "喂养与清洁", items: ["按物种和阶段提供合适大小、来源清楚的食物，记录拒食与体况。", "小范围分次清洁，避免消毒剂、肥皂、农药和护肤品接触敏感皮肤。"] },
      { title: "观察与干预", items: ["记录鸣叫、产卵、变态、蜕皮、活动和天气变化。", "野生个体优先原地观察，不随意捕捉、搬运或跨水体放生。"] },
    ],
    cautions: ["两栖动物对水质和化学残留敏感，处理前应确认材料安全。", "受保护物种、野生采集和跨区域转移应遵守当地规定。"],
  };

  const reptile: PublicGuideContent = {
    parameters: [
      { label: "必须确认", value: "准确物种、成体尺寸、食性与合法来源" },
      { label: "环境", value: "温度梯度、光照、湿度、水域与躲避" },
      { label: "记录", value: "进食、排泄、体重、蜕皮和行为" },
    ],
    sections: [
      { title: "设置环境", items: [`按${name}的准确物种建立冷热区、躲避处、活动空间与安全上盖。`, "需要时配置适合的紫外线光源，并按说明记录安装距离和更换时间。"] },
      { title: "日常照护", items: ["每天核对温湿度、饮水、精神、排泄和设备，定期记录体重或体况。", "按物种食性与体型喂养，避免用单一食物长期替代完整营养。"] },
      { title: "蜕皮与安全", items: ["记录蜕皮完整度、眼部和趾端残皮，先调整环境再考虑处理。", "减少不必要抓取，接触前后洗手；儿童和其他动物不得无监督接触。"] },
    ],
    cautions: ["蛇、龟、蜥蜴之间差异极大，不能共用一套温度、光照或饲料参数。", "来源、饲养、运输与放生可能受法规限制，出现健康异常应联系有经验的异宠兽医。"],
  };

  const insect: PublicGuideContent = {
    parameters: [
      { label: "识别", value: "物种或至少到可靠类群与生命周期阶段" },
      { label: "资源", value: "寄主、花蜜、腐殖质或专用饲料" },
      { label: "环境", value: "温湿度、通风、光周期与防逃" },
    ],
    cycle: recurringCycle("生命周期记录", "按物种记录完整一代", [
      { label: "卵／幼体", duration: "按物种" },
      { label: "蛹或蜕变", duration: "按物种" },
      { label: "成体", duration: "按物种" },
    ]),
    sections: [
      { title: "建立记录", items: [`记录${name}的来源、阶段、寄主或食物、温湿度和出现时间。`, "保留环境照片和连续变化，不只记录成虫或最终结果。"] },
      { title: "饲养或观察", items: ["每天清理霉变食物和过湿区域，同时保留合适湿度与通风。", "为化蛹、羽化、蜕皮或繁殖预留空间，防止跌落、粘翅和逃逸。"] },
      { title: "生态边界", items: ["庭院观察时把寄主植物、天敌、天气和用药一起记录。", "扩繁前先确认后续用途、容量和当地规则，不随意释放非本地个体。"] },
    ],
    cautions: ["蜜蜂、毛虫和部分甲虫可能蜇刺、致敏或分泌刺激物，应避免徒手接触。", "农药处理会同时影响目标与非目标昆虫，使用前应评估替代方法。"],
  };

  const arachnid: PublicGuideContent = {
    parameters: [
      { label: "先识别", value: "蜘蛛或螨的类群、来源与风险" },
      { label: "环境", value: "栖息结构、通风、湿度与防逃" },
      { label: "观察", value: "结网、猎食、蜕皮、数量与危害" },
    ],
    sections: [
      { title: "观察与识别", items: [`记录${name}出现的位置、时间、网型、猎物或寄主和环境条件。`, "不能可靠识别时保持距离，不用徒手捕捉或挤压。"] },
      { title: "栖息管理", items: ["饲养对象按类群提供攀附、穴居或地表空间，并保持通风与适度湿度。", "庭院蜘蛛优先保留原位栖息；作物螨先确认是否为害螨、捕食螨或分解者。"] },
      { title: "异常处理", items: ["记录蜕皮、拒食、腹部状态、扩散速度和近期温湿度变化。", "发现快速危害时先隔离受影响对象、清洁工具，再选择针对性措施。"] },
    ],
    cautions: ["不确定是否有毒或致敏时不要触摸；被咬伤并出现明显症状应及时求助。", "广谱杀螨剂可能影响捕食性天敌和其他节肢动物。"],
  };

  const bird: PublicGuideContent = {
    parameters: [
      { label: "场景", value: "区分野外观察、救助与人工饲养" },
      { label: "环境", value: "空间、栖木、光照、通风、饮水与卫生" },
      { label: "观察", value: "进食、羽毛、鸣叫、飞行、排泄与繁殖" },
    ],
    sections: [
      { title: "先定边界", items: [`确认${name}是野生访客还是合法来源的饲养个体。`, "野外观察记录时间、数量、食物、水源和筑巢，不随意抓取幼鸟或搬动巢。"] },
      { title: "日常环境", items: ["饲养空间要能伸展、转身和完成正常行为，保持空气流通并避免厨房油烟。", "每天更换清洁饮水，记录采食、排泄、羽毛和活动变化。"] },
      { title: "食物与健康", items: ["按准确物种提供多样且合适的食物，不长期只喂单一种子或人类加工食品。", "新增个体先隔离；持续蓬羽、呼吸异常、拒食或受伤应尽快联系专业救助或兽医。"] },
    ],
    cautions: ["野生鸟类、巢、蛋和迁徙物种常受法规保护。", "投喂可能造成聚集、污染和营养失衡；应先改善原生植物、水源和安全栖息环境。"],
  };

  const backyardAnimal: PublicGuideContent = {
    parameters: [
      { label: "基础", value: "物种、数量、年龄、来源与长期空间" },
      { label: "每天检查", value: "饮水、采食、精神、步态、排泄与体况" },
      { label: "环境", value: "通风、遮蔽、垫料、粪污、防逃和防天敌" },
    ],
    cycle: recurringCycle("日常管理参考", "按日检查、按周复盘、按季节调整", [
      { label: "每日", duration: "饮水、采食与个体观察" },
      { label: "每周", duration: "清洁、体况与设施检查" },
      { label: "季节", duration: "防暑、防寒与防疫复盘" },
    ]),
    sections: [
      { title: "开始前", items: [`按${name}的成体体型、群居行为和寿命准备长期空间、预算与照护人。`, backyardFocus[name] || "确认当地饲养、登记、防疫、噪声和粪污处理要求，并预留隔离区。"] },
      { title: "日常管理", items: ["持续提供清洁饮水和适合物种、年龄与阶段的饲料，避免突然换料。", "每天逐只看精神、采食、步态、皮毛或羽毛、排泄和伤口，异常个体及时隔离。"] },
      { title: "环境与记录", items: ["保持通风、干燥、遮阳避雨和可清洁地面，及时处理湿垫料与粪污。", "记录体重或体况、饲料、清洁、防疫、繁殖、维修和异常，按季节调整。"] },
    ],
    cautions: ["鸡、兔、牛、猪等需求差异很大，具体饲料、空间和防疫方案应按物种并咨询当地专业人员。", "不要自行使用处方药或随意改变停药期；动物福利和公共卫生要求优先。"],
  };

  return {
    generic: {
      parameters: [
        { label: "适用对象", value: "按具体项目确认" },
        { label: "起步原则", value: "先小规模验证，再逐步调整" },
        { label: "记录重点", value: "设置、变化、结果与异常" },
      ],
      sections: [
        { title: "开始前", items: ["明确使用场景、目标与可维护的规模。", "记录现有条件，保留可比较的起点。"] },
        { title: "实施与观察", items: ["一次只改变少量关键变量。", "连续记录结果，再决定是否扩大或调整。"] },
      ],
      cautions: ["本页是通用框架；涉及食品、动物、结构安全或当地法规时，应采用更严格的专业要求。"],
    },
    soil_improvement: {
      parameters: [
        { label: "先做判断", value: "质地、排水、板结、酸碱度与有机质" },
        { label: "改良方式", value: "有机质、覆盖、排水或结构调整" },
        { label: "观察周期", value: "按季节持续复查" },
      ],
      sections: [
        { title: "土壤诊断", items: ["观察雨后积水、干后开裂、根系伸展和土壤气味。", "先确认问题是结构、肥力、酸碱度还是盐分，避免只靠加肥解决。"] },
        { title: "分步改良", items: ["先小区试验，再逐步加入腐熟有机质或调整排水。", "保持地表覆盖，减少裸土冲刷、暴晒和水分剧烈波动。"] },
        { title: "持续记录", items: ["记录投入材料、用量、日期、作物表现和土壤变化。", "以一季到数季的结果判断，不追求一次完成。"] },
      ],
      cautions: ["不要把未腐熟材料大量埋入根区。", "石灰、硫磺和高盐肥料应依据检测和作物需求谨慎使用。"],
    },
    compost: {
      parameters: [
        { label: "材料", value: "含碳干料与含氮湿料搭配" },
        { label: "状态", value: "湿润但不滴水，并保持通气" },
        { label: "成熟判断", value: "温度回落、气味土香、原料难辨认" },
      ],
      cycle: recurringCycle("一次堆肥参考", "通常数周至数月", [
        { label: "建堆", duration: "第 1 天" },
        { label: "升温分解", duration: "约 1–3 周" },
        { label: "熟化", duration: "约 1–3 个月" },
      ]),
      sections: [
        { title: "建堆", items: ["把大块材料切小，干湿材料分层混合。", "堆体要能保湿，也要留有空气通道。"] },
        { title: "过程管理", items: ["过干时少量补水，发臭或过湿时加入干料并翻动。", "记录温度、气味、含水状态和翻堆时间。"] },
        { title: "使用", items: ["完全熟化后再用于育苗、盆栽或贴近根系的位置。", "新配方先少量试用，观察植物反应。"] },
      ],
      cautions: ["病株、来源不明的化学处理材料和含有害物的废料不要进入家庭堆肥。", "厨余堆肥要防渗漏、异味和动物翻找。"],
    },
    facility_structure: {
      parameters: [
        { label: "场地", value: "日照、承重、通道与排水" },
        { label: "尺寸", value: "以够得到、能维护为准" },
        { label: "材料", value: "耐候、无明显污染、便于更换" },
      ],
      sections: [
        { title: "规划", items: [`先确定${name}服务的作物、位置和使用频率。`, "预留浇水、排水、清洁、修剪和搬运空间。"] },
        { title: "安装", items: ["检查地面或墙体承重，设置稳定连接和防倾倒措施。", "让接触水土的部位可排水、可检查、可替换。"] },
        { title: "维护", items: ["按季节检查松动、锈蚀、开裂、积水和遮挡。", "记录尺寸、材料、成本和每次调整，便于下次复用。"] },
      ],
      cautions: ["阳台、屋顶、墙体和高处设施应先确认承重与坠落风险。", "儿童和动物可接触区域避免尖角、夹缝和不稳固结构。"],
    },
    facility_climate: {
      parameters: [
        { label: "核心监测", value: "温度、湿度、光照与通风" },
        { label: "安全", value: "抗风、排水、固定与应急开启" },
        { label: "管理", value: "白天夜间分别观察" },
      ],
      sections: [
        { title: "选型与布局", items: [`根据${name}的季节目标决定覆盖材料、开口和高度。`, "避免只保温不通风，也避免遮挡后长期光照不足。"] },
        { title: "运行", items: ["设置温湿度计，在不同位置和时段比较。", "用通风、遮阳、保温和浇水分步调整，记录每次变化。"] },
        { title: "季节检查", items: ["大风、暴雨、降雪或高温前检查固定、排水和开启机构。", "闲置期清洁覆盖材料并修补破损。"] },
      ],
      cautions: ["封闭空间可能迅速升温，不能只依据室外温度判断。", "大型或承重设施应符合当地建筑、消防和物业要求。"],
    },
    facility_water: {
      parameters: [
        { label: "先算需求", value: "来源、峰值用量与储存量" },
        { label: "关键节点", value: "过滤、溢流、排空与防回流" },
        { label: "维护", value: "定期查漏、清淤和冲洗" },
      ],
      sections: [
        { title: "水路规划", items: [`画出${name}的进水、储存、使用、溢流和排空路径。`, "让阀门、过滤器和易堵位置能够直接检查。"] },
        { title: "安装与试运行", items: ["先低压、短时测试，再逐段检查渗漏和流量。", "设置溢流去向，避免水进入地基、邻居区域或电气设备。"] },
        { title: "记录与维护", items: ["记录用水量、水位、压力、过滤状态和异常。", "季节变化、停用或低温前完成排空、防冻和清洁。"] },
      ],
      cautions: ["蓄水和开放水体应防儿童、动物跌落及蚊虫孳生。", "食用、饮用或动物用水须按相应卫生标准处理，不能只凭外观判断。"],
    },
    facility_animal: {
      parameters: [
        { label: "基本条件", value: "空间、通风、干燥、遮蔽与饮水" },
        { label: "防护", value: "防逃逸、防天敌、便于隔离" },
        { label: "清洁", value: "粪污、垫料、食具和排水可管理" },
      ],
      sections: [
        { title: "布局", items: [`先按动物种类、数量和行为设计${name}，不以最低尺寸作为长期目标。`, "把休息、饮水、采食、活动、产蛋或躲藏区域分开考虑。"] },
        { title: "日常检查", items: ["每天看饮水、采食、排泄、精神和设施破损。", "准备隔离空间，新增或患病动物不要直接混群。"] },
        { title: "环境管理", items: ["保持通风但避免直接穿堂风，及时更换潮湿垫料。", "记录清洁、消毒、维修、异常和动物变化。"] },
      ],
      cautions: ["饲养密度、动物福利、疫病防控和粪污处理应遵守当地规定。", "围栏和舍体要同时考虑钻缝、攀爬、啃咬和天敌进入。"],
    },
    method_skill: {
      parameters: [
        { label: "目标", value: "先明确繁殖、保土、节水或降低扰动" },
        { label: "适用条件", value: "物种、季节、材料和场地" },
        { label: "验证", value: "小范围试做，记录成活与后续管理" },
      ],
      sections: [
        { title: "选方法", items: [`先确认${name}解决的具体问题，以及失败时可接受的成本。`, "把时间、材料、工具和后续维护一起纳入方案。"] },
        { title: "分步实施", items: ["先在少量对象上试做，保留对照并记录日期、天气和操作细节。", "一次只调整一个关键步骤，避免结果无法比较。"] },
        { title: "复盘推广", items: ["记录成活、产量、土壤或生态变化，以及额外维护时间。", "只有在多个批次表现稳定后，再扩大到更多项目。"] },
      ],
      cautions: ["嫁接、压条、扦插等操作要使用清洁工具并保护切口；免耕和自然农法也需要持续观察，而不是完全不管理。", "涉及大型机械、药剂或公共绿地时，应遵守安全和当地规定。"],
    },
    aquatic_plant: {
      parameters: [
        { label: "光照", value: "按物种由弱到强逐步适应" },
        { label: "水温", value: "先确认物种适温范围" },
        { label: "水质", value: "稳定优先，关注酸碱度、硬度和营养盐" },
        { label: "底床与营养", value: "根系型与附生型分别设置" },
      ],
      cycle: recurringCycle("定植与稳定参考", "约 1–3 个月进入稳定观察", [
        { label: "缓苗适应", duration: "约 7–21 天" },
        { label: "新根新叶", duration: "约 2–6 周" },
        { label: "稳定生长", duration: "约 1–3 个月" },
      ]),
      sections: [
        { title: "定植", items: ["先确认是沉水、浮叶、挺水还是附生水草，再决定水深和固定方式。", "去除腐烂部位，少量分株，避免一次塞得过密。"] },
        { title: "光、水与营养", items: ["光照从较低强度开始，观察新叶和藻类后再调整。", "保持水温和水质稳定，施肥、二氧化碳和换水一次只改一个变量。"] },
        { title: "修剪与记录", items: ["记录融叶、新芽、根系、藻类和修剪后的恢复。", "过密时分批修剪，及时移走腐败叶片。"] },
      ],
      cautions: ["不同水草差异很大，不能用一套光照、温度和施肥参数覆盖全部物种。", "不要随意把外来水草或修剪物排入自然水体。"],
    },
    aquatic_animal: {
      parameters: [
        { label: "先确认", value: "物种、成体体型、群居性与兼容性" },
        { label: "水环境", value: "温度、溶氧、氨氮/亚硝酸盐与酸碱度" },
        { label: "系统能力", value: "有效水体、过滤、循环与停电预案" },
      ],
      cycle: recurringCycle("入缸与稳定参考", "先完成系统稳定，再逐步增加生物量", [
        { label: "空系统测试", duration: "至少数日" },
        { label: "隔离观察", duration: "按物种与来源决定" },
        { label: "逐步合缸", duration: "分批进行" },
      ]),
      sections: [
        { title: "物种与环境", items: [`为${name}查明成体大小、温度、水质、食性和群居要求。`, "按成体和系统承载力规划，不以幼体大小估算长期密度。"] },
        { title: "建立系统", items: ["过滤和水循环先稳定运行，确认溶氧与含氮废物处理能力。", "新增个体先隔离观察，合缸时逐步适应温度和水质。"] },
        { title: "日常记录", items: ["记录水温、水质、进食、排泄、行为、蜕壳或繁殖。", "异常时先查水质、设备和近期变化，不盲目叠加药物。"] },
      ],
      cautions: ["不要把饲养个体、卵、幼体或水体排入自然环境。", "用药、盐度和温度处理必须核对具体物种耐受性。"],
    },
    aquarium_animal: aquariumAnimal,
    crustacean,
    mollusk_aquatic: molluskAquatic,
    mollusk_land: molluskLand,
    amphibian,
    reptile,
    insect,
    arachnid,
    bird,
    backyard_animal: backyardAnimal,
    habitat_animal: {
      parameters: [
        { label: "对象", value: "先做物种识别，再决定观察或照护" },
        { label: "栖息条件", value: "温湿度、光照、躲避、食物与水" },
        { label: "记录方式", value: "时间、地点、数量、行为与环境变化" },
      ],
      sections: [
        { title: "识别与边界", items: [`记录${name}的外形、行为和出现环境，避免只凭单张照片下结论。`, "优先观察自然状态，不随意捕捉、转移、投喂或干预。"] },
        { title: "营造栖息地", items: ["保留水源、落叶、原生植物、躲避处和连续通道。", "减少广谱农药、强光和频繁扰动，观察变化后再调整。"] },
        { title: "长期观察", items: ["固定时间和路线记录数量、活动、繁殖或迁徙。", "把天气、植物物候和管理动作一起记录，便于发现关联。"] },
      ],
      cautions: ["野生动物、受保护物种和可能有毒或攻击性的动物应保持距离，并遵守当地规定。", "无法可靠识别时不要触摸、食用或自行处置。"],
    },
    food_preserve: {
      parameters: [
        { label: "原料", value: "新鲜、完整、可追溯" },
        { label: "关键控制", value: "清洁、配比、酸度/盐糖、温度与时间" },
        { label: "批次记录", value: "日期、重量、配方、容器和储存条件" },
      ],
      cycle: recurringCycle("一批制作参考", "按配方与保存方式决定", [
        { label: "准备", duration: "当天" },
        { label: "加工", duration: "按工艺" },
        { label: "冷却或静置", duration: "按配方" },
        { label: "储存复查", duration: "持续" },
      ]),
      sections: [
        { title: "配方与准备", items: [`制作${name}前固定原料重量、容器容量和配方来源。`, "清洗双手、工具和容器，剔除霉变、腐败和来源不明的原料。"] },
        { title: "过程控制", items: ["温度、时间、盐糖比例或酸度按可靠配方执行，不凭口感随意降低关键用量。", "分装、冷却和密封过程避免二次污染。"] },
        { title: "保存记录", items: ["标注制作日期、批次、开封日期和保存方式。", "出现胀气、漏液、霉变、异常气味或质地时停止食用。"] },
      ],
      cautions: ["低酸罐藏、真空密封和常温长期保存存在严重食品安全风险，应采用经验证的工艺。", "不能仅靠闻味、尝味判断食品是否安全。"],
    },
    food_ferment: {
      parameters: [
        { label: "原料与菌种", value: "来源清楚、配方明确" },
        { label: "过程", value: "盐度/酸度、温度、时间与排气" },
        { label: "记录", value: "批次、重量、环境、气味与表面状态" },
      ],
      cycle: recurringCycle("发酵批次参考", "从数天到数月，按具体工艺", [
        { label: "备料接种", duration: "第 1 天" },
        { label: "活跃发酵", duration: "数天至数周" },
        { label: "熟成", duration: "数周至数月" },
      ]),
      sections: [
        { title: "建立批次", items: [`制作${name}时固定原料、盐或曲种比例和容器。`, "使用可靠配方，记录原料来源、重量、温度和开始时间。"] },
        { title: "发酵观察", items: ["按工艺维持覆盖、排气、搅拌或压实，减少杂菌污染。", "记录气味、颜色、气泡、表面状态和温度变化。"] },
        { title: "熟成与保存", items: ["达到工艺要求后再分装或转入低温保存。", "保留小样和批次标签，异常批次不与正常批次混合。"] },
      ],
      cautions: ["出现不符合该工艺的霉色、腐败气味、黏滑或不明污染时不要试吃。", "家庭发酵不能用经验替代食品安全控制，尤其是低盐、低酸和含蛋白原料。"],
    },
    food_brew: {
      parameters: [
        { label: "糖源/淀粉", value: "记录原料、糖度或投料比例" },
        { label: "发酵", value: "菌种、温度、时间与排气" },
        { label: "成品", value: "澄清、密封、储存与批次标注" },
      ],
      cycle: recurringCycle("酿造批次参考", "通常数周至数月", [
        { label: "备料", duration: "第 1 天" },
        { label: "主发酵", duration: "约数日至数周" },
        { label: "后发酵/熟成", duration: "约数周至数月" },
      ]),
      sections: [
        { title: "准备", items: [`制作${name}前固定原料、菌种、容器和批次编号。`, "所有接触发酵液的工具都要彻底清洁，并按工艺消毒。"] },
        { title: "发酵管理", items: ["记录投料、温度、比重或糖度、气泡和气味变化。", "有产气阶段使用合适的排气装置，避免密闭容器压力累积。"] },
        { title: "熟成与保存", items: ["发酵稳定后再转移或装瓶，减少沉淀和氧化。", "标注酒精饮品、日期和批次，避光并按工艺温度保存。"] },
      ],
      cautions: ["酿造与酒精生产、持有和分享应遵守当地法律。", "不明污染、异常压力或无法确认安全性的批次不要饮用。"],
    },
  };
}

function enTemplates(name: string): Record<string, PublicGuideContent> {
  const recurringCycle = (title: string, total: string, stages: PublicGuideStage[]): PublicGuideCycle => ({
    title,
    total,
    stages,
    note: "Timing varies with materials, temperature, species, and management. Use your observations as the final reference.",
  });
  const aquariumFocus: Record<string, string> = {
    Goldfish: "Goldfish produce a high waste load; prioritize effective volume, oxygen, and filter maintenance, and avoid incompatible fin-nipping tankmates.",
    Koi: "Koi grow large and live for years; plan long-term pond space, depth, filtration, and seasonal conditions.",
    Guppy: "Guppies reproduce quickly; plan sex ratio, juvenile capacity, and population control while avoiding abrupt water changes.",
    Betta: "Bettas need stable warm water and surface access; individual aggression varies, so mixed housing is never automatic.",
    "Neon tetra": "Neon tetras do best in a stable mature system and a suitable group; reduce temperature and chemistry swings during introduction and water changes.",
    "Native fish": "Identify native fish accurately and confirm legal source, seasonal temperature, and flow needs rather than treating all local fish alike.",
    "Marine fish": "Establish stable salinity, temperature, and mature filtration before stocking, with plans for quarantine, top-off, and outages.",
  };
  const crustaceanFocus: Record<string, string> = {
    "Neocaridina shrimp": "Neocaridina shrimp benefit from mature biofilm and stable water; guard intakes and avoid copper treatments.",
    "Crystal shrimp": "Crystal shrimp are more sensitive to change; stabilize hardness, pH, and temperature and adjust slowly.",
    Crayfish: "Crayfish climb, dig, and may injure tankmates; use a secure lid, separate hides, and cautious compatibility planning.",
    Crab: "Crabs differ widely in fresh, brackish, marine, and land-water needs; identify the exact species and prevent escape.",
  };
  const backyardFocus: Record<string, string> = {
    Chicken: "Chickens need a dry ventilated night shelter, perches, nesting areas, predator protection, and monitoring for wet litter and pecking injuries.",
    Duck: "Duck water access quickly wets the habitat, so separate drinking and drainage from a dry resting area.",
    Goose: "Geese need usable space and clean water plus management of territorial behavior, noise, fencing, and breeding season.",
    Rabbit: "Rabbits are sensitive to heat and damp conditions and need ventilation, dry footing, chew materials, and a continuous appropriate fibre source.",
    Quail: "Quail may flush upward when startled; provide a safe ceiling, dry bedding, and escape-proof gaps.",
    Sheep: "Sheep need consistent forage, clean water, dry footing, hoof checks, and protection from toxic plants.",
    Pig: "Pigs need strong fencing, shade and cooling, a dry resting area, enrichment, and deliberate water and manure management.",
    Cattle: "Cattle require substantial space, forage, water, fencing, and manure management; track rumination, appetite, gait, and condition.",
    Horse: "Horses need continuous appropriate forage, clean water, movement, hoof care, and safe fencing; diet changes must be gradual.",
  };

  const practicalAnimalTemplate = (
    parameters: PublicGuideParameter[],
    setup: string[],
    routine: string[],
    records: string[],
    cautions: string[],
  ): PublicGuideContent => ({
    parameters,
    sections: [
      { title: "Set up", items: setup },
      { title: "Routine care", items: routine },
      { title: "Record and adjust", items: records },
    ],
    cautions,
  });

  const aquariumAnimal = practicalAnimalTemplate(
    [
      { label: "Confirm", value: "Exact species, adult size, social behavior, diet" },
      { label: "Water", value: "Effective volume, temperature, oxygen, ammonia/nitrite, pH" },
      { label: "Equipment", value: "Mature filtration, circulation, aeration, outage plan" },
    ],
    [`Confirm adult size, chemistry, temperature, diet, and compatibility for ${name}.`, aquariumFocus[name] || "Plan around adult needs and system capacity, not juvenile size or nominal tank volume."],
    ["Stabilize filtration and oxygen before adding animals in stages; quarantine and acclimate new arrivals.", "Check breathing, movement, feeding, skin or scales, waste, and interactions every day."],
    ["Track water tests, equipment, feeding, behavior, and every recent change.", "When a problem appears, check water, filtration, and oxygen before stacking treatments."],
    ["Never release animals, eggs, larvae, or aquarium water into nature.", "Medication, salt, temperature, and mixed-species care must be verified for the exact species."],
  );

  const crustacean = practicalAnimalTemplate(
    [
      { label: "Environment", value: "Stable water, oxygen, hardness, shelters" },
      { label: "Key stages", value: "Introduction, molting, eggs, juveniles" },
      { label: "Protection", value: "Prevent predation, injury, intake suction, escape" },
    ],
    [`Prepare mature filtration and safe shelters for ${name}.`, crustaceanFocus[name] || "Confirm fresh, brackish, or marine water, hardness, substrate, and compatibility."],
    ["Feed modest portions and remove waste; watch color, activity, feeding, and molts.", "Reduce disturbance around molts and maintain several secure hides."],
    ["Track eggs, juveniles, survival, and system capacity.", "Inspect lids, gaps, overflows, and intakes for escape or suction risk."],
    ["Copper and some treatments can harm crustaceans; verify every product.", "Crayfish and some crabs may injure tankmates or damage the setup."],
  );

  const molluskAquatic = practicalAnimalTemplate(
    [
      { label: "Water type", value: "Species-specific fresh, brackish, or marine water" },
      { label: "Shell", value: "Hardness, calcium, erosion, damage" },
      { label: "Population", value: "Food, breeding, and system capacity" },
    ],
    [`Confirm habitat, adult size, diet, temperature, and breeding for ${name}.`, "For filter feeders, confirm the system can provide suitable food rather than relying on visible algae."],
    ["Track movement, attachment, feeding, shell condition, deaths, and water quality.", "Control leftover food and organics; remove dead animals promptly."],
    ["Record eggs or juveniles and adjust feeding and filtration as numbers change.", "Check lids, waterline, and plumbing because some species leave the water."],
    ["Do not release aquarium mollusks, eggs, or water into nature.", "Collection, food use, and transport may be regulated or carry parasite risk."],
  );

  const molluskLand = practicalAnimalTemplate(
    [
      { label: "Habitat", value: "Ventilation, moisture, temperature, shelter, escape control" },
      { label: "Food", value: "Species-appropriate diet and safe calcium" },
      { label: "Observe", value: "Activity, feeding, mucus, shell or body" },
    ],
    [`Decide whether ${name} is a study subject, a kept animal, or a crop pest before intervening.`, "Record location, timing, moisture, food source, and abundance."],
    ["Keep the habitat humid but ventilated, with shelters and a cleanable substrate.", "Offer small suitable portions and remove spoiled food and waste."],
    ["Track eggs and juveniles before the enclosure exceeds capacity.", "In crops, start with habitat cleanup, traps, and barriers rather than broad treatment."],
    ["Wash hands after contact and avoid touching the face.", "Never release or relocate unknown or non-native species."],
  );

  const amphibian = practicalAnimalTemplate(
    [
      { label: "Confirm", value: "Exact species, life stage, conservation status" },
      { label: "Habitat", value: "Land-water balance, temperature, humidity, water quality" },
      { label: "Observe", value: "Skin, posture, feeding, waste, metamorphosis" },
    ],
    [`Match water, land, climbing, and hiding zones to the life history of ${name}.`, "Use non-irritating, cleanable materials and stabilize water, humidity, and day-night rhythm."],
    ["Feed appropriate, traceable prey for the species and stage; track refusal and body condition.", "Clean in sections and keep soap, disinfectant residue, pesticides, and skin products away."],
    ["Track calls, eggs, metamorphosis, shedding, activity, and weather.", "Prefer in-place observation for wildlife; do not move animals between watersheds."],
    ["Amphibian skin is sensitive to water quality and residues.", "Follow local rules for protected species, collection, and relocation."],
  );

  const reptile = practicalAnimalTemplate(
    [
      { label: "Required", value: "Exact species, adult size, diet, legal source" },
      { label: "Habitat", value: "Thermal gradient, light, humidity, water, hides" },
      { label: "Track", value: "Feeding, waste, weight, shedding, behavior" },
    ],
    [`Build heat and cool zones, hides, usable space, and a secure lid for the exact ${name} species.`, "Where required, install suitable ultraviolet lighting and record distance and replacement date."],
    ["Check temperature, humidity, water, behavior, waste, and equipment every day.", "Use a species-appropriate varied diet rather than one food as a complete substitute."],
    ["Track shedding, retained skin, weight, feeding, and behavior.", "Adjust husbandry first and contact an experienced exotic-animal veterinarian for persistent problems."],
    ["Turtles, snakes, and lizards cannot share one temperature, light, or diet formula.", "Source, transport, keeping, and release may be regulated."],
  );

  const insect = practicalAnimalTemplate(
    [
      { label: "Identify", value: "Reliable group or species and life stage" },
      { label: "Resource", value: "Host plant, nectar, detritus, or defined feed" },
      { label: "Habitat", value: "Temperature, humidity, ventilation, photoperiod, escape control" },
    ],
    [`Record the source, stage, host or feed, temperature, humidity, and date for ${name}.`, "Leave room for pupation, emergence, molts, or breeding."],
    ["Remove moldy feed and overly wet material while retaining the required humidity.", "Track eggs, larvae, pupae or molts, adults, deaths, and escape points."],
    ["For garden observation, record host plants, predators, weather, and pesticide use together.", "Confirm capacity and local rules before breeding; do not release non-native stock."],
    ["Some bees, caterpillars, and beetles sting, irritate, or trigger allergy.", "Broad pesticides affect target and beneficial insects alike."],
  );

  const arachnid = practicalAnimalTemplate(
    [
      { label: "Identify", value: "Spider or mite group, source, and risk" },
      { label: "Habitat", value: "Structure, ventilation, moisture, escape control" },
      { label: "Observe", value: "Webs, prey or host, molts, spread, damage" },
    ],
    [`Record where and when ${name} appears, plus web, prey or host, and conditions.`, "Keep distance and avoid bare-hand capture when identification is uncertain."],
    ["Match kept spiders to arboreal, burrowing, or terrestrial needs.", "For mites, identify pest, predator, or decomposer before choosing control."],
    ["Track molts, feeding, body condition, spread, damage, and recent humidity changes.", "Isolate affected plants and clean tools before targeted treatment."],
    ["Do not touch unknown or potentially venomous or allergenic animals.", "Broad miticides can also remove predatory mites and other beneficial arthropods."],
  );

  const bird = practicalAnimalTemplate(
    [
      { label: "Context", value: "Separate field observation, rescue, and captive care" },
      { label: "Habitat", value: "Space, perches, light, air, water, hygiene" },
      { label: "Observe", value: "Feeding, plumage, voice, flight, waste, breeding" },
    ],
    [`Confirm whether ${name} is a wild visitor or a legally sourced kept bird.`, "For wildlife, record time, number, food, water, and nesting without moving nests or young."],
    ["Provide enough usable space, clean water, ventilation, and protection from kitchen fumes.", "Use a varied species-appropriate diet rather than seed or processed human food alone."],
    ["Track appetite, waste, feathers, movement, and behavior every day.", "Quarantine newcomers; seek professional rescue or veterinary help for persistent distress or injury."],
    ["Wild birds, nests, eggs, and migratory species may be protected.", "Feeding can cause crowding, contamination, and nutritional imbalance."],
  );

  const backyardAnimal = practicalAnimalTemplate(
    [
      { label: "Basics", value: "Species, number, age, source, long-term space" },
      { label: "Daily", value: "Water, feed, behavior, gait, waste, condition" },
      { label: "Habitat", value: "Air, shelter, bedding, manure, escape, predators" },
    ],
    [`Prepare lifetime space, budget, carers, isolation, and normal-behavior areas for ${name}.`, backyardFocus[name] || "Confirm local rules for keeping, registration, disease control, noise, and manure."],
    ["Provide clean water and feed matched to species and life stage; change diets gradually.", "Observe every individual daily and isolate animals showing illness or injury."],
    ["Track body condition, feed, cleaning, preventive care, breeding, repairs, and exceptions.", "Adjust shade, ventilation, bedding, drainage, and predator protection by season."],
    ["Chickens, rabbits, cattle, and pigs have very different space, feed, and preventive-care needs.", "Do not improvise prescription medicines or withdrawal periods; welfare and public health come first."],
  );

  return {
    generic: {
      parameters: [
        { label: "Scope", value: "Confirm for the specific project" },
        { label: "Starting principle", value: "Test at small scale, then adjust" },
        { label: "Track", value: "Setup, changes, results, and exceptions" },
      ],
      sections: [
        { title: "Before starting", items: ["Define the setting, goal, and maintainable scale.", "Record baseline conditions so later changes can be compared."] },
        { title: "Implement and observe", items: ["Change only a few important variables at a time.", "Record results consistently before expanding or revising the setup."] },
      ],
      cautions: ["This is a general framework. Food, animals, structural safety, and local regulations may require stricter professional guidance."],
    },
    soil_improvement: {
      parameters: [
        { label: "Diagnose first", value: "Texture, drainage, compaction, pH, and organic matter" },
        { label: "Approach", value: "Organic matter, mulch, drainage, or structural change" },
        { label: "Review", value: "Recheck across seasons" },
      ],
      sections: [
        { title: "Diagnose the soil", items: ["Observe ponding after rain, cracking after drying, root growth, and odor.", "Separate structure, fertility, pH, and salinity problems before choosing an amendment."] },
        { title: "Improve in stages", items: ["Test a small area before adding mature organic matter or changing drainage.", "Keep soil covered to reduce erosion, overheating, and moisture swings."] },
        { title: "Keep records", items: ["Track material, amount, date, plant response, and soil changes.", "Judge results over one or more seasons rather than expecting a one-time fix."] },
      ],
      cautions: ["Do not bury large amounts of unfinished material in the root zone.", "Use lime, sulfur, and high-salt fertilizers only with test results and crop needs in mind."],
    },
    compost: {
      parameters: [
        { label: "Materials", value: "Balance carbon-rich dry and nitrogen-rich moist inputs" },
        { label: "Condition", value: "Moist but not dripping, with airflow" },
        { label: "Maturity", value: "Cool, earthy smelling, original inputs hard to identify" },
      ],
      cycle: recurringCycle("One compost batch", "Usually several weeks to several months", [
        { label: "Build", duration: "Day 1" },
        { label: "Active breakdown", duration: "About 1–3 weeks" },
        { label: "Curing", duration: "About 1–3 months" },
      ]),
      sections: [
        { title: "Build the pile", items: ["Cut large materials and mix dry and moist inputs.", "Retain moisture while leaving channels for air."] },
        { title: "Manage the process", items: ["Add a little water when dry; add dry material and turn when wet or odorous.", "Track temperature, odor, moisture, and turning dates."] },
        { title: "Use", items: ["Let compost mature fully before using it near seedlings or roots.", "Test a new recipe at small scale and watch plant response."] },
      ],
      cautions: ["Keep diseased plants, unknown chemical residues, and hazardous waste out of home compost.", "Manage food-scrap compost to prevent leachate, odor, and animal access."],
    },
    facility_structure: {
      parameters: [
        { label: "Site", value: "Light, load, access, and drainage" },
        { label: "Dimensions", value: "Reachable and maintainable" },
        { label: "Materials", value: "Weather-resistant, low-contamination, replaceable" },
      ],
      sections: [
        { title: "Plan", items: [`Define which crops, location, and frequency the ${name} must support.`, "Leave room for watering, drainage, cleaning, pruning, and transport."] },
        { title: "Install", items: ["Confirm floor or wall capacity and prevent tipping.", "Make wet and soil-contact areas drainable, inspectable, and replaceable."] },
        { title: "Maintain", items: ["Seasonally check looseness, rust, cracks, ponding, and unwanted shade.", "Record dimensions, materials, cost, and revisions for reuse."] },
      ],
      cautions: ["Confirm load and fall risks for balconies, roofs, walls, and raised structures.", "Avoid sharp edges, trapping gaps, and unstable elements where children or animals can reach."],
    },
    facility_climate: {
      parameters: [
        { label: "Monitor", value: "Temperature, humidity, light, and ventilation" },
        { label: "Safety", value: "Wind resistance, drainage, anchoring, emergency opening" },
        { label: "Management", value: "Check daytime and nighttime separately" },
      ],
      sections: [
        { title: "Choose and position", items: [`Match the ${name} covering, openings, and height to the seasonal goal.`, "Do not trade all ventilation for heat retention or create long-term low light."] },
        { title: "Operate", items: ["Compare temperature and humidity at several positions and times.", "Adjust ventilation, shade, insulation, and watering one step at a time."] },
        { title: "Seasonal checks", items: ["Before wind, rain, snow, or heat, inspect anchors, drainage, and opening mechanisms.", "Clean coverings and repair damage during idle periods."] },
      ],
      cautions: ["Enclosures can heat rapidly; outdoor temperature alone is not enough.", "Large or load-bearing structures must meet local building, fire, and property rules."],
    },
    facility_water: {
      parameters: [
        { label: "Demand", value: "Source, peak use, and storage volume" },
        { label: "Critical points", value: "Filtration, overflow, drain-down, backflow protection" },
        { label: "Maintenance", value: "Leak checks, sediment removal, flushing" },
      ],
      sections: [
        { title: "Map the water path", items: [`Draw the ${name} intake, storage, use, overflow, and drain-down path.`, "Keep valves, filters, and clog-prone points directly accessible."] },
        { title: "Install and test", items: ["Start with low pressure and short runs, checking each section for leaks and flow.", "Direct overflow away from foundations, neighbors, and electrical equipment."] },
        { title: "Record and maintain", items: ["Track water use, level, pressure, filter condition, and faults.", "Drain, freeze-protect, and clean before seasonal shutdown."] },
      ],
      cautions: ["Protect storage and open water from falls and mosquito breeding.", "Water for drinking, food, or animals must meet the relevant hygiene standard; appearance is not enough."],
    },
    facility_animal: {
      parameters: [
        { label: "Basics", value: "Space, ventilation, dryness, shelter, and water" },
        { label: "Protection", value: "Escape, predators, and isolation" },
        { label: "Cleaning", value: "Manage manure, bedding, feeders, and drainage" },
      ],
      sections: [
        { title: "Layout", items: [`Design the ${name} for species, number, and behavior, not only a legal minimum.`, "Consider separate resting, drinking, feeding, activity, nesting, and hiding areas."] },
        { title: "Daily checks", items: ["Check water, feed, waste, behavior, and damage every day.", "Prepare isolation space; do not mix new or sick animals immediately."] },
        { title: "Environment", items: ["Ventilate without direct drafts and replace wet bedding promptly.", "Track cleaning, disinfection, repairs, symptoms, and animal changes."] },
      ],
      cautions: ["Follow local rules for stocking, welfare, disease control, and manure disposal.", "Barriers must account for squeezing, climbing, chewing, and predator entry."],
    },
    method_skill: {
      parameters: [
        { label: "Goal", value: "Propagation, soil protection, water saving, or lower disturbance" },
        { label: "Conditions", value: "Species, season, materials, and site" },
        { label: "Validation", value: "Test a small batch and track survival and maintenance" },
      ],
      sections: [
        { title: "Choose the method", items: [`Define the problem that ${name} should solve and the acceptable cost of failure.`, "Include time, tools, materials, and follow-up care in the plan."] },
        { title: "Implement in stages", items: ["Test on a small group, keep a comparison, and record date, weather, and exact steps.", "Change one important step at a time so results remain comparable."] },
        { title: "Review and scale", items: ["Track survival, yield, soil or ecological change, and extra maintenance time.", "Scale only after several batches show stable results."] },
      ],
      cautions: ["Use clean tools and protect cuts for grafting, layering, and cuttings. No-till and natural methods still need active observation.", "Follow safety and local requirements when machinery, chemicals, or public land is involved."],
    },
    aquatic_plant: {
      parameters: [
        { label: "Light", value: "Acclimate gradually for the species" },
        { label: "Water temperature", value: "Confirm the species range first" },
        { label: "Water chemistry", value: "Prioritize stability; monitor pH, hardness, and nutrients" },
        { label: "Substrate & nutrition", value: "Treat rooted and epiphytic plants differently" },
      ],
      cycle: recurringCycle("Establishment reference", "About 1–3 months to stable observation", [
        { label: "Acclimation", duration: "About 7–21 days" },
        { label: "New roots and leaves", duration: "About 2–6 weeks" },
        { label: "Stable growth", duration: "About 1–3 months" },
      ]),
      sections: [
        { title: "Plant", items: ["Identify submerged, floating-leaved, emergent, or epiphytic growth before choosing depth and anchoring.", "Remove decayed tissue and begin with moderate spacing."] },
        { title: "Light, water, nutrition", items: ["Start at lower light and adjust after observing new growth and algae.", "Keep temperature and chemistry stable; change fertilizer, carbon dioxide, or water schedule one variable at a time."] },
        { title: "Prune and record", items: ["Track melt, new shoots, roots, algae, and recovery after pruning.", "Thin in stages and remove decaying leaves promptly."] },
      ],
      cautions: ["Aquatic-plant needs vary widely; one light, temperature, and fertilizer recipe cannot fit every species.", "Never release non-native plants or trimmings into natural water."],
    },
    aquatic_animal: {
      parameters: [
        { label: "Confirm first", value: "Species, adult size, social behavior, compatibility" },
        { label: "Water", value: "Temperature, oxygen, ammonia/nitrite, and pH" },
        { label: "System", value: "Effective volume, filtration, circulation, outage plan" },
      ],
      cycle: recurringCycle("Introduction reference", "Stabilize the system before adding biomass gradually", [
        { label: "Empty-system test", duration: "At least several days" },
        { label: "Quarantine", duration: "Based on species and source" },
        { label: "Gradual introduction", duration: "In stages" },
      ]),
      sections: [
        { title: "Species and environment", items: [`Confirm adult size, temperature, chemistry, diet, and social needs for ${name}.`, "Plan for adults and system capacity, not juvenile size."] },
        { title: "Establish the system", items: ["Run filtration and circulation until oxygen and nitrogen-waste handling are stable.", "Quarantine new animals and acclimate them gradually to temperature and chemistry."] },
        { title: "Track", items: ["Record water tests, feeding, waste, behavior, molts, and breeding.", "When problems appear, check water, equipment, and recent changes before stacking treatments."] },
      ],
      cautions: ["Never release animals, eggs, larvae, or aquarium water into nature.", "Medication, salinity, and temperature treatments must be checked for the exact species."],
    },
    aquarium_animal: aquariumAnimal,
    crustacean,
    mollusk_aquatic: molluskAquatic,
    mollusk_land: molluskLand,
    amphibian,
    reptile,
    insect,
    arachnid,
    bird,
    backyard_animal: backyardAnimal,
    habitat_animal: {
      parameters: [
        { label: "Subject", value: "Identify before deciding whether to observe or care" },
        { label: "Habitat", value: "Temperature, moisture, light, shelter, food, and water" },
        { label: "Record", value: "Time, place, number, behavior, and environment" },
      ],
      sections: [
        { title: "Identify and set boundaries", items: [`Record the appearance, behavior, and setting of ${name}; avoid conclusions from one photo.`, "Prefer observation in place rather than capture, relocation, feeding, or intervention."] },
        { title: "Support habitat", items: ["Retain water, leaf litter, native plants, shelter, and connected corridors.", "Reduce broad-spectrum pesticides, harsh lighting, and repeated disturbance."] },
        { title: "Observe over time", items: ["Record counts, activity, breeding, or migration on a fixed route and schedule.", "Track weather, plant phenology, and management actions alongside wildlife observations."] },
      ],
      cautions: ["Keep distance from wildlife, protected species, and potentially venomous or aggressive animals, and follow local rules.", "Do not touch, eat, or relocate an organism you cannot identify reliably."],
    },
    food_preserve: {
      parameters: [
        { label: "Ingredients", value: "Fresh, sound, and traceable" },
        { label: "Controls", value: "Hygiene, ratio, acidity/salt/sugar, temperature, time" },
        { label: "Batch record", value: "Date, weight, recipe, container, storage" },
      ],
      cycle: recurringCycle("One batch", "Depends on the recipe and preservation method", [
        { label: "Prepare", duration: "Same day" },
        { label: "Process", duration: "Per method" },
        { label: "Cool or rest", duration: "Per recipe" },
        { label: "Storage checks", duration: "Ongoing" },
      ]),
      sections: [
        { title: "Recipe and preparation", items: [`Fix ingredient weight, container volume, and a reliable recipe before making ${name}.`, "Clean hands, tools, and containers; discard moldy, spoiled, or unknown ingredients."] },
        { title: "Control the process", items: ["Follow validated time, temperature, acidity, salt, or sugar controls rather than reducing critical amounts by taste.", "Prevent recontamination during portioning, cooling, and sealing."] },
        { title: "Store and record", items: ["Label production, batch, opening date, and storage method.", "Discard items with swelling, leaks, mold, unusual odor, or texture."] },
      ],
      cautions: ["Low-acid canning, vacuum sealing, and long room-temperature storage can carry severe food-safety risks and require validated processes.", "Smell or taste alone cannot establish safety."],
    },
    food_ferment: {
      parameters: [
        { label: "Ingredients & culture", value: "Known source and defined recipe" },
        { label: "Process", value: "Salt/acidity, temperature, time, and gas" },
        { label: "Track", value: "Batch, weight, conditions, aroma, surface" },
      ],
      cycle: recurringCycle("Fermentation batch", "Days to months, depending on the process", [
        { label: "Prepare/inoculate", duration: "Day 1" },
        { label: "Active fermentation", duration: "Days to weeks" },
        { label: "Maturation", duration: "Weeks to months" },
      ]),
      sections: [
        { title: "Create the batch", items: [`Fix ingredients, salt or culture ratio, and vessel for ${name}.`, "Use a reliable method and record sources, weights, temperature, and start time."] },
        { title: "Observe fermentation", items: ["Maintain submersion, venting, stirring, or pressing as the method requires.", "Track aroma, color, bubbles, surface, and temperature."] },
        { title: "Mature and store", items: ["Package or chill only when the process requirements are met.", "Keep labels and a batch sample; never blend a questionable batch into a good one."] },
      ],
      cautions: ["Do not taste a batch with unexpected mold colors, putrid odor, slime, or unknown contamination.", "Experience cannot replace food-safety controls, especially for low-salt, low-acid, or protein-rich foods."],
    },
    food_brew: {
      parameters: [
        { label: "Sugar/starch", value: "Record ingredient and sugar or loading ratio" },
        { label: "Fermentation", value: "Culture, temperature, time, and venting" },
        { label: "Finished batch", value: "Clarify, seal, store, and label" },
      ],
      cycle: recurringCycle("Brewing batch", "Usually weeks to months", [
        { label: "Prepare", duration: "Day 1" },
        { label: "Primary fermentation", duration: "Days to weeks" },
        { label: "Secondary/maturation", duration: "Weeks to months" },
      ]),
      sections: [
        { title: "Prepare", items: [`Fix ingredients, culture, vessel, and batch ID before making ${name}.`, "Thoroughly clean and appropriately sanitize every tool touching the liquid."] },
        { title: "Manage fermentation", items: ["Record additions, temperature, gravity or sugar, bubbles, and aroma.", "Use suitable venting during gas production to prevent pressure buildup."] },
        { title: "Mature and store", items: ["Transfer or bottle only after fermentation stabilizes, limiting sediment and oxygen.", "Label alcohol, date, and batch; store dark at the method's required temperature."] },
      ],
      cautions: ["Follow local law for producing, possessing, and sharing alcohol.", "Do not drink a batch with unknown contamination, unsafe pressure, or uncertain process control."],
    },
  };
}

function getTemplate(
  key: string | null | undefined,
  name: string,
  language: PublicGuideLanguage,
) {
  const templates = language === "en" ? enTemplates(name) : zhTemplates(name);
  return templates[key || "generic"] || templates.generic;
}

export function buildPublicGuideContent(
  entry: PublicGuideEntry,
  language: PublicGuideLanguage,
): PublicGuideContent {
  const name = getPublicGuideName(entry, language);
  const template = getPracticalGuideContent(entry, language) || getTemplate(entry.content_template, name, language);
  const raw = parseGuideContent(language === "en" ? entry.content_en : entry.content);
  const traits = getPublicGuideFilterTraits(entry);
  const copy = publicGuideCopy[language];
  const temperatureReference = getAquaticTemperatureReference(entry);
  const aquaticPlantParameters: PublicGuideParameter[] =
    entry.content_template === "aquatic_plant"
      ? (Object.keys(traits) as PublicGuideFilterKey[])
          .map((key) => ({
            label: key === "temperature" ? copy.referenceTemperature : copy[key],
            value: key === "temperature" ? getPublicGuideTemperatureLabel(entry, language) : getPublicGuideFilterLabel(key, traits[key], language),
            ...(key === "temperature" && temperatureReference ? { note: copy.temperatureReferenceNote } : {}),
          }))
          .filter((item) => item.value)
      : [];
  const templateParameters = aquaticPlantParameters.length
    ? [
        ...aquaticPlantParameters,
        ...template.parameters.filter(
          (item) => item.label !== copy.light && item.label !== copy.temperature,
        ),
      ]
    : template.parameters;

  return {
    overview: raw.overview || (raw.sections?.length ? getPublicGuideSummary(entry, language) : template.overview),
    parameters: raw.parameters?.length ? raw.parameters : templateParameters,
    cycle: raw.cycle || template.cycle || null,
    sections: raw.sections?.length ? raw.sections : template.sections,
    cautions: raw.cautions?.length ? raw.cautions : [
      ...template.cautions,
      ...(temperatureReference && !raw.sections?.length ? [language === "en"
        ? `Temperature reference: ${temperatureReference.species}, ${temperatureReference.min}–${temperatureReference.max}°C. This is a published range, not an ideal setpoint or permission for sudden temperature changes; other species sold under this common name may differ.`
        : `水温参考品种：${temperatureReference.species}，${temperatureReference.min}–${temperatureReference.max}℃。这是资料所列范围，并非整段都是最适温度；同名水草可能不是同一品种，不要据此骤升骤降水温。`] : []),
    ],
    // Do not attribute administrator-written replacement content to the
    // editorial fallback's references.
    sources: raw.sources?.length ? raw.sources : raw.sections?.length ? [] : [
      ...(template.sources || []),
      ...(temperatureReference?.source ? [temperatureReference.source] : []),
    ],
  };
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
