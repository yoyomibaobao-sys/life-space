import { supabase } from "@/lib/supabase";
import type { FeedItem } from "@/lib/discover-types";
import type { PublicProfile, RecordTagRow } from "@/lib/domain-types";
import { buildLocationTextFromFields } from "@/lib/region-shared";
import { attachMediaDisplayUrls } from "@/lib/media-urls";

export async function enrichDiscoverFeedItems(nextItems: FeedItem[]) {
  const recordIds = nextItems.map((item) => item.record_id);
  const userIds = Array.from(new Set(nextItems.map((item) => item.user_id)));
  const archiveIds = Array.from(new Set(nextItems.map((item) => item.archive_id).filter(Boolean)));

  const tagMap = new Map<string, string[]>();
  const locationMap = new Map<string, string | null>();
  const archiveCreatedAtMap = new Map<string, string | null>();
  const archiveFollowerCountMap = new Map<string, number>();
  const recordThumbMap = new Map<string, string | null>();

  if (recordIds.length > 0) {
    const [{ data: tagRows }, { data: mediaRows }] = await Promise.all([
      supabase
        .from("record_tags")
        .select("record_id, tag, tag_type, is_active")
        .in("record_id", recordIds)
        .eq("tag_type", "behavior")
        .neq("is_active", false),
      supabase
        .from("media")
        .select("record_id, url, thumb_url, storage_path, thumb_path, created_at")
        .in("record_id", recordIds)
        .eq("type", "image")
        .order("created_at", { ascending: true }),
    ]);

    (tagRows || []).forEach((row: RecordTagRow) => {
      const prev = tagMap.get(row.record_id) || [];
      if (!prev.includes(row.tag)) {
        prev.push(row.tag);
      }
      tagMap.set(row.record_id, prev);
    });

    const displayMediaRows = await attachMediaDisplayUrls(
      supabase,
      (mediaRows || []) as Array<{
        record_id: string | null;
        url: string | null;
        thumb_url: string | null;
        storage_path?: string | null;
        thumb_path?: string | null;
      }>
    );

    displayMediaRows.forEach((row) => {
      const thumbUrl = row.display_thumb_url || row.thumb_url;
      if (!row.record_id || !thumbUrl) return;
      const item = nextItems.find((feedItem) => feedItem.record_id === row.record_id);
      const isPrimaryMedia = !item?.primary_image_url || item.primary_image_url === row.url;

      if (isPrimaryMedia || !recordThumbMap.has(row.record_id)) {
        recordThumbMap.set(row.record_id, thumbUrl);
      }
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
      .from("public_profiles")
      .select("id, country_code, country_name, region_name, city_name")
      .in("id", userIds);

    (profileRows || []).forEach((row: PublicProfile) => {
      locationMap.set(
        row.id,
        buildLocationTextFromFields({
          countryCode: row.country_code,
          countryName: row.country_name,
          regionName: row.region_name,
          cityName: row.city_name,
        }) || null
      );
    });
  }

  return nextItems.map((item) => ({
    ...item,
    user_location: item.user_location || locationMap.get(item.user_id) || null,
    primary_thumb_url: recordThumbMap.get(item.record_id) || item.primary_thumb_url || null,
    archive_created_at: item.archive_created_at || archiveCreatedAtMap.get(item.archive_id) || null,
    archive_follower_count:
      typeof item.archive_follower_count === "number"
        ? item.archive_follower_count
        : archiveFollowerCountMap.get(item.archive_id) || 0,
    display_tags: tagMap.get(item.record_id) || [],
  }));
}
