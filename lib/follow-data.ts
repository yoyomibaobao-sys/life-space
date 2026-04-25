import { getArchiveCategoryIcon, getArchiveCategoryLabel } from "@/lib/archive-categories";
import type {
  ArchiveFollowRow,
  ArchiveRow,
  FollowPageData,
  FollowProjectCard,
  FollowUserCard,
  GroupTagRow,
  ProfileRow,
  RecordRow,
  SubTagRow,
  UserFollowRow,
} from "@/lib/follow-types";
import {
  byRecentProject,
  getDurationDays,
  getProjectStatusKind,
  getProjectStatusLabel,
  unique,
} from "@/lib/follow-utils";
import { getRecentArchiveTitles, getTimeValue, sortRecentArchives } from "@/lib/social-space-shared";

export async function loadFollowPageData(supabase: any, userId: string): Promise<FollowPageData> {
  const [{ data: archiveFollows }, { data: userFollows }] = await Promise.all([
    supabase
      .from("archive_follows")
      .select("archive_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("follows")
      .select("following_id, created_at")
      .eq("follower_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const archiveFollowRows = (archiveFollows || []) as ArchiveFollowRow[];
  const userFollowRows = (userFollows || []) as UserFollowRow[];

  const archiveIds = unique(archiveFollowRows.map((item) => item.archive_id).filter(Boolean));
  const followedUserIds = unique(userFollowRows.map((item) => item.following_id).filter(Boolean));

  const archivesPromise = archiveIds.length
    ? supabase
        .from("archives")
        .select(
          "id, user_id, title, category, system_name, species_name_snapshot, group_tag_id, sub_tag_id, created_at, status, ended_at, help_status, record_count, last_record_time, view_count, cover_image_url"
        )
        .in("id", archiveIds)
    : Promise.resolve({ data: [] as ArchiveRow[], error: null });

  const followedUsersArchivesPromise = followedUserIds.length
    ? supabase
        .from("archives")
        .select("id, user_id, title, last_record_time, is_public")
        .in("user_id", followedUserIds)
        .eq("is_public", true)
    : Promise.resolve({ data: [] as any[], error: null });

  const recordsPromise = archiveIds.length
    ? supabase
        .from("records")
        .select("archive_id, note, record_time, primary_image_url")
        .in("archive_id", archiveIds)
        .order("record_time", { ascending: false })
    : Promise.resolve({ data: [] as RecordRow[], error: null });

  const [archivesResult, followedUsersArchivesResult, recordsResult] = await Promise.all([
    archivesPromise,
    followedUsersArchivesPromise,
    recordsPromise,
  ]);

  const archives = (archivesResult.data || []) as ArchiveRow[];
  const followedUsersArchives = (followedUsersArchivesResult.data || []) as Array<
    Pick<ArchiveRow, "id" | "user_id" | "title" | "last_record_time"> & {
      is_public?: boolean;
    }
  >;
  const records = (recordsResult.data || []) as RecordRow[];

  const profileIds = unique([...archives.map((item) => item.user_id), ...followedUserIds]);
  const subTagIds = unique(archives.map((item) => item.sub_tag_id).filter(Boolean)) as string[];
  const groupTagIds = unique(archives.map((item) => item.group_tag_id).filter(Boolean)) as string[];

  const [profilesResult, subTagsResult, groupTagsResult] = await Promise.all([
    profileIds.length
      ? supabase.from("profiles").select("id, username, avatar_url").in("id", profileIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    subTagIds.length
      ? supabase.from("sub_tags").select("id, name").in("id", subTagIds)
      : Promise.resolve({ data: [] as SubTagRow[], error: null }),
    groupTagIds.length
      ? supabase.from("group_tags").select("id, name").in("id", groupTagIds)
      : Promise.resolve({ data: [] as GroupTagRow[], error: null }),
  ]);

  const profiles = (profilesResult.data || []) as ProfileRow[];
  const subTags = (subTagsResult.data || []) as SubTagRow[];
  const groupTags = (groupTagsResult.data || []) as GroupTagRow[];

  const profileMap = new Map(profiles.map((item) => [item.id, item]));
  const subTagMap = new Map(subTags.map((item) => [item.id, item.name || ""]));
  const groupTagMap = new Map(groupTags.map((item) => [item.id, item.name || ""]));

  const latestRecordMap = new Map<string, RecordRow>();
  records.forEach((record) => {
    if (!record.archive_id) return;
    if (!latestRecordMap.has(record.archive_id)) {
      latestRecordMap.set(record.archive_id, record);
    }
  });

  const projectCards = archives
    .map((archive) => {
      const latestRecord = latestRecordMap.get(archive.id);
      const profile = profileMap.get(archive.user_id);
      const systemName = archive.system_name || archive.species_name_snapshot || "未填写";
      const endBase = archive.ended_at || archive.last_record_time || new Date().toISOString();

      return {
        id: archive.id,
        title: archive.title || "未命名项目",
        displaySystemName: systemName,
        ownerId: archive.user_id,
        ownerName: profile?.username || "未设置用户名",
        ownerAvatarUrl: profile?.avatar_url || null,
        categoryLabel: getArchiveCategoryLabel(archive.category),
        categoryIcon: getArchiveCategoryIcon(archive.category),
        subTagName: archive.sub_tag_id ? subTagMap.get(archive.sub_tag_id) || "" : "",
        groupTagName: archive.group_tag_id ? groupTagMap.get(archive.group_tag_id) || "" : "",
        latestNote: latestRecord?.note?.trim() || "新增了一条记录",
        latestRecordTime: latestRecord?.record_time || archive.last_record_time || null,
        recordCount: Number(archive.record_count || 0),
        durationDays: getDurationDays(archive.created_at, endBase),
        viewCount: Number(archive.view_count || 0),
        statusLabel: getProjectStatusLabel(archive.help_status, archive.status),
        statusKind: getProjectStatusKind(archive.help_status, archive.status),
        coverUrl: archive.cover_image_url || latestRecord?.primary_image_url || null,
      } satisfies FollowProjectCard;
    })
    .sort(byRecentProject);

  const publicArchiveMap = new Map<string, Array<{ title: string; last_record_time: string | null }>>();
  followedUsersArchives.forEach((archive) => {
    if (!archive.user_id) return;
    if (!publicArchiveMap.has(archive.user_id)) {
      publicArchiveMap.set(archive.user_id, []);
    }
    publicArchiveMap.get(archive.user_id)?.push({
      title: archive.title || "未命名项目",
      last_record_time: archive.last_record_time || null,
    });
  });

  const userCards = followedUserIds
    .map((followedId) => {
      const profile = profileMap.get(followedId);
      const archivesOfUser = sortRecentArchives(publicArchiveMap.get(followedId) || []);

      return {
        id: followedId,
        username: profile?.username || "未设置用户名",
        avatarUrl: profile?.avatar_url || null,
        latestRecordTime: archivesOfUser[0]?.last_record_time || null,
        publicArchiveCount: archivesOfUser.length,
        recentArchiveTitles: getRecentArchiveTitles(archivesOfUser),
      } satisfies FollowUserCard;
    })
    .sort((a, b) => getTimeValue(b.latestRecordTime) - getTimeValue(a.latestRecordTime));

  return { projectCards, userCards };
}
