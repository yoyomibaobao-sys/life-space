import type { PostgrestError } from "@supabase/supabase-js";
import {
  enrichDiscoveryProjectMedia,
  normalizeDiscoveryProjectFeedRow,
} from "@/lib/discover-project-feed";
import type {
  DiscoveryProjectCursor,
  DiscoveryProjectFeedItem,
  DiscoveryProjectFeedRow,
} from "@/lib/discover-project-types";
import type { ArchiveCategory } from "@/lib/archive-categories";
import { supabase } from "@/lib/supabase";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 49;

export type FollowedPublicProjectFeedParams = {
  ownerUserId?: string | null;
  category?: ArchiveCategory | null;
  helpOnly?: boolean;
  cursor?: DiscoveryProjectCursor | null;
  limit?: number;
};

export type FollowedPublicProjectFeedResult = {
  items: DiscoveryProjectFeedItem[];
  nextCursor: DiscoveryProjectCursor | null;
  hasMore: boolean;
  error: PostgrestError | null;
};

function normalizePageLimit(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PAGE_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(value), 1), MAX_PAGE_LIMIT);
}

export async function fetchFollowedPublicProjects({
  ownerUserId = null,
  category = null,
  helpOnly = false,
  cursor = null,
  limit,
}: FollowedPublicProjectFeedParams = {}): Promise<FollowedPublicProjectFeedResult> {
  const pageLimit = normalizePageLimit(limit);
  const { data, error } = await supabase.rpc(
    "get_followed_public_project_feed",
    {
      p_owner_user_id: ownerUserId,
      p_category: category,
      p_help_only: helpOnly,
      p_cursor_public_activity_at: cursor?.public_activity_at || null,
      p_cursor_archive_id: cursor?.archive_id || null,
      p_limit: pageLimit + 1,
    }
  );

  if (error) {
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
      error,
    };
  }

  const rows = (data || []) as unknown as DiscoveryProjectFeedRow[];
  const hasExtraRow = rows.length > pageLimit;
  const pageRows = rows.slice(0, pageLimit);
  const normalizedItems = pageRows.map(normalizeDiscoveryProjectFeedRow);
  const items = await enrichDiscoveryProjectMedia(normalizedItems);
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasExtraRow && lastItem?.public_activity_at
      ? {
          public_activity_at: lastItem.public_activity_at,
          archive_id: lastItem.archive_id,
        }
      : null;

  return {
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    error: null,
  };
}
