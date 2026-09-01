import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260825045740_add_admin_operations_dashboard.sql";

test("page views are privacy-preserving and available only as admin aggregates", async () => {
  const [migration, tracker, analytics] = await Promise.all([
    source(migrationPath),
    source("components/AnalyticsTracker.tsx"),
    source("lib/analytics-events.ts"),
  ]);

  assert.match(migration, /event_name in \([\s\S]*?'page_view'/i);
  assert.match(
    migration,
    /analytics events anonymous insert limited[\s\S]*?'page_view'/i
  );
  assert.match(migration, /analytics_events_name_created_idx/i);
  assert.match(migration, /metadata ->> 'path'/i);
  assert.match(migration, /public\.is_app_admin\(auth\.uid\(\)\)/i);
  assert.match(
    migration,
    /revoke all on function public\.admin_get_operations_dashboard\(integer\)[\s\S]*?from public, anon, authenticated, service_role/i
  );

  assert.match(analytics, /\| "page_view"/);
  assert.match(analytics, /eventName === "page_view" \? null : sanitizeReferrer/);
  assert.match(tracker, /normalizeAnalyticsPath/);
  assert.match(tracker, /"\/archive\/\[id\]"/);
  assert.match(tracker, /"\/user\/\[id\]\/profile"/);
  assert.match(tracker, /STATIC_ANALYTICS_PATHS/);
  assert.match(tracker, /return "\/not-found"/);
  assert.match(tracker, /window\.sessionStorage/);
  assert.match(tracker, /PAGE_VIEW_DEDUPE_MS = 30_000/);
  assert.match(tracker, /trackAnalyticsEvent\("page_view", \{ path \}\)/);
  assert.doesNotMatch(tracker, /searchParams|location\.search|document\.title/);
});

test("administrator dashboard covers traffic, registrations, downloads, payments, and capacity", async () => {
  const [migration, page, zhCopy, enCopy] = await Promise.all([
    source(migrationPath),
    source("app/admin/memberships/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(migration, /'page_views_today'/i);
  assert.match(migration, /'visitors_7d'/i);
  assert.match(migration, /'registered_total'/i);
  assert.match(migration, /'cloud_members'/i);
  assert.match(migration, /'payments_awaiting_confirmation'/i);
  assert.match(migration, /'apk_download_total'/i);
  assert.match(migration, /private\.platform_storage_usage_bytes\(\)/i);
  assert.match(migration, /au\.last_sign_in_at/i);
  assert.match(migration, /u\.account_number/i);
  assert.match(migration, /archive_count bigint/i);
  assert.match(migration, /record_count bigint/i);

  for (const section of [
    "overview",
    "traffic",
    "registrations",
    "payment-review",
    "refund-review",
    "capacity",
    "account-closures",
  ]) {
    assert.match(page, new RegExp(`id="${section}"`));
  }

  assert.match(page, /admin_get_operations_dashboard/);
  assert.match(page, /admin_list_account_deletions/);
  assert.match(page, /operationsDashboard\?\.daily_traffic/);
  assert.match(page, /operationsDashboard\?\.top_pages/);
  assert.match(page, /operationsDashboard\?\.storage_leaders/);
  assert.match(page, /row\.account_number/);
  assert.match(page, /row\.last_sign_in_at/);
  assert.match(zhCopy, /title: "管理员中心"/);
  assert.match(zhCopy, /APP 下载累计/);
  assert.match(enCopy, /title: "Administrator Center"/);
});

test("account closure is distinct from membership suspension and requires an audit", async () => {
  const [migration, page, deleteRoute, membershipRoute, zhCopy] = await Promise.all([
    source(migrationPath),
    source("app/admin/memberships/page.tsx"),
    source("app/api/account/delete/route.ts"),
    source("app/api/admin/memberships/delete/route.ts"),
    source("lib/i18n/zh.ts"),
  ]);

  assert.match(migration, /create table if not exists public\.account_deletion_audits/i);
  assert.match(migration, /alter table public\.account_deletion_audits enable row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.account_deletion_audits[\s\S]*?from public, anon, authenticated/i
  );
  const auditTable = migration.match(
    /create table if not exists public\.account_deletion_audits[\s\S]*?\n\);/i
  )?.[0] ?? "";
  assert.doesNotMatch(auditTable, /references auth\.users/i);
  assert.doesNotMatch(auditTable, /email/i);

  assert.match(deleteRoute, /hasValidMutationOrigin\(request\)/);
  assert.match(deleteRoute, /body\.confirmPermanent !== true/);
  assert.match(deleteRoute, /confirmationText !== requiredConfirmation/);
  assert.match(deleteRoute, /userId === requestedBy/);
  assert.match(deleteRoute, /targetMembership\?\.plan === "admin"/);
  assert.match(deleteRoute, /\.from\("account_deletion_audits"\)/);
  assert.ok(
    deleteRoute.indexOf('.from("account_deletion_audits")') <
      deleteRoute.indexOf("deleteAccountData(supabase, userId, authUserExists)")
  );
  assert.match(deleteRoute, /status: "completed"/);
  assert.match(deleteRoute, /status: "failed"/);
  assert.match(deleteRoute, /supabase\.auth\.admin\.deleteUser\(userId, true\)/);
  assert.match(deleteRoute, /hasResidualAccountData\(supabase, userId\)/);
  assert.match(deleteRoute, /deleteAccountData\(supabase, userId, authUserExists\)/);
  assert.match(deleteRoute, /if \(authUserExists\)/);
  assert.ok(
    deleteRoute.indexOf("if (isAdminInitiated && !requesterAdmin)") <
      deleteRoute.indexOf("hasResidualAccountData(supabase, userId)")
  );
  assert.match(membershipRoute, /hasValidMutationOrigin\(request\)/);

  assert.match(page, /permanent_account_delete/);
  assert.match(page, /accountDeleteConfirmation\.trim\(\) !==/);
  assert.match(page, /accountDeleteAcknowledged/);
  assert.match(zhCopy, /delete_membership: "停用会员"/);
  assert.match(zhCopy, /permanent_account_delete: "永久注销账号"/);
  assert.match(zhCopy, /永久注销不可恢复/);
});

test("administrator search includes residual owners whose Auth identity is gone", async () => {
  const migration = await source(
    "supabase/migrations/20260901100000_include_orphaned_accounts_in_admin_search.sql"
  );

  assert.match(migration, /with candidate_users as/i);
  assert.match(migration, /select a\.user_id[\s\S]*?from public\.archives as a/i);
  assert.match(migration, /select r\.user_id[\s\S]*?from public\.records as r/i);
  assert.match(migration, /from auth\.users as au[\s\S]*?where au\.deleted_at is null/i);
  assert.match(migration, /left join auth\.users as au on au\.id = candidates\.user_id/i);
  assert.doesNotMatch(migration, /select mp\.user_id[\s\S]*?from public\.membership_payments/i);
  assert.match(
    migration,
    /revoke all on function public\.admin_search_memberships\(text\)[\s\S]*?from public, anon, authenticated, service_role/i
  );
  assert.match(
    migration,
    /grant execute on function public\.admin_search_memberships\(text\)[\s\S]*?to authenticated, service_role/i
  );
});
