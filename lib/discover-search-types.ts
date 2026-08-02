import type { ArchiveCategory } from "@/lib/archive-categories";
import { RECORD_TAG_OPTIONS } from "@/lib/record-tags";

export type SearchCategory = "all" | ArchiveCategory;
export type DiscoverSearchKind = "projects" | "records" | "experience";

export type SearchFilters = {
  countryCode: string;
  countryName: string;
  region: string;
  city: string;
  locationQuery: string;
  category: SearchCategory;
  name: string;
  tag: string;
  content: string;
  textQuery: string;
  helpOnly: boolean;
  speciesId?: string | null;
};

export const SEARCH_BATCH_SIZE = 120;

export const commonSearchTags = RECORD_TAG_OPTIONS;

export const emptySearchFilters: SearchFilters = {
  countryCode: "",
  countryName: "",
  region: "",
  city: "",
  locationQuery: "",
  category: "all",
  name: "",
  tag: "",
  content: "",
  textQuery: "",
  helpOnly: false,
  speciesId: null,
};
