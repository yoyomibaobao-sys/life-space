import "server-only";

import {
  getAuthenticatedRequestClient,
  hasValidMutationOrigin,
} from "@/lib/server/authenticated-request";
import { runStorageDeletionWorker } from "@/lib/server/storage-deletion-worker";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MarketMutationKind = "delete_post" | "delete_media" | "set_cover";

type MarketMutationRow = {
  ok?: boolean | null;
  job_id?: string | null;
  error_code?: string | null;
};

function noStoreJson(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isSafeObjectPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1024 &&
    !value.includes("\0")
  );
}

export async function handleSafeMarketMutation(
  request: Request,
  kind: MarketMutationKind,
  id: string,
) {
  if (!UUID_PATTERN.test(id)) return noStoreJson({ error: "invalid_id" }, 400);
  if (!hasValidMutationOrigin(request)) {
    return noStoreJson({ error: "invalid_origin" }, 403);
  }

  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return noStoreJson({ error: "unauthorized" }, 401);

  let rpcName = "request_delete_market_post";
  let rpcParams: Record<string, string | null> = { p_market_post_id: id };

  if (kind === "delete_media") {
    rpcName = "request_delete_market_media";
    rpcParams = { p_market_media_id: id };
  } else if (kind === "set_cover") {
    const body = (await request.json().catch(() => null)) as {
      path?: unknown;
      thumbPath?: unknown;
      reservationId?: unknown;
    } | null;
    const path = body?.path == null ? null : body.path;
    const thumbPath = body?.thumbPath == null ? null : body.thumbPath;
    const reservationId = body?.reservationId == null ? null : body.reservationId;

    if (
      (path !== null && !isSafeObjectPath(path)) ||
      (thumbPath !== null && !isSafeObjectPath(thumbPath)) ||
      (reservationId !== null &&
        (typeof reservationId !== "string" || !UUID_PATTERN.test(reservationId)))
    ) {
      return noStoreJson({ error: "invalid_payload" }, 400);
    }

    rpcName = "set_market_post_cover";
    rpcParams = {
      p_market_post_id: id,
      p_cover_path: path,
      p_cover_thumb_path: thumbPath,
      p_upload_reservation_id: reservationId,
    };
  }

  const rpcResult = await auth.supabase.rpc(rpcName, rpcParams);
  if (rpcResult.error) {
    console.error("safe market storage mutation failed", {
      kind,
      errorCode: "rpc_failed",
    });
    return noStoreJson({ error: "operation_failed" }, 500);
  }

  const rpcData = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
  const result = (rpcData || null) as MarketMutationRow | null;
  if (!result?.ok) {
    if (result?.error_code === "not_found_or_forbidden") {
      return noStoreJson({ error: "not_found" }, 404);
    }
    if (
      result?.error_code === "reservation_not_found_or_forbidden" ||
      result?.error_code === "cover_source_not_allowed" ||
      result?.error_code === "invalid_cover"
    ) {
      return noStoreJson({ error: "invalid_cover" }, 409);
    }
    return noStoreJson({ error: "operation_failed" }, 500);
  }

  let cleanup: "processed" | "queued" = "queued";
  if (result.job_id) {
    try {
      await runStorageDeletionWorker();
      const job = await getSupabaseAdmin()
        .from("storage_deletion_jobs")
        .select("status")
        .eq("id", result.job_id)
        .maybeSingle();
      if (!job.error && job.data?.status === "succeeded") cleanup = "processed";
    } catch {
      console.error("safe market storage cleanup failed", {
        kind,
        errorCode: "worker_failed",
      });
    }
  }

  return noStoreJson({ ok: true, cleanup }, 200);
}
