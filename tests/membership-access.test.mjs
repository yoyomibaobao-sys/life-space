import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260726140000_align_membership_access_and_market_limits.sql";

test("new registrations become local-free instead of receiving an automatic trial", async () => {
  const [migration, registration] = await Promise.all([
    source(migrationPath),
    source("app/register/page.tsx"),
  ]);

  assert.match(
    migration,
    /drop trigger if exists trg_ensure_user_membership on public\.users;/i
  );
  assert.match(
    migration,
    /drop function if exists public\.ensure_user_membership\(\);/i
  );
  assert.match(
    migration,
    /alter table public\.profiles\s+alter column storage_limit set default 0;/i
  );
  assert.match(registration, /注册后成为本地免费用户/);
  assert.match(registration, /注册不会赠送云空间/);
});

test("the launch cloud plan is fixed at 1 GB and 30 active market posts", async () => {
  const [migration, admin, membershipPage] = await Promise.all([
    source(migrationPath),
    source("app/admin/memberships/page.tsx"),
    source("app/membership/page.tsx"),
  ]);

  assert.match(
    migration,
    /if new\.plan = 'basic' then\s+new\.storage_limit_bytes := 1000000000;\s+new\.base_market_post_limit := 30;/i
  );
  assert.match(
    migration,
    /create trigger trg_enforce_basic_cloud_plan[\s\S]*?before insert or update of plan, storage_limit_bytes, base_market_post_limit/i
  );
  assert.match(
    migration,
    /create or replace function public\.get_user_market_post_limit[\s\S]*?select m\.base_market_post_limit[\s\S]*?end;/i
  );
  assert.doesNotMatch(
    migration.match(
      /create or replace function public\.get_user_market_post_limit[\s\S]*?\$\$;/
    )?.[0] ?? "",
    /market_post_quota_addons/i
  );
  assert.match(admin, /if \(plan === "basic"\) return currency === "CNY" \? 64 : 8;/);
  assert.match(admin, /baseMarketPostLimit: 30/);
  assert.match(admin, /preset\.key !== "trial" \|\| selected\?\.plan === "trial"/);
  assert.match(membershipPage, /¥64 \/ 年｜US\$8 \/ year/);
  assert.match(membershipPage, /暂不提供集市加量包/);
});

test("plant guidance is split into visitor, registered, and cloud-member tiers", async () => {
  const migration = await source(migrationPath);

  const speciesGrant =
    migration.match(
      /grant select \([\s\S]*?\) on public\.plant_species to anon, authenticated;/
    )?.[0] ?? "";
  const i18nGrant =
    migration.match(
      /grant select \([\s\S]*?\) on public\.plant_species_i18n to anon, authenticated;/
    )?.[0] ?? "";

  assert.match(speciesGrant, /\bcommon_name\b/);
  assert.match(speciesGrant, /\bcategory\b/);
  assert.doesNotMatch(speciesGrant, /\bdescription\b/);
  assert.match(i18nGrant, /\bcommon_name\b/);
  assert.doesNotMatch(i18nGrant, /\bdescription\b/);

  assert.match(
    migration,
    /grant execute on function public\.get_plant_basic_overviews\(uuid, text\)\s+to authenticated;/i
  );
  assert.match(
    migration,
    /revoke all on function public\.get_plant_basic_overviews\(uuid, text\)\s+from public, anon, authenticated, service_role;/i
  );
  assert.match(
    migration,
    /grant execute on function public\.get_plant_core_parameters\(uuid\)\s+to authenticated;/i
  );
  assert.match(
    migration,
    /revoke all on function public\.get_plant_core_parameters\(uuid\)\s+from public, anon, authenticated, service_role;/i
  );

  const coreParameterRpc =
    migration.match(
      /create or replace function public\.get_plant_core_parameters[\s\S]*?comment on function public\.get_plant_core_parameters\(uuid\)[\s\S]*?;/
    )?.[0] ?? "";
  for (const column of [
    "sun_score",
    "need_trellis",
    "container_friendly_score",
    "indoor_friendly_score",
    "balcony_friendly_score",
  ]) {
    assert.match(coreParameterRpc, new RegExp(`\\b${column}\\b`));
  }
  for (const paidColumn of [
    "soil_moisture_score",
    "optimal_growth_temp_min",
    "care_note",
  ]) {
    assert.doesNotMatch(coreParameterRpc, new RegExp(`\\b${paidColumn}\\b`));
  }

  for (const table of [
    "plant_care_guides",
    "plant_parameters",
    "plant_growth_cycle",
    "plant_light_cycle",
    "plant_temperature_ranges",
    "plant_parameter_score_guides",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `create policy ${table}_select_cloud_member[\\s\\S]*?using \\([\\s\\S]*?public\\.has_active_cloud_access\\(\\)`,
        "i"
      )
    );
  }

  assert.match(
    migration,
    /revoke select on table public\.plant_related_archives_view\s+from anon, authenticated;/i
  );
});

