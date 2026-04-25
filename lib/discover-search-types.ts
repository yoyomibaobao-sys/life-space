import type { ArchiveCategory } from "@/lib/archive-categories";

export type SearchCategory = "all" | ArchiveCategory;

export type SearchFilters = {
  countryCode: string;
  countryName: string;
  region: string;
  city: string;
  category: SearchCategory;
  name: string;
  tag: string;
  content: string;
  helpOnly: boolean;
  speciesId?: string | null;
};

export const SEARCH_BATCH_SIZE = 120;

export const commonSearchTags = [
  "发芽",
  "开花",
  "结果",
  "叶片",
  "病害",
  "浇水",
  "施肥",
  "换盆",
  "修剪",
  "播种",
  "扦插",
  "移植",
  "堆肥",
  "育苗",
  "补光",
] as const;

export const emptySearchFilters: SearchFilters = {
  countryCode: "",
  countryName: "",
  region: "",
  city: "",
  category: "all",
  name: "",
  tag: "",
  content: "",
  helpOnly: false,
  speciesId: null,
};
