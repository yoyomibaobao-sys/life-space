export type SocialProfileSummary = {
  id?: string;
  username?: string | null;
  avatar_url?: string | null;
  level?: number | null;
  flower_count?: number | null;
};

export type FollowCountSummary = {
  followingCount: number;
  followerCount: number;
};

export type RecentArchiveItem = {
  title: string;
  last_record_time: string | null;
};

export function getArchiveDisplayName(title?: string | null, systemName?: string | null) {
  const safeTitle = title || "未命名项目";
  const safeSystemName = systemName || "未填写";
  return `${safeTitle} · ${safeSystemName}`;
}

export function sortRecentArchives(items: RecentArchiveItem[]) {
  return [...items].sort((a, b) => getTimeValue(b.last_record_time) - getTimeValue(a.last_record_time));
}

export function getRecentArchiveTitles(items: RecentArchiveItem[], count = 3) {
  return sortRecentArchives(items)
    .slice(0, count)
    .map((item) => item.title);
}

export function getTimeValue(value?: string | null) {
  return value ? new Date(value).getTime() : 0;
}

export async function loadFollowCountSummary(
  supabase: any,
  targetUserId: string
): Promise<FollowCountSummary> {
  const [{ count: followingCount }, { count: followerCount }] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", targetUserId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", targetUserId),
  ]);

  return {
    followingCount: followingCount || 0,
    followerCount: followerCount || 0,
  };
}

export async function loadUserFollowState(
  supabase: any,
  viewerId: string,
  targetUserId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerId)
    .eq("following_id", targetUserId)
    .maybeSingle();

  return !!data;
}
