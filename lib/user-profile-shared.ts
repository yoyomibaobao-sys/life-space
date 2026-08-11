import { PUBLIC_PROFILE_SELECT, type AppProfile } from "@/lib/domain-types";
import { isMissingDatabaseColumn } from "@/lib/supabase-schema-compat";
import { formatCardDate, formatPreciseDateTime } from "@/lib/date-time";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Language } from "@/lib/i18n";

export type UserProfileStats = {
  archiveCount: number;
  publicArchiveCount: number;
  endedArchiveCount: number;
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
  status?: string | null;
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

export function formatProfileDateTime(
  value?: string | null,
  language: Language = "zh"
) {
  return formatPreciseDateTime(value) || (language === "en" ? "None" : "暂无");
}

export function formatProfileDate(
  value?: string | null,
  language: Language = "zh"
) {
  return formatCardDate(value) || (language === "en" ? "None" : "暂无");
}

function formatStorageNumber(value: number) {
  const rounded = value >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function formatStorage(bytes?: number | null) {
  const size = Math.max(0, Number(bytes || 0));
  if (!Number.isFinite(size) || size <= 0) return "0 B";

  const kb = 1000;
  const mb = 1000 * 1000;
  const gb = 1000 * 1000 * 1000;

  if (size >= gb) return `${formatStorageNumber(size / gb)} GB`;
  if (size >= mb) return `${formatStorageNumber(size / mb)} MB`;
  if (size >= kb) return `${formatStorageNumber(size / kb)} KB`;
  return `${Math.round(size)} B`;
}

async function loadUserProfileDataWithProfile(
  supabase: SupabaseClient,
  userId: string,
  profileSource: "own" | "public"
): Promise<PublicUserProfileData> {
  const profileQuery =
    profileSource === "own"
      ? supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
      : supabase.from("public_profiles").select(PUBLIC_PROFILE_SELECT).eq("id", userId).maybeSingle();
  const accountIdentitySource =
    profileSource === "own" ? "users" : "public_profiles";
  const accountIdentityQuery =
    profileSource === "own"
      ? supabase
          .from("users")
          .select(
            "account_number, registration_year, registration_sequence, is_internal_test"
          )
          .eq("id", userId)
          .maybeSingle()
      : supabase
          .from("public_profiles")
          .select("account_number, registration_year, registration_sequence")
          .eq("id", userId)
          .maybeSingle();

  const [
    profileResult,
    accountIdentityResult,
    archivesResult,
    followingResult,
    followerResult,
    archiveFollowsResult,
    plansResult,
    interestsResult,
    receivedFlowersResult,
    sentFlowersResult,
  ] = await Promise.all([
    profileQuery,
    accountIdentityQuery,
    supabase
      .from("archives")
      .select("id, title, system_name, category, status, last_record_time, record_count, view_count, is_public")
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

  const accountIdentityMissing =
    Boolean(accountIdentityResult.error) &&
    (
      isMissingDatabaseColumn(
        accountIdentityResult.error,
        accountIdentitySource,
        "account_number"
      ) ||
      isMissingDatabaseColumn(
        accountIdentityResult.error,
        accountIdentitySource,
        "registration_year"
      ) ||
      isMissingDatabaseColumn(
        accountIdentityResult.error,
        accountIdentitySource,
        "registration_sequence"
      )
    );

  if (accountIdentityResult.error && !accountIdentityMissing) {
    console.error("load account identity error:", accountIdentityResult.error);
  }

  const baseProfile = (profileResult.data || null) as AppProfile | null;
  const accountIdentity = accountIdentityMissing
    ? null
    : (accountIdentityResult.data as Partial<AppProfile> | null);
  const mergedProfile = baseProfile
    ? {
        ...baseProfile,
        account_number:
          accountIdentity?.account_number ?? baseProfile.account_number ?? null,
        registration_year:
          accountIdentity?.registration_year ??
          baseProfile.registration_year ??
          null,
        registration_sequence:
          accountIdentity?.registration_sequence ??
          baseProfile.registration_sequence ??
          null,
        is_internal_test:
          accountIdentity?.is_internal_test ??
          baseProfile.is_internal_test ??
          null,
      }
    : null;

  const archives = (archivesResult.data || []) as Array<UserProfileArchiveItem & { is_public?: boolean | null }>;
  const publicArchives = archives.filter((item) => item.is_public);
  const endedArchives = archives.filter((item) => item.status === "ended");
  const plans = (plansResult.data || []) as UserPlantPlanRow[];
  const planNames = plans
    .map((item) => item.plant_species?.common_name || item.plant_species?.scientific_name || "")
    .filter(Boolean)
    .slice(0, 3);

  return {
    profile: mergedProfile,
    stats: {
      archiveCount: archives.length,
      publicArchiveCount: publicArchives.length,
      endedArchiveCount: endedArchives.length,
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

export async function loadUserProfileData(supabase: SupabaseClient, userId: string): Promise<PublicUserProfileData> {
  return loadUserProfileDataWithProfile(supabase, userId, "own");
}

export async function loadPublicUserProfileData(supabase: SupabaseClient, userId: string): Promise<PublicUserProfileData> {
  return loadUserProfileDataWithProfile(supabase, userId, "public");
}
