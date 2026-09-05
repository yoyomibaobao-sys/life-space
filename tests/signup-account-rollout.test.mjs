import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260730063743_add_signup_account_rollout.sql";
const claimableTrialMigrationPath =
  "supabase/migrations/20260902033206_claimable_cloud_trial.sql";

test("formal account numbers are global, permanent, and exclude existing internal accounts", async () => {
  const migration = await source(migrationPath);

  assert.match(
    migration,
    /add column if not exists is_internal_test boolean not null default true/i
  );
  assert.match(
    migration,
    /last_registration_sequence bigint not null default 0/i
  );
  assert.match(
    migration,
    /select \*\s+into v_state[\s\S]*?for update;/i
  );
  assert.match(
    migration,
    /v_registration_sequence := v_state\.last_registration_sequence \+ 1;/i
  );
  assert.match(
    migration,
    /'LS'\s+\|\| v_state\.account_class[\s\S]*?\|\| v_registration_year::text[\s\S]*?lpad\(/i
  );
  assert.match(
    migration,
    /create unique index if not exists users_registration_sequence_unique/i
  );
  assert.match(
    migration,
    /create trigger trg_enforce_account_identity_immutable/i
  );
  assert.match(
    migration,
    /message = 'account_identity_is_immutable'/i
  );
});

test("formal accounts claim one fixed 30 MB / 90-day trial after email confirmation", async () => {
  const migration = await source(claimableTrialMigrationPath);

  assert.match(
    migration,
    /storage_limit_bytes bigint not null default 30000000/i
  );
  assert.match(
    migration,
    /platform_storage_pause_bytes bigint not null default 700000000/i
  );
  assert.match(
    migration,
    /create table if not exists private\.cloud_trial_claims[\s\S]*?user_id uuid primary key/i
  );
  assert.match(
    migration,
    /create or replace function public\.claim_my_cloud_trial\(\)/i
  );
  assert.match(
    migration,
    /select au\.email_confirmed_at[\s\S]*?if v_email_confirmed_at is null/i
  );
  assert.match(
    migration,
    /'membership-payment:' \|\| v_user_id::text/i
  );
  assert.match(
    migration,
    /v_trial_ends_at :=\s*v_claimed_at \+ make_interval\(days => v_settings\.trial_duration_days\)/i
  );
  assert.match(
    migration,
    /v_cleanup_due_at :=\s*v_trial_ends_at \+ make_interval\(days => v_settings\.handling_period_days\)/i
  );
  assert.match(migration, /trial_duration_days integer not null default 90/i);
  assert.match(migration, /handling_period_days integer not null default 90/i);
});

test("registration remains local-free while capacity can pause only new claims", async () => {
  const migration = await source(claimableTrialMigrationPath);
  const initializer =
    migration.match(
      /create or replace function private\.initialize_new_account[\s\S]*?comment on function private\.initialize_new_account/
    )?.[0] ?? "";

  assert.match(
    initializer,
    /insert into public\.users[\s\S]*?v_account_number/i
  );
  assert.doesNotMatch(
    initializer,
    /insert into public\.user_memberships/i
  );
  assert.match(
    initializer,
    /false,\s*'user',\s*'active'/i
  );
  assert.match(
    migration,
    /v_storage_bytes\s*\+ v_unrealized_bytes\s*\+ v_settings\.storage_limit_bytes[\s\S]*?> v_settings\.platform_storage_pause_bytes/i
  );
  assert.match(
    migration,
    /'storage_safety_threshold'::text/i
  );
  assert.match(
    migration,
    /membership_payments[\s\S]*?mp\.status = 'confirmed'[\s\S]*?'paid_membership_history'::text/i
  );
});

test("account identity keeps a pre-migration compatibility path without crowding mobile profiles", async () => {
  const [profileLoader, ownProfile, publicProfile, accountNumber, zhCopy, enCopy] =
    await Promise.all([
      source("lib/user-profile-shared.ts"),
      source("app/profile/page.tsx"),
      source("app/user/[id]/profile/page.tsx"),
      source("lib/account-number.ts"),
      source("lib/i18n/zh.ts"),
      source("lib/i18n/en.ts"),
    ]);

  assert.match(
    profileLoader,
    /select\(\s*"account_number, registration_year, registration_sequence, is_internal_test"\s*\)/
  );
  assert.match(profileLoader, /isMissingDatabaseColumn/);
  assert.doesNotMatch(ownProfile, /label=\{t\.profile\.account_number\}/);
  assert.doesNotMatch(ownProfile, /t\.profile\.internal_test/);
  assert.doesNotMatch(publicProfile, /t\.profile\.public_profile\.account_number/);
  assert.match(zhCopy, /account_number: "账号编号"/);
  assert.match(enCopy, /account_number: "Account number"/);
  assert.match(accountNumber, /\^LS\(\[a-z\]\)-\(\[0-9\]\{4\}\)-\(\[0-9\]\+\)\$/);
  assert.match(accountNumber, /Formal user #\$\{parsed\.registrationSequence\}/);
  assert.match(accountNumber, /正式用户总第\$\{parsed\.registrationSequence\}位/);
});

test("registration, membership, and admin copy use the claim and handling rules", async () => {
  const [registration, membership, admin, docs, migration, zhCopy, enCopy] = await Promise.all([
    source("app/register/page.tsx"),
    source("app/membership/page.tsx"),
    source("app/admin/memberships/page.tsx"),
    source("docs/membership-access.md"),
    source(claimableTrialMigrationPath),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  for (const text of [zhCopy, docs]) {
    assert.match(text, /30MB/i);
    assert.match(text, /90天/i);
  }

  assert.match(registration, /t\.auth\.registration_intro/);
  assert.match(membership, /t\.membership_page/);
  assert.match(zhCopy, /永久账号编号/);
  assert.match(zhCopy, /处理期/);
  assert.match(admin, /admin_get_cloud_trial_status/);
  assert.match(admin, /t\.admin_memberships\.rollout_title/);
  assert.match(admin, /t\.admin_memberships\.platform_storage/);
  assert.match(admin, /t\.admin_memberships\.unused_allowance/);
  assert.match(zhCopy, /rollout_title: "每个正式账号可领取一次 · 30MB／90天"/);
  assert.match(enCopy, /rollout_title: "One claim per formal account · 30 MB \/ 90 days"/);
  assert.match(zhCopy, /platform_storage: "平台实际存储"/);
  assert.match(enCopy, /platform_storage: "Actual platform storage"/);
  assert.match(docs, /LSa-2026-0001/);
  assert.match(docs, /700MB安全线/);
  assert.match(docs, /处理期结束后/);
  assert.match(docs, /最终结束云端保留前7天发送一次关键邮件/);
  assert.match(docs, /处理期以站内通知为主/);
  assert.match(docs, /曾经至少有一笔确认成功且未被撤销的付费会员记录/);
  assert.match(docs, /公开转私密/);
  assert.match(zhCopy, /trial_cleanup_completed: "已转回本地使用/);
  assert.doesNotMatch(zhCopy, /trial_cleanup_(?:in_progress|completed): "[^"]*清理/);
  assert.match(migration, /insert into public\.notifications/i);
  assert.doesNotMatch(migration, /云端数据清理(?:还剩|完成|已开始)/);
});
