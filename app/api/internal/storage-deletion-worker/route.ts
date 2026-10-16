import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { maintenanceRunSource, writeMaintenanceRunAudit } from "@/lib/server/maintenance-run-audit";

import {
  runCloudTrialLifecycle,
  runStorageDeletionWorkerBatches,
} from "@/lib/server/storage-deletion-worker";

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

  const auditId = randomUUID();
  await writeMaintenanceRunAudit({ id: auditId, source: maintenanceRunSource(request), status: "running" });

  try {
    const lifecycleBeforeDeletion = await runCloudTrialLifecycle(25);
    const storageDeletion = await runStorageDeletionWorkerBatches({
      maxBatches: 5,
      maxDurationMs: 20_000,
    });
    const lifecycleAfterDeletion = await runCloudTrialLifecycle(25);
    const lifecycleFailed = lifecycleBeforeDeletion.cleanupFailed + lifecycleAfterDeletion.cleanupFailed;
    const partialFailure = lifecycleFailed > 0 || storageDeletion.failed > 0 || storageDeletion.retryScheduled > 0;
    await writeMaintenanceRunAudit({
      id: auditId, status: partialFailure ? "failed" : "succeeded",
      ...(partialFailure ? { errorCode: "partial_failure" as const } : {}),
      summary: {
        lifecycleProcessed: lifecycleBeforeDeletion.processed + lifecycleAfterDeletion.processed,
        lifecycleFailed,
        deletionClaimed: storageDeletion.claimed,
        deletionCompleted: storageDeletion.deleted + storageDeletion.notFound + storageDeletion.retainedShared,
        deletionFailed: storageDeletion.failed,
        deletionRetryScheduled: storageDeletion.retryScheduled,
      },
    });
    return noStoreJson(
      {
        cloudTrialLifecycle: {
          beforeDeletion: lifecycleBeforeDeletion,
          afterDeletion: lifecycleAfterDeletion,
        },
        storageDeletion,
      },
      200
    );
  } catch {
    await writeMaintenanceRunAudit({ id: auditId, status: "failed", errorCode: "worker_failed" });
    console.error("storage deletion worker route failed", {
      errorCode: "worker_failed",
    });
    return noStoreJson({ error: "worker_failed" }, 500);
  }
}
