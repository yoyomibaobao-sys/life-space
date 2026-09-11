import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("PayPal client keeps credentials server-only and uses fixed one-time US$8 Orders v2 checkout", () => {
  const paypal = read("lib/paypal.ts");
  const env = read(".env.example");

  assert.match(paypal, /import "server-only"/);
  assert.match(paypal, /PAYPAL_MEMBERSHIP_AMOUNT = "8\.00"/);
  assert.match(paypal, /PAYPAL_MEMBERSHIP_CURRENCY = "USD"/);
  assert.match(paypal, /https:\/\/api-m\.sandbox\.paypal\.com/);
  assert.match(paypal, /https:\/\/api-m\.paypal\.com/);
  assert.match(paypal, /\/v2\/checkout\/orders/);
  assert.match(paypal, /intent: "CAPTURE"/);
  assert.match(paypal, /shipping_preference: "NO_SHIPPING"/);
  assert.match(paypal, /\/capture`/);
  assert.match(paypal, /verify-webhook-signature/);
  assert.doesNotMatch(paypal, /SUBSCRIPTION|subscription_id|billing_plan/i);

  assert.match(env, /PAYPAL_ENV=sandbox/);
  assert.match(env, /PAYPAL_CLIENT_ID=/);
  assert.match(env, /PAYPAL_CLIENT_SECRET=/);
  assert.match(env, /PAYPAL_WEBHOOK_ID=/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_PAYPAL_CLIENT_SECRET/);
});

test("PayPal checkout is authenticated, server-priced, and bound to the existing LifeSpace payment order", () => {
  const route = read("app/api/paypal/checkout/route.ts");

  assert.match(route, /getAuthenticatedRequestClient/);
  assert.match(route, /hasValidMutationOrigin/);
  assert.match(route, /PAYPAL_MEMBERSHIP_CURRENCY/);
  assert.match(route, /PAYPAL_MEMBERSHIP_AMOUNT/);
  assert.match(route, /payment\.payment_method !== "paypal"/);
  assert.match(route, /bind_paypal_membership_order_json/);
  assert.match(route, /createPayPalMembershipOrder/);
  assert.match(route, /confirmMembershipFromPayPalOrder/);
});

test("PayPal return and verified webhooks can complete membership even if the payer closes the page", () => {
  const returnRoute = read("app/api/paypal/return/route.ts");
  const webhook = read("app/api/paypal/webhook/route.ts");

  assert.match(returnRoute, /capturePayPalOrder/);
  assert.match(returnRoute, /confirmMembershipFromPayPalOrder/);
  assert.match(returnRoute, /provider_order_id/);

  assert.match(webhook, /verifyPayPalWebhookSignature/);
  assert.match(webhook, /CHECKOUT\.ORDER\.APPROVED/);
  assert.match(webhook, /PAYMENT\.CAPTURE\.COMPLETED/);
  assert.match(webhook, /capturePayPalOrder/);
  assert.match(webhook, /confirmMembershipFromPayPalOrder/);
  assert.match(webhook, /status: 503/);
});

test("database confirmation is service-role-only and idempotently extends Plus by twelve months", () => {
  const migration = read(
    "supabase/migrations/20260911173500_add_paypal_auto_membership.sql"
  );

  assert.match(migration, /provider_order_id text/);
  assert.match(migration, /provider_capture_id text/);
  assert.match(migration, /membership_payments_provider_order_uidx/);
  assert.match(migration, /membership_payments_provider_capture_uidx/);
  assert.match(migration, /paypal_checkout_orders_api/);
  assert.match(migration, /paypal-orders-v2-v1/);
  assert.match(migration, /confirm_paypal_membership_payment_json/);
  assert.match(migration, /v_payment\.amount = 8\.00/);
  assert.match(migration, /interval '12 months'/);
  assert.match(migration, /1000000000/);
  assert.match(migration, /provider_capture_id = v_capture_id/);
  assert.match(migration, /to service_role/);
  assert.match(migration, /from public, anon, authenticated/);
});

test("payment page keeps Alipay proof review but removes proof upload from the PayPal path", () => {
  const page = read("app/membership/payment/page.tsx");

  assert.match(page, /fetch\("\/api\/paypal\/checkout"/);
  assert.match(page, /order\.payment_method === "alipay" \? \(/);
  assert.match(page, /付款成功后自动开通，无需上传付款凭证/);
  assert.match(page, /No proof upload is needed/);
  assert.doesNotMatch(page, /paypal\.com\/ncp\/payment/);
});
