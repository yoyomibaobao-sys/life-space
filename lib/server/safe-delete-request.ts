import "server-only";

import {
  getAuthenticatedRequestClient,
  hasValidMutationOrigin,
} from "@/lib/server/authenticated-request";
import { runStorageDeletionWorker } from "@/lib/server/storage-deletion-worker";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SafeDeleteKind = "record" | "media";

type SafeDeleteRpcRow = {
  ok?: boolean | null;
  job_id?: string | null;
  error_code?: string | null;
};

function noStoreJson(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function handleSafeDeleteRequest(
  request: Request,
  kind: SafeDeleteKind,
  id: string
) {
  if (!UUID_PATTERN.test(id)) {
    return noStoreJson({ error: "invalid_id" }, 400);
  }

  if (!hasValidMutationOrigin(request)) {
    return noStoreJson({ error: "invalid_origin" }, 403);
  }

  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) {
    return noStoreJson({ error: "unauthorized" }, 401);
  }

  const rpcName =
    kind === "record" ? "request_delete_record" : "request_delete_media";
  const parameterName = kind === "record" ? "p_record_id" : "p_media_id";
  const rpcResult = await auth.supabase.rpc(rpcName, {
    [parameterName]: id,
  });

  if (rpcResult.error) {
    console.error("safe deletion request failed", {
      kind,
      errorCode: "rpc_failed",
    });
    return noStoreJson({ error: "delete_failed" }, 500);
  }

  const rpcData = Array.isArray(rpcResult.data)
    ? rpcResult.data[0]
    : rpcResult.data;
  const result = (rpcData || null) as SafeDeleteRpcRow | null;

  if (!result?.ok) {
    if (result?.error_code === "not_found_or_forbidden") {
      return noStoreJson({ error: "not_found" }, 404);
    }

    if (
      result?.error_code === "unsafe_media_path" ||
      result?.error_code === "unparseable_media_url"
    ) {
      return noStoreJson({ error: "media_cleanup_blocked" }, 409);
    }

    return noStoreJson({ error: "delete_failed" }, 500);
  }

  let cleanup: "processed" | "queued" = "queued";

  try {
    await runStorageDeletionWorker();

    if (result.job_id) {
      const jobResult = await getSupabaseAdmin()
        .from("storage_deletion_jobs")
        .select("status")
        .eq("id", result.job_id)
        .maybeSingle();

      if (!jobResult.error && jobResult.data?.status === "succeeded") {
        cleanup = "processed";
      }
    }
  } catch {
    console.error("safe deletion immediate cleanup failed", {
      kind,
      errorCode: "worker_failed",
    });
  }

  return noStoreJson({ ok: true, cleanup }, 200);
}
