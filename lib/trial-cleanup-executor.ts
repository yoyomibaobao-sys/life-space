import { createHash } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type TrialCleanupExecutorRpcName =
  | "claim_trial_cloud_cleanup_storage_object"
  | "authorize_trial_cloud_cleanup_object_delete"
  | "record_trial_cloud_cleanup_quarantine_manifest"
  | "recheck_trial_cloud_cleanup_object"
  | "read_trial_cloud_cleanup_quarantine"
  | "begin_trial_cloud_cleanup_restore"
  | "adopt_trial_cloud_cleanup_restore"
  | "finish_trial_cloud_cleanup_restore"
  | "mark_trial_cloud_cleanup_restore_conflict"
  | "complete_trial_cloud_cleanup_storage_object"
  | "fail_trial_cloud_cleanup_storage_object";

export type TrialCleanupExecutorRpc = (
  name: TrialCleanupExecutorRpcName,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown | null }>;

export type TrialCleanupStoredObject = {
  bucketId: string;
  objectPath: string;
};

export type TrialCleanupObjectDescription = {
  contentType: string | null;
  cacheControl: string | null;
  metadata: Record<string, string>;
};

export type TrialCleanupWriteResult = "created" | "exists";

export type TrialCleanupObjectStore = {
  /**
   * `exclusive` means create-if-absent that fails without replacing bytes.
   * Supabase Storage's upsert:false is that primitive. It is not an
   * If-Match compare-and-swap, so a path that already holds different bytes
   * is never written.
   */
  conditionalCreate?: "exclusive" | "unsupported";
  read(object: TrialCleanupStoredObject): Promise<Uint8Array | null>;
  describe?(object: TrialCleanupStoredObject): Promise<TrialCleanupObjectDescription | null>;
  write(
    object: TrialCleanupStoredObject,
    body: Uint8Array,
    options?: {
      restoreToken?: string | null;
      contentType?: string | null;
      cacheControl?: string | null;
      metadata?: Record<string, string> | null;
      ifAbsent?: boolean;
    },
  ): Promise<void | TrialCleanupWriteResult>;
  remove(object: TrialCleanupStoredObject): Promise<"deleted" | "not_found">;
};

export type TrialCleanupStorageStep = {
  outcome: "deleted" | "not_found" | "idle" | "failed" | "refused";
  reason: string | null;
  adminExecutionEnabled: false;
};

