import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260726140000_align_membership_access_and_market_limits.sql";
const signupRolloutMigrationPath =
  "supabase/migrations/20260730063743_add_signup_account_rollout.sql";
const paymentOrderMigrationPath =
  "supabase/migrations/20260814022739_add_membership_payment_orders.sql";

test("new registrations use the bounded 30 MB signup rollout instead of the legacy automatic trial", async () => {
  const [migration, signupRolloutMigration, registration, zhCopy] = await Promise.all([
    source(migrationPath),
    source(signupRolloutMigrationPath),
    source("app/register/page.tsx"),
    source("lib/i18n/zh.ts"),
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
  assert.match(
    signupRolloutMigration,
    /trial_slot_limit integer not null default 20/i
  );
  assert.match(
    signupRolloutMigration,
    /trial_allowance_bytes bigint not null default 30000000/i
  );
  assert.match(
    signupRolloutMigration,
    /from private\.initialize_new_account/i
  );
  assert.match(registration, /t\.auth\.registration_intro/);
  assert.match(zhCopy, /首批20名正式注册用户/);
  assert.match(zhCopy, /30MB云空间体验/);
});

test("the launch cloud plan is fixed at 1 GB and 30 active market posts", async () => {
  const [migration, admin, membershipPage, zhCopy] = await Promise.all([
    source(migrationPath),
    source("app/admin/memberships/page.tsx"),
    source("app/membership/page.tsx"),
    source("lib/i18n/zh.ts"),
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
  assert.match(membershipPage, /t\.membership_page/);
  assert.match(zhCopy, /¥64 \/ 年｜US\$8 \/ year/);
  assert.match(zhCopy, /暂不提供集市加量包/);
});

test("manual membership orders keep fixed prices, private proof, and transactional confirmation", async () => {
  const [migration, paymentPage, profile, admin, accountDelete, docs] = await Promise.all([
    source(paymentOrderMigrationPath),
    source("app/membership/payment/page.tsx"),
    source("app/profile/page.tsx"),
    source("app/admin/memberships/page.tsx"),
    source("app/api/account/delete/route.ts"),
    source("docs/membership-access.md"),
  ]);

  assert.match(migration, /v_amount := case when v_currency = 'CNY' then 64\.00 else 8\.00 end/);
  assert.match(migration, /v_currency = 'CNY' and v_payment_method = 'alipay'/);
  assert.match(migration, /v_currency = 'USD' and v_payment_method = 'paypal'/);
  assert.doesNotMatch(paymentPage, /createOrder\("wechat"\)/);
  assert.match(migration, /'payment-proofs',[\s\S]*?false,[\s\S]*?5242880/);
  assert.match(migration, /name = auth\.uid\(\)::text \|\| '\/' \|\| \(storage\.foldername\(name\)\)\[2\] \|\| '\/proof'/);
  assert.match(paymentPage, /const proofPath = `\$\{userId\}\/\$\{order\.id\}\/proof`/);
  assert.match(paymentPage, /upsert: true/);
  assert.match(
    migration,
    /revoke all on table public\.membership_payments from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant select on table public\.membership_payments to authenticated/
  );
  assert.match(
    migration,
    /create unique index if not exists membership_payments_one_open_order_per_user_uidx[\s\S]*?status in \('pending_payment', 'submitted', 'needs_update'\)/
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_service_ends_at := v_service_started_at \+ interval '12 months'/);
  assert.match(migration, /if v_payment\.status = 'confirmed' then[\s\S]*?'already_confirmed', true/);
  assert.match(profile, /admin_get_membership_payment_queue_count/);
  assert.match(profile, /admin_get_membership_refund_queue_count/);
  assert.match(profile, /"\/admin\/memberships#refund-review"/);
  assert.match(profile, /"\/admin\/memberships#payment-review"/);
  assert.match(admin, /admin_confirm_submitted_membership_payment_json/);
  assert.match(admin, /createSignedUrl\(row\.proof_path, 300\)/);
  assert.match(accountDelete, /listStoragePrefix\(supabase, "payment-proofs", userId\)/);
  assert.match(accountDelete, /removeStoragePaths\(supabase, "payment-proofs", storagePaths\.paymentProofs\)/);
  assert.match(accountDelete, /proof_path: null/);
  assert.match(
    accountDelete,
    /\.in\("status", \["pending_payment", "submitted", "needs_update"\]\)/
  );
  assert.match(
    admin,
    /\.in\("status", \["confirmed", "refunded", "canceled"\]\)/
  );
  assert.match(docs, /确认付款并开通.*同一数据库事务/);
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
  const [indexPage, detailPage, guideCompat, zhCopy] = await Promise.all([
    source("app/plant/page.tsx"),
    source("app/plant/[id]/page.tsx"),
    source("lib/plant-guide-compat.ts"),
    source("lib/i18n/zh.ts"),
  ]);

  assert.match(indexPage, /loadPlantBasicOverviewsCompat\(null\)/);
  assert.match(indexPage, /canReadFullGuide\s+\?\s+supabase\.from\("plant_parameters"\)/);
  assert.match(indexPage, /loadPlantCoreParametersCompat\(null\)/);
  assert.doesNotMatch(
    indexPage,
    /\.from\("plant_species"\)[\s\S]{0,180}\.select\([^)]*description/i
  );
  assert.match(indexPage, /t\.plant\.visitor_notice/);

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
  assert.match(detailPage, /copy\.visitor_detail_notice/);
  assert.match(zhCopy, /visitor_notice: "游客可以查看植物目录、名称和分类。"/);
  assert.match(zhCopy, /visitor_detail_notice: "游客可以查看目录、名称和分类。"/);

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
  const [migration, marketComments, zhCopy, enCopy] = await Promise.all([
    source(migrationPath),
    source("components/market/MarketCommentsSection.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
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
  assert.match(marketComments, /t\.market\.comments_title/);
  assert.match(marketComments, /t\.market\.comment_permission_hint/);
  assert.match(zhCopy, /comments_title: "咨询与联系"/);
  assert.match(zhCopy, /本地用户也可咨询/);
  assert.match(enCopy, /comments_title: "Questions & contact"/);
});

test("record photos are unlimited cumulatively but capped at ten per add operation", async () => {
  const [batchRules, cloudAddRecord, cloudArchive, localArchive, zhCopy, migration] =
    await Promise.all([
      source("lib/record-photo-batches.ts"),
      source("app/archive/[id]/AddRecord.tsx"),
      source("app/archive/[id]/page.tsx"),
      source("app/local/archive/[id]/page.tsx"),
      source("lib/i18n/zh.ts"),
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
    /\{copy\.photo_limit_prefix\} \{MAX_RECORD_PHOTOS_PER_ADD\} \{copy\.photo_limit_suffix\}/
  );
  assert.match(zhCopy, /单条记录累计照片不设上限/);
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
  assert.match(membership, /需要开通云会员/);
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

  assert.match(docs, /游客（未注册）.*本地用户（免费）.*云会员/);
  assert.match(docs, /植物指引基础概要 \| — \| ✓ \| ✓/);
  assert.match(docs, /少量核心静态参数 \| — \| ✓ \| ✓/);
  assert.match(docs, /完整参数、生长周期和完整养护指引 \| — \| — \| ✓/);
  assert.match(docs, /评论、回复、点赞、有帮助反馈和关注 \| — \| — \| ✓/);
  assert.match(docs, /集市咨询和联系发布者 \| — \| ✓ \| ✓/);
  assert.match(docs, /未来：作者主动公开的单张经验卡.*\| ✓ \| ✓ \| ✓/);
  assert.match(docs, /只有报名时仍有效的云会员可以申请试用／试种/);
  assert.match(docs, /商社会员面向个人经营者、苗圃、农场、工作室、小型商家和协作团队/);
  assert.match(docs, /商社空间＋成员账号/);
  assert.match(docs, /不允许多人共用同一登录账号和密码/);
  assert.match(docs, /受邀成员获得的是商社管理权限，不自动获得个人云会员权益/);
  assert.match(docs, /主动公开、或在本次报名中明确授权展示的种植经验/);
  assert.match(docs, /不得读取或披露报名者的私密项目、私密记录/);
  assert.match(docs, /¥64\/年或 US\$8\/year/);
  assert.match(docs, /现有 4 个内部试用账号保留原到期日、原容量和原集市额度/);
  assert.match(docs, /已结束的集市条目不占 30 条额度/);
  assert.match(docs, /先执行账号编号与首批体验额度 migration，再发布/);
  assert.match(docs, /第21个正式账号与存储安全线两条路径都只停止赠送，不阻断注册/);
});

test("isolated database CI runs membership behavior and all concurrency suites", async () => {
  const runner = await source("scripts/run-isolated-database-tests.sh");

  assert.match(runner, /supabase\/tests\/membership_access_dynamic\.sql/);
  assert.match(
    runner,
    /supabase\/tests\/storage_upload_capacity_reservations_concurrency\.sql/
  );
  assert.match(runner, /supabase\/tests\/market_post_limit_concurrency\.sql/);
  assert.match(runner, /supabase\/tests\/signup_account_rollout_concurrency\.sql/);
  assert.match(runner, /find "supabase\/tests"[\s\S]*?-name '\*\.sql'/);
  assert.match(
    runner,
    /run_concurrency_sql_file "\$\{test_file\}"/
  );
});

test("membership fixtures keep guide usage linked to real auth identities", async () => {
  const fixture = await source("supabase/tests/membership_access_dynamic.sql");
  const authInsert = fixture.indexOf("insert into auth.users");

  assert.ok(authInsert > fixture.indexOf("insert into public.users"));
  assert.ok(authInsert < fixture.indexOf("insert into public.archives"));
  assert.match(fixture, /c\.local_user, c\.cloud_user, c\.trial_user, c\.expired_user, c\.other_user/);
  assert.match(fixture, /candidate\.created_by = c\.other_user/);
  assert.match(fixture, /usage\.archive_id = c\.archive_id/);
  assert.doesNotMatch(fixture, /disable trigger|session_replication_role/i);
});
