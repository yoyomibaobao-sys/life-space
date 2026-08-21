import type { ArchiveCategory } from "@/lib/archive-categories";

export type DiscoveryProjectFeedRow = {
  archive_id: string;
  owner_user_id: string | null;
  archive_title: string;
  category: ArchiveCategory | null;
  system_name: string | null;
  archive_summary: string | null;
  archive_created_at: string | null;
  archive_ended_at: string | null;
  latest_public_record_id: string;
  latest_public_record_note: string | null;
  latest_public_record_time: string | null;
  latest_public_record_created_at: string | null;
  latest_public_primary_image_url: string | null;
  species_name_snapshot: string | null;
  public_record_count: number | string | null;
  public_comment_count: number | string | null;
  has_public_help: boolean | null;
  public_activity_at: string | null;
  profile_display_name: string | null;
  profile_avatar_url: string | null;
  profile_region: string | null;
  view_count?: number | string | null;
};

export type DiscoveryProjectFeedItem = Omit<
  DiscoveryProjectFeedRow,
  "public_record_count" | "public_comment_count" | "has_public_help"
> & {
  public_record_count: number;
  public_comment_count: number;
  has_public_help: boolean;
  view_count: number;
  card_summary: string | null;
  display_image_url: string | null;
};

export type DiscoveryProjectCursor = {
  public_activity_at: string;
  archive_id: string;
};

export type DiscoveryProjectFeedFilters = {
  category?: ArchiveCategory | null;
  helpOnly?: boolean;
  cursor?: DiscoveryProjectCursor | null;
  limit?: number;
};
