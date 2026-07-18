import "server-only";

import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const WORKER_BATCH_LIMIT = 20;
const WORKER_LEASE_SECONDS = 300;
const STORAGE_DELETE_CONCURRENCY = 4;
const MAX_ATTEMPTS = 10;

type ClaimedDeletionItem = {
  item_id: string;
  job_id: string;
  bucket_id: string;
  object_path: string;
  size_bytes: number | null;
  attempts: number;
};

type StorageDeletionResultCode = "deleted" | "not_found" | "retained_shared";

type StorageDeletionErrorCode =
  | "reference_check_failed"
  | "unsupported_bucket"
  | "storage_unauthorized"
  | "storage_rate_limited"
  | "storage_unavailable"
  | "storage_unknown"
  | "queue_state_update_failed";

export type StorageDeletionWorkerSummary = {
  claimed: number;
  deleted: number;
  notFound: number;
  retainedShared: number;
  retryScheduled: number;
  failed: number;
};

type StorageDeletionWorkerBatchOptions = {
  maxBatches?: number;
  maxDurationMs?: number;
};

type StorageErrorClassification = {
  code: StorageDeletionErrorCode;
  retryable: boolean;
  notFound: boolean;
};

function createEmptySummary(): StorageDeletionWorkerSummary {
  return {
    claimed: 0,
    deleted: 0,
    notFound: 0,
    retainedShared: 0,
    retryScheduled: 0,
    failed: 0,
  };
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;

  const value = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
  };
  const candidate = value.statusCode ?? value.status ?? value.code;
  const parsed = Number(candidate);

  return Number.isFinite(parsed) ? parsed : null;
}

function classifyStorageError(error: unknown): StorageErrorClassification {
  const status = getErrorStatus(error);

  if (status === 404) {
    return { code: "storage_unknown", retryable: false, notFound: true };
  }

  if (status === 401 || status === 403) {
    return { code: "storage_unauthorized", retryable: false, notFound: false };
  }

  if (status === 429) {
    return { code: "storage_rate_limited", retryable: true, notFound: false };
  }

  if (status === 408 || (status !== null && status >= 500)) {
    return { code: "storage_unavailable", retryable: true, notFound: false };
  }

  return { code: "storage_unknown", retryable: true, notFound: false };
}

function incrementErrorCode(
  counts: Map<StorageDeletionErrorCode, number>,
  code: StorageDeletionErrorCode
) {
  counts.set(code, (counts.get(code) || 0) + 1);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>
) {
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await work(items[index]);
    }
  }

  const runnerCount = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: runnerCount }, () => runner()));
}

