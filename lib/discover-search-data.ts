import { supabase } from "@/lib/supabase";
import { hydrateExperienceCardListItems } from "@/lib/experience-cards";
import type {
  ExperienceCardListItem,
  ExperienceCardRow,
} from "@/lib/experience-card-types";
import { enrichDiscoverFeedItems } from "@/lib/discover-data";
import { enrichDiscoveryProjectMedia } from "@/lib/discover-project-feed";
import {
  normalizeDiscoveryProjectFeedRow,
} from "@/lib/discover-project-feed";
import type {
  DiscoveryProjectFeedItem,
  DiscoveryProjectFeedRow,
} from "@/lib/discover-project-types";
import type { FeedItem } from "@/lib/discover-types";
import {
  SEARCH_BATCH_SIZE,
  type SearchFilters,
} from "@/lib/discover-search-types";
import { compareArchiveDisplayOrder } from "@/lib/discover-utils";
import { sanitizeOrSearchText } from "@/lib/discover-search-utils";
import {
  findUserIdsByRegionFilters,
  makeRegionSearchText,
} from "@/lib/region-shared";

type IdRow = { id?: string | null; plant_id?: string | null; species_id?: string | null; record_id?: string | null };

function includesSearchTerm(value: string | null | undefined, term: string) {
  return String(value || "").toLocaleLowerCase().includes(term);
}

