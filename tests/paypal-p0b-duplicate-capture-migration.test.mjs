import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "supabase", "migrations", "20261101013910_paypal_p0_safety_guards.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

test("P0-B uses the stored Capture ID as the idempotency key", () => {
  const guard = sql.indexOf("M1: stored Capture is the idempotency key");
  const lock = sql.indexOf("pg_advisory_xact_lock");
  const membershipWrite = sql.indexOf("insert into public.user_memberships");
  assert.ok(guard > -1 && (lock === -1 || guard < lock) && (membershipWrite === -1 || guard < membershipWrite));
  assert.match(sql, /if v_payment\.status <> 'confirmed' then[\s\S]*?status = 'confirmed'[\s\S]*?end if;/);
  assert.match(sql, /'already_confirmed', true/);
  assert.match(sql, /paypal_capture_mismatch/);
});

test("P0-C blocks legacy cancellation of confirmed, refunded or captured payments", () => {
  assert.match(sql, /M1: the legacy status RPC cannot downgrade a confirmed or settled payment/);
  assert.match(sql, /v_payment\.status in \('confirmed', 'refunded'\)/);
  assert.match(sql, /v_payment\.provider_capture_id is not null/);
  assert.match(sql, /confirmed_payment_cannot_be_canceled/);
});

test("migration supports pristine source and the temporary QA-only patch", () => {
  assert.match(sql, /PayPal confirmation RPC exact source block drifted/);
  assert.match(sql, /paypal_capture_already_processed_in_nonconfirmed_state/);
  assert.match(sql, /temporary QA Capture guard conversion is incomplete/);
  assert.match(sql, /legacy admin payment status RPC exact source block drifted/);
  assert.match(sql, /The legacy status-only API must not undo a confirmed PayPal\/Capture fact/);
  assert.match(sql, /temporary QA admin guard conversion is incomplete/);
  assert.match(sql, /new_guard := replace\(new_guard_lf/);
});

test("R26 Plus 1GB/12-month contract and RPC metadata are preserved", () => {
  assert.match(sql, /1000000000/);
  assert.match(sql, /interval ''12 months''/);
  assert.match(sql, /base_market_post_limit/);
  assert.match(sql, /acl_before aclitem\[\]/);
  assert.match(sql, /owner_before oid/);
  assert.match(sql, /config_before text\[\]/);
  assert.match(sql, /security_before boolean/);
  assert.match(sql, /proacl/);
  assert.match(sql, /proowner/);
});

test("least-privilege RPC ACLs are explicit and no destructive schema changes are included", () => {
  assert.match(sql, /revoke all on function public\.confirm_paypal_membership_payment_json[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.confirm_paypal_membership_payment_json[\s\S]*?to service_role;/i);
  assert.match(sql, /grant execute on function public\.admin_update_membership_payment_status_json[\s\S]*?to authenticated, service_role;/i);
  assert.doesNotMatch(sql, /\b(?:create\s+table|drop\s+table|truncate|create\s+role|create\s+user|delete\s+from)\b/i);
  assert.match(sql, /set local lock_timeout = '5s'/i);
  assert.match(sql, /set local statement_timeout = '30s'/i);
});
