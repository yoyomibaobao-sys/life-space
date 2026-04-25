import type { ArchiveCategory } from "@/lib/archive-categories";

export type FeedItem = {
  record_id: string;
  archive_id: string;
  user_id: string;
  note: string | null;
  record_time: string;
  visibility?: string | null;
  status_tag: string | null;
  primary_image_url: string | null;
  comment_count: number;
  media_count: number;
  archive_title: string;
  archive_category: string | null;
  species_id: string | null;
  species_name_snapshot?: string | null;
  archive_is_public?: boolean | null;
  username: string | null;
  avatar_url: string | null;
  user_location?: string | null;
  profile_is_public?: boolean | null;
  display_tags?: string[];
  system_name?: string | null;
  record_count?: number | null;
  archive_record_count?: number | null;
  view_count?: number | null;
  archive_view_count?: number | null;
  archive_status?: string | null;
  archive_ended_at?: string | null;
};

export type FilterMode = "all" | ArchiveCategory | "help";

export type UserSection = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  user_location: string | null;
  latest_time: string;
  records: FeedItem[];
  total_project_count: number;
};

export type FilterOption = {
  value: FilterMode;
  label: string;
};

export const RECORD_BATCH_SIZE = 80;

export const filterOptions: FilterOption[] = [
  { value: "all", label: "全部" },
  { value: "plant", label: "种植" },
  { value: "system", label: "农法/设施" },
  { value: "insect_fish", label: "虫鱼" },
  { value: "other", label: "其他" },
  { value: "help", label: "只看求助" },
];
