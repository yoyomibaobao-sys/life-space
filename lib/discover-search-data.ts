import { supabase } from "@/lib/supabase";
import { enrichDiscoverFeedItems } from "@/lib/discover-data";
import type { FeedItem } from "@/lib/discover-types";
import {
  SEARCH_BATCH_SIZE,
  type SearchFilters,
} from "@/lib/discover-search-types";
import { compareArchiveDisplayOrder } from "@/lib/discover-utils";
import { sanitizeOrSearchText } from "@/lib/discover-search-utils";
import { findUserIdsByRegionFilters } from "@/lib/region-shared";

type IdRow = { id?: string | null; plant_id?: string | null; species_id?: string | null; record_id?: string | null };

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

  if (speciesResult.error) console.error("discover search species error:", speciesResult.error);
  if (i18nResult.error) console.error("discover search species i18n error:", i18nResult.error);
  if (aliasResult.error) console.error("discover search species aliases error:", aliasResult.error);

  (speciesResult.data || []).forEach((row: IdRow) => row.id && ids.add(String(row.id)));
  (i18nResult.data || []).forEach((row: IdRow) => row.plant_id && ids.add(String(row.plant_id)));
  (aliasResult.data || []).forEach((row: IdRow) => row.species_id && ids.add(String(row.species_id)));

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
  (data || []).forEach((row: IdRow) => row.record_id && ids.add(String(row.record_id)));
  return Array.from(ids);
}

export async function fetchDiscoverSearchResults(filters: SearchFilters) {
  const nameTerm = sanitizeOrSearchText(filters.name);
  const tagTerm = sanitizeOrSearchText(filters.tag);
  const contentTerm = sanitizeOrSearchText(filters.content);

  const [matchedSpeciesIds, matchedTagRecordIds] = await Promise.all([
    nameTerm ? findSpeciesIdsByNameTerm(nameTerm) : Promise.resolve<string[]>([]),
    tagTerm ? findRecordIdsByTagTerm(tagTerm) : Promise.resolve<string[]>([]),
  ]);

  let userFilterIds: string[] | null = null;

  if (filters.countryCode || filters.countryName || filters.region || filters.city) {
    userFilterIds = await findUserIdsByRegionFilters(supabase, {
      countryCode: filters.countryCode,
      countryName: filters.countryName,
      regionName: filters.region,
      cityName: filters.city,
    });

    if (userFilterIds.length === 0) {
      return [] as FeedItem[];
    }
  }

  if (tagTerm && matchedTagRecordIds.length === 0) return [] as FeedItem[];

  let query = supabase
    .from("discovery_feed_view")
    .select("*")
    .order("record_time", { ascending: false })
    .limit(SEARCH_BATCH_SIZE);

  if (
    filters.category === "plant" ||
    filters.category === "system" ||
    filters.category === "insect_fish" ||
    filters.category === "other"
  ) {
    query = query.eq("archive_category", filters.category);
  }

  if (filters.helpOnly) query = query.eq("status_tag", "help");
  if (filters.speciesId) query = query.eq("species_id", filters.speciesId);
  if (userFilterIds?.length) query = query.in("user_id", userFilterIds);

  if (nameTerm) {
    const nameFilters = [
      `archive_title.ilike.%${nameTerm}%`,
      `species_name_snapshot.ilike.%${nameTerm}%`,
      `system_name.ilike.%${nameTerm}%`,
    ];

    if (matchedSpeciesIds.length > 0) {
      nameFilters.push(`species_id.in.(${matchedSpeciesIds.join(",")})`);
    }

    query = query.or(nameFilters.join(","));
  }

  if (tagTerm) query = query.in("record_id", matchedTagRecordIds);
  if (contentTerm) query = query.ilike("note", `%${contentTerm}%`);

  const { data, error } = await query;
  if (error) {
    console.error("discover search error:", error);
    return [] as FeedItem[];
  }

  const enrichedItems = await enrichDiscoverFeedItems((data || []) as FeedItem[]);
  return [...enrichedItems].sort(compareArchiveDisplayOrder);
}
