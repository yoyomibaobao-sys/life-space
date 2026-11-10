import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["lib/membership.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const membership = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);

test("Free is a registered user in both languages while cloud and market remain usable", () => {
  const free = { plan: "free", status: "active", can_create_content: true, can_create_market_post: true };
  assert.equal(membership.getMembershipPlanLabel("free", "zh"), "注册用户");
  assert.equal(membership.getMembershipPlanLabel("free", "en"), "Registered user");
  assert.equal(membership.getUserTypeLabel({ signedIn: true, membership: free }), "注册用户");
  assert.equal(membership.getUserTypeLabel({ signedIn: true, membership: free }, "en"), "Registered user");
  assert.equal(membership.canCreateMembershipContent(free), true);
  assert.equal(membership.canCreateMembershipMarketPost(free), true);
  assert.equal(membership.canAccessMembershipGuidance(free), false);
});

test("full Guide permits an effective paid entitlement including paid past_due", () => {
  for (const plan of ["basic", "large"]) {
    for (const status of ["active", "past_due"]) {
      const paid = { plan, status, can_create_content: true };
      assert.equal(membership.canAccessMembershipGuidance(paid), true);
      assert.equal(membership.getUserTypeLabel({ signedIn: true, membership: paid }), "Plus");
    }
  }
});

test("full Guide denies missing, Free, trial, admin, inactive, and inconsistent grants", () => {
  const denied = [
    null, undefined, {},
    ...["free", "trial", "admin", "seller", "unknown"].map(plan => ({ plan, status: "active", can_create_content: true })),
    ...["expired", "canceled", "trialing", "unknown", undefined].map(status => ({ plan: "basic", status, can_create_content: true })),
    { plan: "basic", status: "active", can_create_content: false },
    { plan: "basic", status: "past_due", can_create_content: false },
  ];
  for (const item of denied) {
    assert.equal(membership.canAccessMembershipGuidance(item), false, JSON.stringify(item));
  }
  assert.equal(membership.getUserTypeLabel({ signedIn: false }), "游客");
  assert.equal(membership.getUserTypeLabel({ signedIn: true, failed: true }), "暂时无法读取");
});
