import type { ArchiveStat, UserSpaceArchive, UserSpaceRecord, UserSpaceTag } from "@/lib/user-space-types";

export function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("zh-CN");
}

export function getMediaUrl(media: {
  file_url?: string | null;
  url?: string | null;
  path?: string | null;
}) {
  return media?.file_url || media?.url || media?.path || "";
}

export function buildStatsMap(records: UserSpaceRecord[]) {
  const map: Record<string, ArchiveStat> = {};

  records.forEach((record) => {
    if (!map[record.archive_id]) {
      map[record.archive_id] = {
        count: 0,
        latest: record,
        hasHelp: false,
      };
    }

    map[record.archive_id].count += 1;

    if (record.status_tag === "help" || record.status === "help") {
      map[record.archive_id].hasHelp = true;
    }

    if (
      new Date(record.record_time || 0).getTime() >
      new Date(map[record.archive_id].latest.record_time || 0).getTime()
    ) {
      map[record.archive_id].latest = record;
    }
  });

  return map;
}

export function buildCoverMap(records: UserSpaceRecord[]) {
  const map: Record<string, string> = {};

  records.forEach((record) => {
    if (map[record.archive_id]) return;

    if (record.primary_image_url) {
      map[record.archive_id] = record.primary_image_url;
      return;
    }

    if (record.media?.length) {
      const url = getMediaUrl(record.media[0]);
      if (url) map[record.archive_id] = url;
    }
  });

  return map;
}

export function getVisibleSubTags(
  archives: UserSpaceArchive[],
  subTags: UserSpaceTag[]
) {
  return subTags.filter((tag) =>
    archives.some((archive) => archive.sub_tag_id === tag.id)
  );
}

export function getVisibleGroupTags(
  activeSubTag: string | null,
  archives: UserSpaceArchive[],
  groupTags: UserSpaceTag[],
  publicArchiveIds: Set<string>
) {
  if (!activeSubTag) return [];

  return groupTags.filter((tag) => {
    if (tag.sub_tag_id !== activeSubTag) return false;

    return archives.some(
      (archive) =>
        archive.sub_tag_id === activeSubTag &&
        archive.group_tag_id === tag.id &&
        publicArchiveIds.has(archive.id)
    );
  });
}

export function getFilteredArchives(
  archives: UserSpaceArchive[],
  activeCategory: string,
  activeSubTag: string | null,
  activeGroupTag: string | null
) {
  return archives.filter((archive) => {
    if (activeCategory !== "all" && archive.category !== activeCategory) {
      return false;
    }

    if (activeSubTag && archive.sub_tag_id !== activeSubTag) {
      return false;
    }

    if (activeGroupTag && archive.group_tag_id !== activeGroupTag) {
      return false;
    }

    return true;
  });
}

export function getSubTagName(subTags: UserSpaceTag[], subTagId?: string | null) {
  return subTags.find((tag) => tag.id === subTagId)?.name || "未细分";
}

export function getGroupTagName(groupTags: UserSpaceTag[], groupTagId?: string | null) {
  return groupTags.find((tag) => tag.id === groupTagId)?.name || "";
}
