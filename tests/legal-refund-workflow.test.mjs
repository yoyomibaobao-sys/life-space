import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260825064702_membership_refund_workflow.sql";

test("refund policy is enforced by an ownership-checked, RPC-only table", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /create table if not exists public\.membership_refund_requests/i);
  assert.match(migration, /payment_id uuid not null unique/i);
  assert.match(migration, /alter table public\.membership_refund_requests enable row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.membership_refund_requests[\s\S]*?from public, anon, authenticated/i
  );
  assert.match(migration, /create or replace function public\.get_my_membership_refunds_json/i);
  assert.match(migration, /where mp\.user_id = v_user_id/i);
  assert.match(migration, /create or replace function public\.request_membership_refund_json/i);
  assert.match(migration, /interval '7 days'/i);
  assert.match(migration, /interval '180 days'/i);
  assert.match(migration, /round\(v_payment\.amount \* 0\.5, 2\)/i);
  assert.match(migration, /v_payment\.service_started_at > now\(\)[\s\S]*?'unused_renewal_full'/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
});

test("administrator refunds require approval, an external refund, and an exact amount", async () => {
  const [migration, admin] = await Promise.all([
    source(migrationPath),
    source("app/admin/memberships/page.tsx"),
  ]);

  assert.match(migration, /'approved_pending_refund'/i);
  assert.match(migration, /create or replace function public\.admin_approve_membership_refund_json/i);
  assert.match(migration, /create or replace function public\.admin_complete_membership_refund_json/i);
  assert.match(migration, /refund_reference_required/i);
  assert.match(migration, /refund_amount_mismatch/i);
  assert.match(migration, /status = 'completed'[\s\S]*?refund_reference = v_reference/i);
  assert.match(migration, /status = 'refunded'/i);
  assert.match(migration, /benefits_ended_at = v_benefits_end/i);
  assert.match(migration, /if v_status = 'refunded'[\s\S]*?'refund_workflow_required'/i);
  assert.match(migration, /trg_prevent_payment_change_during_open_refund/i);

  assert.match(admin, /id="refund-review"/);
  assert.match(admin, /admin_approve_membership_refund_json/);
  assert.match(admin, /admin_complete_membership_refund_json/);
  assert.match(admin, /p_refund_reference: refundReference/);
  assert.match(admin, /p_confirmed_amount: Number\(expectedAmount\)/);
  assert.doesNotMatch(admin, /handleUpdatePaymentStatus/);
  assert.doesNotMatch(admin, /onClick=\{\(\) => void .*"refunded"/);
});

test("users can request and track refunds from profile and payment surfaces", async () => {
  const [refundPage, profile, payment, accountDelete, analytics] = await Promise.all([
    source("app/membership/refund/page.tsx"),
    source("app/profile/page.tsx"),
    source("app/membership/payment/page.tsx"),
    source("app/api/account/delete/route.ts"),
    source("components/AnalyticsTracker.tsx"),
  ]);

  assert.match(refundPage, /get_my_membership_refunds_json/);
  assert.match(refundPage, /request_membership_refund_json/);
  assert.match(refundPage, /href="\/legal\/refunds"/);
  assert.match(profile, /href: "\/membership\/refund"/);
  assert.match(profile, /admin_get_membership_refund_queue_count/);
  assert.doesNotMatch(payment, /href="\/membership\/refund"/);
  assert.match(accountDelete, /存在未完成的退款申请/);
  assert.match(accountDelete, /"submitted", "approved_pending_refund"/);
  assert.match(analytics, /"\/membership\/refund"/);
});

test("public privacy, terms, refund and operator-contact pages cover the actual service", async () => {
  const [content, shell, footer, analytics] = await Promise.all([
    source("lib/legal-content.ts"),
    source("components/legal/LegalShell.tsx"),
    source("components/SiteFooter.tsx"),
    source("components/AnalyticsTracker.tsx"),
  ]);

  for (const route of ["privacy", "terms", "refunds", "contact"]) {
    await source(`app/legal/${route}/page.tsx`);
    assert.match(footer, new RegExp(`href="/legal/${route}"`));
    assert.match(analytics, new RegExp(`"/legal/${route}"`));
  }

  assert.match(shell, /getLegalContent\(language\)/);
  assert.match(content, /有时·耕作 \/ LifeSpace for Cultivation/);
  assert.match(content, /yoyomibaobao@gmail\.com/);
  assert.match(content, /本地离线项目默认保存在当前设备/);
  assert.match(content, /统计表不保存搜索词、页面内容、精确位置或邮箱/);
  assert.match(content, /付款凭证存放在私有空间/);
  assert.match(content, /未满14周岁/);
  assert.match(content, /付款确认后的7个自然日内申请/);
  assert.match(content, /第8个自然日起至第180个自然日内申请/);
  assert.match(content, /原则上退回原付款渠道/);
  assert.match(content, /当前不自动续费/);
  assert.match(content, /我们不出售个人信息/);
});
