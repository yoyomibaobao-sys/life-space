import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { runTrialCleanupPreflightReview } from "@/lib/trial-cleanup-preflight";

/**
 * Internal, opt-in QA helper. Intentionally not attached to Cron, admin UI,
 * or the generic Storage worker until migration and payment QA are complete.
 */
export async function runTrialCleanupPreflight(batchId: string) {
  if (process.env.TRIAL_ADMIN_PREFLIGHT_ENABLED !== "true") {
    throw new Error("trial_cleanup_preflight_disabled");
  }
  const admin = getSupabaseAdmin();
  return runTrialCleanupPreflightReview(
    async (name, args) => {
      const result = await admin.rpc(name, args);
      return { data: result.data, error: result.error };
    },
    batchId,
  );
}
