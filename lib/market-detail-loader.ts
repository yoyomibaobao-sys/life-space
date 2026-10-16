import { PUBLIC_PROFILE_SELECT } from "@/lib/domain-types";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import type { MarketPostRow } from "@/lib/market-types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MarketDetailProfileBrief = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

export type MarketDetailArchiveBrief = {
  id: string;
  title: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
};

export type MarketDetailSourceRecordBrief = {
  id: string;
  archive_id: string | null;
  note: string | null;
  photo_time: string | null;
};

export type MarketDetailMediaRow = {
  id: string;
  market_post_id: string;
  user_id: string;
  url: string | null;
  path: string | null;
  thumb_url?: string | null;
  thumb_path?: string | null;
  display_url?: string | null;
  display_thumb_url?: string | null;
  source_media_id: string | null;
  source_record_id: string | null;
  sort_order: number | null;
  created_at: string | null;
};

export type MarketPostDisplayRow = MarketPostRow & {
  display_cover_image_url?: string | null;
  display_cover_thumb_url?: string | null;
};

export type MarketDetailPayload = {
  item: MarketPostDisplayRow | null;
  profile: MarketDetailProfileBrief | null;
  archive: MarketDetailArchiveBrief | null;
  sourceRecord: MarketDetailSourceRecordBrief | null;
  marketMedia: MarketDetailMediaRow[];
  currentUserId: string | null;
};

export async function loadMarketPostDetail(
  client: SupabaseClient,
  id: string,
): Promise<MarketDetailPayload> {
  const {
    data: { user },
  } = await client.auth.getUser();

  const { data, error } = await client
    .from("market_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("load market detail error:", error);
    return {
      item: null,
      profile: null,
      archive: null,
      sourceRecord: null,
      marketMedia: [],
      currentUserId: user?.id || null,
    };
  }

  const row = (data || null) as MarketPostRow | null;
  if (!row) {
    return {
      item: null,
      profile: null,
      archive: null,
      sourceRecord: null,
      marketMedia: [],
      currentUserId: user?.id || null,
    };
  }

  const [profileResult, archiveResult, sourceRecordResult, mediaResult] =
    await Promise.all([
      client
        .from("public_profiles")
        .select(PUBLIC_PROFILE_SELECT)
        .eq("id", row.user_id)
        .maybeSingle(),
      row.archive_id
        ? client
            .from("archives")
            .select("id, title, system_name, species_name_snapshot")
            .eq("id", row.archive_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      row.source_record_id
        ? client
            .from("records")
            .select("id, archive_id, note, photo_time")
            .eq("id", row.source_record_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      client
        .from("market_media")
        .select("*")
        .eq("market_post_id", row.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  const rawMarketMedia = mediaResult.error
    ? []
    : ((mediaResult.data || []) as MarketDetailMediaRow[]);
  if (mediaResult.error) {
    console.error("load market media error:", mediaResult.error);
  }

  const displayPairs = await resolveMediaDisplayPairs(client, [
    {
      url: row.cover_image_url,
      path: row.cover_image_path,
      thumb_url: row.cover_thumb_url,
      thumb_path: row.cover_thumb_path,
    },
    ...rawMarketMedia,
  ]);

  if (row.status === "active") {
    void client
      .from("market_posts")
      .update({ view_count: Number(row.view_count || 0) + 1 })
      .eq("id", row.id);
  }

  return {
    item: {
      ...row,
      display_cover_image_url: displayPairs[0]?.display_url || null,
      display_cover_thumb_url: displayPairs[0]?.display_thumb_url || null,
    },
    profile: (profileResult.data || null) as MarketDetailProfileBrief | null,
    archive: (archiveResult.data || null) as MarketDetailArchiveBrief | null,
    sourceRecord: (sourceRecordResult.data || null) as MarketDetailSourceRecordBrief | null,
    marketMedia: rawMarketMedia.map((media, index) => ({
      ...media,
      ...displayPairs[index + 1],
    })),
    currentUserId: user?.id || null,
  };
}
