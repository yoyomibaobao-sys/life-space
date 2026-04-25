import { supabase } from "@/lib/supabase";
import { enrichDiscoverFeedItems } from "@/lib/discover-data";
import type { FeedItem, FilterMode } from "@/lib/discover-types";
import type { SearchCategory } from "@/lib/discover-search-types";
import { compareArchiveDisplayOrder } from "@/lib/discover-utils";
import { sanitizeOrSearchText } from "@/lib/discover-search-utils";
import type {
  PlantAliasIdRow,
  PlantI18nIdRow,
  ProfileLocationRow,
  RecordIdRow,
  SpeciesIdRow,
} from "@/lib/domain-types";

export type DiscoverCategoryFilter = FilterMode | SearchCategory;

export function applyDiscoverCategoryFilter<TQuery extends { eq: (...args: unknown[]) => TQuery }>(
  query: TQuery,
  category: DiscoverCategoryFilter
) {
  if (
    category === "plant" ||
    category === "system" ||
    category === "insect_fish" ||
    category === "other"
  ) {
    return query.eq("archive_category", category);
  }

  return query;
}

export function applyDiscoverHelpFilter<TQuery extends { eq: (...args: unknown[]) => TQuery }>(
  query: TQuery,
  helpOnly: boolean
) {
  return helpOnly ? query.eq("status_tag", "help") : query;
}

export async function fetchDiscoverFeedRange(options: {
  from: number;
  to: number;
  category: FilterMode;
}) {
  let query = supabase
    .from("discovery_feed_view")
    .select("*")
    .order("record_time", { ascending: false })
    .range(options.from, options.to);

  query = applyDiscoverCategoryFilter(query, options.category);
  query = applyDiscoverHelpFilter(query, options.category === "help");

  const { data, error } = await query;

  if (error) {
    console.error("discover load error:", error);
    return {
      items: [] as FeedItem[],
      hasError: true,
    };
  }

  const nextItems = (data || []) as FeedItem[];
  const enrichedItems = await enrichDiscoverFeedItems(nextItems);

  return {
    items: enrichedItems,
    hasError: false,
  };
}

export async function findSpeciesIdsByNameTerm(nameTerm: string) {
  const term = sanitizeOrSearchText(nameTerm);
  if (!term) return [] as string[];

  const ids = new Set<string>();

  const [speciesResult, i18nResult, aliasResult] = await Promise.all([
    supabase
      .from("plant_species")
      .select("id")
      .or(`common_name.ilike.%${term}%,scientific_name.ilike.%${term}%`)
      .limit(80),
    supabase
      .from("plant_species_i18n")
      .select("plant_id")
      .ilike("common_name", `%${term}%`)
      .limit(80),
    supabase
      .from("plant_species_aliases")
      .select("species_id")
      .or(`alias_name.ilike.%${term}%,normalized_name.ilike.%${term}%`)
      .limit(120),
  ]);

  if (speciesResult.error) {
    console.error("discover search species error:", speciesResult.error);
  }

  if (i18nResult.error) {
    console.error("discover search species i18n error:", i18nResult.error);
  }

  if (aliasResult.error) {
    console.error("discover search species aliases error:", aliasResult.error);
  }

  (speciesResult.data || []).forEach((row: SpeciesIdRow) => {
    if (row.id) ids.add(row.id);
  });

  (i18nResult.data || []).forEach((row: PlantI18nIdRow) => {
    if (row.plant_id) ids.add(row.plant_id);
  });

  (aliasResult.data || []).forEach((row: PlantAliasIdRow) => {
    if (row.species_id) ids.add(row.species_id);
  });

  return Array.from(ids);
}

export async function findRecordIdsByTagTerm(tagTerm: string) {
  const term = sanitizeOrSearchText(tagTerm);
  if (!term) return [] as string[];

  const { data, error } = await supabase
    .from("record_tags")
    .select("record_id")
    .ilike("tag", `%${term}%`)
    .neq("is_active", false)
    .limit(300);

  if (error) {
    console.error("discover search record tags error:", error);
    return [];
  }

  const ids = new Set<string>();

  (data || []).forEach((row: RecordIdRow) => {
    if (row.record_id) ids.add(row.record_id);
  });

  return Array.from(ids);
}

export async function resolveDiscoverRegionUserIds(regionTerm: string) {
  const cleanRegionTerm = regionTerm.trim();
  if (!cleanRegionTerm) return null as string[] | null;

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .ilike("location", `%${cleanRegionTerm}%`)
    .limit(200);

  if (profileError) {
    console.error("discover search profile error:", profileError);
  }

  return (profileRows || []).map((row: ProfileLocationRow) => row.id);
}

export function mergeDiscoverFeedItems(prev: FeedItem[], next: FeedItem[]) {
  const merged = [...prev, ...next];
  const map = new Map<string, FeedItem>();

  merged.forEach((item) => {
    map.set(item.record_id, item);
  });

  return Array.from(map.values()).sort(compareArchiveDisplayOrder);
}
