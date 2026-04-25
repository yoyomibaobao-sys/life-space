import { supabase } from "@/lib/supabase";
import type { FeedItem } from "@/lib/discover-types";
import type { ProfileLocationRow, RecordTagRow } from "@/lib/domain-types";

export async function enrichDiscoverFeedItems(nextItems: FeedItem[]) {
  const recordIds = nextItems.map((item) => item.record_id);
  const userIds = Array.from(new Set(nextItems.map((item) => item.user_id)));

  const tagMap = new Map<string, string[]>();
  const locationMap = new Map<string, string | null>();

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
    display_tags: tagMap.get(item.record_id) || [],
  }));
}
