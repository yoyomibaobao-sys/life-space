import { hasValidMutationOrigin } from "@/lib/server/authenticated-request";
import {
  CloudTrashPurgeError,
  emptyCloudTrash,
  getCloudTrashActor,
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
    const code = error instanceof CloudTrashPurgeError ? error.code : "empty_failed";
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

  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) {
    return noStoreJson({ error: "invalid_body" }, 400);
  }

  try {
    const result = await emptyCloudTrash(actor.userId);
    if (
      result.accepted === 0 &&
      result.alreadyProcessing === 0 &&
      result.failed === 0
    ) {
      return noStoreJson(
        { ok: true, action: "empty", accepted: 0, status: "nothing_to_do" },
        200,
      );
    }

    await runImmediateTrashWorker("empty");
    return noStoreJson(
      {
        ok: true,
        action: "emptying",
        accepted: result.accepted,
        alreadyProcessing: result.alreadyProcessing,
        failed: result.failed,
        morePending: result.morePending,
        status: "accepted",
      },
      202,
    );
  } catch (error) {
    const status = error instanceof CloudTrashPurgeError ? error.statusCode : 500;
    const code = error instanceof CloudTrashPurgeError ? error.code : "empty_failed";
    return noStoreJson({ error: code }, status);
  }
}
