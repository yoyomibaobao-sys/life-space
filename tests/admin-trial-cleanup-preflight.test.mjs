import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../supabase/migrations/20261013005152_trial_cleanup_job_provenance.sql", import.meta.url),
  "utf8",
);
const start = source.indexOf("create or replace function public.preflight_trial_cloud_cleanup(");
const finish = source.indexOf("revoke all on function public.preflight_trial_cloud_cleanup", start);
const sql = source.slice(start, finish);

test("preflight inspects a bounded, oldest-first set and persists progress for resumable scans", () => {
  assert.ok(start >= 0 && finish > start, "preflight function must exist");
  assert.match(source, /preflight_checked_at timestamptz/);
  assert.match(source, /create index trial_cleanup_targets_preflight_idx/);
  assert.match(sql, /t\.preflight_checked_at is null/);
  assert.match(sql, /order by t\.cleanup_due_at, t\.user_id\s+limit v_limit\s+for update of t skip locked/);
  assert.match(sql, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 50\)/);
  assert.match(sql, /preflight_checked_at = pg_catalog\.clock_timestamp\(\)/);
  assert.match(sql, /remaining_unchecked/);
});

test("preflight is non-blocking under concurrent PayPal/manual confirmation", () => {
  assert.match(sql, /pg_catalog\.pg_try_advisory_xact_lock/);
  assert.doesNotMatch(sql, /(?<!try_)pg_advisory_xact_lock\s*\(/);
  assert.match(sql, /'membership-payment:' \|\| v_target\.user_id::text/);
  assert.match(sql, /private\.trial_cleanup_payment_safety\(v_target\.user_id\)/);
  assert.match(sql, /account_locks_busy/);
});

test("preflight only reclassifies safe statuses; no physical deletes or worker claims", () => {
  assert.match(sql, /when 'eligible' then 'pending'/);
  assert.match(sql, /when 'paid' then 'skipped_paid'/);
  assert.match(sql, /when 'payment_unresolved' then 'deferred_payment'/);
  assert.match(sql, /'execution_enabled', false/);
  assert.doesNotMatch(sql, /\bdelete\s+from\b|storage\s*\.\s*remove\s*\(|request_delete_archive\s*\(|claim_storage_deletion_items\s*\(|insert\s+into\s+public\.storage_deletion_/i);
});

test("preflight is restricted to service_role; retrying deferred account resets its preflight cursor", () => {
  assert.match(source, /revoke all on function public\.preflight_trial_cloud_cleanup\(uuid, integer\)\s+from public, anon, authenticated, service_role/);
  assert.match(source, /grant execute on function public\.preflight_trial_cloud_cleanup\(uuid, integer\)\s+to service_role/);
  assert.doesNotMatch(source, /grant execute on function public\.preflight_trial_cloud_cleanup\(uuid, integer\)\s+to authenticated/);
  const retry = source.slice(
    source.indexOf("create or replace function public.admin_retry_deferred_trial_cloud_cleanup"),
    start,
  );
  assert.match(retry, /preflight_checked_at = null/);
});
