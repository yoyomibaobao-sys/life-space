import type { StoredLocalOwnerContext } from "@/lib/local-owner-context";
import type { MyMembership } from "@/lib/membership";

export type OfflineProfileSnapshot = {
  userId: string | null;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  membership: MyMembership | null;
  storageUsed: number | null;
  storageLimit: number | null;
  accountNumber: string | null;
  location: string | null;
  countryCode: string | null;
  countryName: string | null;
  regionName: string | null;
  cityName: string | null;
  experienceCardCount: number | null;
};

export function buildOfflineProfileSnapshot(input: {
  owner?: StoredLocalOwnerContext | null;
  profile?: {
    username?: string | null;
    avatar_url?: string | null;
    storage_used?: number | null;
    storage_limit?: number | null;
    account_number?: string | null;
    location?: string | null;
    country_code?: string | null;
    country_name?: string | null;
    region_name?: string | null;
    city_name?: string | null;
  } | null;
  membership?: MyMembership | null;
  experienceCardCount?: number | null;
}): OfflineProfileSnapshot {
  return {
    userId: input.owner?.userId || null,
    email: input.owner?.email || null,
    username: input.profile?.username || null,
    avatarUrl: input.profile?.avatar_url || null,
    membership: input.membership || null,
    storageUsed: input.profile?.storage_used ?? null,
    storageLimit: input.profile?.storage_limit ?? null,
    accountNumber: input.profile?.account_number || null,
    location: input.profile?.location || null,
    countryCode: input.profile?.country_code || null,
    countryName: input.profile?.country_name || null,
    regionName: input.profile?.region_name || null,
    cityName: input.profile?.city_name || null,
    experienceCardCount: input.experienceCardCount ?? null,
  };
}
