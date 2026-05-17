import { supabase } from "@/lib/supabase";
import type { FeedItem } from "@/lib/discover-types";
import type { ProfileLocationRow, RecordTagRow } from "@/lib/domain-types";

export async function enrichDiscoverFeedItems(nextItems: FeedItem[]) {
  const recordIds = nextItems.map((item) => item.record_id);
  const userIds = Array.from(new Set(nextItems.map((item) => item.user_id)));
  const archiveIds = Array.from(new Set(nextItems.map((item) => item.archive_id).filter(Boolean)));

  const tagMap = new Map<string, string[]>();
  const locationMap = new Map<string, string | null>();
  const archiveCreatedAtMap = new Map<string, string | null>();
  const archiveFollowerCountMap = new Map<string, number>();

  if (recordIds.length > 0) {
    const { data: tagRows } = await supabase
      .from("record_tags")
      .select("record_id, tag, tag_type, is_active")
      .in("record_id", recordIds)
      .eq("tag_type", "behavior")
      .neq("is_active", false);

    (tagRows || []).forEach((row: RecordTagRow) => {
      const prev = tagMap.get(row.record_id) || [];
      if (!prev.includes(row.tag)) {
        prev.push(row.tag);
      }
      tagMap.set(row.record_id, prev);
    });
  }


  if (archiveIds.length > 0) {
    const [{ data: archiveRows }, { data: followRows }] = await Promise.all([
      supabase.from("archives").select("id, created_at").in("id", archiveIds),
      supabase.from("archive_follows").select("archive_id").in("archive_id", archiveIds),
    ]);

    (archiveRows || []).forEach((row: { id: string; created_at: string | null }) => {
      archiveCreatedAtMap.set(row.id, row.created_at || null);
    });

    (followRows || []).forEach((row: { archive_id: string | null }) => {
      if (!row.archive_id) return;
      archiveFollowerCountMap.set(
        row.archive_id,
        (archiveFollowerCountMap.get(row.archive_id) || 0) + 1
      );
    });
  }

  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, location")
      .in("id", userIds);

    (profileRows || []).forEach((row: ProfileLocationRow) => {
      locationMap.set(row.id, row.location || null);
    });
  }

  return nextItems.map((item) => ({
    ...item,
    user_location: item.user_location || locationMap.get(item.user_id) || null,
    archive_created_at: item.archive_created_at || archiveCreatedAtMap.get(item.archive_id) || null,
    archive_follower_count:
      typeof item.archive_follower_count === "number"
        ? item.archive_follower_count
        : archiveFollowerCountMap.get(item.archive_id) || 0,
    display_tags: tagMap.get(item.record_id) || [],
  }));
}
