import { NextResponse } from "next/server";

import {
  capturePayPalOrder,
  createPayPalMembershipOrder,
  getPayPalApprovalUrl,
  getPayPalOrder,
  PAYPAL_MEMBERSHIP_AMOUNT,
  PAYPAL_MEMBERSHIP_CURRENCY,
} from "@/lib/paypal";
import { confirmMembershipFromPayPalOrder } from "@/lib/paypal-membership";
import {
  getAuthenticatedRequestClient,
  hasValidMutationOrigin,
} from "@/lib/server/authenticated-request";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CheckoutBody = {
  paymentId?: unknown;
};

type MembershipPaymentRow = {
  id: string;
  user_id: string;
  order_number: string | null;
  status: string;
  amount: number | string;
  currency: string;
  payment_method: string;
  expires_at: string | null;
  provider_order_id: string | null;
  provider_capture_id: string | null;
};

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function successUrl(request: Request) {
  return `${new URL(request.url).origin}/membership/payment/success`;
}

async function finishExistingPayPalOrder(
  request: Request,
  payment: MembershipPaymentRow
) {
  if (!payment.provider_order_id) return null;

  let paypalOrder = await getPayPalOrder(payment.provider_order_id);

  if (paypalOrder.status === "APPROVED") {
    paypalOrder = await capturePayPalOrder(payment.provider_order_id);
  }

  if (paypalOrder.status === "COMPLETED") {
    await confirmMembershipFromPayPalOrder(paypalOrder, payment.id);
    return NextResponse.json({
      ok: true,
      completed: true,
      redirectUrl: successUrl(request),
    });
  }

  const approveUrl = getPayPalApprovalUrl(paypalOrder);
  if (approveUrl) {
    return NextResponse.json({
      ok: true,
      completed: false,
      approveUrl,
      paypalOrderId: payment.provider_order_id,
    });
  }

  return jsonError("paypal_order_not_payable", 409);
}

export async function POST(request: Request) {
  if (!hasValidMutationOrigin(request)) {
    return jsonError("invalid_origin", 403);
  }

  const authenticated = await getAuthenticatedRequestClient(request);
  if (!authenticated) {
    return jsonError("authentication_required", 401);
  }

  const body = (await request.json().catch(() => null)) as CheckoutBody | null;
  const paymentId = String(body?.paymentId || "").trim();
  if (!UUID_PATTERN.test(paymentId)) {
    return jsonError("invalid_payment_id", 400);
  }

  const { data, error } = await authenticated.supabase
    .from("membership_payments")
    .select(
      "id,user_id,order_number,status,amount,currency,payment_method,expires_at,provider_order_id,provider_capture_id"
    )
    .eq("id", paymentId)
    .eq("user_id", authenticated.userId)
    .maybeSingle();

  if (error) {
    console.error("PayPal checkout payment read error:", error);
    return jsonError("payment_read_failed", 500);
  }

  const payment = data as MembershipPaymentRow | null;
  if (!payment?.order_number) {
    return jsonError("payment_not_found", 404);
  }

  if (
    payment.payment_method !== "paypal" ||
    payment.currency !== PAYPAL_MEMBERSHIP_CURRENCY ||
    Number(payment.amount) !== Number(PAYPAL_MEMBERSHIP_AMOUNT)
  ) {
    return jsonError("invalid_paypal_order", 400);
  }

  if (payment.status === "confirmed") {
    return NextResponse.json({
      ok: true,
      completed: true,
      redirectUrl: successUrl(request),
    });
  }

  if (payment.status !== "pending_payment") {
    return jsonError("payment_not_pending", 409);
  }

  if (payment.expires_at && new Date(payment.expires_at).getTime() <= Date.now()) {
    return jsonError("order_expired", 409);
  }

  try {
    const existingResponse = await finishExistingPayPalOrder(request, payment);
    if (existingResponse) return existingResponse;

    const origin = new URL(request.url).origin;
    const paypalOrder = await createPayPalMembershipOrder({
      paymentId: payment.id,
      orderNumber: payment.order_number,
      returnUrl: `${origin}/api/paypal/return`,
      cancelUrl: `${origin}/membership/payment?paypal=canceled`,
    });

    if (!paypalOrder.id) {
      console.error("PayPal create order returned no id:", paypalOrder);
      return jsonError("paypal_order_create_failed", 502);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: bindData, error: bindError } = await supabaseAdmin.rpc(
      "bind_paypal_membership_order_json",
      {
        p_payment_id: payment.id,
        p_user_id: authenticated.userId,
        p_paypal_order_id: paypalOrder.id,
      }
    );

    const bindResult = (Array.isArray(bindData) ? bindData[0] : bindData) as
      | { ok?: boolean; error_message?: string | null }
      | null;

    if (bindError || !bindResult?.ok) {
      console.error("Bind PayPal order failed:", bindError || bindResult);
      return jsonError(bindResult?.error_message || "paypal_order_bind_failed", 409);
    }

    const approveUrl = getPayPalApprovalUrl(paypalOrder);
    if (!approveUrl) {
      console.error("PayPal create order returned no approval link:", paypalOrder);
      return jsonError("paypal_approval_url_missing", 502);
    }

    return NextResponse.json({
      ok: true,
      completed: false,
      approveUrl,
      paypalOrderId: paypalOrder.id,
    });
  } catch (error) {
    console.error("PayPal checkout error:", error);
    return jsonError("paypal_checkout_failed", 502);
  }
}
