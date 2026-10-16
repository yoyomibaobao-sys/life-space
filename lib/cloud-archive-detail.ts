import { supabase } from "@/lib/supabase";
import { attachMediaDisplayUrls, resolveMediaDisplayPairs } from "@/lib/media-urls";
import { getCloudArchiveCategoryDepths } from "@/lib/archive-category-settings";
import type { ArchiveCycle, ArchiveDetailArchive, RecordItem, RecordQueryRow, RecordTagRow } from "@/lib/archive-detail-types";
import type { MediaItem } from "@/lib/domain-types";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";

export type ReadonlyPublicProjectSummary = Pick<DiscoveryProjectFeedItem,
  "archive_id" | "archive_title" | "profile_display_name" | "system_name" |
  "display_image_url" | "card_summary">;

// Used by the website and the bundled Android controller. This module has no
// Next route or document dependency; Supabase RLS remains the access boundary.
export async function loadCloudArchiveTimeline(
  archiveId: string,
  isOwner: boolean,
  client: typeof supabase = supabase,
) {
  const cycleResult = await client.from("archive_cycles")
    .select("id, archive_id, cycle_no, display_name, status, started_at, ended_at, created_at, updated_at")
    .eq("archive_id", archiveId).order("cycle_no", { ascending: false });
  if (cycleResult.error) throw cycleResult.error;

  let query = client.from("records")
    .select("*, record_tags (tag, tag_type, source, is_active)")
    .eq("archive_id", archiveId).order("record_time", { ascending: false });
  if (!isOwner) query = query.eq("visibility", "public");
  const recordResult = await query;
  if (recordResult.error) throw recordResult.error;
  const rows = (recordResult.data || []) as RecordQueryRow[];
  const mediaMap = new Map<string, MediaItem[]>();
  if (rows.length) {
    const mediaResult = await client.from("media").select("*").in("record_id", rows.map((row) => row.id));
    if (mediaResult.error) throw mediaResult.error;
    const media = await attachMediaDisplayUrls(client, (mediaResult.data || []) as MediaItem[]);
    for (const item of media) {
      if (!item.record_id) continue;
      mediaMap.set(item.record_id, [...(mediaMap.get(item.record_id) || []), item]);
    }
  }
  const records: RecordItem[] = rows.map((row) => {
    const tags = row.record_tags || [];
    const active = tags.filter((tag): tag is RecordTagRow & { tag: string } =>
      tag.tag_type === "behavior" && tag.is_active !== false && typeof tag.tag === "string");
    const display = Array.from(new Set(active.map((tag) => tag.tag)));
    return {
      ...row,
      media: mediaMap.get(row.id) || [],
      parsed_actions: display,
      display_tags: display,
      user_behavior_tags: Array.from(new Set(active.filter((tag) => tag.source === "user").map((tag) => tag.tag))),
    };
  });
  return { records, cycles: (cycleResult.data || []) as ArchiveCycle[] };
}

export async function loadCloudArchiveDetail(
  archiveId: string,
  userId: string,
  client: typeof supabase = supabase,
) {
  const result = await client.from("archives").select("*").eq("id", archiveId).maybeSingle();
  if (result.error) throw result.error;
  const archive = result.data as ArchiveDetailArchive | null;
  if (!archive || archive.user_id !== userId || archive.trashed_at) return null;

  const [timeline, profileResult, subTags, groupTags, depths] = await Promise.all([
    loadCloudArchiveTimeline(archiveId, true, client),
    client.from("public_profiles").select("username").eq("id", userId).maybeSingle(),
    client.from("sub_tags").select("id, user_id, name, category").eq("user_id", userId).order("created_at", { ascending: true }),
    client.from("group_tags").select("id, user_id, name, sub_tag_id").eq("user_id", userId).order("created_at", { ascending: true }),
    getCloudArchiveCategoryDepths(userId),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (subTags.error) throw subTags.error;
  if (groupTags.error) throw groupTags.error;
  return {
    archive,
    ...timeline,
    username: profileResult.data?.username || "",
    subTags: subTags.data || [],
    groupTags: groupTags.data || [],
    depths,
  };
}

// A followed project's URL is not necessarily in the home feed or the
// signed-in owner's cloud list. Resolve the archive before choosing the
// Android owner controller or the existing public read-only presentation.
export async function resolveCloudArchiveRoute(
  archiveId: string,
  client: typeof supabase = supabase,
): Promise<{ ownerId: string; publicSummary: ReadonlyPublicProjectSummary | null } | null> {
  const result = await client.from("archives")
    .select("id, user_id, title, system_name, species_name_snapshot, archive_summary, is_public, trashed_at, cover_image_url, cover_image_path, cover_thumb_path")
    .eq("id", archiveId).maybeSingle();
  if (result.error) throw result.error;
  const archive = result.data;
  if (!archive || archive.trashed_at) return null;
  if (!archive.is_public) return { ownerId: archive.user_id, publicSummary: null };

  const profile = await client.from("public_profiles")
    .select("username").eq("id", archive.user_id).maybeSingle();
  if (profile.error) throw profile.error;
  const covers = await resolveMediaDisplayPairs(client, [{
    url: archive.cover_image_url,
    path: archive.cover_image_path,
    thumb_path: archive.cover_thumb_path,
  }]);
  return {
    ownerId: archive.user_id,
    publicSummary: {
      archive_id: archive.id,
      archive_title: archive.title,
      profile_display_name: profile.data?.username || null,
      system_name: archive.system_name || archive.species_name_snapshot || null,
      display_image_url: covers[0]?.display_thumb_url || covers[0]?.display_url || archive.cover_image_url || null,
      card_summary: archive.archive_summary || null,
    },
  };
}
