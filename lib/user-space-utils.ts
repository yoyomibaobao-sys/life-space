import type { ArchiveStat, UserSpaceArchive, UserSpaceRecord, UserSpaceTag } from "@/lib/user-space-types";
import { formatCardDate } from "@/lib/date-time";

export function formatDate(value?: string | null) {
  return formatCardDate(value);
}

export function getMediaUrl(media: {
  file_url?: string | null;
  url?: string | null;
  path?: string | null;
  thumb_url?: string | null;
  thumb_path?: string | null;
  display_url?: string | null;
  display_thumb_url?: string | null;
}) {
  return media?.display_url || "";
}

export function getMediaPreviewUrl(media: {
  file_url?: string | null;
  url?: string | null;
  path?: string | null;
  thumb_url?: string | null;
  thumb_path?: string | null;
  display_url?: string | null;
  display_thumb_url?: string | null;
}) {
  return media?.display_thumb_url || getMediaUrl(media);
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

    if (record.media?.length) {
      const primaryMedia = record.media.find(
        (media) => media.url && record.primary_image_url && media.url === record.primary_image_url
      );
      const previewUrl = getMediaPreviewUrl(primaryMedia || record.media[0]);
      if (previewUrl) {
        map[record.archive_id] = previewUrl;
        return;
      }
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
