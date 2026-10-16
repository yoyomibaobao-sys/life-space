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

test("trial summary distinguishes active 90 days, 30-day handling and completed cleanup", () => {
  assert.match(getMembershipSummary({ ...trial, status: "trialing", can_create_content: true }, "zh"), /90天云体验/);
  assert.match(getMembershipSummary(trial, "zh", "handling_period"), /30天只读处理期/);
  assert.match(getMembershipSummary(trial, "en", "handling_period"), /30-day read-only handling period/);
  assert.match(getMembershipSummary(trial, "zh", "cleanup_completed"), /不再可访问/);
  assert.match(getMembershipSummary(null, "zh", "cleanup_completed"), /不再可访问/);
  assert.match(getMembershipSummary(trial, "zh"), /请联网确认/);
  assert.doesNotMatch(getMembershipSummary(trial, "zh"), /仍可查看/);
});

test("expired Plus keeps cloud data long-term read-only", () => {
  assert.match(getMembershipSummary(plus, "zh"), /长期只读保留/);
  assert.match(getMembershipSummary(plus, "en"), /read-only for the long term/);
});

test("membership and profile pages pass the verified lifecycle, and handle offer failures as unknown", () => {
  const membershipPage = readFileSync(new URL("../app/membership/page.tsx", import.meta.url), "utf8");
  const profilePage = readFileSync(new URL("../app/profile/page.tsx", import.meta.url), "utf8");
  assert.match(membershipPage, /getMembershipSummary\(membership, language, trialOfferLoadFailed \? null : trialOffer\?\.lifecycle_status\)/);
  assert.match(profilePage, /get_my_cloud_trial_offer/);
  assert.match(profilePage, /trialOfferResult\.error[\s\S]*?\? null[\s\S]*?: normalizeCloudTrialOfferRpcResult/);
  assert.match(profilePage, /getMembershipSummary\(membership, language, trialLifecycle\)/);
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
