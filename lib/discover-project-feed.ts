import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import type {
  DiscoveryProjectCursor,
  DiscoveryProjectFeedFilters,
  DiscoveryProjectFeedItem,
  DiscoveryProjectFeedRow,
} from "@/lib/discover-project-types";

const DEFAULT_CANDIDATE_LIMIT = 40;
const MAX_CANDIDATE_LIMIT = 200;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DiscoveryProjectMediaRow = {
  record_id: string | null;
  url: string | null;
  thumb_url: string | null;
  storage_path: string | null;
  thumb_path: string | null;
  sort_order: number | null;
  created_at: string | null;
};

type DiscoveryArchiveCountRow = {
  id: string;
  view_count: number | string | null;
};

type DiscoveryArchiveFollowRow = { archive_id: string | null };

type DiscoveryProfileLocationRow = {
  id: string;
  country_name: string | null;
  region_name: string | null;
  city_name: string | null;
};

export type DiscoveryProjectFeedResult = {
  items: DiscoveryProjectFeedItem[];
  nextCursor: DiscoveryProjectCursor | null;
  hasMore: boolean;
  error: PostgrestError | null;
};

function normalizeCount(value: number | string | null) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Math.trunc(parsed), Number.MAX_SAFE_INTEGER);
}

function normalizeOptionalText(value: string | null) {
  const text = String(value || "").trim();
  return text || null;
}

export function normalizeDiscoveryProjectFeedRow(
  row: DiscoveryProjectFeedRow
): DiscoveryProjectFeedItem {
  const archiveSummary = normalizeOptionalText(row.archive_summary);
  const latestNote = normalizeOptionalText(row.latest_public_record_note);

  return {
    ...row,
    archive_summary: archiveSummary,
    latest_public_record_note: latestNote,
    public_record_count: normalizeCount(row.public_record_count),
    public_comment_count: normalizeCount(row.public_comment_count),
    view_count: normalizeCount(row.view_count ?? null),
    follower_count: 0,
    profile_country: null,
    profile_region_name: null,
    profile_city: null,
    has_public_help: row.has_public_help === true,
    card_summary: latestNote || archiveSummary,
    display_image_url: null,
  };
}

export async function enrichDiscoveryProjectViewCounts(
  items: DiscoveryProjectFeedItem[]
): Promise<DiscoveryProjectFeedItem[]> {
  const archiveIds = Array.from(new Set(items.map((item) => item.archive_id).filter(Boolean)));
  if (!archiveIds.length) return items;

  const ownerIds = Array.from(
    new Set(items.map((item) => item.owner_user_id).filter(Boolean) as string[]),
  );
  const [archiveResult, followResult, profileResult] = await Promise.all([
    supabase
      .from("archives")
      .select("id, view_count")
      .in("id", archiveIds)
      .eq("is_public", true),
    supabase.from("archive_follows").select("archive_id").in("archive_id", archiveIds),
    ownerIds.length
      ? supabase
          .from("public_profiles")
          .select("id, country_name, region_name, city_name")
          .in("id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (archiveResult.error) {
    console.warn("discovery project view count load failed:", archiveResult.error.message);
  }
  if (followResult.error) {
    console.warn("discovery project follower count load failed:", followResult.error.message);
  }
  if (profileResult.error) {
    console.warn("discovery project owner location load failed:", profileResult.error.message);
  }

  const countMap = new Map(
    ((archiveResult.data || []) as DiscoveryArchiveCountRow[]).map((row) => [
      String(row.id),
      normalizeCount(row.view_count),
    ]),
  );
  const followerMap = new Map<string, number>();
  ((followResult.data || []) as DiscoveryArchiveFollowRow[]).forEach((row) => {
    const archiveId = String(row.archive_id || "");
    if (!archiveId) return;
    followerMap.set(archiveId, (followerMap.get(archiveId) || 0) + 1);
  });
  const profileMap = new Map(
    ((profileResult.data || []) as DiscoveryProfileLocationRow[]).map((row) => [
      String(row.id),
      row,
    ]),
  );

  return items.map((item) => {
    const profile = item.owner_user_id ? profileMap.get(item.owner_user_id) : null;
    return {
      ...item,
      view_count: countMap.get(item.archive_id) ?? item.view_count,
      follower_count: followerMap.get(item.archive_id) || 0,
      profile_country: String(profile?.country_name || "").trim() || null,
      profile_region_name: String(profile?.region_name || "").trim() || null,
      profile_city: String(profile?.city_name || "").trim() || null,
    };
  });
}

function normalizeLimit(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CANDIDATE_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(value), 1), MAX_CANDIDATE_LIMIT);
}

