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
};

export function buildOfflineProfileSnapshot(input: {
  owner?: StoredLocalOwnerContext | null;
  profile?: {
    username?: string | null;
    avatar_url?: string | null;
    storage_used?: number | null;
    storage_limit?: number | null;
  } | null;
  membership?: MyMembership | null;
}): OfflineProfileSnapshot {
  return {
    userId: input.owner?.userId || null,
    email: input.owner?.email || null,
    username: input.profile?.username || null,
    avatarUrl: input.profile?.avatar_url || null,
    membership: input.membership || null,
    storageUsed: input.profile?.storage_used ?? null,
    storageLimit: input.profile?.storage_limit ?? null,
  };
}
