import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { build } from "esbuild";

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

const { getMembershipSummary } = await load("lib/membership.ts");
const { canReadAndroidCloudWorkspace } = await load("lib/android-creation-capabilities.ts");
const trial = { user_id: "A", plan: "trial", status: "expired", trial_ends_at: "2026-09-01T00:00:00Z", can_create_content: false };
const plus = { ...trial, plan: "basic", status: "expired" };

test("retired trials and expired Plus return to Free while unresolved membership stays unknown", () => {
  for (const membership of [trial, plus, { ...trial, status: "trialing" }]) {
    assert.equal(getMembershipSummary(membership, "zh"), "Free · 永久 30MB");
    assert.equal(getMembershipSummary(membership, "en"), "Free · 30 MB");
  }
  assert.equal(getMembershipSummary(null, "zh"), "暂时无法读取");
  for (const path of ["app/membership/page.tsx", "app/profile/page.tsx"]) {
    const page = readFileSync(new URL("../" + path, import.meta.url), "utf8");
    assert.match(page, /getMembershipSummary\(membership, language\)/);
    assert.doesNotMatch(page, /get_my_cloud_trial_offer/);
  }
});

test("expired trial visibility needs an authenticated same-account server lifecycle, not the device clock", () => {
  const input = { auth: "signed-in", userId: "A", membership: trial, trialAccess: null };
  assert.equal(canReadAndroidCloudWorkspace(input), false);
  assert.equal(canReadAndroidCloudWorkspace({ ...input, trialAccess: { userId: "A", lifecycle: "handling_period" } }), true);
  assert.equal(canReadAndroidCloudWorkspace({ ...input, trialAccess: { userId: "B", lifecycle: "handling_period" } }), false);
  assert.equal(canReadAndroidCloudWorkspace({ ...input, trialAccess: { userId: "A", lifecycle: "cleanup_completed" } }), false);
  assert.equal(canReadAndroidCloudWorkspace({ ...input, auth: "signed-out", trialAccess: { userId: "A", lifecycle: "handling_period" } }), false);
  assert.equal(canReadAndroidCloudWorkspace({ ...input, membership: { ...trial, can_create_content: true } }), true);
  assert.equal(canReadAndroidCloudWorkspace({ ...input, membership: plus }), true);
  const shell = readFileSync(new URL("../mobile-offline-src/main.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /Date\.parse\(membership\.trial_ends_at/);
  assert.match(shell, /if \(!isAndroidOnline\(\)\) return;/);
  assert.match(shell, /const trialOffer = trialOfferResult\.error \? null/);
  assert.match(shell, /authenticatedOwnerContext \? cloudCaches : \[\]/);
});
