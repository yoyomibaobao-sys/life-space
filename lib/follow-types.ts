export type TabKey = "projects" | "users";
export type ProjectStatusFilter = "all" | "open" | "resolved" | "ended";

export type ArchiveFollowRow = {
  archive_id: string;
  created_at: string;
};

export type UserFollowRow = {
  following_id: string;
  created_at: string;
};

export type ArchiveRow = {
  id: string;
  user_id: string;
  title: string;
  category: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
  group_tag_id: string | null;
  sub_tag_id: string | null;
  created_at: string | null;
  status: string | null;
  ended_at: string | null;
  help_status: string | null;
  record_count: number | null;
  last_record_time: string | null;
  view_count: number | null;
  cover_image_url?: string | null;
};

export type RecordRow = {
  archive_id: string;
  note: string | null;
  record_time: string | null;
  primary_image_url: string | null;
};

export type ProfileRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

export type SubTagRow = {
  id: string;
  name: string | null;
};

export type GroupTagRow = {
  id: string;
  name: string | null;
};

export type FollowProjectCard = {
  id: string;
  title: string;
  displaySystemName: string;
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  categoryLabel: string;
  categoryIcon: string;
  subTagName: string;
  groupTagName: string;
  latestNote: string;
  latestRecordTime: string | null;
  recordCount: number;
  durationDays: number;
  viewCount: number;
  statusLabel: string;
  statusKind: "help" | "resolved" | "ended" | "normal";
  coverUrl: string | null;
};

export type FollowUserCard = {
  id: string;
  username: string;
  avatarUrl: string | null;
  latestRecordTime: string | null;
  publicArchiveCount: number;
  recentArchiveTitles: string[];
};

export type FollowPageData = {
  projectCards: FollowProjectCard[];
  userCards: FollowUserCard[];
};
