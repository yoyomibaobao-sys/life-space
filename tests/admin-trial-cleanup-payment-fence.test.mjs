import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  new URL("../supabase/migrations/20261013005152_trial_cleanup_job_provenance.sql", import.meta.url),
  "utf8",
);
const paypal = readFileSync(
  new URL("../supabase/migrations/20260911173500_add_paypal_auto_membership.sql", import.meta.url),
  "utf8",
);
const manual = readFileSync(
  new URL("../supabase/migrations/20260814022739_add_membership_payment_orders.sql", import.meta.url),
  "utf8",
);

test("manual and PayPal confirmation use the same per-account payment lock", () => {
  assert.match(sql, /membership-payment:' \|\| new\.user_id::text/);
  assert.match(paypal, /membership-payment:' \|\| v_payment\.user_id::text/);
  assert.match(manual, /membership-payment:' \|\| v_payment\.user_id::text/);
});

test("eligible cleanup must exclude incomplete orders and any bound PayPal order", () => {
  assert.match(sql, /create or replace function private\.trial_cleanup_payment_safety/);
  assert.match(sql, /cleanup_due_at > now\(\)/);
  assert.match(sql, /v_claim\.cleanup_started_at is not null/);
  assert.match(sql, /v_claim\.converted_to_paid_at is not null/);
  assert.match(sql, /mp\.status = 'confirmed'/);
  assert.match(sql, /mp\.status in \('pending_payment', 'submitted', 'needs_update'\)/);
  assert.match(sql, /mp\.provider_order_id is not null/);
  assert.match(sql, /return 'payment_unresolved'/);
});

test("new orders defer queued cleanup before checkout; new checkout cannot start during irreversible deletion", () => {
  assert.match(sql, /create trigger membership_payments_defer_trial_cleanup_before_insert[\s\S]*?before insert on public\.membership_payments/);
  assert.match(sql, /perform pg_catalog\.pg_advisory_xact_lock/);
  assert.match(sql, /t\.status in \('deleting', 'awaiting_storage'\)/);
  assert.match(sql, /raise exception 'trial_cleanup_in_progress'/);
  assert.match(sql, /where t\.user_id = new\.user_id and t\.status in \('pending', 'reserved', 'deferred_payment'\)/);
  assert.match(sql, /set status = case when new\.status = 'confirmed' then 'skipped_paid'/);
});

test("successful PayPal or manual confirmation stops any remaining queued trial cleanup", () => {
  assert.match(sql, /create trigger membership_payments_stop_queued_cleanup_before_confirm[\s\S]*?before update of status on public\.membership_payments/);
  assert.match(sql, /new\.status = 'confirmed' and old\.status is distinct from 'confirmed'/);
  assert.match(sql, /set status = 'skipped_paid', last_error_code = 'paid'/);
  assert.match(sql, /where t\.user_id = new\.user_id[\s\S]*?t\.status in \('pending', 'reserved', 'deferred_payment'\)/);
});

test("direct Plus grants cannot overtake an active cleanup fence", () => {
  const grant = sql.slice(
    sql.indexOf("create or replace function private.fence_trial_cleanup_on_membership_grant"),
    sql.indexOf("-- Confirmation prepares account rows only."),
  );
  assert.match(grant, /before insert or update of plan, paid_until on public\.user_memberships/);
  assert.match(grant, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(grant, /t\.status in \('deleting', 'awaiting_storage'\)/);
  assert.match(grant, /raise exception 'trial_cleanup_in_progress'/);
  assert.match(grant, /status = 'skipped_paid'/);
});

test("confirm, cancel and progress are admin-only and cannot perform physical deletion", () => {
  for (const fn of [
    "admin_confirm_trial_cloud_cleanup",
    "admin_cancel_trial_cloud_cleanup",
    "admin_retry_deferred_trial_cloud_cleanup",
    "admin_trial_cloud_cleanup_progress",
  ]) {
    assert.match(sql, new RegExp("create or replace function public\\." + fn + "\\(p_batch_id uuid\\)"));
    assert.match(sql, new RegExp("grant execute on function public\\." + fn + "\\(uuid\\)\\s+to authenticated"));
  }
  assert.match(sql, /v_batch\.status <> 'review'/);
  assert.match(sql, /status not in \('review', 'confirmed'\)/);
  assert.match(sql, /'execution_enabled', false/);
  assert.doesNotMatch(sql, /\bdelete\s+from\s+(?:public|storage)\.|storage\.remove\s*\(/i);
});

test("cancel cannot report success while a physical delete may still be in flight", () => {
  const cancel = sql.slice(
    sql.indexOf("create or replace function public.admin_cancel_trial_cloud_cleanup"),
    sql.indexOf("create or replace function public.admin_retry_deferred_trial_cloud_cleanup"),
  );
  assert.match(cancel, /v_batch.status not in \('review', 'confirmed'\)/);
  assert.match(cancel, /t.status in \('deleting', 'awaiting_storage'\)/);
  assert.match(cancel, /raise exception 'batch_not_cancelable'/);
});

test("deferred payment retry rechecks eligibility, never retries an in-flight Storage delete", () => {
  const retry = sql.slice(
    sql.indexOf("create or replace function public.admin_retry_deferred_trial_cloud_cleanup"),
    sql.indexOf("create or replace function public.admin_trial_cloud_cleanup_progress"),
  );
  assert.match(retry, /private.trial_cleanup_payment_safety\(t.user_id\)/);
  assert.match(retry, /where t.batch_id = p_batch_id and t.status = 'deferred_payment'/);
  assert.match(retry, /when 'payment_unresolved' then 'deferred_payment'/);
  assert.match(retry, /when 'paid' then 'skipped_paid'/);
  assert.doesNotMatch(retry, /storage_deletion_items|storage\.remove|status = 'deleting'/);
});

test("only one active target per account and no collision with user-initiated Storage purge source", () => {
  assert.match(sql, /create unique index trial_cleanup_targets_one_active_user[\s\S]*?where status in \('pending', 'reserved', 'deleting', 'awaiting_storage'\)/);
  const constraint = sql.match(/add constraint storage_deletion_jobs_source_type_check[\s\S]*?check \(source_type in \(([\s\S]*?)\)\);/);
  assert.ok(constraint, "source type check must preserve legacy queue sources");
  for (const sourceType of ["record", "archive", "cycle", "account", "media",
    "market_post", "market_media", "market_cover", "trial_admin"]) {
    assert.match(constraint[1], new RegExp("'" + sourceType + "'"));
  }
  assert.match(sql, /source_type = 'trial_admin'[\s\S]*?source_id = trial_cleanup_target_id/);
  assert.match(sql, /job_origin = 'legacy_unspecified'/);
});

test("unverified admin cleanup cannot enqueue a physical Storage deletion", () => {
  assert.match(sql, /create trigger storage_deletion_items_block_unverified_trial_admin/);
  assert.match(sql, /before insert or update of job_id on public.storage_deletion_items/);
  assert.match(sql, /select j.job_origin into v_origin[\s\S]*?for share/);
  assert.match(sql, /raise exception 'trial_admin_storage_delete_not_enabled'/);
  assert.match(sql, /create trigger storage_deletion_jobs_block_trial_admin_relabel/);
  assert.match(sql, /raise exception 'trial_admin_job_relabel_not_enabled'/);
});
