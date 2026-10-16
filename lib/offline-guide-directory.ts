import { getDefaultSystemNames, type ArchiveCategory } from "@/lib/archive-categories";
import type { PlantParameterLite } from "@/lib/plant-env";
import type { SystemNameCandidate } from "@/lib/system-name-candidates";

const KEY = "lifespace:guide-directory:v2";
const LEGACY_KEY = "lifespace:guide-directory:v1";
const MAX_DIRECTORY_ROWS = 15_000;
const PUBLIC_SOURCES = new Set(["builtin", "plant_species", "public_guide"]);
const CATEGORIES = new Set<ArchiveCategory>([
  "plant",
  "system",
  "insect_fish",
  "other",
]);

export type OfflineGuideLanguage = "zh" | "en";

export type OfflineGuideParameter = {
  label: string;
  value: string;
  note?: string;
};

export type OfflineGuideCoreParameters = Pick<
  PlantParameterLite,
  | "sun_score"
  | "need_trellis"
  | "container_friendly_score"
  | "indoor_friendly_score"
  | "balcony_friendly_score"
>;

export type OfflineGuideDirectoryEntry = SystemNameCandidate & {
  nameEn?: string;
  overviewZh?: string;
  overviewEn?: string;
  parametersZh?: OfflineGuideParameter[];
  parametersEn?: OfflineGuideParameter[];
  plantCoreParameters?: OfflineGuideCoreParameters;
};

// Names only: no generated species identifiers or unverified growing advice.
const PLANTS = "一品红 茶花 蓝莓 番茄 黄瓜 南瓜 丝瓜 冬瓜 苦瓜 辣椒 茄子 玉米 豌豆 蚕豆 毛豆 豇豆 四季豆 生菜 菠菜 油菜 苋菜 小白菜 萝卜 胡萝卜 土豆 红薯 葱 大蒜 韭菜 芦笋 香菜 罗勒 薄荷 草莓 葡萄 猕猴桃 无花果 石榴 杨梅 金桔 柠檬 月季 绣球 杜鹃 茉莉".split(" ");

export const BUNDLED_GUIDE_DIRECTORY: OfflineGuideDirectoryEntry[] = [
  ...PLANTS.map((label) => ({
    label,
    source: "builtin" as const,
    category: "plant" as const,
  })),
  ...(["system", "insect_fish", "other"] as ArchiveCategory[]).flatMap(
    (category) =>
      getDefaultSystemNames(category).map((label) => ({
        label,
        category,
        source: "builtin" as const,
      })),
  ),
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function cleanAliases(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const aliases = Array.from(
    new Set(value.map((item) => cleanText(item, 160)).filter(Boolean)),
  ).slice(0, 20) as string[];
  return aliases.length ? aliases : undefined;
}

function clean(rows: unknown, legacy = false): OfflineGuideDirectoryEntry[] {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, MAX_DIRECTORY_ROWS).flatMap((row) => {
    if (!isRecord(row)) return [];
    const label = cleanText(row.label, 160);
    if (
      !label ||
      !PUBLIC_SOURCES.has(String(row.source || "")) ||
      !CATEGORIES.has(row.category as ArchiveCategory)
    ) {
      return [];
    }

    const aliases = cleanAliases(row.aliases);
    const description = cleanText(row.description, 400);
    const nameEn = cleanText(row.nameEn, 160);
    // The old plant-species overview came from the basic care summary. Other
    // old overviews came from the member-capable client generator.
    const keepOverview = !legacy || row.source === "plant_species";
    const overviewZh = keepOverview ? cleanText(row.overviewZh, 2_000) : undefined;
    const overviewEn = keepOverview ? cleanText(row.overviewEn, 2_000) : undefined;

    return [
      {
        label,
        category: row.category as ArchiveCategory,
        source: row.source as OfflineGuideDirectoryEntry["source"],
        id: cleanText(row.id, 100),
        plantId: cleanText(row.plantId, 100),
        plantSlug: cleanText(row.plantSlug, 160),
        sectionName: cleanText(row.sectionName, 80),
        sectionNameEn: cleanText(row.sectionNameEn, 80),
        searchText: cleanText(row.searchText, 1_000),
        ...(aliases ? { aliases } : {}),
        ...(description ? { description } : {}),
        ...(nameEn ? { nameEn } : {}),
        ...(overviewZh ? { overviewZh } : {}),
        ...(overviewEn ? { overviewEn } : {}),
      },
    ];
  });
}

export function getOfflineGuideKey(
  entry: Pick<OfflineGuideDirectoryEntry, "category" | "label">,
) {
  return `${entry.category || "other"}:${entry.label.trim().toLowerCase()}`;
}

function mergeEntries(rows: OfflineGuideDirectoryEntry[]) {
  const entries = new Map<string, OfflineGuideDirectoryEntry>();
  rows.forEach((row) => {
    const key = getOfflineGuideKey(row);
    const previous = entries.get(key);
    if (!previous) {
      entries.set(key, row);
      return;
    }
    entries.set(key, {
      ...previous,
      ...Object.fromEntries(
        Object.entries(row).filter(([, value]) => value !== undefined),
      ),
      aliases: Array.from(
        new Set([...(previous.aliases || []), ...(row.aliases || [])]),
      ),
    } as OfflineGuideDirectoryEntry);
  });
  return Array.from(entries.values());
}

