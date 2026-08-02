import type {
  DiscoverSearchKind,
  SearchCategory,
  SearchFilters,
} from "@/lib/discover-search-types";

export function sanitizeOrSearchText(value: string) {
  return value.replace(/[(),]/g, " ").trim();
}

export function parseSearchCategory(value: string | null): SearchCategory {
  return value === "plant" ||
    value === "system" ||
    value === "insect_fish" ||
    value === "other"
    ? value
    : "all";
}

export function parseDiscoverSearchKind(search: string): DiscoverSearchKind {
  const params = new URLSearchParams(search);
  const value = params.get("type");
  if (value === "records" || value === "experience") return value;
  if (value === "projects") return value;
  if (
    params.has("fromArchive") ||
    params.has("tag") ||
    params.has("content") ||
    params.get("help") === "1"
  ) {
    return "records";
  }
  return "projects";
}

export function parseSearchFiltersFromUrl(search: string): SearchFilters {
  const params = new URLSearchParams(search);

  return {
    countryCode: params.get("country") || "",
    countryName: params.get("countryName") || "",
    region: params.get("region") || "",
    city: params.get("city") || "",
    locationQuery: params.get("location") || "",
    category: parseSearchCategory(params.get("category")),
    name: params.get("name") || "",
    tag: params.get("tag") || "",
    content: params.get("content") || "",
    textQuery: params.get("q") || "",
    helpOnly: params.get("help") === "1",
    speciesId: params.get("species"),
  };
}
export function buildDiscoverSearchUrl(
  filters: SearchFilters,
  extraParams?: Record<string, string>,
  kind: DiscoverSearchKind = "projects"
) {
  const params = new URLSearchParams();

  params.set("type", kind);

  if (filters.countryCode) params.set("country", filters.countryCode);
  if (filters.countryName) params.set("countryName", filters.countryName);
  if (filters.region) params.set("region", filters.region);
  if (filters.city) params.set("city", filters.city);
  if (filters.locationQuery?.trim()) params.set("location", filters.locationQuery.trim());
  if (filters.category && filters.category !== "all") params.set("category", filters.category);
  if (filters.name.trim()) params.set("name", filters.name.trim());
  if (filters.tag.trim()) params.set("tag", filters.tag.trim());
  if (filters.content.trim()) params.set("content", filters.content.trim());
  if (filters.textQuery?.trim()) params.set("q", filters.textQuery.trim());
  if (filters.helpOnly) params.set("help", "1");
  if (filters.speciesId) params.set("species", filters.speciesId);

  Object.entries(extraParams || {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  const query = params.toString();
  return `/discover/search?${query}`;
}