function buildCursorFilter(cursor: DiscoveryProjectCursor) {
  if (!ISO_TIMESTAMP_PATTERN.test(cursor.public_activity_at)) {
    throw new TypeError("Invalid discovery project activity cursor");
  }

  if (!UUID_PATTERN.test(cursor.archive_id)) {
    throw new TypeError("Invalid discovery project archive cursor");
  }

  const activity = cursor.public_activity_at;
  const archiveId = cursor.archive_id;

  return [
    `public_activity_at.lt.${activity}`,
    `and(public_activity_at.eq.${activity},archive_id.lt.${archiveId})`,
  ].join(",");
}

export async function enrichDiscoveryProjectMedia(
  items: DiscoveryProjectFeedItem[]
): Promise<DiscoveryProjectFeedItem[]> {
  const recordIds = Array.from(
    new Set(items.map((item) => item.latest_public_record_id).filter(Boolean))
  );

  if (!recordIds.length) return items;

  const { data, error } = await supabase
    .from("media")
    .select("record_id, url, thumb_url, storage_path, thumb_path, sort_order, created_at")
    .in("record_id", recordIds)
    .eq("type", "image")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("discovery project media load failed:", error.message);
  }

  const rows = (data || []) as DiscoveryProjectMediaRow[];
  const rowsByRecord = new Map<string, DiscoveryProjectMediaRow[]>();

  rows.forEach((row) => {
    if (!row.record_id) return;
    const recordRows = rowsByRecord.get(row.record_id) || [];
    recordRows.push(row);
    rowsByRecord.set(row.record_id, recordRows);
  });

  const sources = items.map((item) => {
    const recordRows = rowsByRecord.get(item.latest_public_record_id) || [];
    const selectedRow =
      recordRows.find(
        (row) =>
          Boolean(item.latest_public_primary_image_url) &&
          row.url === item.latest_public_primary_image_url
      ) || recordRows[0];

    return (
      selectedRow || {
        record_id: item.latest_public_record_id,
        url: item.latest_public_primary_image_url,
        thumb_url: null,
        storage_path: null,
        thumb_path: null,
        sort_order: null,
        created_at: null,
      }
    );
  });

  const displayPairs = await resolveMediaDisplayPairs(supabase, sources);

  return items.map((item, index) => ({
    ...item,
    display_image_url:
      displayPairs[index]?.display_thumb_url ||
      displayPairs[index]?.display_url ||
      null,
  }));
}

export async function fetchDiscoveryProjectCandidates(
  filters: DiscoveryProjectFeedFilters = {}
): Promise<DiscoveryProjectFeedResult> {
  const limit = normalizeLimit(filters.limit);
  let query = supabase
    .from("discovery_project_feed_view")
    .select("*")
    .order("public_activity_at", { ascending: false, nullsFirst: false })
    .order("archive_id", { ascending: false })
    .limit(limit + 1);

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (filters.helpOnly) {
    query = query.eq("has_public_help", true);
  }

  if (filters.cursor) {
    query = query.or(buildCursorFilter(filters.cursor));
  }

  const { data, error } = await query;

  if (error) {
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
      error,
    };
  }

  const rows = (data || []) as unknown as DiscoveryProjectFeedRow[];
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const normalizedItems = pageRows.map(normalizeDiscoveryProjectFeedRow);
  const itemsWithViews = await enrichDiscoveryProjectViewCounts(normalizedItems);
  const items = await enrichDiscoveryProjectMedia(itemsWithViews);
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem?.public_activity_at
      ? {
          public_activity_at: lastItem.public_activity_at,
          archive_id: lastItem.archive_id,
        }
      : null;

  return {
    items,
    nextCursor,
    hasMore,
    error: null,
  };
}