export async function runStorageDeletionWorker(): Promise<StorageDeletionWorkerSummary> {
  const runId = randomUUID();
  const workerId = randomUUID();
  const supabase = getSupabaseAdmin();
  const summary = createEmptySummary();
  const errorCodes = new Map<StorageDeletionErrorCode, number>();

  const claimResult = await supabase.rpc("claim_storage_deletion_items", {
    p_worker_id: workerId,
    p_limit: WORKER_BATCH_LIMIT,
    p_lease_seconds: WORKER_LEASE_SECONDS,
  });

  if (claimResult.error) {
    incrementErrorCode(errorCodes, "queue_state_update_failed");
    console.error("storage deletion worker claim failed", {
      runId,
      errorCodes: Object.fromEntries(errorCodes),
    });
    throw new Error("storage_deletion_claim_failed");
  }

  const claimedItems = (claimResult.data || []) as ClaimedDeletionItem[];
  summary.claimed = claimedItems.length;

  async function completeItem(
    item: ClaimedDeletionItem,
    resultCode: StorageDeletionResultCode
  ) {
    const result = await supabase.rpc("complete_storage_deletion_item", {
      p_item_id: item.item_id,
      p_worker_id: workerId,
      p_result_code: resultCode,
    });

    if (result.error || result.data !== true) {
      throw new Error("queue_state_update_failed");
    }

    const refreshResult = await supabase.rpc(
      "refresh_cloud_trash_purges_for_item",
      { p_item_id: item.item_id }
    );

    if (refreshResult.error) {
      throw new Error("queue_state_update_failed");
    }
  }

  async function failItem(
    item: ClaimedDeletionItem,
    errorCode: StorageDeletionErrorCode,
    retryable: boolean
  ) {
    const result = await supabase.rpc("fail_storage_deletion_item", {
      p_item_id: item.item_id,
      p_worker_id: workerId,
      p_error_code: errorCode,
      p_retryable: retryable,
    });

    incrementErrorCode(errorCodes, errorCode);

    if (result.error || result.data !== true) {
      incrementErrorCode(errorCodes, "queue_state_update_failed");
      summary.failed += 1;
      return;
    }

    const refreshResult = await supabase.rpc(
      "refresh_cloud_trash_purges_for_item",
      { p_item_id: item.item_id }
    );

    if (refreshResult.error) {
      incrementErrorCode(errorCodes, "queue_state_update_failed");
      summary.failed += 1;
      return;
    }

    if (retryable && item.attempts < MAX_ATTEMPTS) {
      summary.retryScheduled += 1;
    } else {
      summary.failed += 1;
    }
  }

  async function handleStorageError(item: ClaimedDeletionItem, error: unknown) {
    const classification = classifyStorageError(error);

    if (classification.notFound) {
      await completeItem(item, "not_found");
      summary.notFound += 1;
      return;
    }

    await failItem(item, classification.code, classification.retryable);
  }

  if (claimedItems.length === 0) {
    console.info("storage deletion worker completed", {
      runId,
      summary,
      errorCodes: {},
    });
    return summary;
  }

  const mediaItems: ClaimedDeletionItem[] = [];

  for (const item of claimedItems) {
    if (item.bucket_id === "media") {
      mediaItems.push(item);
    } else {
      await failItem(item, "unsupported_bucket", false);
    }
  }

  let referencedPaths: Set<string>;

  if (mediaItems.length > 0) {
    const referenceResult = await supabase.rpc("get_referenced_storage_paths", {
      p_bucket_id: "media",
      p_object_paths: mediaItems.map((item) => item.object_path),
    });

    if (referenceResult.error) {
      await runWithConcurrency(
        mediaItems,
        STORAGE_DELETE_CONCURRENCY,
        async (item) => {
          await failItem(item, "reference_check_failed", true);
        }
      );

      console.error("storage deletion worker reference check failed", {
        runId,
        summary,
        errorCodes: Object.fromEntries(errorCodes),
      });
      return summary;
    }

    referencedPaths = new Set(
      ((referenceResult.data || []) as Array<{ object_path?: string | null }>)
        .map((row) => String(row.object_path || "").trim())
        .filter(Boolean)
    );
  } else {
    referencedPaths = new Set();
  }

  await runWithConcurrency(
    mediaItems,
    STORAGE_DELETE_CONCURRENCY,
    async (item) => {
      try {
        if (referencedPaths.has(item.object_path)) {
          await completeItem(item, "retained_shared");
          summary.retainedShared += 1;
          return;
        }

        const mediaBucket = supabase.storage.from("media");
        let existence: Awaited<ReturnType<typeof mediaBucket.exists>>;

        try {
          existence = await mediaBucket.exists(item.object_path);
        } catch (error) {
          await handleStorageError(item, error);
          return;
        }

        if (existence.data === false) {
          await completeItem(item, "not_found");
          summary.notFound += 1;
          return;
        }

        if (existence.error) {
          await handleStorageError(item, existence.error);
          return;
        }

        let removal: Awaited<ReturnType<typeof mediaBucket.remove>>;

        try {
          removal = await mediaBucket.remove([item.object_path]);
        } catch (error) {
          await handleStorageError(item, error);
          return;
        }

        if (removal.error) {
          await handleStorageError(item, removal.error);
          return;
        }

        await completeItem(item, "deleted");
        summary.deleted += 1;
      } catch {
        incrementErrorCode(errorCodes, "queue_state_update_failed");
        summary.failed += 1;
      }
    }
  );

  console.info("storage deletion worker completed", {
    runId,
    summary,
    errorCodes: Object.fromEntries(errorCodes),
  });

  return summary;
}

export async function runStorageDeletionWorkerBatches(
  options: StorageDeletionWorkerBatchOptions = {}
): Promise<StorageDeletionWorkerSummary> {
  const maxBatches = Math.min(Math.max(Math.trunc(options.maxBatches ?? 1), 1), 10);
  const maxDurationMs = Math.min(
    Math.max(Math.trunc(options.maxDurationMs ?? 4_000), 500),
    45_000
  );
  const startedAt = Date.now();
  const total = createEmptySummary();

  for (let batch = 0; batch < maxBatches; batch += 1) {
    if (batch > 0 && Date.now() - startedAt >= maxDurationMs) break;

    const summary = await runStorageDeletionWorker();
    total.claimed += summary.claimed;
    total.deleted += summary.deleted;
    total.notFound += summary.notFound;
    total.retainedShared += summary.retainedShared;
    total.retryScheduled += summary.retryScheduled;
    total.failed += summary.failed;

    if (summary.claimed === 0) break;
  }

  return total;
}
