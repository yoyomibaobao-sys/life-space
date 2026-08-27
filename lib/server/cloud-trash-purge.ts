import "server-only";

import { getAuthenticatedRequestClient } from "@/lib/server/authenticated-request";
import { runStorageDeletionWorkerBatches } from "@/lib/server/storage-deletion-worker";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_TRASH_ENTRY_LIMIT = 200;

type TrashEntryType = "archive" | "cycle" | "record" | "media";
type TrashPurgeMode = "purge" | "retry";

type TrashEntryRow = {
  id: string;
  owner_user_id: string;
  target_type: TrashEntryType;
  target_id: string;
  root_type: TrashEntryType;
  root_id: string;
  status: string;
  capacity_reconciliation_required: boolean;
};

type PurgeRpcRow = {
  ok?: boolean | null;
  status?: string | null;
  already_requested?: boolean | null;
  error_code?: string | null;
};

export class CloudTrashPurgeError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(code);
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export async function getCloudTrashActor(request: Request) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) throw new CloudTrashPurgeError("unauthorized", 401);
  return { userId: auth.userId };
}

async function readTrashEntry(trashEntryId: string) {
  const admin = getSupabaseAdmin();
  const result = await admin
    .from("trash_entries")
    .select(
      "id,owner_user_id,target_type,target_id,root_type,root_id,status,capacity_reconciliation_required"
    )
    .eq("id", trashEntryId)
    .maybeSingle();

  if (result.error) {
    console.error("cloud trash purge entry lookup failed", {
      errorCode: "entry_lookup_failed",
    });
    throw new CloudTrashPurgeError("purge_failed", 500);
  }

  return (result.data || null) as TrashEntryRow | null;
}

function assertEntryActionAllowed(
  entry: TrashEntryRow,
  userId: string,
  mode: TrashPurgeMode,
) {
  if (entry.owner_user_id !== userId) {
    throw new CloudTrashPurgeError("forbidden", 403);
  }

  if (
    entry.root_type !== entry.target_type ||
    entry.root_id !== entry.target_id
  ) {
    throw new CloudTrashPurgeError("not_found", 404);
  }

  if (mode === "purge" && entry.status !== "active" && entry.status !== "purging") {
    throw new CloudTrashPurgeError("purge_conflict", 409);
  }

  if (mode === "retry" && entry.status !== "failed" && entry.status !== "purging") {
    throw new CloudTrashPurgeError("retry_conflict", 409);
  }

  if (mode === "retry" && entry.capacity_reconciliation_required) {
    throw new CloudTrashPurgeError("retry_unavailable", 409);
  }
}

function mapPurgeRpcError(errorCode: string | null | undefined) {
  if (errorCode === "not_found_or_forbidden") {
    return new CloudTrashPurgeError("not_found", 404);
  }

  if (
    errorCode === "purge_conflict" ||
    errorCode === "purge_job_conflict" ||
    errorCode === "purge_job_missing" ||
    errorCode === "invalid_trash_state" ||
    errorCode === "capacity_reconciliation_required"
  ) {
    return new CloudTrashPurgeError("purge_conflict", 409);
  }

  return new CloudTrashPurgeError("purge_failed", 500);
}

async function orchestrateTrashEntry(
  userId: string,
  trashEntryId: string,
  mode: TrashPurgeMode,
) {
  const entry = await readTrashEntry(trashEntryId);
  if (!entry) throw new CloudTrashPurgeError("not_found", 404);
  assertEntryActionAllowed(entry, userId, mode);

  const admin = getSupabaseAdmin();
  const rpcResult = await admin.rpc("request_purge_trash_entry", {
    p_owner_user_id: userId,
    p_target_type: entry.target_type,
    p_target_id: entry.target_id,
  });

  if (rpcResult.error) {
    console.error("cloud trash purge orchestration failed", {
      operation: mode,
      errorCode: "rpc_failed",
    });
    throw new CloudTrashPurgeError("purge_failed", 500);
  }

  const rpcData = Array.isArray(rpcResult.data)
    ? rpcResult.data[0]
    : rpcResult.data;
  const result = (rpcData || null) as PurgeRpcRow | null;

  if (!result?.ok) throw mapPurgeRpcError(result?.error_code);

  return {
    alreadyProcessing: result.already_requested === true,
  };
}

export async function requestCloudTrashPurge(
  userId: string,
  trashEntryId: string,
) {
  return orchestrateTrashEntry(userId, trashEntryId, "purge");
}

export async function retryCloudTrashPurge(
  userId: string,
  trashEntryId: string,
) {
  return orchestrateTrashEntry(userId, trashEntryId, "retry");
}

export async function emptyCloudTrash(userId: string) {
  const admin = getSupabaseAdmin();
  const listResult = await admin
    .from("trash_entries")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .order("deleted_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(EMPTY_TRASH_ENTRY_LIMIT + 1);

  if (listResult.error) {
    console.error("cloud trash empty listing failed", {
      errorCode: "entry_lookup_failed",
    });
    throw new CloudTrashPurgeError("empty_failed", 500);
  }

  const rows = (listResult.data || []) as Array<{ id: string }>;
  const selectedRows = rows.slice(0, EMPTY_TRASH_ENTRY_LIMIT);
  let accepted = 0;
  let alreadyProcessing = 0;
  let failed = 0;

  for (const row of selectedRows) {
    try {
      const result = await orchestrateTrashEntry(userId, row.id, "purge");
      if (result.alreadyProcessing) alreadyProcessing += 1;
      else accepted += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    accepted,
    alreadyProcessing,
    failed,
    morePending: rows.length > EMPTY_TRASH_ENTRY_LIMIT,
  };
}

export async function runImmediateTrashWorker(operation: string) {
  try {
    await runStorageDeletionWorkerBatches({
      maxBatches: 2,
      maxDurationMs: 4_000,
    });
  } catch {
    console.error("immediate trash worker trigger failed", {
      operation,
      errorCode: "worker_failed",
    });
  }
}
