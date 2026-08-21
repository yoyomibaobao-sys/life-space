import type { PostgrestError } from "@supabase/supabase-js";
import type { ArchiveCategory } from "@/lib/archive-categories";
import {
  enrichDiscoveryProjectMedia,
  normalizeDiscoveryProjectFeedRow,
} from "@/lib/discover-project-feed";
import type {
  DiscoveryProjectFeedItem,
  DiscoveryProjectFeedRow,
} from "@/lib/discover-project-types";
import {
  PUBLIC_PROFILE_SELECT,
  type PublicProfile,
} from "@/lib/domain-types";
import { getPublicProfileRegion } from "@/lib/followed-users";
import { supabase } from "@/lib/supabase";

type ArchiveFollowRow = {
  archive_id: string | null;
  created_at: string | null;
};

type FollowedArchiveRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  category: ArchiveCategory | null;
  system_name: string | null;
  species_name_snapshot: string | null;
  archive_summary: string | null;
  created_at: string | null;
  ended_at: string | null;
  view_count: number | null;
};

type PublicRecordRow = {
  id: string;
  archive_id: string | null;
  note: string | null;
  record_time: string | null;
  created_at: string | null;
  primary_image_url: string | null;
  comment_count: number | string | null;
};

export type FollowedArchiveProjectsResult = {
  items: DiscoveryProjectFeedItem[];
  error: PostgrestError | null;
};

function unique(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function getTimeValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export async function fetchFollowedArchiveProjects(
  currentUserId: string
): Promise<FollowedArchiveProjectsResult> {
  const { data: followData, error: followError } = await supabase
    .from("archive_follows")
    .select("archive_id, created_at")
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false });

  if (followError) return { items: [], error: followError };

  const followRows = (followData || []) as ArchiveFollowRow[];
  const archiveIds = unique(followRows.map((row) => row.archive_id));
  if (!archiveIds.length) return { items: [], error: null };

  const { data: archiveData, error: archiveError } = await supabase
    .from("archives")
    .select(
      "id, user_id, title, category, system_name, species_name_snapshot, archive_summary, created_at, ended_at, view_count"
    )
    .in("id", archiveIds)
    .eq("is_public", true);

  if (archiveError) return { items: [], error: archiveError };

  const archives = (archiveData || []) as FollowedArchiveRow[];
  const visibleArchiveIds = archives.map((archive) => archive.id);
  if (!visibleArchiveIds.length) return { items: [], error: null };

  const { data: recordData, error: recordError } = await supabase
    .from("records")
    .select(
      "id, archive_id, note, record_time, created_at, primary_image_url, comment_count"
    )
    .in("archive_id", visibleArchiveIds)
    .eq("visibility", "public")
    .order("record_time", { ascending: false })
    .order("created_at", { ascending: false });

  if (recordError) return { items: [], error: recordError };

  const records = (recordData || []) as PublicRecordRow[];
  const ownerIds = unique(archives.map((archive) => archive.user_id));
  const profilesResult = ownerIds.length
    ? await supabase
        .from("public_profiles")
        .select(PUBLIC_PROFILE_SELECT)
        .in("id", ownerIds)
    : { data: [] as PublicProfile[], error: null };

  if (profilesResult.error) return { items: [], error: profilesResult.error };

  const profiles = (profilesResult.data || []) as PublicProfile[];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const recordsByArchive = new Map<string, PublicRecordRow[]>();

  records.forEach((record) => {
    if (!record.archive_id) return;
    const archiveRecords = recordsByArchive.get(record.archive_id) || [];
    archiveRecords.push(record);
    recordsByArchive.set(record.archive_id, archiveRecords);
  });

  const rows = archives.map((archive) => {
    const archiveRecords = recordsByArchive.get(archive.id) || [];
    const latestRecord = archiveRecords[0];
    const profile = archive.user_id ? profileMap.get(archive.user_id) : undefined;
    const publicCommentCount = archiveRecords.reduce(
      (total, record) => total + Number(record.comment_count || 0),
      0
    );

    return {
      archive_id: archive.id,
      owner_user_id: archive.user_id,
      archive_title: archive.title || "未命名项目",
      category: archive.category,
      system_name: archive.system_name,
      archive_summary: archive.archive_summary,
      archive_created_at: archive.created_at,
      archive_ended_at: archive.ended_at,
      latest_public_record_id: latestRecord?.id || "",
      latest_public_record_note: latestRecord?.note || null,
      latest_public_record_time: latestRecord?.record_time || null,
      latest_public_record_created_at: latestRecord?.created_at || null,
      latest_public_primary_image_url:
        latestRecord?.primary_image_url || null,
      species_name_snapshot: archive.species_name_snapshot,
      public_record_count: archiveRecords.length,
      public_comment_count: publicCommentCount,
      has_public_help: false,
      public_activity_at:
        latestRecord?.record_time ||
        latestRecord?.created_at ||
        archive.created_at,
      profile_display_name: profile?.username || null,
      profile_avatar_url: profile?.avatar_url || null,
      profile_region: getPublicProfileRegion(profile),
      view_count: archive.view_count,
    } satisfies DiscoveryProjectFeedRow;
  });

  rows.sort((left, right) => {
    const timeDifference =
      getTimeValue(right.public_activity_at) - getTimeValue(left.public_activity_at);
    if (timeDifference !== 0) return timeDifference;
    return right.archive_id.localeCompare(left.archive_id);
  });

  const normalizedItems = rows.map(normalizeDiscoveryProjectFeedRow);
  const items = await enrichDiscoveryProjectMedia(normalizedItems);

  return { items, error: null };
}