export function loadOfflineGuideDirectory(): OfflineGuideDirectoryEntry[] {
  let cached: OfflineGuideDirectoryEntry[] = [];
  try {
    if (typeof localStorage !== "undefined") {
      const current = localStorage.getItem(KEY);
      if (current !== null) {
        cached = clean(JSON.parse(current));
        localStorage.removeItem?.(LEGACY_KEY);
      } else {
        const previous = localStorage.getItem(LEGACY_KEY);
        if (previous !== null) {
          // Old members cached full parameters and generated overviews. Carry
          // names and lookup keys forward, then refresh basic summaries online.
          cached = clean(JSON.parse(previous), true);
          localStorage.setItem(KEY, JSON.stringify(cached));
          localStorage.removeItem?.(LEGACY_KEY);
        }
      }
    }
  } catch {
    // Use bundled names.
  }
  return mergeEntries([...BUNDLED_GUIDE_DIRECTORY, ...cached]);
}

export function findOfflineGuideEntry(rows: OfflineGuideDirectoryEntry[], key: string) {
  const normalized = decodeURIComponent(key).trim().toLocaleLowerCase();
  return rows.find((row) => [getOfflineGuideKey(row), row.id, row.plantId,
    row.plantSlug, row.label, row.nameEn, ...(row.aliases || [])]
    .some((value) => String(value || "").toLocaleLowerCase() === normalized));
}

export function rememberGuideDirectory(rows: readonly SystemNameCandidate[]) {
  try {
    if (typeof localStorage === "undefined") return;
    const merged = mergeEntries([
      ...loadOfflineGuideDirectory(),
      ...clean(rows),
    ]);
    const serialized = JSON.stringify(clean(merged));
    if (localStorage.getItem(KEY) === serialized) return;
    localStorage.setItem(KEY, serialized);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("lifespace-guide-directory-updated"));
  } catch {
    // Local recording does not depend on the guide cache.
  }
}

export function getOfflineGuideName(
  entry: OfflineGuideDirectoryEntry,
  language: OfflineGuideLanguage,
) {
  return language === "en" && entry.nameEn ? entry.nameEn : entry.label;
}

export function getOfflineGuideOverview(
  entry: OfflineGuideDirectoryEntry,
  language: OfflineGuideLanguage,
) {
  const exact = language === "en" ? entry.overviewEn : entry.overviewZh;
  if (exact) return exact;

  const name = getOfflineGuideName(entry, language);
  if (language === "en") {
    const messages: Record<ArchiveCategory, string> = {
      plant: `${name} does not yet have a cached species overview. Use the basic checks below as a general starting framework, then reconnect to refresh verified details.`,
      system: `${name} does not yet have a cached overview. Start by checking its purpose, scale, materials, and operating safety, then reconnect for verified details.`,
      insect_fish: `${name} does not yet have a cached overview. Start by checking habitat, capacity, compatibility, and observation needs, then reconnect for verified details.`,
      other: `${name} does not yet have a cached overview. Use the basic checks below as a general starting framework, then reconnect for verified details.`,
    };
    return messages[entry.category || "other"];
  }

  const messages: Record<ArchiveCategory, string> = {
    plant: `${name} 暂无已缓存的物种概要。可先按下方基础项做通用核对，联网后再刷新经核实的详细资料。`,
    system: `${name} 暂无已缓存的概要。可先核对用途、规模、材料与操作安全，联网后再刷新经核实的详细资料。`,
    insect_fish: `${name} 暂无已缓存的概要。可先核对生境、承载量、相容性与观察要求，联网后再刷新经核实的详细资料。`,
    other: `${name} 暂无已缓存的概要。可先按下方基础项做通用核对，联网后再刷新经核实的详细资料。`,
  };
  return messages[entry.category || "other"];
}

export function getOfflineGuideParameters(
  entry: OfflineGuideDirectoryEntry,
  language: OfflineGuideLanguage,
): OfflineGuideParameter[] {
  const generic: Record<ArchiveCategory, Record<OfflineGuideLanguage, OfflineGuideParameter[]>> = {
    plant: {
      zh: [
        { label: "光照", value: "以实际种类资料与现场光照为准" },
        { label: "栽培场景", value: "先核对地栽、盆栽或阳台条件" },
        { label: "室内", value: "先核对自然光、通风与可用空间" },
      ],
      en: [
        { label: "Light", value: "Check the exact species and actual site light" },
        { label: "Growing setting", value: "Confirm ground, container, or balcony conditions" },
        { label: "Indoors", value: "Check natural light, airflow, and available space" },
      ],
    },
    system: {
      zh: [
        { label: "用途", value: "先明确目标与适用场景" },
        { label: "规模", value: "按空间与维护能力确定" },
        { label: "安全", value: "核对材料、承载与操作要求" },
      ],
      en: [
        { label: "Purpose", value: "Define the goal and intended setting first" },
        { label: "Scale", value: "Match available space and maintenance capacity" },
        { label: "Safety", value: "Check materials, loads, and operating requirements" },
      ],
    },
    insect_fish: {
      zh: [
        { label: "生境", value: "先核对温度、空间与基础环境" },
        { label: "相容性", value: "确认物种、数量与混养关系" },
        { label: "观察", value: "建立稳定的状态与异常记录" },
      ],
      en: [
        { label: "Habitat", value: "Check temperature, space, and baseline conditions" },
        { label: "Compatibility", value: "Confirm species, stocking, and cohabitation" },
        { label: "Observation", value: "Keep consistent health and exception notes" },
      ],
    },
    other: {
      zh: [
        { label: "目标", value: "先明确用途与期望结果" },
        { label: "条件", value: "核对空间、材料与环境限制" },
        { label: "记录", value: "保留关键步骤与结果供复盘" },
      ],
      en: [
        { label: "Goal", value: "Define the purpose and expected outcome" },
        { label: "Conditions", value: "Check space, materials, and environmental limits" },
        { label: "Records", value: "Keep key steps and outcomes for review" },
      ],
    },
  };
  return generic[entry.category || "other"][language];
}
