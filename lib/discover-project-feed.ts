import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  getMediaFallbackUrl,
  getMediaObjectPath,
  getMediaThumbObjectPath,
} from "@/lib/media-urls";
import type {
  DiscoveryProjectCursor,
  DiscoveryProjectFeedFilters,
  DiscoveryProjectFeedItem,
  DiscoveryProjectFeedRow,
} from "@/lib/discover-project-types";

const DEFAULT_CANDIDATE_LIMIT = 40;
const MAX_CANDIDATE_LIMIT = 200;
const MEDIA_SIGNED_URL_EXPIRES_IN = 60 * 60;
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

type DiscoveryProjectMediaSource = Pick<
  DiscoveryProjectMediaRow,
  "url" | "thumb_url" | "storage_path" | "thumb_path"
>;

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
    has_public_help: row.has_public_help === true,
    card_summary: archiveSummary || latestNote,
    display_image_url: null,
  };
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

async function resolveDiscoveryProjectMediaUrls(
  sources: DiscoveryProjectMediaSource[]
) {
  const paths = Array.from(
    new Set(
      sources
        .flatMap((source) => [
          getMediaObjectPath(source),
          getMediaThumbObjectPath(source),
        ])
        .filter((path): path is string => Boolean(path))
    )
  );
  const signedUrlMap = new Map<string, string>();

  if (paths.length) {
    const { data, error } = await supabase.storage
      .from("media")
      .createSignedUrls(paths, MEDIA_SIGNED_URL_EXPIRES_IN);

    if (error) {
      console.warn("discovery project media signing failed:", error.message);
    } else {
      (data || []).forEach((row) => {
        if (row.path && row.signedUrl) {
          signedUrlMap.set(row.path, row.signedUrl);
        }
      });
    }
  }

  return sources.map((source) => {
    const imagePath = getMediaObjectPath(source);
    const thumbPath = getMediaThumbObjectPath(source);
    const displayUrl =
      (imagePath && signedUrlMap.get(imagePath)) ||
      getMediaFallbackUrl(source, false);
    const displayThumbUrl =
      (thumbPath && signedUrlMap.get(thumbPath)) ||
      getMediaFallbackUrl(source, true) ||
      displayUrl;

    return {
      display_url: displayUrl || null,
      display_thumb_url: displayThumbUrl || null,
    };
  });
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

  const displayPairs = await resolveDiscoveryProjectMediaUrls(sources);

  return items.map((item, index) => ({
    ...item,
    display_image_url:
      displayPairs[index]?.display_thumb_url ||
      displayPairs[index]?.display_url ||
      item.latest_public_primary_image_url ||
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
  const items = await enrichDiscoveryProjectMedia(normalizedItems);
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
