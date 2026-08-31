import { getArchiveCategoryLabel, type ArchiveCategory } from "./archive-categories";
import type { PublicGuideEntry, PublicGuideSection } from "./public-guide-library";

export type DirectoryPlant = {
  id: string;
  slug?: string | null;
  common_name?: string | null;
  scientific_name?: string | null;
  family?: string | null;
  category?: string | null;
  sub_category?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
};

export type GuideDirectoryMatch =
  | { kind: "plant"; key: string; category: "plant"; plant: DirectoryPlant }
  | { kind: "guide"; key: string; category: ArchiveCategory; entry: PublicGuideEntry };

/** Do not mistake PostgREST's per-request row cap for the whole catalogue. */
export async function loadGuideDirectoryRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) return { data: rows, error: result.error };
    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

function nameScore(values: unknown[], query: string) {
  return values.reduce<number>((best, value) => {
    const name = normalize(value);
    const score = name === query ? 4 : name.startsWith(query) ? 3 : name.includes(query) ? 2 : 0;
    return Math.max(best, score);
  }, 0);
}

/** Search public catalogues together; browsing filters must not exclude hits. */
export function searchGuideDirectory({
  query,
  plants,
  aliases,
  entries,
  sections,
}: {
  query: string;
  plants: DirectoryPlant[];
  aliases: Record<string, string[]>;
  entries: PublicGuideEntry[];
  sections: PublicGuideSection[];
}): GuideDirectoryMatch[] {
  const keyword = normalize(query);
  if (!keyword) return [];
  const matches: Array<{ match: GuideDirectoryMatch; score: number; order: number }> = [];
  const sectionMap = new Map(sections.map((section) => [section.id, section]));
  const seen = new Set<string>();
  const plantsByName = new Map<string, DirectoryPlant[]>();
  for (const plant of plants) {
    for (const name of [plant.common_name, plant.scientific_name]) {
      const key = normalize(name);
      if (key) plantsByName.set(key, [...(plantsByName.get(key) || []), plant]);
    }
  }
  const mirrorNames = new Map<string, string[]>();
  const mirroredEntries = new Set<string>();
  for (const entry of entries) {
    if (entry.category !== "plant" || entry.is_active === false) continue;
    const linkedPlants = plantsByName.get(normalize(entry.name));
    if (!linkedPlants?.length) continue;
    mirroredEntries.add(entry.id);
    for (const plant of linkedPlants) {
      mirrorNames.set(plant.id, [...(mirrorNames.get(plant.id) || []), entry.name, entry.name_en || ""]);
    }
  }

  for (const plant of plants) {
    const key = `plant:${plant.id}`;
    if (plant.is_active === false || seen.has(key)) continue;
    seen.add(key);
    const score = nameScore([plant.common_name, plant.scientific_name, ...(aliases[plant.id] || []), ...(mirrorNames.get(plant.id) || [])], keyword)
      || ([plant.family, plant.slug, plant.category, plant.sub_category, "种植", "Plants"].some((value) => normalize(value).includes(keyword)) ? 1 : 0);
    if (score) matches.push({ match: { kind: "plant", key, category: "plant", plant }, score, order: plant.sort_order ?? Number.MAX_SAFE_INTEGER });
  }

  for (const entry of entries) {
    const key = `guide:${entry.id}`;
    // A mirror enriches the plant's names, without duplicating its card or route.
    // Approved plant guides with no species row remain valid public results.
    if (mirroredEntries.has(entry.id) || entry.is_active === false || seen.has(key)) continue;
    seen.add(key);
    const section = entry.section_id ? sectionMap.get(entry.section_id) : undefined;
    const score = nameScore([entry.name, entry.name_en], keyword)
      || ([entry.summary, entry.summary_en, section?.name, section?.name_en,
        getArchiveCategoryLabel(entry.category, "zh"), getArchiveCategoryLabel(entry.category, "en")]
        .some((value) => normalize(value).includes(keyword)) ? 1 : 0);
    if (score) matches.push({ match: { kind: "guide", key, category: entry.category, entry }, score, order: entry.sort_order ?? Number.MAX_SAFE_INTEGER });
  }

  return matches.sort((a, b) => b.score - a.score || a.order - b.order).map(({ match }) => match);
}
