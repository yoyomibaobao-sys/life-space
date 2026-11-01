import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paymentBase = {
  id: "payment-01",
  order_number: "LS-01",
  payment_method: "paypal",
  currency: "USD",
  amount: "8.00",
  provider_order_id: "order-01",
};

async function loadReturnRoute(payment, { orderStatus = "APPROVED" } = {}) {
  const calls = { dbRead: 0, getOrder: 0, capture: 0, confirm: 0 };
  const bindings = {
    calls,
    payment,
    async getPayPalOrder() {
      calls.getOrder++;
      return { id: "order-01", status: orderStatus };
    },
    async capturePayPalOrder() {
      calls.capture++;
      return { id: "order-01", status: "COMPLETED" };
    },
    getPayPalSiteOrigin: (value) => new URL(value).origin,
    PAYPAL_MEMBERSHIP_AMOUNT: "8.00",
    PAYPAL_MEMBERSHIP_CURRENCY: "USD",
    isPayPalRuntimeEnabled: () => true,
    getSupabaseAdmin: () => ({
      from(table) {
        assert.equal(table, "membership_payments");
        return {
          select() { return this; },
          eq(column, value) {
            assert.equal(column, "provider_order_id");
            assert.equal(value, "order-01");
            return this;
          },
          async maybeSingle() {
            calls.dbRead++;
            return { data: payment, error: null };
          },
        };
      },
    }),
    async confirmMembershipFromPayPalOrder() {
      calls.confirm++;
      return { confirmed: true };
    },
  };
  const modules = {
    "next/server": "export const NextResponse = { redirect: (url, status = 303) => Response.redirect(url, status) };",
    "@/lib/paypal": [
      "export const capturePayPalOrder = (...args) => globalThis.mock.capturePayPalOrder(...args);",
      "export const getPayPalOrder = (...args) => globalThis.mock.getPayPalOrder(...args);",
      "export const getPayPalSiteOrigin = (...args) => globalThis.mock.getPayPalSiteOrigin(...args);",
      "export const PAYPAL_MEMBERSHIP_AMOUNT = globalThis.mock.PAYPAL_MEMBERSHIP_AMOUNT;",
      "export const PAYPAL_MEMBERSHIP_CURRENCY = globalThis.mock.PAYPAL_MEMBERSHIP_CURRENCY;",
    ].join("\n"),
    "@/lib/paypal-membership": "export const confirmMembershipFromPayPalOrder = (...args) => globalThis.mock.confirmMembershipFromPayPalOrder(...args);",
    "@/lib/paypal-runtime-gate": "export const isPayPalRuntimeEnabled = () => globalThis.mock.isPayPalRuntimeEnabled();",
    "@/lib/supabaseAdmin": "export const getSupabaseAdmin = () => globalThis.mock.getSupabaseAdmin();",
  };
  const bundle = await build({
    entryPoints: [path.join(root, "app/api/paypal/return/route.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    plugins: [{
      name: "paypal-return-isolated-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^(next\/server|@\/lib\/.*)$/ }, (args) => ({
          path: args.path,
          namespace: "mock",
        }));
        plugin.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents: modules[args.path],
          loader: "js",
        }));
      },
    }],
  });
  const loadedModule = { exports: {} };
  const sandbox = { mock: bindings };
  new Function("module", "exports", "globalThis", "Response", "Request", "URL", "console",
    bundle.outputFiles[0].text
  )(loadedModule, loadedModule.exports, sandbox, Response, Request, URL, console);
  return { get: loadedModule.exports.GET, calls };
}

const request = () => new Request("https://qa.lifespace.test/api/paypal/return?token=order-01");
const redirect = (response) => new URL(response.headers.get("location"));

test("refunded Return is terminal before external Order lookup or Capture", async () => {
  const { get, calls } = await loadReturnRoute({ ...paymentBase, status: "refunded" });
  const response = await get(request());
  assert.equal(response.status, 303);
  assert.equal(redirect(response).searchParams.get("paypal"), "refunded");
  assert.deepEqual(calls, { dbRead: 1, getOrder: 0, capture: 0, confirm: 0 });
});

test("unknown and non-payable local states fail closed before external calls", async () => {
  for (const status of ["submitted", "needs_update", "chargeback", "mystery", ""]) {
    const { get, calls } = await loadReturnRoute({ ...paymentBase, status });
    const response = await get(request());
    assert.equal(redirect(response).searchParams.get("paypal"), "invalid-order", status);
    assert.equal(calls.getOrder, 0, status);
    assert.equal(calls.capture, 0, status);
    assert.equal(calls.confirm, 0, status);
  }
});

test("confirmed Return remains successful without another Capture", async () => {
  const { get, calls } = await loadReturnRoute({ ...paymentBase, status: "confirmed" });
  const response = await get(request());
  assert.equal(redirect(response).pathname, "/membership/payment/success");
  assert.equal(calls.getOrder, 0);
  assert.equal(calls.capture, 0);
  assert.equal(calls.confirm, 0);
});

test("pending, canceled and expired orders retain the approved-order Capture path", async () => {
  for (const status of ["pending_payment", "canceled", "expired"]) {
    const { get, calls } = await loadReturnRoute({ ...paymentBase, status });
    const response = await get(request());
    assert.equal(redirect(response).pathname, "/membership/payment/success", status);
    assert.equal(calls.getOrder, 1, status);
    assert.equal(calls.capture, 1, status);
    assert.equal(calls.confirm, 1, status);
  }
});

test("official COMPLETED order is confirmed without a second Capture", async () => {
  const { get, calls } = await loadReturnRoute(
    { ...paymentBase, status: "expired" },
    { orderStatus: "COMPLETED" },
  );
  const response = await get(request());
  assert.equal(redirect(response).pathname, "/membership/payment/success");
  assert.equal(calls.getOrder, 1);
  assert.equal(calls.capture, 0);
  assert.equal(calls.confirm, 1);
});

test("wrong amount or payment method is rejected before external calls", async () => {
  for (const payment of [
    { ...paymentBase, status: "pending_payment", amount: "7.00" },
    { ...paymentBase, status: "pending_payment", payment_method: "alipay" },
  ]) {
    const { get, calls } = await loadReturnRoute(payment);
    const response = await get(request());
    assert.equal(redirect(response).searchParams.get("paypal"), "invalid-order");
    assert.equal(calls.getOrder, 0);
    assert.equal(calls.capture, 0);
  }
});
