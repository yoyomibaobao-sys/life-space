import {
  getAuthenticatedRequestClient,
  hasValidMutationOrigin,
} from "@/lib/server/authenticated-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TrashItemType = "archive" | "cycle" | "record" | "media";

type RestoreRpcRow = {
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

export async function POST(request: Request) {
  if (!hasValidMutationOrigin(request)) {
    return noStoreJson({ error: "invalid_origin" }, 403);
  }

  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return noStoreJson({ error: "invalid_content_type" }, 400);
  }

  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) {
    return noStoreJson({ error: "unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "invalid_json" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return noStoreJson({ error: "invalid_body" }, 400);
  }

  const values = body as Record<string, unknown>;
  const keys = Object.keys(values);
  if (keys.some((key) => key !== "type" && key !== "id")) {
    return noStoreJson({ error: "invalid_body" }, 400);
  }

  const type = values.type;
  const id = values.id;
  if (type !== "archive" && type !== "cycle" && type !== "record" && type !== "media") {
    return noStoreJson({ error: "invalid_type" }, 400);
  }

  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    return noStoreJson({ error: "invalid_id" }, 400);
  }

  const rpcNames: Record<TrashItemType, string> = {
    archive: "restore_archive_from_trash",
    cycle: "restore_archive_cycle_from_trash",
    record: "restore_record_from_trash",
    media: "restore_media_from_trash",
  };
  const parameterNames: Record<TrashItemType, string> = {
    archive: "p_archive_id",
    cycle: "p_cycle_id",
    record: "p_record_id",
    media: "p_media_id",
  };
  const rpcResult = await auth.supabase.rpc(rpcNames[type], {
    [parameterNames[type]]: id,
  });

  if (rpcResult.error) {
    console.error("cloud trash restore failed", {
      type,
      errorCode: "rpc_failed",
    });
    return noStoreJson({ error: "restore_failed" }, 500);
  }

  const rpcData = Array.isArray(rpcResult.data)
    ? rpcResult.data[0]
    : rpcResult.data;
  const result = (rpcData || null) as RestoreRpcRow | null;

  if (!result?.ok) {
    if (result?.error_code === "not_found_or_forbidden") {
      return noStoreJson({ error: "not_found" }, 404);
    }

    if (result?.error_code === "parent_trashed") {
      return noStoreJson({ error: "parent_trashed" }, 409);
    }

    if (
      result?.error_code === "restore_conflict" ||
      result?.error_code === "invalid_trash_state" ||
      result?.error_code === "not_trashed"
    ) {
      return noStoreJson({ error: "restore_conflict" }, 409);
    }

    return noStoreJson({ error: "restore_failed" }, 500);
  }

  return noStoreJson({ ok: true, action: "restored" }, 200);
}
