export const STORAGE_DELETION_WORKER_PATH =
  "/api/internal/storage-deletion-worker";

const INTERNAL_ORIGIN = "https://life-space.internal";

function getCronSecret(env) {
  const secret =
    typeof env?.CRON_SECRET === "string" ? env.CRON_SECRET.trim() : "";

  if (!secret) {
    throw new Error("cloudflare_cron_secret_missing");
  }

  return secret;
}

export async function runScheduledMaintenance(app, env, ctx) {
  const request = new Request(
    `${INTERNAL_ORIGIN}${STORAGE_DELETION_WORKER_PATH}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${getCronSecret(env)}`,
      },
    }
  );
  const response = await app.fetch(request, env, ctx);

  if (!response.ok) {
    throw new Error(`cloudflare_scheduled_maintenance_failed:${response.status}`);
  }

  return response.status;
}
