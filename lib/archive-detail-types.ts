import type { MediaItem } from "@/lib/domain-types";

export type RecordComment = {
  id: string;
  record_id: string;
  user_id: string;
  content: string;
  accepted?: boolean | null;
  created_at: string;
};

export type RecordLikeRow = {
  id?: string;
  record_id: string;
  user_id: string;
  created_at?: string | null;
};

export type CommentLikeRow = {
  id?: string;
  comment_id: string;
  user_id: string;
  created_at?: string | null;
};

export type CommentFlowerRow = {
  id: string;
  record_id: string;
  comment_id: string;
  sender_user_id: string;
  receiver_user_id: string;
  created_at: string;
  revoked_at?: string | null;
  revoke_until?: string | null;
  reason?: string | null;
};

export type RecordHelpStatus = "help" | "resolved" | null;
export type RecordVisibility = "public" | "private" | string | null;

export type RecordTagRow = {
  tag: string | null;
  tag_type: string | null;
  source?: string | null;
  is_active?: boolean | null;
};

export type RecordQueryRow = {
  id: string;
  archive_id?: string;
  note: string | null;
  record_time: string;
  visibility?: RecordVisibility;
  status_tag: RecordHelpStatus;
  comment_count?: number | null;
  record_tags?: RecordTagRow[] | null;
};

export type RelatedTagCountRow = {
  id: string;
  record_tags?: RecordTagRow[] | null;
};

export type RecordItem = {
  id: string;
  note: string | null;
  record_time: string;
  visibility?: RecordVisibility;
  status_tag: RecordHelpStatus;
  comment_count?: number | null;
  media?: MediaItem[];
  display_tags?: string[];
  user_behavior_tags?: string[];
  parsed_actions?: string[];
};

export type LightboxImage = {
  url: string;
  alt: string;
};

export type ArchiveDetailArchive = {
  id: string;
  user_id: string;
  title: string;
  category: string | null;
  created_at?: string | null;
  last_record_time?: string | null;
  is_public: boolean;
  record_count?: number | null;
  status?: string | null;
  species_id?: string | null;
  species_name_snapshot?: string | null;
  system_name?: string | null;
  help_status?: string | null;
  help_opened_at?: string | null;
  help_resolved_at?: string | null;
  help_updated_at?: string | null;
  view_count?: number | null;
  [key: string]: unknown;
};

export type PlantSpeciesLite = {
  id: string;
  common_name?: string | null;
  scientific_name?: string | null;
  [key: string]: unknown;
};

export type ArchiveMode = "owner" | "viewer";
