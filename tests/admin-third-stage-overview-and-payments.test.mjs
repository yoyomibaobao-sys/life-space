import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("app/admin/memberships/page.tsx", "utf8");
const behaviorPermissions = fs.readFileSync("components/admin/AdminBehaviorPermissions.tsx", "utf8");
const legacyTrialCleanup = fs.readFileSync("components/admin/AdminTrialCleanupPreview.tsx", "utf8");

test("ADM third stage: overview todos use exact server-side queue counts and route to their queues", () => {
  for (const rpc of [
    "admin_get_support_submission_queue_count",
    "admin_get_membership_payment_queue_count",
    "admin_get_membership_refund_queue_count",
  ]) {
    assert.ok(page.includes(rpc), "missing server-side todo count RPC: " + rpc);
  }
  assert.match(page, /href="\/admin\/support"/);
  assert.match(page, /href="#payment-review"/);
  assert.match(page, /href="#refund-review"/);
  assert.match(page, /href="#account-closures"/);
  assert.match(page, /formatOptionalAdminCount\(todoCounts\.reports, language\)/);
  assert.match(page, /formatOptionalAdminCount\(todoCounts\.payments, language\)/);
  assert.match(page, /formatOptionalAdminCount\(todoCounts\.refunds, language\)/);
  assert.match(page, /—.*不代表数量为0|—.*not zero/);
});

test("ADM third stage: user payment history includes recent orders across statuses and PayPal identifiers", () => {
  assert.match(page, /\.from\("membership_payments"\)[\s\S]*?\.select\("\*"\)[\s\S]*?\.eq\("user_id", userId\)[\s\S]*?\.order\("created_at", \{ ascending: false \}\)[\s\S]*?\.limit\(20\)/);
  assert.doesNotMatch(page, /\.in\("status", \["confirmed", "refunded", "canceled"\]\)/);
  for (const field of [
    "order_number",
    "provider_order_id",
    "provider_capture_id",
    "provider_order_created_at",
    "provider_paid_at",
    "reviewed_at",
    "review_note",
    "expires_at",
    "close_reason",
  ]) {
    assert.match(page, new RegExp(field));
  }
  assert.match(page, /逐次Webhook投递日志/);
  assert.match(page, /Duplicate Capture confirmations are protected/);
});

test("ADM third stage: renewal presets extend from a later existing expiry instead of shortening it", () => {
  assert.equal((page.match(/currentPaidUntil = selected\?\.paid_until/g) || []).length, 2);
  assert.equal((page.match(/currentPaidUntil\.getTime\(\) > Date\.now\(\)/g) || []).length, 2);
});

test("ADM third stage: Free entitlement mismatch is surfaced without treating the old trial preset as Free", () => {
  assert.match(page, /Free永久30MB、5条/);
  assert.match(page, /不要用云体验30MB／3条代替Free/);
  assert.match(page, /key:"free",storageLimitBytes:30_000_000,baseMarketPostLimit:5/);
  assert.doesNotMatch(page, /key:\s*"trial",/);
  assert.match(page, /key:"basic",storageLimitBytes:1_000_000_000,baseMarketPostLimit:30/);
});

test("ADM third stage: legacy Trial cleanup preview is frozen and cannot invoke the old RPC", () => {
  assert.doesNotMatch(page, /历史Trial清理（冻结）/);
  assert.doesNotMatch(page, /AdminTrialCleanupPreview/);
  assert.match(legacyTrialCleanup, /历史云体验（Trial）清理预览已冻结/);
  assert.doesNotMatch(legacyTrialCleanup, /admin_preview_trial_cloud_cleanup/);
  assert.doesNotMatch(legacyTrialCleanup, /supabase\\.rpc/);
  assert.doesNotMatch(legacyTrialCleanup, /<button/);
});

test("ADM first batch: the three behavior permissions remain separate and history-backed", () => {
  for (const permission of ['"comment"', '"public_publish"', '"market_publish"']) {
    assert.ok(behaviorPermissions.includes(permission), "missing independent behavior permission " + permission);
  }
  assert.match(behaviorPermissions, /admin_list_user_behavior_restrictions/);
  assert.match(behaviorPermissions, /admin_set_user_behavior_restriction/);
  assert.match(behaviorPermissions, /admin_release_user_behavior_restriction/);
});