type RestoreManifest = {
  quarantinePath: string;
  sha256: string;
  contentType: string;
  contentBytes: number;
  metadata: Record<string, string>;
  restoreToken: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sameBytes(left: Uint8Array | null, right: Uint8Array | null) {
  if (!left || !right || left.byteLength !== right.byteLength) return false;
  for (let i = 0; i < left.byteLength; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function trialCleanupContentSha256(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

export function trialCleanupQuarantinePath(
  fenceId: string, claimToken: string, objectPath: string,
) {
  return `trial-cleanup-quarantine/${fenceId}/${claimToken}/${objectPath}`;
}

function exclusivePath(ownerUserId: string, objectPath: string) {
  return objectPath === objectPath.trim()
    && objectPath.startsWith(`${ownerUserId}/`)
    && !objectPath.includes("..")
    && !objectPath.includes("\\")
    && !objectPath.includes("%")
    && !objectPath.includes("?")
    && !objectPath.includes("#");
}

function stringMap(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  const metadata: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string" && key !== "trial_cleanup_restore_token") {
      metadata[key] = entry;
    }
  }
  return metadata;
}

function contentTypeOf(metadata: Record<string, string>, fallback: string | null) {
  return metadata.mimetype || fallback || "application/octet-stream";
}

function refused(reason: string): TrialCleanupStorageStep {
  return { outcome: "refused", reason, adminExecutionEnabled: false };
}

async function rpcResult(
  rpc: TrialCleanupExecutorRpc,
  name: TrialCleanupExecutorRpcName,
  args: Record<string, unknown>,
) {
  const result = await rpc(name, args);
  if (result.error) throw new Error("trial_cleanup_executor_rpc_failed");
  const record = asRecord(result.data);
  if (!record || record.admin_execution_enabled !== false) {
    throw new Error("trial_cleanup_executor_invalid_result");
  }
  return record;
}

function manifestFrom(record: Record<string, unknown>, restoreToken: string | null): RestoreManifest | null {
  const quarantinePath = record.quarantine_path;
  const sha256 = record.content_sha256;
  const contentType = record.content_type;
  const contentBytes = record.content_bytes;
  if (typeof quarantinePath !== "string"
    || !quarantinePath.startsWith("trial-cleanup-quarantine/")
    || typeof sha256 !== "string" || !SHA256_PATTERN.test(sha256)
    || typeof contentType !== "string" || contentType.length === 0
    || (typeof contentBytes !== "number" && typeof contentBytes !== "string")
    || !restoreToken || !UUID_PATTERN.test(restoreToken)) {
    return null;
  }
  const bytes = Number(contentBytes);
  if (!Number.isInteger(bytes) || bytes < 0) return null;
  return {
    quarantinePath,
    sha256,
    contentType,
    contentBytes: bytes,
    metadata: stringMap(record.object_metadata),
    restoreToken,
  };
}

async function markConflict(
  rpc: TrialCleanupExecutorRpc,
  fenceId: string,
  objectPath: string,
  claimToken: string,
  reason: string,
) {
  const marked = await rpcResult(rpc, "mark_trial_cloud_cleanup_restore_conflict", {
    p_fence_id: fenceId,
    p_object_path: objectPath,
    p_claim_token: claimToken,
    p_reason: reason,
  });
  if (marked.marked !== true || marked.deletion_allowed !== false) {
    throw new Error("trial_cleanup_executor_invalid_result");
  }
}

async function exclusiveWrite(
  store: TrialCleanupObjectStore,
  object: TrialCleanupStoredObject,
  body: Uint8Array,
  options: {
    restoreToken?: string | null;
    contentType?: string | null;
    cacheControl?: string | null;
    metadata?: Record<string, string> | null;
  },
) {
  if (store.conditionalCreate !== "exclusive") return "unsupported" as const;
  const written = await store.write(object, body, { ...options, ifAbsent: true });
  if (written !== "created" && written !== "exists") return "unsupported" as const;
  return written;
}

/**
 * Restores from the durable quarantine object. The original bytes are read
 * back from the store; callers must not pass an in-memory copy.
 * A released, mismatched, or in-progress token returns before any original write.
 */
async function restorePersistedQuarantine(
  rpc: TrialCleanupExecutorRpc,
  store: TrialCleanupObjectStore,
  fenceId: string,
  objectPath: string,
  claimToken: string,
  bucketId: string,
  manifest: RestoreManifest,
): Promise<TrialCleanupStorageStep | { outcome: "restored" }> {
  const quarantineKey = { bucketId, objectPath: manifest.quarantinePath };
  const originalKey = { bucketId, objectPath };
  const persisted = await store.read(quarantineKey);
  const persistedSha = persisted ? trialCleanupContentSha256(persisted) : null;
  if (!persisted || persistedSha !== manifest.sha256
    || persisted.byteLength !== manifest.contentBytes) {
    await markConflict(rpc, fenceId, objectPath, claimToken, "integrity_mismatch");
    return refused("integrity_mismatch");
  }
  const current = await store.read(originalKey);
  if (current && !sameBytes(current, persisted)) {
    await markConflict(rpc, fenceId, objectPath, claimToken, "object_overwritten");
    return refused("object_overwritten");
  }
  if (!current) {
    const cacheControl = manifest.metadata.cacheControl || null;
    const metadata = { ...manifest.metadata };
    delete metadata.cacheControl;
    const written = await exclusiveWrite(store, originalKey, persisted, {
      restoreToken: manifest.restoreToken,
      contentType: manifest.contentType,
      cacheControl,
      metadata,
    });
    if (written === "unsupported") {
      await markConflict(rpc, fenceId, objectPath, claimToken, "conditional_write_unsupported");
      return refused("conditional_write_unsupported");
    }
    const after = await store.read(originalKey);
    if (!after || !sameBytes(after, persisted)) {
      await markConflict(rpc, fenceId, objectPath, claimToken, "conditional_write_failed");
      return refused("conditional_write_failed");
    }
  }
  const finished = await rpcResult(rpc, "finish_trial_cloud_cleanup_restore", {
    p_fence_id: fenceId,
    p_object_path: objectPath,
    p_restore_token: manifest.restoreToken,
  });
  if (finished.finished !== true) throw new Error("trial_cleanup_executor_invalid_result");
  return { outcome: "restored" };
}

/**
 * Continues a quarantine restore after the worker process is gone.
 * Bytes come only from the persisted quarantine object named by the database.
 * A restoring row does not authorize a write: the caller must still hold the
 * unexpired claim, and adopt issues the only restore token that may write.
 */
export async function resumeTrialCleanupQuarantine(
  rpc: TrialCleanupExecutorRpc,
  store: TrialCleanupObjectStore,
  fenceId: string,
  objectPath: string,
  claimToken: string,
): Promise<TrialCleanupStorageStep> {
  if (!UUID_PATTERN.test(fenceId) || !UUID_PATTERN.test(claimToken)) {
    throw new Error("trial_cleanup_executor_invalid_fence");
  }
  const snapshot = await rpcResult(rpc, "read_trial_cloud_cleanup_quarantine", {
    p_fence_id: fenceId,
    p_object_path: objectPath,
  });
  if (snapshot.already_released === true || snapshot.status === "released") {
    return refused("already_released");
  }
  if (snapshot.status === "conflict") {
    return refused(typeof snapshot.conflict_reason === "string"
      ? snapshot.conflict_reason : "restore_conflict");
  }
  if (snapshot.status !== "restoring" && snapshot.status !== "quarantined") {
    return refused("not_quarantined");
  }
  const adopted = await rpcResult(rpc, "adopt_trial_cloud_cleanup_restore", {
    p_fence_id: fenceId,
    p_object_path: objectPath,
    p_claim_token: claimToken,
  });
  if (adopted.already_released === true || adopted.started !== true) {
    return refused(typeof adopted.reason === "string" ? adopted.reason : "already_released");
  }
  const restoreToken = typeof adopted.restore_token === "string" ? adopted.restore_token : null;
  const manifest = manifestFrom(adopted, restoreToken);
  if (!manifest) return refused("claim_mismatch");
  const restored = await restorePersistedQuarantine(
    rpc, store, fenceId, objectPath, claimToken, "media", manifest,
  );
  if ("reason" in restored) return restored;
  return { outcome: "idle", reason: "restored", adminExecutionEnabled: false };
}

/**
 * Advances one fenced Storage object. Physical deletion stays closed:
 * Storage remove() cannot pin an object version. This function never touches
 * the generic deletion queue and cannot enable the administrator button.
 */
export async function advanceTrialCleanupStorageObject(
  rpc: TrialCleanupExecutorRpc,
  store: TrialCleanupObjectStore,
  fenceId: string,
): Promise<TrialCleanupStorageStep> {
  if (!UUID_PATTERN.test(fenceId)) throw new Error("trial_cleanup_executor_invalid_fence");
  const claim = await rpcResult(rpc, "claim_trial_cloud_cleanup_storage_object", {
    p_fence_id: fenceId,
  });
  if (typeof claim.claimed !== "boolean") {
    throw new Error("trial_cleanup_executor_invalid_result");
  }
  if (claim.claimed !== true) {
    const reason = typeof claim.reason === "string" ? claim.reason : "idle";
    return {
      outcome: reason === "idle" || reason === "not_deleting" ? "idle" : "refused",
      reason, adminExecutionEnabled: false,
    };
  }
  const ownerUserId = claim.owner_user_id;
  const objectPath = claim.object_path;
  const claimToken = claim.claim_token;
  const bucketId = claim.bucket_id;
  if (typeof ownerUserId !== "string" || !UUID_PATTERN.test(ownerUserId)
    || typeof objectPath !== "string" || typeof claimToken !== "string"
    || !UUID_PATTERN.test(claimToken) || bucketId !== "media"
    || !exclusivePath(ownerUserId, objectPath)) {
    if (typeof objectPath === "string" && typeof claimToken === "string") {
      await rpc("fail_trial_cloud_cleanup_storage_object", {
        p_fence_id: fenceId, p_object_path: objectPath,
        p_claim_token: claimToken, p_error_code: "unsafe_path",
      });
    }
    return refused("unsafe_path");
  }

  const authorization = await rpcResult(rpc, "authorize_trial_cloud_cleanup_object_delete", {
    p_fence_id: fenceId,
    p_object_path: objectPath,
    p_claim_token: claimToken,
  });
  if (authorization.authorized !== true) {
    const reason = typeof authorization.reason === "string"
      ? authorization.reason : "not_authorized";
    return refused(reason);
  }

  const originalKey = { bucketId, objectPath };
  const described = store.describe ? await store.describe(originalKey) : null;
  const metadata = {
    ...(described?.metadata || {}),
    ...(described?.cacheControl ? { cacheControl: described.cacheControl } : {}),
  };
  const contentType = contentTypeOf(metadata, described?.contentType || null);
  const original = await store.read(originalKey);
  if (!original) {
    await rpc("fail_trial_cloud_cleanup_storage_object", {
      p_fence_id: fenceId, p_object_path: objectPath,
      p_claim_token: claimToken, p_error_code: "missing_object",
    });
    return { outcome: "failed", reason: "missing_object", adminExecutionEnabled: false };
  }
  const quarantinePath = trialCleanupQuarantinePath(fenceId, claimToken, objectPath);
  const quarantineKey = { bucketId, objectPath: quarantinePath };
  const copied = await exclusiveWrite(store, quarantineKey, original, {
    contentType, cacheControl: metadata.cacheControl || null, metadata,
  });
  if (copied === "unsupported") return refused("conditional_write_unsupported");
  const persisted = await store.read(quarantineKey);
  if (!persisted || !sameBytes(persisted, original)) {
    return refused("integrity_mismatch");
  }
  const recorded = await rpcResult(rpc, "record_trial_cloud_cleanup_quarantine_manifest", {
    p_fence_id: fenceId,
    p_object_path: objectPath,
    p_claim_token: claimToken,
    p_quarantine_path: quarantinePath,
    p_content_sha256: trialCleanupContentSha256(persisted),
    p_content_type: contentType,
    p_content_bytes: persisted.byteLength,
    p_metadata: metadata,
  });
  if (recorded.recorded !== true) {
    return refused(typeof recorded.reason === "string" ? recorded.reason : "not_quarantined");
  }

  const recheck = await rpcResult(rpc, "recheck_trial_cloud_cleanup_object", {
    p_fence_id: fenceId, p_object_path: objectPath, p_claim_token: claimToken,
  });
  if (recheck.clear !== true) {
    const reason = typeof recheck.reason === "string" ? recheck.reason : "not_authorized";
    return refused(reason);
  }

  const current = await store.read(originalKey);
  if (!current || !sameBytes(current, persisted)) {
    await markConflict(rpc, fenceId, objectPath, claimToken, "object_overwritten");
    return refused("object_overwritten");
  }

  // Storage remove() is by object name and has no generation precondition.
  // A writer between this read and a delete would lose the new version, and
  // writing the quarantine bytes back would replace that new version. Leave
  // both the live object and the quarantine copy in place.
  await rpc("fail_trial_cloud_cleanup_storage_object", {
    p_fence_id: fenceId, p_object_path: objectPath,
    p_claim_token: claimToken, p_error_code: "version_guard_unavailable",
  });
  return {
    outcome: "refused",
    reason: "version_guard_unavailable",
    adminExecutionEnabled: false,
  };
}
