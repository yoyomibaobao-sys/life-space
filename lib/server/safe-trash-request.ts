import "server-only";

import {
  getAuthenticatedRequestClient,
  hasValidMutationOrigin,
} from "@/lib/server/authenticated-request";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CloudTrashKind = "record" | "media" | "archive";

type MoveToTrashRpcRow = {
  ok?: boolean | null;
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

export async function handleMoveToTrashRequest(
  request: Request,
  kind: CloudTrashKind,
  id: string,
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
    kind === "record"
      ? "move_record_to_trash"
      : kind === "media"
        ? "move_media_to_trash"
        : "move_archive_to_trash";
  const parameterName =
    kind === "record"
      ? "p_record_id"
      : kind === "media"
        ? "p_media_id"
        : "p_archive_id";
  const rpcResult = await auth.supabase.rpc(rpcName, {
    [parameterName]: id,
  });

  if (rpcResult.error) {
    console.error("move to trash request failed", {
      kind,
      errorCode: "rpc_failed",
    });
    return noStoreJson({ error: "trash_failed" }, 500);
  }

  const rpcData = Array.isArray(rpcResult.data)
    ? rpcResult.data[0]
    : rpcResult.data;
  const result = (rpcData || null) as MoveToTrashRpcRow | null;

  if (!result?.ok) {
    if (result?.error_code === "not_found_or_forbidden") {
      return noStoreJson({ error: "not_found" }, 404);
    }

    if (
      result?.error_code === "parent_trashed" ||
      result?.error_code === "invalid_trash_state"
    ) {
      return noStoreJson({ error: "trash_conflict" }, 409);
    }

    return noStoreJson({ error: "trash_failed" }, 500);
  }

  return noStoreJson({ ok: true, action: "trashed" }, 200);
}
