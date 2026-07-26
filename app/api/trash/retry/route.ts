import { hasValidMutationOrigin } from "@/lib/server/authenticated-request";
import {
  CloudTrashPurgeError,
  getCloudTrashActor,
  isUuid,
  retryCloudTrashPurge,
  runImmediateTrashWorker,
} from "@/lib/server/cloud-trash-purge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!hasValidMutationOrigin(request)) {
    return noStoreJson({ error: "invalid_origin" }, 403);
  }

  let actor: Awaited<ReturnType<typeof getCloudTrashActor>>;
  try {
    actor = await getCloudTrashActor(request);
  } catch (error) {
    const status = error instanceof CloudTrashPurgeError ? error.statusCode : 500;
    const code = error instanceof CloudTrashPurgeError ? error.code : "retry_failed";
    return noStoreJson({ error: code }, status);
  }

  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return noStoreJson({ error: "invalid_content_type" }, 400);
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
  if (Object.keys(values).some((key) => key !== "trashEntryId") || !isUuid(values.trashEntryId)) {
    return noStoreJson({ error: "invalid_id" }, 400);
  }

  try {
    await retryCloudTrashPurge(actor.userId, values.trashEntryId);
    await runImmediateTrashWorker("retry");
    return noStoreJson(
      { ok: true, action: "retrying", status: "accepted" },
      202,
    );
  } catch (error) {
    const status = error instanceof CloudTrashPurgeError ? error.statusCode : 500;
    const code = error instanceof CloudTrashPurgeError ? error.code : "retry_failed";
    return noStoreJson({ error: code }, status);
  }
}
