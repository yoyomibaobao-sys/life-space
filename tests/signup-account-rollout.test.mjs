import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260730063743_add_signup_account_rollout.sql";

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

test("only the first 20 formal accounts receive a non-expiring 30 MB allowance", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /trial_slot_limit integer not null default 20/i);
  assert.match(
    migration,
    /trial_allowance_bytes bigint not null default 30000000/i
  );
  assert.match(
    migration,
    /platform_storage_pause_bytes bigint not null default 700000000/i
  );
  assert.match(
    migration,
    /create or replace function private\.signup_trial_unrealized_allowance_bytes\(\)/i
  );
  assert.match(
    migration,
    /v_projected_storage_bytes :=\s*v_platform_storage_bytes\s*\+\s*v_unrealized_trial_allowance_bytes\s*\+\s*v_state\.trial_allowance_bytes;/i
  );
  assert.match(
    migration,
    /v_registration_sequence <= v_state\.trial_slot_limit/i
  );
  assert.match(
    migration,
    /if v_projected_storage_bytes <= v_state\.platform_storage_pause_bytes then\s+v_trial_slot := v_registration_sequence::integer;/i
  );
  assert.match(
    migration,
    /'trial',\s*'trialing',\s*v_created_at,\s*null,\s*null,\s*v_state\.trial_allowance_bytes,\s*3/i
  );
  assert.match(
    migration,
    /m\.trial_ends_at is null\s+and m\.status = 'trialing'/i
  );
  assert.doesNotMatch(
    migration.match(
      /create or replace function private\.initialize_new_account[\s\S]*?\$\$;/
    )?.[0] ?? "",
    /interval '6 months'/i
  );
});

test("trial exhaustion pauses the allowance without blocking account registration", async () => {
  const migration = await source(migrationPath);
  const initializer =
    migration.match(
      /create or replace function private\.initialize_new_account[\s\S]*?comment on function private\.initialize_new_account/
    )?.[0] ?? "";

  assert.match(
    initializer,
    /insert into public\.users[\s\S]*?v_account_number/i
  );
  assert.match(
    initializer,
    /if v_trial_slot is not null then\s+insert into public\.user_memberships/i
  );
  assert.doesNotMatch(
    initializer,
    /else\s+raise exception[\s\S]*?(trial|slot|storage)/i
  );
  assert.match(
    migration,
    /trial_slots_granted = trial_slots_granted\s+\+ case when v_trial_slot is null then 0 else 1 end/i
  );
  assert.match(
    migration,
    /v_state\.last_registration_sequence >= v_state\.trial_slot_limit[\s\S]*?first_twenty_registered/i
  );
});

test("account identity is shown with a pre-migration compatibility path", async () => {
  const [profileLoader, ownProfile, publicProfile, accountNumber] =
    await Promise.all([
      source("lib/user-profile-shared.ts"),
      source("app/profile/page.tsx"),
      source("app/user/[id]/profile/page.tsx"),
      source("lib/account-number.ts"),
    ]);

  assert.match(
    profileLoader,
    /select\(\s*"account_number, registration_year, registration_sequence, is_internal_test"\s*\)/
  );
  assert.match(profileLoader, /isMissingDatabaseColumn/);
  assert.match(ownProfile, /label="账号编号"/);
  assert.match(ownProfile, /内部测试账号/);
  assert.match(publicProfile, /账号编号：\{profile\.account_number\}/);
  assert.match(accountNumber, /\^LS\(\[a-z\]\)-\(\[0-9\]\{4\}\)-\(\[0-9\]\+\)\$/);
  assert.match(accountNumber, /正式用户总第\$\{parsed\.registrationSequence\}位/);
});

test("registration, membership, and admin copy use the confirmed rollout rules", async () => {
  const [registration, membership, admin, docs] = await Promise.all([
    source("app/register/page.tsx"),
    source("app/membership/page.tsx"),
    source("app/admin/memberships/page.tsx"),
    source("docs/membership-access.md"),
  ]);

  for (const text of [registration, membership, admin, docs]) {
    assert.match(text, /20/);
    assert.match(text, /30MB/i);
  }

  assert.match(registration, /永久账号编号/);
  assert.match(membership, /不设6个月期限/);
  assert.match(admin, /admin_get_signup_rollout_status/);
  assert.match(admin, /平台实际存储/);
  assert.match(admin, /尚未使用的体验额度/);
  assert.match(docs, /LSa-2026-0001/);
  assert.match(docs, /700MB安全线/);
});