test("the plant pages request only data allowed for the current tier", async () => {
  const [indexPage, detailPage, guideCompat] = await Promise.all([
    source("app/plant/page.tsx"),
    source("app/plant/[id]/page.tsx"),
    source("lib/plant-guide-compat.ts"),
  ]);

  assert.match(indexPage, /loadPlantBasicOverviewsCompat\(null\)/);
  assert.match(indexPage, /canReadFullGuide\s+\?\s+supabase\.from\("plant_parameters"\)/);
  assert.match(indexPage, /loadPlantCoreParametersCompat\(null\)/);
  assert.doesNotMatch(
    indexPage,
    /\.from\("plant_species"\)[\s\S]{0,180}\.select\([^)]*description/i
  );
  assert.match(indexPage, /游客可以查看植物目录、名称和分类/);

  assert.match(detailPage, /loadPlantBasicOverviewsCompat\(id\)/);
  assert.match(detailPage, /loadPlantCoreParametersCompat\(id\)/);
  assert.match(
    detailPage,
    /canReadFullGuide\s+\?\s+supabase\.from\("plant_parameters"\)/
  );
  assert.match(
    detailPage,
    /canReadFullGuide\s+\?\s+supabase\.from\("plant_growth_cycle"\)/
  );
  assert.doesNotMatch(detailPage, /from\("plant_related_archives_view"\)/);
  assert.match(detailPage, /游客可以查看目录、名称和分类/);

  assert.match(guideCompat, /rpc\("get_plant_basic_overviews"/);
  assert.match(guideCompat, /rpc\("get_plant_core_parameters"/);
  assert.match(
    guideCompat,
    /isMissingDatabaseFunction\(rpcResult\.error, "get_plant_basic_overviews"\)/
  );
  assert.match(
    guideCompat,
    /isMissingDatabaseFunction\(rpcResult\.error, "get_plant_core_parameters"\)/
  );
  const coreFallbackSelect =
    guideCompat.match(
      /\.from\("plant_parameters"\)[\s\S]*?\.select\(\s*"([^"]+)"\s*\)/
    )?.[1] ?? "";
  for (const column of [
    "species_id",
    "sun_score",
    "need_trellis",
    "container_friendly_score",
    "indoor_friendly_score",
    "balcony_friendly_score",
  ]) {
    assert.match(coreFallbackSelect, new RegExp(`\\b${column}\\b`));
  }
  assert.doesNotMatch(coreFallbackSelect, /\bsoil_moisture_score\b/);
});

test("all community interactions require active cloud access for new writes", async () => {
  const migration = await source(migrationPath);

  for (const policy of [
    '"allow insert own follow"',
    '"archive follows allow insert own"',
    "record_likes_insert_own",
    "comment_likes_insert_own",
    "comment_flowers_insert_help_owner",
    "comments_insert_own_active_visible_record",
    "user_plant_interests_insert_own",
    "user_plant_plans_insert_own",
  ]) {
    const escaped = policy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      migration,
      new RegExp(
        `create policy ${escaped}[\\s\\S]*?with check \\([\\s\\S]*?public\\.has_active_cloud_access\\(\\)`,
        "i"
      )
    );
  }
});

test("registered local-free users can consult on active marketplace posts", async () => {
  const [migration, marketComments] = await Promise.all([
    source(migrationPath),
    source("components/market/MarketCommentsSection.tsx"),
  ]);
  const consultationPolicy =
    migration.match(
      /create policy market_comments_insert_own_active_post[\s\S]*?\);/
    )?.[0] ?? "";

  assert.match(consultationPolicy, /\(select auth\.uid\(\)\) = user_id/i);
  assert.match(
    consultationPolicy,
    /public\.can_comment_market_post\(market_post_id\)/i
  );
  assert.doesNotMatch(consultationPolicy, /has_active_cloud_access/i);
  assert.doesNotMatch(marketComments, /canCreateMembershipContent/);
  assert.doesNotMatch(marketComments, /get_my_membership/);
  assert.match(marketComments, /咨询与联系/);
  assert.match(marketComments, /本地免费用户也可咨询/);
});

test("record photos are unlimited cumulatively but capped at ten per add operation", async () => {
  const [batchRules, cloudAddRecord, cloudArchive, localArchive, migration] =
    await Promise.all([
      source("lib/record-photo-batches.ts"),
      source("app/archive/[id]/AddRecord.tsx"),
      source("app/archive/[id]/page.tsx"),
      source("app/local/archive/[id]/page.tsx"),
      source(migrationPath),
    ]);

  assert.match(batchRules, /MAX_RECORD_PHOTOS_PER_ADD = 10/);
  assert.match(batchRules, /items\.slice\(0, safeLimit\)/);
  assert.match(batchRules, /if \(mergeIntoOneRecord\)/);
  assert.match(batchRules, /const byDate = new Map/);
  assert.match(batchRules, /recordTimeISO: latestRecordTime\(photos\)/);
  assert.match(batchRules, /recordTimeISO: latestRecordTime\(groupPhotos\)/);
  assert.match(
    cloudAddRecord,
    /每次最多添加 \{MAX_RECORD_PHOTOS_PER_ADD\} 张，可分多次继续添加；单条记录累计照片不设上限/
  );
  assert.match(cloudArchive, /limitRecordPhotoBatch/);
  assert.match(localArchive, /image_captured_at/);
  assert.match(
    migration,
    /alter table public\.media\s+add column if not exists captured_at timestamptz;/i
  );
});

