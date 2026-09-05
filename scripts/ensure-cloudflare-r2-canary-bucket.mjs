import { pathToFileURL } from "node:url";

export const R2_CANARY_BUCKET_NAME = "life-space-media-canary";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

function requireValue(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new Error(`Missing ${name}.`);
  }
  return normalized;
}

async function readCloudflareResponse(response, action) {
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success !== true) {
    const errorCodes = Array.isArray(payload?.errors)
      ? payload.errors
          .map((error) => error?.code)
          .filter(
            (code) =>
              Number.isSafeInteger(code) ||
              (typeof code === "string" && /^[a-z0-9_-]{1,64}$/i.test(code))
          )
          .slice(0, 5)
      : [];
    const codeSuffix = errorCodes.length
      ? ` Cloudflare error code${errorCodes.length === 1 ? "" : "s"}: ${errorCodes.join(
          ", "
        )}.`
      : "";

    throw new Error(
      `Cloudflare ${action} failed with HTTP ${response.status}.${codeSuffix}`
    );
  }

  return payload;
}

export async function ensureR2CanaryBucket({
  accountId,
  apiToken,
  fetchImpl = fetch,
  bucketName = R2_CANARY_BUCKET_NAME,
} = {}) {
  const normalizedAccountId = requireValue(
    accountId,
    "CLOUDFLARE_ACCOUNT_ID"
  );
  const normalizedApiToken = requireValue(
    apiToken,
    "CLOUDFLARE_API_TOKEN"
  );
  const normalizedBucketName = requireValue(bucketName, "R2 bucket name");
  const endpoint = `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(
    normalizedAccountId
  )}/r2/buckets`;
  const headers = {
    Authorization: `Bearer ${normalizedApiToken}`,
  };
  const listUrl = `${endpoint}?name_contains=${encodeURIComponent(
    normalizedBucketName
  )}&per_page=1000`;
  const listResponse = await fetchImpl(listUrl, { headers });
  const listPayload = await readCloudflareResponse(
    listResponse,
    "R2 bucket lookup"
  );
  const buckets = Array.isArray(listPayload.result?.buckets)
    ? listPayload.result.buckets
    : [];

  if (buckets.some((bucket) => bucket?.name === normalizedBucketName)) {
    return { created: false, name: normalizedBucketName };
  }

  const createResponse = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: normalizedBucketName }),
  });
  await readCloudflareResponse(createResponse, "R2 bucket creation");

  return { created: true, name: normalizedBucketName };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  ensureR2CanaryBucket({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  })
    .then(({ created, name }) => {
      console.log(
        created
          ? `Created isolated R2 canary bucket: ${name}.`
          : `Isolated R2 canary bucket already exists: ${name}.`
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
