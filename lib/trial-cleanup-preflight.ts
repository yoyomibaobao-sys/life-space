export type TrialCleanupPreflightStep = {
  batch_id: string;
  checked: number;
  ready: number;
  skipped_paid: number;
  deferred_payment: number;
  canceled: number;
  account_locks_busy: number;
  remaining_unchecked: number;
  execution_enabled: false;
};

export type TrialCleanupPreflightSummary = {
  checked: number;
  ready: number;
  skippedPaid: number;
  deferredPayment: number;
  canceled: number;
  locksBusy: number;
  remainingUnchecked: number;
  reviewComplete: boolean;
  stoppedForContention: boolean;
  batches: number;
  /** Never imply that this review has executed actual deletion. */
  executionEnabled: false;
};

export type TrialCleanupPreflightRpc = (
  name: "preflight_trial_cloud_cleanup",
  args: { p_batch_id: string; p_limit: number }
) => Promise<{ data: unknown; error: unknown | null }>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

/**
 * Invokes only the service-role preflight RPC. No Storage client, archive
 * deletion or queue claim is available in this function.
 */
export async function runTrialCleanupPreflightReview(
  rpc: TrialCleanupPreflightRpc,
  batchId: string,
  options: { maxBatches?: number; perBatch?: number } = {},
): Promise<TrialCleanupPreflightSummary> {
  if (!UUID_PATTERN.test(batchId)) throw new Error("invalid_trial_cleanup_batch_id");
  const batchesOption = Number.isFinite(options.maxBatches) ? options.maxBatches! : 5;
  const perBatchOption = Number.isFinite(options.perBatch) ? options.perBatch! : 25;
  const maxBatches = Math.min(Math.max(Math.trunc(batchesOption), 1), 20);
  const perBatch = Math.min(Math.max(Math.trunc(perBatchOption), 1), 50);

  const summary: TrialCleanupPreflightSummary = {
    checked: 0, ready: 0, skippedPaid: 0, deferredPayment: 0,
    canceled: 0, locksBusy: 0, remainingUnchecked: 0,
    reviewComplete: false, stoppedForContention: false,
    batches: 0, executionEnabled: false,
  };
  for (let i = 0; i < maxBatches; i += 1) {
    const result = await rpc("preflight_trial_cloud_cleanup", {
      p_batch_id: batchId, p_limit: perBatch,
    });
    if (result.error || !result.data || typeof result.data !== "object"
      || Array.isArray(result.data)) {
      throw new Error("trial_cleanup_preflight_rpc_failed");
    }

    const step = result.data as Record<string, unknown>;
    const checked = safeCount(step.checked);
    const ready = safeCount(step.ready);
    const skipped = safeCount(step.skipped_paid);
    const deferred = safeCount(step.deferred_payment);
    const canceled = safeCount(step.canceled);
    const locksBusy = safeCount(step.account_locks_busy);
    const remaining = safeCount(step.remaining_unchecked);
    if (step.batch_id !== batchId || step.execution_enabled !== false
      || [checked, ready, skipped, deferred, canceled, locksBusy, remaining].some((value) => value === null)
      || checked! !== ready! + skipped! + deferred! + canceled!) {
      throw new Error("trial_cleanup_preflight_invalid_response");
    }

    summary.checked += checked!;
    summary.ready += ready!;
    summary.skippedPaid += skipped!;
    summary.deferredPayment += deferred!;
    summary.canceled += canceled!;
    summary.locksBusy += locksBusy!;
    summary.remainingUnchecked = remaining!;
    summary.batches += 1;

    if (remaining === 0) {
      summary.reviewComplete = true;
      break;
    }
    if (checked === 0) {
      // Revisit later; never spin on accounts held by a payment transaction.
      summary.stoppedForContention = true;
      break;
    }
  }
  return summary;
}
