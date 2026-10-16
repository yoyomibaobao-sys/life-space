import "server-only";

import {
  advanceTrialCleanupStorageObject,
  type TrialCleanupObjectDescription,
  type TrialCleanupObjectStore,
  type TrialCleanupWriteResult,
} from "@/lib/trial-cleanup-executor";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const SYSTEM_METADATA = new Set([
  "eTag", "etag", "size", "mimetype", "cacheControl", "cache_control",
  "lastModified", "last_modified", "contentLength", "content_length",
  "httpStatusCode", "http_status_code", "trial_cleanup_restore_token",
]);

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function customMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const metadata: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && !SYSTEM_METADATA.has(key)) metadata[key] = entry;
  }
  return metadata;
}

/**
 * Opt-in single-object executor. It is not called by Cron, the admin page,
 * or the generic Storage worker. The environment flag stays off until
 * isolated QA has accepted the fence and path hold.
 *
 * Supabase Storage's upload accepts `upsert`, not an If-Match or object
 * version. `info().version` / `etag` cannot be enforced on the write.
 * `upsert: false` fails when the name already exists and does not replace
 * bytes. This store never retries with an overwrite.
 */
export async function runTrialCleanupStorageStep(fenceId: string) {
  if (process.env.TRIAL_ADMIN_CLEANUP_EXECUTOR_ENABLED !== "true") {
    throw new Error("trial_cleanup_executor_disabled");
  }
  const admin = getSupabaseAdmin();
  const store: TrialCleanupObjectStore = {
    conditionalCreate: "exclusive",
    async read({ bucketId, objectPath }) {
      const downloaded = await admin.storage.from(bucketId).download(objectPath);
      if (downloaded.error || !downloaded.data) return null;
      return new Uint8Array(await downloaded.data.arrayBuffer());
    },
    async describe({ bucketId, objectPath }): Promise<TrialCleanupObjectDescription | null> {
      const bucket = admin.storage.from(bucketId);
      const info = typeof bucket.info === "function"
        ? await bucket.info(objectPath)
        : { data: null, error: new Error("storage_info_unavailable") };
      if (!info.error && info.data) {
        const data = info.data as unknown as Record<string, unknown>;
        const raw = data.metadata;
        const metadata = customMetadata(raw);
        const rawRecord = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        return {
          contentType: asString(data.contentType) || asString(data.content_type)
            || asString(rawRecord.mimetype),
          cacheControl: asString(data.cacheControl) || asString(data.cache_control)
            || asString(rawRecord.cacheControl),
          metadata,
        };
      }
      const downloaded = await bucket.download(objectPath);
      if (downloaded.error || !downloaded.data) return null;
      return {
        contentType: downloaded.data.type || null,
        cacheControl: null,
        metadata: {},
      };
    },
    async write({ bucketId, objectPath }, body, options): Promise<TrialCleanupWriteResult> {
      const metadata = { ...(options?.metadata || {}) };
      if (options?.restoreToken) metadata.trial_cleanup_restore_token = options.restoreToken;
      const uploaded = await admin.storage.from(bucketId).upload(objectPath, body, {
        upsert: false,
        contentType: options?.contentType || "application/octet-stream",
        ...(options?.cacheControl ? { cacheControl: options.cacheControl } : {}),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      });
      if (uploaded.error) {
        const message = uploaded.error.message || "";
        const status = "status" in uploaded.error ? uploaded.error.status : undefined;
        const statusCode = "statusCode" in uploaded.error ? uploaded.error.statusCode : undefined;
        if (status === 409 || statusCode === "409" || /already exists|duplicate/i.test(message)) {
          return "exists";
        }
        throw new Error("trial_cleanup_storage_write_failed");
      }
      return "created";
    },
    async remove() {
      throw new Error("trial_cleanup_version_guard_unavailable");
    },
  };
  return advanceTrialCleanupStorageObject(async (name, args) => {
    const result = await admin.rpc(name, args);
    return { data: result.data, error: result.error };
  }, store, fenceId);
}
