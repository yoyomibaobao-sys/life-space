import { createHash, timingSafeEqual } from "node:crypto";

import { runStorageDeletionWorkerBatches } from "@/lib/server/storage-deletion-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function isAuthorized(request: Request, expectedSecret: string) {
  const suppliedSecret = getBearerToken(request);
  if (!suppliedSecret) return false;

  return timingSafeEqual(hashSecret(suppliedSecret), hashSecret(expectedSecret));
}

function noStoreJson(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return noStoreJson({ error: "worker_not_configured" }, 503);
  }

  if (!isAuthorized(request, cronSecret)) {
    return noStoreJson({ error: "unauthorized" }, 401);
  }

  try {
    const summary = await runStorageDeletionWorkerBatches({
      maxBatches: 5,
      maxDurationMs: 20_000,
    });
    return noStoreJson(summary, 200);
  } catch {
    console.error("storage deletion worker route failed", {
      errorCode: "worker_failed",
    });
    return noStoreJson({ error: "worker_failed" }, 500);
  }
}
