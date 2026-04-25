import type { ArchiveCategory } from "@/lib/archive-categories";

export type SortMode = "created" | "name" | "updated";

export type ArchiveItem = {
  id: string;
  user_id?: string | null;
  title?: string | null;
  category: ArchiveCategory;
  status?: "active" | "ended" | string | null;
  system_name?: string | null;
  species_id?: string | null;
  species_name_snapshot?: string | null;
  species_display_name?: string | null;
  cover_image_url?: string | null;
  created_at?: string | null;
  last_record_time?: string | null;
  note?: string | null;
  is_public?: boolean | null;
  sub_tag_id?: string | null;
  group_tag_id?: string | null;
  record_count?: number | null;
  view_count?: number | null;
  follower_count?: number | null;
  help_status?: "open" | "resolved" | "none" | string | null;
};

export type GroupTagItem = {
  id: string;
  user_id?: string | null;
  name: string;
  sub_tag_id: string;
};

export type SubTagItem = {
  id: string;
  user_id?: string | null;
  name: string;
  category: ArchiveCategory;
};

export type PlantSpeciesOption = {
  id: string;
  common_name?: string | null;
  scientific_name?: string | null;
  slug?: string | null;
  category?: string | null;
  is_active?: boolean | null;
  aliases?: string[];
  display_name: string;
  search_text: string;
};

export type PlantPlanItem = {
  id: string;
  status?: string | null;
  created_archive_id?: string | null;
};

export type PlantInterestItem = {
  id: string;
};
