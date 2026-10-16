import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type MaintenanceRunSource = "vercel" | "cloudflare" | "unknown";
export type MaintenanceRunSummary = {
  lifecycleProcessed: number;
  lifecycleFailed: number;
  deletionClaimed: number;
  deletionCompleted: number;
  deletionFailed: number;
  deletionRetryScheduled: number;
};

export function maintenanceRunSource(request: Request): MaintenanceRunSource {
  if (request.headers.get("x-lifespace-maintenance-source") === "cloudflare") return "cloudflare";
  if ((request.headers.get("user-agent") || "").toLowerCase().startsWith("vercel-cron/")) return "vercel";
  return "unknown";
}

// Best-effort audit: failure to record never alters existing cleanup outcomes.
export async function writeMaintenanceRunAudit(
  input:
    | { id: string; source: MaintenanceRunSource; status: "running" }
    | { id: string; status: "succeeded" | "failed"; summary: MaintenanceRunSummary; errorCode?: "partial_failure" }
    | { id: string; status: "failed"; errorCode: "worker_failed" }
): Promise<void> {
  try {
    const table = getSupabaseAdmin().from("maintenance_run_audits");
    const summary = "summary" in input ? input.summary : null;
    const query = input.status === "running"
      ? table.insert({ id: input.id, source: input.source, status: "running" })
      : table.update({
          status: input.status,
          finished_at: new Date().toISOString(),
          ...(summary
            ? {
                lifecycle_processed: summary.lifecycleProcessed,
                lifecycle_failed: summary.lifecycleFailed,
                deletion_claimed: summary.deletionClaimed,
                deletion_completed: summary.deletionCompleted,
                deletion_failed: summary.deletionFailed,
                deletion_retry_scheduled: summary.deletionRetryScheduled,
              }
            : {}),
          ...(input.status === "failed" ? { error_code: input.errorCode } : {}),
        }).eq("id", input.id);
    const { error } = await query.abortSignal(AbortSignal.timeout(2500));
    if (error) console.warn("maintenance run audit unavailable", { phase: input.status });
  } catch {
    console.warn("maintenance run audit unavailable", { phase: input.status });
  }
}
