import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transformSync } from "esbuild";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("cleanup preview uses five nonoverlapping calendar-age bands and requires admin", () => {
  const sql = read("supabase/migrations/20261013000650_trial_cleanup_preview.sql");
  for (const band of ["lt_6m", "m6_12", "y1_3", "y3_6", "gte_6y"]) {
    assert.match(sql, new RegExp("'" + band + "'"));
  }
  for (const duration of ["6 months", "1 year", "3 years", "6 years"]) {
    assert.match(sql, new RegExp("cleanup_due_at > now\\(\\) - interval '" + duration + "'"));
  }
  assert.match(sql, /cleanup_due_at <= now\(\)/);
  assert.match(sql, /public\.is_app_admin\(auth\.uid\(\)\)/);
  assert.match(sql, /c\.cleanup_started_at is null/);
  assert.match(sql, /c\.converted_to_paid_at is null/);
  assert.match(sql, /mp\.status = 'confirmed'/);
  assert.match(sql, /um\.plan <> 'trial'/);
  assert.match(sql, /grant execute on function public\.admin_preview_trial_cloud_cleanup\(text\[\]\)\s+to authenticated/);
  assert.doesNotMatch(sql, /request_delete_archive|request_delete_market_post|delete from|truncate|storage\.remove/);
});

test("retired Trial cleanup is absent from active admin UI; historical preview remains read-only", () => {
  const page = read("app/admin/memberships/page.tsx");
  const component = read("components/admin/AdminTrialCleanupPreview.tsx");
  assert.match(page, /if \(!isAdmin\) \{/);
  assert.doesNotMatch(page, /id="trial-cleanup"|<AdminTrialCleanupPreview/,
    "retired Trial cleanup must not be offered as a production action");
  assert.match(component, /历史云体验（Trial）清理预览已冻结/);
  assert.match(component, /此处不再调用旧版预览RPC/);
  assert.match(component, /Free闲置资料清理仍需独立核实365天登录记录/);
  assert.doesNotMatch(component, /\.rpc\(|admin_preview_trial_cloud_cleanup|execute_trial_cleanup|request_delete_archive|admin_run_trial_cleanup|\bDELETE\b/);
  for (const [name, source] of [
    ["admin page", page],
    ["cleanup preview component", component],
  ]) {
    assert.doesNotThrow(() => transformSync(source, { loader: "tsx", format: "esm" }), name);
  }
});

test("previous unsafe lifecycle cleanup migration remains explicitly blocked", () => {
  const sql = read("supabase/migrations/20261012230036_manual_trial_cloud_cleanup.sql");
  assert.match(sql, /trial_manual_cleanup_migration_incomplete/);
  assert.match(sql, /legacy_trial_cleanup_in_progress/);
  // A delayed Cron must still expire a trial without invoking the old
  // physical-deletion path. The migration remains blocked until QA review.
  assert.match(sql, /c\.trial_ends_at <= now\(\) \+ interval '30 days'/);
  assert.match(sql, /c\.cleanup_due_at > now\(\)\s+or exists/);
  assert.match(sql, /m\.status <> 'expired'/);
  assert.match(sql, /mp\.status = 'active'/);
  assert.doesNotMatch(sql, /request_delete_archive\s*\(|request_delete_market_post\s*\(/);
  assert.match(sql, /'cleanup_started', 0/);
});
