import { getDefaultSystemNames, type ArchiveCategory } from "@/lib/archive-categories";
import type { SystemNameCandidate } from "@/lib/system-name-candidates";
const KEY = "lifespace:guide-directory:v1";
// Names only: no generated species identifiers or unverified growing advice.
const PLANTS = "一品红 茶花 蓝莓 番茄 黄瓜 南瓜 丝瓜 冬瓜 苦瓜 辣椒 茄子 玉米 豌豆 蚕豆 毛豆 豇豆 四季豆 生菜 菠菜 油菜 苋菜 小白菜 萝卜 胡萝卜 土豆 红薯 葱 大蒜 韭菜 芦笋 香菜 罗勒 薄荷 草莓 葡萄 猕猴桃 无花果 石榴 杨梅 金桔 柠檬 月季 绣球 杜鹃 茉莉".split(" ");
export const BUNDLED_GUIDE_DIRECTORY: SystemNameCandidate[] = [
  ...PLANTS.map((label) => ({ label, source: "builtin" as const, category: "plant" as const })),
  ...(["system", "insect_fish", "other"] as ArchiveCategory[]).flatMap((category) => getDefaultSystemNames(category).map((label) => ({ label, category, source: "builtin" as const }))),
];
function clean(rows: unknown): SystemNameCandidate[] {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 15000).flatMap((row) => {
    if (!row || !["builtin", "plant_species", "public_guide"].includes(row.source) || !["plant", "system", "insect_fish", "other"].includes(row.category) || typeof row.label !== "string" || !row.label.trim()) return [];
    return [{ label: row.label.trim().slice(0, 160), category: row.category, source: row.source,
      id: typeof row.id === "string" ? row.id.slice(0, 100) : undefined,
      plantId: typeof row.plantId === "string" ? row.plantId.slice(0, 100) : undefined,
      plantSlug: typeof row.plantSlug === "string" ? row.plantSlug.slice(0, 160) : undefined,
      aliases: Array.isArray(row.aliases) ? row.aliases.filter((v: unknown) => typeof v === "string").slice(0, 20) : [],
      description: typeof row.description === "string" ? row.description.slice(0, 400) : undefined,
      sectionName: typeof row.sectionName === "string" ? row.sectionName.slice(0, 80) : undefined,
    }];
  });
}
export function loadOfflineGuideDirectory(): SystemNameCandidate[] {
  let cached: SystemNameCandidate[] = [];
  try { if (typeof localStorage !== "undefined") cached = clean(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { /* Use bundled names. */ }
  return [...new Map([...BUNDLED_GUIDE_DIRECTORY, ...cached].map((row) => [`${row.category}:${row.label}`, row])).values()];
}
export function rememberGuideDirectory(rows: SystemNameCandidate[]) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify([...new Map([...loadOfflineGuideDirectory(), ...clean(rows)].map((row) => [`${row.category}:${row.label}`, row])).values()])); } catch { /* Local recording does not depend on the guide cache. */ }
}