function matchesExperienceRegion(
  item: ExperienceCardListItem,
  filters: SearchFilters
) {
  const locationTerm = sanitizeOrSearchText(filters.locationQuery || "")
    .toLocaleLowerCase();
  if (locationTerm && !includesSearchTerm(item.authorRegion, locationTerm)) {
    return false;
  }

  if (
    filters.countryCode &&
    filters.countryCode !== "OTHER" &&
    item.authorCountryCode !== filters.countryCode
  ) {
    return false;
  }
  if (
    filters.countryCode === "OTHER" &&
    filters.countryName.trim() &&
    !includesSearchTerm(item.authorCountryName, filters.countryName.toLocaleLowerCase())
  ) {
    return false;
  }
  if (
    filters.region.trim() &&
    !includesSearchTerm(item.authorRegionName, filters.region.toLocaleLowerCase())
  ) {
    return false;
  }
  if (
    filters.city.trim() &&
    !includesSearchTerm(item.authorCityName, filters.city.toLocaleLowerCase())
  ) {
    return false;
  }
  return true;
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

async function findUserIdsByRegionKeyword(keyword: string) {
  const term = sanitizeOrSearchText(keyword).toLowerCase();
  if (!term) return [] as string[];

  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, country_code, country_name, region_name, city_name")
    .limit(500);

  if (error) {
    console.error("discover location search error:", error);
    return [];
  }

  return (data || [])
    .filter((row) =>
      makeRegionSearchText({
        countryCode: row.country_code,
        countryName: row.country_name,
        regionName: row.region_name,
        cityName: row.city_name,
      }).includes(term)
    )
    .map((row) => String(row.id));
}

export async function fetchDiscoverSearchResults(filters: SearchFilters) {
  const textTerm = sanitizeOrSearchText(filters.textQuery || "");
  const nameTerm = sanitizeOrSearchText(textTerm ? "" : filters.name);
  const tagTerm = sanitizeOrSearchText(filters.tag);
  const contentTerm = sanitizeOrSearchText(textTerm ? "" : filters.content);

  const [matchedSpeciesIds, matchedTagRecordIds] = await Promise.all([
    nameTerm || textTerm
      ? findSpeciesIdsByNameTerm(nameTerm || textTerm)
      : Promise.resolve<string[]>([]),
    tagTerm ? findRecordIdsByTagTerm(tagTerm) : Promise.resolve<string[]>([]),
  ]);

  let userFilterIds: string[] | null = null;

  if (filters.locationQuery?.trim()) {
    userFilterIds = await findUserIdsByRegionKeyword(filters.locationQuery);

    if (userFilterIds.length === 0) {
      return [] as FeedItem[];
    }
  } else if (filters.countryCode || filters.countryName || filters.region || filters.city) {
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

  if (textTerm) {
    const textFilters = [
      `archive_title.ilike.%${textTerm}%`,
      `species_name_snapshot.ilike.%${textTerm}%`,
      `system_name.ilike.%${textTerm}%`,
      `note.ilike.%${textTerm}%`,
    ];

    if (matchedSpeciesIds.length > 0) {
      textFilters.push(`species_id.in.(${matchedSpeciesIds.join(",")})`);
    }

    query = query.or(textFilters.join(","));
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

export async function fetchDiscoverProjectSearchResults(
  filters: SearchFilters
): Promise<DiscoveryProjectFeedItem[]> {
  const textTerm = sanitizeOrSearchText(filters.textQuery || filters.name);
  let userFilterIds: string[] | null = null;

  if (!filters.locationQuery?.trim() && (
    filters.countryCode ||
    filters.countryName ||
    filters.region ||
    filters.city
  )) {
    userFilterIds = await findUserIdsByRegionFilters(supabase, {
      countryCode: filters.countryCode,
      countryName: filters.countryName,
      regionName: filters.region,
      cityName: filters.city,
    });
    if (userFilterIds.length === 0) return [];
  }

  let query = supabase
    .from("discovery_project_feed_view")
    .select("*")
    .order("public_activity_at", { ascending: false, nullsFirst: false })
    .order("archive_id", { ascending: false })
    .limit(SEARCH_BATCH_SIZE);

  if (filters.category !== "all") query = query.eq("category", filters.category);
  if (userFilterIds?.length) query = query.in("owner_user_id", userFilterIds);
  if (filters.locationQuery?.trim()) {
    const locationTerm = sanitizeOrSearchText(filters.locationQuery);
    query = query.ilike("profile_region", `%${locationTerm}%`);
  }
  if (textTerm) {
    query = query.or(
      [
        `archive_title.ilike.%${textTerm}%`,
        `system_name.ilike.%${textTerm}%`,
        `species_name_snapshot.ilike.%${textTerm}%`,
        `profile_display_name.ilike.%${textTerm}%`,
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("discover project search error:", error);
    return [];
  }

  const normalized = ((data || []) as unknown as DiscoveryProjectFeedRow[]).map(
    normalizeDiscoveryProjectFeedRow
  );
  return enrichDiscoveryProjectMedia(normalized);
}

export async function fetchDiscoverExperienceCardSearchResults(
  filters: SearchFilters
): Promise<ExperienceCardListItem[]> {
  const { data, error } = await supabase
    .from("experience_cards")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(SEARCH_BATCH_SIZE);

  if (error) {
    console.error("discover experience card search error:", error);
    return [];
  }

  const rows = (data || []) as ExperienceCardRow[];
  const publicStates = await Promise.all(
    rows.map(async (row) => {
      const { data: publicData } = await supabase.rpc(
        "is_experience_card_public",
        { p_card_id: row.id }
      );
      return Boolean(
        Array.isArray(publicData) ? publicData[0] : publicData
      );
    })
  );
  const items = await hydrateExperienceCardListItems(
    rows.filter((_row, index) => publicStates[index])
  );
  const textTerm = sanitizeOrSearchText(filters.textQuery || filters.name)
    .toLocaleLowerCase();

  return items.filter((item) => {
    if (
      filters.category !== "all" &&
      item.archiveCategory !== filters.category
    ) {
      return false;
    }
    if (!matchesExperienceRegion(item, filters)) return false;
    if (!textTerm) return true;

    return [
      item.title,
      item.archiveTitle,
      item.systemName,
      item.authorName,
    ].some((value) => includesSearchTerm(value, textTerm));
  });
}