test("the application remains usable while production is between code and migration", async () => {
  const [
    schemaCompat,
    guideCompat,
    cloudAddRecord,
    cloudArchive,
    localToCloudSync,
    exportRoute,
  ] = await Promise.all([
    source("lib/supabase-schema-compat.ts"),
    source("lib/plant-guide-compat.ts"),
    source("app/archive/[id]/AddRecord.tsx"),
    source("app/archive/[id]/page.tsx"),
    source("lib/local-to-cloud-sync.ts"),
    source("app/api/export/my-records/route.ts"),
  ]);

  assert.match(schemaCompat, /code === "PGRST204" \|\| code === "42703"/);
  assert.match(schemaCompat, /code === "PGRST202" \|\| code === "42883"/);
  assert.match(guideCompat, /isMissingDatabaseFunction/);

  for (const sourceText of [
    cloudAddRecord,
    cloudArchive,
    localToCloudSync,
  ]) {
    assert.match(
      sourceText,
      /isMissingDatabaseColumn\([\s\S]*?mediaInsertResult\.error,[\s\S]*?"media",[\s\S]*?"captured_at"/
    );
    assert.match(
      sourceText,
      /\.insert\(\[withoutCapturedAt\(mediaPayload\)\]\)/
    );
  }

  assert.match(
    exportRoute,
    /isMissingDatabaseColumn\([\s\S]*?mediaWithCaptureResult\.error,[\s\S]*?"media",[\s\S]*?"captured_at"/
  );
  assert.match(
    exportRoute,
    /\.select\("id,record_id,type,url,storage_path,thumb_url,thumb_path,size_mb,size_bytes,duration_sec,storage_class,created_at,sort_order"\)/
  );
});

test("client-side entitlement checks fail closed when membership is absent", async () => {
  const membership = await source("lib/membership.ts");

  assert.match(
    membership,
    /canCreateMembershipContent[\s\S]*?can_create_content === true/
  );
  assert.match(
    membership,
    /canCreateMembershipMarketPost[\s\S]*?can_create_market_post === true/
  );
  assert.match(
    membership,
    /canAccessMembershipGuidance[\s\S]*?can_create_content === true/
  );
  assert.match(membership, /需要开通有效云空间/);
});

test("market activation is serialized for inserts and reactivation", async () => {
  const migration = await source(migrationPath);

  assert.match(
    migration,
    /from public\.user_memberships as m[\s\S]*?where m\.user_id = new\.user_id[\s\S]*?for update;/i
  );
  assert.match(
    migration,
    /from public\.market_posts as mp[\s\S]*?mp\.status = 'active'[\s\S]*?mp\.id is distinct from new\.id/i
  );
  assert.match(migration, /message = 'membership_inactive'/);
  assert.match(migration, /message = 'market_post_limit_reached'/);
  assert.match(
    migration,
    /before insert or update of status, user_id\s+on public\.market_posts/i
  );
});

test("the approved matrix and transition rules are documented", async () => {
  const docs = await source("docs/membership-access.md");

  assert.match(docs, /游客（未注册）.*本地免费用户.*云空间会员/);
  assert.match(docs, /植物指引基础概要 \| — \| ✓ \| ✓/);
  assert.match(docs, /少量核心静态参数 \| — \| ✓ \| ✓/);
  assert.match(docs, /完整参数、生长周期和完整养护指引 \| — \| — \| ✓/);
  assert.match(docs, /评论、回复、点赞、鲜花和关注 \| — \| — \| ✓/);
  assert.match(docs, /集市咨询和联系发布者 \| — \| ✓ \| ✓/);
  assert.match(docs, /未来：作者主动公开的单张经验卡.*\| ✓ \| ✓ \| ✓/);
  assert.match(docs, /只有报名时仍有效的云空间会员可以申请试用／试种/);
  assert.match(docs, /主动公开、或在本次报名中明确授权展示的种植经验/);
  assert.match(docs, /不得读取或披露报名者的私密项目、私密记录/);
  assert.match(docs, /¥64\/年或 US\$8\/year/);
  assert.match(docs, /现有 4 个试用账号保留原到期日、原容量和原集市额度/);
  assert.match(docs, /已结束的集市条目不占 30 条额度/);
  assert.match(docs, /先发布包含过渡兼容层的应用代码，再执行本 PR 的生产 migration/);
  assert.match(docs, /不能先执行收紧植物表列权限的 migration 后继续运行旧前端/);
});

test("isolated database CI runs membership behavior and both concurrency suites", async () => {
  const runner = await source("scripts/run-isolated-database-tests.sh");

  assert.match(runner, /supabase\/tests\/membership_access_dynamic\.sql/);
  assert.match(
    runner,
    /supabase\/tests\/storage_upload_capacity_reservations_concurrency\.sql/
  );
  assert.match(runner, /supabase\/tests\/market_post_limit_concurrency\.sql/);
  assert.match(
    runner,
    /run_concurrency_sql_file "\$\{test_file\}"/
  );
});
