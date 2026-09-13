import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { getCompletedMembershipCapture } from "../lib/paypal-order.ts";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("PayPal client keeps credentials server-only and uses fixed one-time US$8 Orders v2 checkout", () => {
  const paypal = read("lib/paypal.ts");
  const paypalOrder = read("lib/paypal-order.ts");
  const env = read(".env.example");

  assert.match(paypal, /import "server-only"/);
  assert.match(paypalOrder, /PAYPAL_MEMBERSHIP_AMOUNT = "8\.00"/);
  assert.match(paypalOrder, /PAYPAL_MEMBERSHIP_CURRENCY = "USD"/);
  assert.match(paypal, /https:\/\/api-m\.sandbox\.paypal\.com/);
  assert.match(paypal, /https:\/\/api-m\.paypal\.com/);
  assert.match(paypal, /\/v2\/checkout\/orders/);
  assert.match(paypal, /intent: "CAPTURE"/);
  assert.match(paypal, /custom_id: input\.paymentId/);
  assert.match(paypal, /invoice_id: input\.orderNumber/);
  assert.match(paypal, /shipping_preference: "NO_SHIPPING"/);
  assert.match(paypal, /\/capture`/);
  assert.match(paypal, /verify-webhook-signature/);
  assert.doesNotMatch(paypal, /SUBSCRIPTION|subscription_id|billing_plan/i);

  assert.match(env, /PAYPAL_ENV=sandbox/);
  assert.match(env, /PAYPAL_CLIENT_ID=/);
  assert.match(env, /PAYPAL_CLIENT_SECRET=/);
  assert.match(env, /PAYPAL_WEBHOOK_ID=/);
  assert.match(env, /PAYPAL_SITE_ORIGIN=/);
  assert.match(env, /SUPABASE_SERVICE_ROLE_KEY=/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_PAYPAL_CLIENT_SECRET/);
});

function validCompletedOrder() {
  return {
    id: "PAYPAL-ORDER-1",
    status: "COMPLETED",
    purchase_units: [
      {
        custom_id: "6e905938-776f-4666-92b1-da4c7f700839",
        invoice_id: "YS-20260913-ABC123",
        amount: { currency_code: "USD", value: "8.00" },
        payments: {
          captures: [
            {
              id: "PAYPAL-CAPTURE-1",
              status: "COMPLETED",
              amount: { currency_code: "USD", value: "8.00" },
              create_time: "2026-09-13T10:00:00Z",
            },
          ],
        },
      },
    ],
  };
}

test("canonical PayPal parsing accepts only one exact US$8 membership capture", () => {
  const valid = validCompletedOrder();
  assert.deepEqual(getCompletedMembershipCapture(valid), {
    paymentId: "6e905938-776f-4666-92b1-da4c7f700839",
    invoiceId: "YS-20260913-ABC123",
    paypalOrderId: "PAYPAL-ORDER-1",
    paypalCaptureId: "PAYPAL-CAPTURE-1",
    paidAt: "2026-09-13T10:00:00Z",
  });

  const missingInvoice = validCompletedOrder();
  delete missingInvoice.purchase_units[0].invoice_id;
  assert.equal(getCompletedMembershipCapture(missingInvoice), null);

  const wrongAmount = validCompletedOrder();
  wrongAmount.purchase_units[0].payments.captures[0].amount.value = "7.99";
  assert.equal(getCompletedMembershipCapture(wrongAmount), null);

  const multipleUnits = validCompletedOrder();
  multipleUnits.purchase_units.push(structuredClone(multipleUnits.purchase_units[0]));
  assert.equal(getCompletedMembershipCapture(multipleUnits), null);

  const multipleCompletedCaptures = validCompletedOrder();
  multipleCompletedCaptures.purchase_units[0].payments.captures.push({
    ...structuredClone(
      multipleCompletedCaptures.purchase_units[0].payments.captures[0]
    ),
    id: "PAYPAL-CAPTURE-2",
  });
  assert.equal(getCompletedMembershipCapture(multipleCompletedCaptures), null);
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
  assert.match(route, /getPayPalSiteOrigin/);
  assert.match(route, /orderNumber: payment\.order_number/);
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
  assert.match(webhook, /findPaymentByProviderOrderId/);
  assert.match(webhook, /if \(!payment\) return/);
  assert.ok(
    webhook.indexOf("findPaymentByProviderOrderId(paypalOrderId)") <
      webhook.indexOf("capturePayPalOrder(paypalOrderId)")
  );
  assert.match(webhook, /status: 503/);

  const membership = read("lib/paypal-membership.ts");
  assert.match(membership, /capture\.invoiceId !== expected\.orderNumber/);
  assert.match(membership, /capture\.paypalOrderId !== expected\.paypalOrderId/);
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
  const copy = read("lib/i18n/paypal-payment.ts");

  assert.match(page, /fetch\("\/api\/paypal\/checkout"/);
  assert.match(page, /order\.payment_method === "alipay" \? \(/);
  assert.match(page, /getPayPalPaymentCopy/);
  assert.match(copy, /付款成功后自动开通，无需上传付款凭证/);
  assert.match(copy, /No proof upload is needed/);
  assert.doesNotMatch(page, /paypal\.com\/ncp\/payment/);
});
