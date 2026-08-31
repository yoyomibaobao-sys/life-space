import type { ArchiveCategory } from "./archive-categories";

export function buildGuideDirectoryHref(section: ArchiveCategory, query = "", category = "all") {
  const params = new URLSearchParams({ section });
  if (query.trim()) params.set("q", query.trim());
  if (category !== "all") params.set("category", category);
  return `/plant?${params.toString()}`;
}
