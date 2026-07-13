import type { PostgrestError } from "@supabase/supabase-js";
import {
  PUBLIC_PROFILE_SELECT,
  type PublicProfile,
} from "@/lib/domain-types";
import { supabase } from "@/lib/supabase";

type FollowRow = {
  id: string;
  following_id: string | null;
  created_at: string | null;
};

export type FollowedUserSummary = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  region: string | null;
  followedAt: string | null;
};

export type FollowedUsersResult = {
  users: FollowedUserSummary[];
  error: PostgrestError | null;
};

export function getPublicProfileRegion(profile?: PublicProfile) {
  if (!profile) return null;

  const parts = [
    profile.country_name,
    profile.region_name,
    profile.city_name,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(parts)).join(" ") || null;
}

export async function fetchFollowedUsers(
  currentUserId: string
): Promise<FollowedUsersResult> {
  const { data: followData, error: followError } = await supabase
    .from("follows")
    .select("id, following_id, created_at")
    .eq("follower_id", currentUserId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (followError) {
    return { users: [], error: followError };
  }

  const seenUserIds = new Set<string>();
  const followRows = ((followData || []) as FollowRow[]).filter((row) => {
    if (!row.following_id || seenUserIds.has(row.following_id)) return false;
    seenUserIds.add(row.following_id);
    return true;
  });
  const followedUserIds = followRows.map((row) => row.following_id as string);

  if (!followedUserIds.length) {
    return { users: [], error: null };
  }

  const { data: profileData, error: profileError } = await supabase
    .from("public_profiles")
    .select(PUBLIC_PROFILE_SELECT)
    .in("id", followedUserIds);

  if (profileError) {
    return { users: [], error: profileError };
  }

  const profiles = (profileData || []) as PublicProfile[];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  return {
    users: followRows.map((row) => {
      const userId = row.following_id as string;
      const profile = profileMap.get(userId);

      return {
        id: userId,
        displayName: profile?.username?.trim() || "一位用户",
        avatarUrl: profile?.avatar_url || null,
        region: getPublicProfileRegion(profile),
        followedAt: row.created_at,
      };
    }),
    error: null,
  };
}
