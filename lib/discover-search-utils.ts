import type { SearchCategory, SearchFilters } from "@/lib/discover-search-types";

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

export function parseSearchFiltersFromUrl(search: string): SearchFilters {
  const params = new URLSearchParams(search);

  return {
    countryCode: params.get("country") || "",
    countryName: params.get("countryName") || "",
    region: params.get("region") || "",
    city: params.get("city") || "",
    category: parseSearchCategory(params.get("category")),
    name: params.get("name") || "",
    tag: params.get("tag") || "",
    content: params.get("content") || "",
    helpOnly: params.get("help") === "1",
    speciesId: params.get("species"),
  };
}
