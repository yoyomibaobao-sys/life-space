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
  assert.match(guidePage, /<GuideCategoryTabs/);
  assert.match(await source("components/plant/GuideCategoryTabs.tsx"), /archiveCategoryOptions\.map/);
  assert.match(adminPage, /list_pending_guide_candidates/);
  assert.match(adminPage, /review_guide_candidate/);
  assert.match(candidates, /\.from\("guide_entries"\)/);
});

test("public guide library has sections, reusable content, and openable details", async () => {
  const [migration, indexPage, detailPage, guideLibrary, candidates, newProject] = await Promise.all([
    source("supabase/migrations/20260829054053_expand_public_guide_library.sql"),
    source("app/plant/page.tsx"),
    source("app/plant/guide/[id]/page.tsx"),
    source("lib/public-guide-library.ts"),
    source("lib/system-name-candidates.ts"),
    source("app/archive/new/page.tsx"),
  ]);

  assert.match(migration, /create table if not exists public\.guide_sections/);
  assert.match(migration, /alter table public\.guide_sections enable row level security/);
  assert.match(migration, /grant select on table public\.guide_sections to anon, authenticated/);
  assert.match(migration, /grant insert, update, delete on table public\.guide_sections to authenticated/);
  assert.match(migration, /guide sections public read/);
  assert.match(migration, /using \(is_active = true\)/);
  assert.match(migration, /guide entries authenticated read/);
  assert.match(migration, /is_active = true[\s\S]*?or public\.is_app_admin/);
  assert.match(migration, /public\.is_app_admin\(\(select auth\.uid\(\)\)\)/);
  assert.match(migration, /add column if not exists content_template/);
  assert.match(migration, /add column if not exists content jsonb/);
  assert.match(migration, /'土壤与堆肥'/);
  assert.match(migration, /'农法与技能'/);
  assert.match(migration, /'嫁接'/);
  assert.match(migration, /'水草'/);
  assert.match(migration, /'梅子蜜'/);
  assert.match(migration, /on conflict \(category, normalized_name\)/);
  assert.match(indexPage, /guide_sections/);
  assert.match(indexPage, /\/plant\/guide\/\$\{entry\.id\}/);
  assert.match(detailPage, /buildPublicGuideContent/);
  assert.match(detailPage, /system_name=\$\{encodeURIComponent\(entry\.name\)\}/);
  assert.match(guideLibrary, /aquatic_plant/);
  assert.match(guideLibrary, /food_ferment/);
  assert.match(candidates, /\.eq\("is_active", true\)/);
  assert.match(newProject, /searchParams\.get\("system_name"\)/);
});

test("non-plant guides use the confirmed hierarchy, independent search, and plant-style related content", async () => {
  const [migration, indexPage, detailPage, guideLibrary] = await Promise.all([
    source("supabase/migrations/20260829120000_expand_domain_guide_hierarchy.sql"),
    source("app/plant/page.tsx"),
    source("app/plant/guide/[id]/page.tsx"),
    source("lib/public-guide-library.ts"),
  ]);

  for (const section of [
    "水草",
    "鱼虾蟹",
    "螺贝",
    "蛙类",
    "龟蛇",
    "虫蝶",
    "蜘蛛",
    "鸟类",
    "庭院动物",
  ]) {
    assert.match(migration, new RegExp(`'${section}'`));
  }
  for (const entry of [
    "莫斯",
    "浮萍",
    "金鱼",
    "水晶虾",
    "河蚌",
    "蝾螈",
    "蜥蜴",
    "黑水虻",
    "螨",
    "白头鹎",
    "鹌鹑",
    "牛",
    "马",
  ]) {
    assert.match(migration, new RegExp(`'${entry}'`));
  }
  assert.match(migration, /\('system', '鱼缸鱼池'\)/);
  assert.doesNotMatch(migration, /\('system', '鱼池'\)/);
  assert.match(migration, /'filters'[\s\S]*?'light'[\s\S]*?'temperature'[\s\S]*?'growth_form'[\s\S]*?'difficulty'/);
  assert.match(migration, /where entry\.source = 'preset'/);
  assert.doesNotMatch(migration, /where entry\.category = 'plant'/);

  assert.match(indexPage, /publicGuideSearchInputs/);
  assert.match(indexPage, /activeSectionByCategory/);
  assert.match(indexPage, /activeSection\?\.slug === "aquatic_plants"/);
  assert.match(indexPage, /matchesPublicGuideFilters/);
  assert.match(indexPage, /repeat\(auto-fit, minmax\(240px, 1fr\)\)/);
  assert.match(indexPage, /<FilterSelect[\s\S]*?label=\{t\.plant\.category\}/);
  assert.match(indexPage, /copy\.waterPlantFilters/);

  for (const template of [
    "aquarium_animal",
    "crustacean",
    "mollusk_aquatic",
    "mollusk_land",
    "amphibian",
    "reptile",
    "insect",
    "arachnid",
    "bird",
    "backyard_animal",
  ]) {
    assert.match(guideLibrary, new RegExp(`${template}:`));
  }
  assert.match(guideLibrary, /publicGuideWaterFilterOptions/);
  assert.match(guideLibrary, /getPublicGuideFilterTraits/);
  assert.match(guideLibrary, /matchesPublicGuideFilters/);

  assert.match(detailPage, /canAccessMembershipGuidance/);
  assert.match(detailPage, /GuideTab = "guide" \| "experience" \| "projects"/);
  assert.match(detailPage, /hydrateExperienceCardListItems/);
  assert.match(detailPage, /is_experience_card_public/);
  assert.match(detailPage, /<PlantRelatedArchives archives=\{relatedArchives\}/);
  assert.match(detailPage, /\.eq\("category", entry\.category\)/);
  assert.match(detailPage, /\.eq\("system_name", entry\.name\)/);
});

test("plant cycles support days, years, and omitting misleading fixed cycles", async () => {
  const [migration, detailPage, zh, en] = await Promise.all([
    source("supabase/migrations/20260829054054_add_plant_cycle_display_rules.sql"),
    source("app/plant/[id]/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(migration, /cycle_unit in \('day', 'year', 'hidden'\)/);
  assert.match(migration, /add column if not exists cycle_min numeric/);
  assert.match(migration, /add column if not exists cycle_max numeric/);
  assert.match(migration, /set cycle_unit = 'hidden'/);
  assert.match(migration, /'perennial', 'tree', 'shrub'/);
  assert.match(detailPage, /hasMeaningfulGrowthCycle/);
  assert.match(detailPage, /cycle\.cycle_unit === "year"/);
  assert.match(detailPage, /showGrowthCycle \?/);
  assert.match(zh, /year_unit: " 年"/);
  assert.match(en, /year_unit: " years"/);
});
