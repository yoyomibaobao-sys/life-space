import type { ArchiveCategory } from "@/lib/archive-categories";

export type Category = "all" | ArchiveCategory;

export type UserSpaceArchive = {
  id: string;
  title?: string | null;
  system_name?: string | null;
  species_name_snapshot?: string | null;
  category?: string | null;
  sub_tag_id?: string | null;
  group_tag_id?: string | null;
  status?: string | null;
  view_count?: number | null;
  record_count?: number | null;
};

export type UserSpaceMedia = {
  file_url?: string | null;
  url?: string | null;
  path?: string | null;
  thumb_url?: string | null;
  thumb_path?: string | null;
  storage_path?: string | null;
  display_url?: string | null;
  display_thumb_url?: string | null;
};

export type UserSpaceRecord = {
  id: string;
  archive_id: string;
  note?: string | null;
  record_time?: string | null;
  status_tag?: string | null;
  status?: string | null;
  primary_image_url?: string | null;
  media?: UserSpaceMedia[] | null;
};

export type UserSpaceTag = {
  id: string;
  name: string;
  category?: string | null;
  sub_tag_id?: string | null;
};

export type ArchiveStat = {
  count: number;
  latest: UserSpaceRecord;
  hasHelp: boolean;
};
