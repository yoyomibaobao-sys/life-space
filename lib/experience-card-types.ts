import type { MediaItem } from "@/lib/domain-types";

export type ExperienceCardStatus = "draft" | "published";

export type ExperienceCardRow = {
  id: string;
  user_id: string;
  archive_id: string;
  title: string;
  cover_media_id: string | null;
  status: ExperienceCardStatus | string;
  source_record_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExperienceCardArchive = {
  id: string;
  user_id: string;
  title: string;
  category: string | null;
  species_id: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
  is_public: boolean | null;
};

export type ExperienceCardAuthor = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  account_number?: string | null;
};

export type ExperienceCardRecordTag = {
  tag: string | null;
  tag_type: string | null;
  source?: string | null;
  is_active?: boolean | null;
};

export type ExperienceCardSourceRecord = {
  id: string;
  archive_id: string;
  user_id: string;
  note: string | null;
  record_time: string;
  created_at?: string | null;
  visibility?: string | null;
  status_tag?: string | null;
  record_tags?: ExperienceCardRecordTag[] | null;
  media: ExperienceCardMedia[];
};

export type ExperienceCardMedia = MediaItem & {
  id: string;
  record_id: string;
  display_url?: string | null;
  display_thumb_url?: string | null;
};

export type ExperienceCardDetail = {
  card: ExperienceCardRow;
  archive: ExperienceCardArchive;
  author: ExperienceCardAuthor | null;
  records: ExperienceCardSourceRecord[];
  cover: ExperienceCardMedia | null;
  isPubliclyAvailable: boolean;
  sourceIsComplete: boolean;
};

export type ExperienceCardSaveInput = {
  cardId?: string | null;
  archiveId: string;
  title: string;
  recordIds: string[];
  coverMediaId?: string | null;
};
