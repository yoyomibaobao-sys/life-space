import { getArchiveCategoryLabel, getArchiveNamePlaceholder } from "@/lib/archive-categories";
import type { FeedItem, UserSection } from "@/lib/discover-types";

export function categoryLabel(value?: string | null) {
  return getArchiveCategoryLabel(value);
}

export function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortText(value?: string | null, maxLength = 42) {
  const text = (value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

export function getArchiveUserTitle(record: FeedItem) {
  return record.archive_title || "未命名项目";
}

export function getArchiveSystemName(record: FeedItem) {
  const systemName =
    record.archive_category === "plant"
      ? record.species_name_snapshot || record.system_name
      : record.system_name || record.species_name_snapshot;

  if (systemName) return systemName;
  return getArchiveNamePlaceholder(record.archive_category);
}

export function getArchiveRecordCount(record: FeedItem) {
  const value = record.archive_record_count ?? record.record_count;
  if (typeof value === "number" && value >= 0) return value;
  return null;
}

export function getArchiveViewCount(record: FeedItem) {
  const value = record.archive_view_count ?? record.view_count;
  if (typeof value === "number" && value >= 0) return value;
  return null;
}

export function getArchiveLifecycleStatus(record: FeedItem) {
  return record.archive_status === "ended" ? "ended" : "active";
}

export function compareArchiveDisplayOrder(a: FeedItem, b: FeedItem) {
  const aEnded = getArchiveLifecycleStatus(a) === "ended";
  const bEnded = getArchiveLifecycleStatus(b) === "ended";

  if (aEnded !== bEnded) {
    return aEnded ? 1 : -1;
  }

  return new Date(b.record_time).getTime() - new Date(a.record_time).getTime();
}

export function buildUserSections(items: FeedItem[]): UserSection[] {
  const userMap = new Map<
    string,
    {
      user_id: string;
      username: string;
      avatar_url: string | null;
      user_location: string | null;
      latest_time: string;
      archiveMap: Map<string, FeedItem>;
    }
  >();

  const sortedItems = [...items].sort(
    (a, b) => new Date(b.record_time).getTime() - new Date(a.record_time).getTime()
  );

  sortedItems.forEach((item) => {
    if (!item.user_id || !item.archive_id) return;

    const current = userMap.get(item.user_id) || {
      user_id: item.user_id,
      username: item.username || "用户",
      avatar_url: item.avatar_url || null,
      user_location: item.user_location || null,
      latest_time: item.record_time,
      archiveMap: new Map<string, FeedItem>(),
    };

    current.username = item.username || current.username || "用户";
    current.avatar_url = item.avatar_url || current.avatar_url || null;
    current.user_location = item.user_location || current.user_location || null;

    if (new Date(item.record_time).getTime() > new Date(current.latest_time).getTime()) {
      current.latest_time = item.record_time;
    }

    if (!current.archiveMap.has(item.archive_id)) {
      current.archiveMap.set(item.archive_id, item);
    }

    userMap.set(item.user_id, current);
  });

  return Array.from(userMap.values())
    .map((user) => {
      const records = Array.from(user.archiveMap.values()).sort(compareArchiveDisplayOrder);
      const first = records[0];
      const helpRecord = records.find(
        (record) => record.status_tag === "help" && (!first || record.record_id !== first.record_id)
      );

      let orderedRecords = records;
      if (first && helpRecord) {
        orderedRecords = [
          first,
          helpRecord,
          ...records.filter(
            (record) =>
              record.record_id !== first.record_id &&
              record.record_id !== helpRecord.record_id
          ),
        ];
      }

      return {
        user_id: user.user_id,
        username: user.username,
        avatar_url: user.avatar_url,
        user_location: user.user_location,
        latest_time: user.latest_time,
        records: orderedRecords.slice(0, 4),
        total_project_count: orderedRecords.length,
      };
    })
    .filter((section) => section.records.length > 0)
    .sort(
      (a, b) => new Date(b.latest_time).getTime() - new Date(a.latest_time).getTime()
    );
}
