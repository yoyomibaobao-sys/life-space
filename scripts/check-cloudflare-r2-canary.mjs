const baseUrl = process.env.CLOUDFLARE_CANARY_URL?.trim().replace(/\/+$/, "");
const secret = process.env.R2_CANARY_SECRET?.trim();

if (!baseUrl || !secret) {
  console.error(
    "Set CLOUDFLARE_CANARY_URL and R2_CANARY_SECRET before running the R2 canary check."
  );
  process.exitCode = 2;
} else {
  const response = await fetch(`${baseUrl}/__canary/r2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true) {
    console.error(`R2 canary failed with HTTP ${response.status}.`);
    process.exitCode = 1;
  } else {
    console.log("R2 canary passed: write, read, and cleanup succeeded.");
  }
}
