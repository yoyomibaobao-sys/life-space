import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  new URL("../supabase/migrations/20261013005152_trial_cleanup_job_provenance.sql", import.meta.url),
  "utf8",
);

test("manual trial cleanup has separate durable review batches and per-account targets", () => {
  assert.match(sql, /create table private\.trial_cloud_cleanup_batches/);
  assert.match(sql, /create table private\.trial_cloud_cleanup_targets/);
  assert.match(sql, /unique \(batch_id, user_id\)/);
  assert.match(sql, /cleanup_due_at, user_id/);
  assert.match(sql, /status text not null default 'review'/);
  assert.match(sql, /'awaiting_storage'/);
  assert.match(sql, /'skipped_paid'/);
  assert.match(sql, /selected_bands text\[\] not null/);
  assert.match(sql, /from private\.cloud_trial_claims c/);
  assert.match(sql, /order by c\.cleanup_due_at, c\.user_id/);
  assert.doesNotMatch(sql, /\blimit\s+\d+\b/i);
  assert.doesNotMatch(sql, /delete\s+from\s+|truncate\s+table\s+|storage\.remove\s*\(|request_delete_archive\s*\(/i);
});

test("existing Storage deletion jobs are never misclassified as administrator-initiated", () => {
  assert.match(sql, /add column job_origin text not null default 'legacy_unspecified'/);
  assert.match(sql, /job_origin = 'trial_admin'\s+and source_type = 'trial_admin'\s+and trial_cleanup_target_id is not null\s+and source_id = trial_cleanup_target_id/);
  assert.match(sql, /job_origin = 'legacy_unspecified'\s+and source_type <> 'trial_admin'\s+and trial_cleanup_target_id is null/);
  assert.match(sql, /references private\.trial_cloud_cleanup_targets\(id\)/);
  assert.doesNotMatch(sql, /update\s+public\.storage_deletion_jobs\s+set\s+job_origin/i);
  assert.doesNotMatch(sql, /where\s+source_type\s*=/i);
});

test("creating a review draft cannot authorize or trigger cleanup", () => {
  assert.match(sql, /public\.admin_stage_trial_cloud_cleanup\(p_bands text\[\]\)/);
  assert.match(sql, /public\.is_app_admin\(v_admin\)/);
  assert.match(sql, /cleanup_due_at <= now\(\)/);
  assert.match(sql, /c\.converted_to_paid_at is null/);
  assert.match(sql, /c\.cleanup_started_at is null/);
  assert.match(sql, /mp\.status = 'confirmed'/);
  assert.match(sql, /um\.plan <> 'trial'/);
  assert.match(sql, /'execution_enabled', false/);
  assert.match(sql, /revoke all on private\.trial_cloud_cleanup_batches/);
  assert.match(sql, /revoke all on private\.trial_cloud_cleanup_targets/);
  assert.match(sql, /grant execute on function public\.admin_stage_trial_cloud_cleanup\(text\[\]\)\s+to authenticated/);
  assert.doesNotMatch(sql, /references auth\.users\(id\)/);
});
