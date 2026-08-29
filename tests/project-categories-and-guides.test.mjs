import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("cloud and local project category depths remain independent", async () => {
  const [migration, optimization, settings, page] = await Promise.all([
    source("supabase/migrations/20260829034713_add_archive_category_settings.sql"),
    source("supabase/migrations/20260829034846_optimize_archive_category_guide_policies.sql"),
    source("lib/archive-category-settings.ts"),
    source("app/profile/project-categories/page.tsx"),
  ]);

  assert.match(migration, /create table if not exists public\.archive_category_settings/);
  assert.match(migration, /max_depth between 1 and 3/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /grant select on table public\.archive_category_settings to anon/);
  assert.match(migration, /grant select, insert, update, delete on table public\.archive_category_settings to authenticated/);
  assert.match(migration, /for update[\s\S]*?using \(auth\.uid\(\) = user_id\)[\s\S]*?with check \(auth\.uid\(\) = user_id\)/);
  assert.match(optimization, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(settings, /LOCAL_SETTINGS_PREFIX/);
  assert.match(settings, /getCloudArchiveCategoryDepths/);
  assert.match(settings, /saveCloudArchiveCategoryDepths/);
  assert.match(page, /activeSpace === "cloud"/);
  assert.match(page, /\(\["cloud", "local"\] as const\)\.map/);
  assert.match(page, /saveLocalArchiveCategoryDepths/);
  assert.match(page, /depth >= 2/);
  assert.match(page, /depth >= 3/);
});

test("public related guides are explicit-grant, RLS-protected, and admin reviewed", async () => {
  const [migration, optimization, guidePage, adminPage, candidates] = await Promise.all([
    source("supabase/migrations/20260829034732_add_public_guide_candidates.sql"),
    source("supabase/migrations/20260829034846_optimize_archive_category_guide_policies.sql"),
    source("app/plant/page.tsx"),
    source("app/admin/guides/page.tsx"),
    source("lib/system-name-candidates.ts"),
  ]);

  for (const table of ["guide_entries", "guide_candidates", "guide_candidate_usages"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /grant select on table public\.guide_entries to anon, authenticated/);
  assert.match(migration, /grant select on table public\.guide_candidates to authenticated/);
  assert.match(migration, /grant select on table public\.guide_candidate_usages to authenticated/);
  assert.match(migration, /guide entries public read/);
  assert.match(migration, /guide candidates involved user read/);
  assert.match(migration, /status = 'pending_review'/);
  assert.match(migration, /distinct_user_count[\s\S]*?review_threshold/);
  assert.match(migration, /guide_candidate_usages_refresh_counts/);
  assert.match(migration, /after insert or update of candidate_id or delete/);
  assert.match(migration, /if not public\.is_app_admin\(auth\.uid\(\)\)/);
  assert.match(migration, /if not public\.is_app_admin\(v_admin_id\)/);
  assert.match(migration, /revoke all on function public\.track_archive_guide_usage\(\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.list_pending_guide_candidates\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.list_pending_guide_candidates\(\) to authenticated/);
  assert.doesNotMatch(migration, /user_metadata|raw_user_meta_data|auth\.role\(\)/);
  assert.match(optimization, /guide_candidates_created_by_idx/);
  assert.match(optimization, /guide_entries_approved_by_idx/);
  assert.match(optimization, /select public\.is_app_admin\(\(select auth\.uid\(\)\)\)/);
  assert.match(guidePage, /\.from\("guide_entries"\)/);
  assert.match(guidePage, /archiveCategoryOptions\.map/);
  assert.match(adminPage, /list_pending_guide_candidates/);
  assert.match(adminPage, /review_guide_candidate/);
  assert.match(candidates, /\.from\("guide_entries"\)/);
});
