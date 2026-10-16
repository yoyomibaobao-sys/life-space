import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(
  new URL("../supabase/migrations/20261013005152_trial_cleanup_job_provenance.sql", import.meta.url),
  "utf8",
);
const begin = src.indexOf("create or replace function public.inspect_trial_cloud_cleanup_target");
const end = src.indexOf("revoke all on function public.inspect_trial_cloud_cleanup_target", begin);
const inventory = src.slice(begin, end);

test("queued cleanup inventory is server-only, read-only, and never reports permission to delete", () => {
  assert.ok(begin > 0 && end > begin);
  assert.match(src, /revoke all on function public\.inspect_trial_cloud_cleanup_target\(uuid\)[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(src, /grant execute on function public\.inspect_trial_cloud_cleanup_target\(uuid\)\s+to service_role/);
  assert.match(inventory, /v_target\.preflight_checked_at is null/);
  assert.match(inventory, /private\.trial_cleanup_payment_safety\(v_target\.user_id\)/);
  assert.match(inventory, /'safe_to_delete', false/g);
  assert.doesNotMatch(inventory, /delete from|truncate |insert into public\.storage_deletion_items|storage\.remove|request_delete_archive/i);
  assert.doesNotMatch(inventory, /pg_catalog\.coalesce\s*\(/i);
});

test("inventory tracks all archive, record, market, and media reference sources", () => {
  const froms = [
    "public.archives", "public.records", "public.media", "public.market_posts",
    "public.market_media",
  ];
  for (const table of froms) {
    assert.ok(inventory.includes(table), table + " absent from inspection");
  }
  for (const column of [
    "cover_image_path", "cover_thumb_path", "primary_image_path", "primary_thumb_path",
    "storage_path", "thumb_path", "cover_image_url", "primary_image_url",
    "thumb_url", "mm.path", "mm.url", "mm.thumb_path",
  ]) {
    assert.ok(inventory.includes(column), column + " path or URL missing");
  }
  assert.match(inventory, /public\.media_object_path_from_public_url\(raw_url\)/);
  // A separately populated path must not hide an invalid URL on that row.
  assert.match(inventory, /select nullif\(pg_catalog\.btrim\(raw_path\), ''\) as path/);
  assert.match(inventory, /union all\s+select public\.media_object_path_from_public_url\(raw_url\) as path/);
  assert.doesNotMatch(inventory, /coalesce\(\s*nullif\(pg_catalog\.btrim\(raw_path\)/);
  assert.match(inventory, /count\(distinct path\)/);
  assert.match(inventory, /unsafe_path_references/);
  assert.match(inventory, /unresolved_url_references/);
  assert.match(inventory, /owner_chain_mismatches/);
});

test("inventory never treats registered photo size as actual cloud capacity", () => {
  assert.match(inventory, /registered_photo_bytes/);
  assert.match(inventory, /'capacity_measurement', 'application_metadata_only'/);
  assert.doesNotMatch(inventory, /'actual_released_bytes'|'actual_r2_bytes'/);
});

test("server inventory can only inspect under opt-in, rejects unexpected permission and counts", () => {
  const wrapper = readFileSync(
    new URL("../lib/server/trial-cleanup-inventory.ts", import.meta.url), "utf8",
  );
  assert.match(wrapper, /import "server-only"/);
  assert.match(wrapper, /TRIAL_ADMIN_INVENTORY_ENABLED !== "true"/);
  assert.match(wrapper, /getSupabaseAdmin\(\)\.rpc/);
  assert.match(wrapper, /safe_to_delete !== false/);
  assert.match(wrapper, /Number\.isSafeInteger/);
  assert.match(wrapper, /trial_cleanup_inventory_invalid_result/);
  assert.doesNotMatch(wrapper, /\.storage\.from\(|\.remove\(|request_delete_archive|request_delete_market_post|fetch\(/);
});
