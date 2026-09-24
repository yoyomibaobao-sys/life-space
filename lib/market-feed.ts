import { PUBLIC_PROFILE_SELECT } from "@/lib/domain-types";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import {
  type MarketItemCategory,
  type MarketPostRow,
  type MarketPostType,
} from "@/lib/market-types";
import { supabase } from "@/lib/supabase";

export type MarketProfileBrief = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  country_name: string | null;
  region_name: string | null;
  city_name: string | null;
};

export type MarketArchiveBrief = {
  id: string;
  title: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
};

export type MarketPostDisplayRow = MarketPostRow & {
  display_cover_image_url?: string | null;
  display_cover_thumb_url?: string | null;
};

export type MarketFeedParams = {
  typeFilter?: "all" | MarketPostType;
  categoryFilter?: "all" | MarketItemCategory;
  limit?: number;
};

export type MarketFeedResult = {
  items: MarketPostDisplayRow[];
  profiles: Map<string, MarketProfileBrief>;
  archives: Map<string, MarketArchiveBrief>;
  currentUserId: string | null;
  error: unknown | null;
};

async function attachMarketPostDisplayUrls<T extends MarketPostRow>(rows: T[]) {
  const pairs = await resolveMediaDisplayPairs(
    supabase,
    rows.map((row) => ({
      url: row.cover_image_url,
      path: row.cover_image_path,
      thumb_url: row.cover_thumb_url,
      thumb_path: row.cover_thumb_path,
    })),
  );

  return rows.map((row, index) => ({
    ...row,
    display_cover_image_url: pairs[index]?.display_url || null,
    display_cover_thumb_url: pairs[index]?.display_thumb_url || null,
  }));
}

export async function fetchMarketFeed({
  typeFilter = "all",
  categoryFilter = "all",
  limit = 80,
}: MarketFeedParams = {}): Promise<MarketFeedResult> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let query = supabase
      .from("market_posts")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (typeFilter !== "all") {
      query = query.eq("post_type", typeFilter);
    }
    if (categoryFilter !== "all") {
      query = query.eq("item_category", categoryFilter);
    }

    const { data, error } = await query;
    if (error) {
      return {
        items: [],
        profiles: new Map(),
        archives: new Map(),
        currentUserId: user?.id || null,
        error,
      };
    }

    const rows = await attachMarketPostDisplayUrls(
      (data || []) as MarketPostRow[],
    );
    const userIds = Array.from(new Set(rows.map((item) => item.user_id)));
    const archiveIds = Array.from(
      new Set(rows.map((item) => item.archive_id).filter(Boolean)),
    ) as string[];

    const [profilesResult, archivesResult] = await Promise.all([
      userIds.length
        ? supabase
            .from("public_profiles")
            .select(PUBLIC_PROFILE_SELECT)
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      archiveIds.length
        ? supabase
            .from("archives")
            .select("id, title, system_name, species_name_snapshot")
            .in("id", archiveIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const profiles = new Map(
      ((profilesResult.data || []) as MarketProfileBrief[]).map((profile) => [
        profile.id,
        profile,
      ]),
    );
    const archives = new Map(
      ((archivesResult.data || []) as MarketArchiveBrief[]).map((archive) => [
        archive.id,
        archive,
      ]),
    );

    return {
      items: rows,
      profiles,
      archives,
      currentUserId: user?.id || null,
      error: profilesResult.error || archivesResult.error || null,
    };
  } catch (error) {
    return {
      items: [],
      profiles: new Map(),
      archives: new Map(),
      currentUserId: null,
      error,
    };
  }
}
