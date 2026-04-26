import type { AppProfile } from "@/lib/domain-types";

export type UserProfileStats = {
  archiveCount: number;
  publicArchiveCount: number;
  followingCount: number;
  followerCount: number;
  projectFollowCount: number;
  planCount: number;
  planNames: string[];
  interestCount: number;
  latestRecordTime: string | null;
  receivedFlowerCount: number;
  sentFlowerCount: number;
};

export type UserProfileArchiveItem = {
  id: string;
  title: string | null;
  system_name: string | null;
  category: string | null;
  last_record_time: string | null;
  record_count: number | null;
  view_count: number | null;
};

type UserPlantPlanRow = {
  id: string;
  species_id: string | null;
  plant_species?: {
    common_name?: string | null;
    scientific_name?: string | null;
  } | null;
};

export type PublicUserProfileData = {
  profile: AppProfile | null;
  stats: UserProfileStats;
  recentArchives: UserProfileArchiveItem[];
};

export function formatProfileDateTime(value?: string | null) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatStorage(bytes?: number | null) {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

export async function loadUserProfileData(supabase: any, userId: string): Promise<PublicUserProfileData> {
  const [
    profileResult,
    archivesResult,
    followingResult,
    followerResult,
    archiveFollowsResult,
    plansResult,
    interestsResult,
    receivedFlowersResult,
    sentFlowersResult,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase
      .from("archives")
      .select("id, title, system_name, category, last_record_time, record_count, view_count, is_public")
      .eq("user_id", userId)
      .order("last_record_time", { ascending: false }),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("archive_follows").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("user_plant_plans")
      .select("id, species_id, plant_species:species_id(common_name, scientific_name)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase.from("user_plant_interests").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("comment_flowers").select("*", { count: "exact", head: true }).eq("receiver_user_id", userId).is("revoked_at", null),
    supabase.from("comment_flowers").select("*", { count: "exact", head: true }).eq("sender_user_id", userId).is("revoked_at", null),
  ]);

  const archives = (archivesResult.data || []) as Array<UserProfileArchiveItem & { is_public?: boolean | null }>;
  const publicArchives = archives.filter((item) => item.is_public);
  const plans = (plansResult.data || []) as UserPlantPlanRow[];
  const planNames = plans
    .map((item) => item.plant_species?.common_name || item.plant_species?.scientific_name || "")
    .filter(Boolean)
    .slice(0, 3);

  return {
    profile: (profileResult.data || null) as AppProfile | null,
    stats: {
      archiveCount: archives.length,
      publicArchiveCount: publicArchives.length,
      followingCount: followingResult.count || 0,
      followerCount: followerResult.count || 0,
      projectFollowCount: archiveFollowsResult.count || 0,
      planCount: plans.length,
      planNames,
      interestCount: interestsResult.count || 0,
      latestRecordTime: publicArchives[0]?.last_record_time || archives[0]?.last_record_time || null,
      receivedFlowerCount: receivedFlowersResult.count || 0,
      sentFlowerCount: sentFlowersResult.count || 0,
    },
    recentArchives: publicArchives.slice(0, 6),
  };
}
