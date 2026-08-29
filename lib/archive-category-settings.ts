import type { ArchiveCategory } from "@/lib/archive-categories";
import { supabase } from "@/lib/supabase";

export type ArchiveCategoryDepth = 1 | 2 | 3;
export type ArchiveCategoryDepths = Record<ArchiveCategory, ArchiveCategoryDepth>;
export type ArchiveCategorySpace = "cloud" | "local";

export const DEFAULT_ARCHIVE_CATEGORY_DEPTHS: ArchiveCategoryDepths = {
  plant: 3,
  system: 3,
  insect_fish: 3,
  other: 3,
};

const LOCAL_SETTINGS_PREFIX = "lifespace:archive-category-depths:local:v1";
const ARCHIVE_CATEGORIES: ArchiveCategory[] = [
  "plant",
  "system",
  "insect_fish",
  "other",
];

function normalizeDepth(value: unknown): ArchiveCategoryDepth {
  const numericValue = Number(value);
  if (numericValue >= 3) return 3;
  if (numericValue >= 2) return 2;
  return 1;
}

function normalizeDepths(value: unknown): ArchiveCategoryDepths {
  const source = value && typeof value === "object"
    ? value as Partial<Record<ArchiveCategory, unknown>>
    : {};

  return ARCHIVE_CATEGORIES.reduce<ArchiveCategoryDepths>(
    (result, category) => {
      result[category] = source[category] == null
        ? DEFAULT_ARCHIVE_CATEGORY_DEPTHS[category]
        : normalizeDepth(source[category]);
      return result;
    },
    { ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS },
  );
}

function getLocalSettingsKey(ownerId?: string | null) {
  return `${LOCAL_SETTINGS_PREFIX}:${ownerId || "device"}`;
}

export function getLocalArchiveCategoryDepths(ownerId?: string | null) {
  if (typeof window === "undefined") return { ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS };

  try {
    const raw = window.localStorage.getItem(getLocalSettingsKey(ownerId));
    return raw ? normalizeDepths(JSON.parse(raw)) : { ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS };
  } catch {
    return { ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS };
  }
}

export function saveLocalArchiveCategoryDepths(
  depths: ArchiveCategoryDepths,
  ownerId?: string | null,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getLocalSettingsKey(ownerId),
    JSON.stringify(normalizeDepths(depths)),
  );
}

export async function getCloudArchiveCategoryDepths(userId: string) {
  const { data, error } = await supabase
    .from("archive_category_settings")
    .select("category, max_depth")
    .eq("user_id", userId);

  if (error) throw error;

  const values: Partial<Record<ArchiveCategory, number>> = {};
  for (const row of data || []) {
    if (ARCHIVE_CATEGORIES.includes(row.category as ArchiveCategory)) {
      values[row.category as ArchiveCategory] = Number(row.max_depth);
    }
  }
  return normalizeDepths(values);
}

export async function saveCloudArchiveCategoryDepths(
  userId: string,
  depths: ArchiveCategoryDepths,
) {
  const normalized = normalizeDepths(depths);
  const now = new Date().toISOString();
  const rows = ARCHIVE_CATEGORIES.map((category) => ({
    user_id: userId,
    category,
    max_depth: normalized[category],
    updated_at: now,
  }));
  const { error } = await supabase
    .from("archive_category_settings")
    .upsert(rows, { onConflict: "user_id,category" });

  if (error) throw error;
}

export function getArchiveCategoryDepth(
  depths: ArchiveCategoryDepths | null | undefined,
  category?: string | null,
) {
  const normalizedCategory = ARCHIVE_CATEGORIES.includes(category as ArchiveCategory)
    ? category as ArchiveCategory
    : "other";
  return depths?.[normalizedCategory] || DEFAULT_ARCHIVE_CATEGORY_DEPTHS[normalizedCategory];
}
