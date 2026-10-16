import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TrialCleanupInventory = {
  target_id: string;
  eligible: boolean;
  eligibility: string;
  safe_to_delete: false;
  projects?: number;
  records?: number;
  photos?: number;
  market_posts?: number;
  market_media?: number;
  candidate_storage_paths?: number;
  unsafe_path_references?: number;
  unresolved_url_references?: number;
  owner_chain_mismatches?: number;
  registered_photo_bytes?: number;
  capacity_measurement?: "application_metadata_only";
};

const COUNT_FIELDS = [
  "projects", "records", "photos", "market_posts", "market_media",
  "candidate_storage_paths", "unsafe_path_references",
  "unresolved_url_references", "owner_chain_mismatches",
  "registered_photo_bytes",
] as const;

/**
 * Opt-in server-only diagnostic. This never deletes account or Storage data.
 * The underlying SQL deliberately never returns raw file paths.
 */
export async function inspectTrialCleanupTarget(targetId: string): Promise<TrialCleanupInventory> {
  if (process.env.TRIAL_ADMIN_INVENTORY_ENABLED !== "true") {
    throw new Error("trial_cleanup_inventory_disabled");
  }
  if (!UUID_PATTERN.test(targetId)) {
    throw new Error("trial_cleanup_inventory_invalid_target");
  }
  const { data, error } = await getSupabaseAdmin().rpc(
    "inspect_trial_cloud_cleanup_target", { p_target_id: targetId },
  );
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("trial_cleanup_inventory_failed");
  }

  const value = data as Record<string, unknown>;
  if (value.target_id !== targetId || value.safe_to_delete !== false
    || typeof value.eligible !== "boolean"
    || typeof value.eligibility !== "string") {
    throw new Error("trial_cleanup_inventory_invalid_result");
  }
  if (value.eligible) {
    if (value.eligibility !== "eligible"
      || value.capacity_measurement !== "application_metadata_only"
      || COUNT_FIELDS.some((field) => typeof value[field] !== "number"
        || !Number.isSafeInteger(value[field])
        || (value[field] as number) < 0)) {
      throw new Error("trial_cleanup_inventory_invalid_result");
    }
  }
  return value as TrialCleanupInventory;
}
