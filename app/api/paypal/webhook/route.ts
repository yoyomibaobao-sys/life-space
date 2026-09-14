import { NextResponse } from "next/server";

import {
  capturePayPalOrder,
  getCompletedMembershipCapture,
  getPayPalOrder,
  PAYPAL_MEMBERSHIP_AMOUNT,
  PAYPAL_MEMBERSHIP_CURRENCY,
  verifyPayPalWebhookSignature,
} from "@/lib/paypal";
import { confirmMembershipFromPayPalOrder } from "@/lib/paypal-membership";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    custom_id?: string;
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
      };
    };
  };
};

type MembershipPaymentRow = {
  id: string;
  order_number: string | null;
  status: string;
  amount: number | string;
  currency: string;
  payment_method: string;
  provider_order_id: string | null;
  provider_capture_id: string | null;
};

type BoundMembershipPayment = MembershipPaymentRow & {
  order_number: string;
  provider_order_id: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPTURABLE_STATUSES = new Set(["pending_payment", "canceled", "expired"]);
const PAYMENT_COLUMNS =
  "id,order_number,status,amount,currency,payment_method,provider_order_id,provider_capture_id";

function ok(status = 200) {
  return NextResponse.json({ ok: true }, { status });
}

async function findPaymentByProviderOrderId(paypalOrderId: string) {
  const value = paypalOrderId.trim();
  if (!value || value.length > 128) return null;

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("membership_payments")
    .select(PAYMENT_COLUMNS)
    .eq("provider_order_id", value)
    .maybeSingle();

  if (error) {
    console.error("PayPal webhook payment lookup error:", error);
    throw new Error("PayPal webhook payment lookup failed.");
  }

  return data as MembershipPaymentRow | null;
}

async function findPaymentById(paymentId: string) {
  const value = paymentId.trim();
  if (!UUID_PATTERN.test(value)) return null;

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("membership_payments")
    .select(PAYMENT_COLUMNS)
    .eq("id", value)
    .maybeSingle();

  if (error) {
    console.error("PayPal webhook payment-id lookup error:", error);
    throw new Error("PayPal webhook payment lookup failed.");
  }

  return data as MembershipPaymentRow | null;
}

function isBoundMembershipPayment(
  payment: MembershipPaymentRow
): payment is BoundMembershipPayment {
  return Boolean(
    payment.order_number &&
      payment.provider_order_id &&
      payment.payment_method === "paypal" &&
      payment.currency === PAYPAL_MEMBERSHIP_CURRENCY &&
      Number(payment.amount) === Number(PAYPAL_MEMBERSHIP_AMOUNT)
  );
}

function expectedPayment(payment: BoundMembershipPayment) {
  return {
    paymentId: payment.id,
    orderNumber: payment.order_number,
    paypalOrderId: payment.provider_order_id,
  };
}

async function findPaymentFromCaptureEvent(event: PayPalWebhookEvent) {
  const relatedOrderId =
    event.resource?.supplementary_data?.related_ids?.order_id?.trim();
  if (relatedOrderId) {
    return findPaymentByProviderOrderId(relatedOrderId);
  }

  const paymentId = event.resource?.custom_id?.trim();
  return paymentId ? findPaymentById(paymentId) : null;
}

async function handleApprovedOrder(event: PayPalWebhookEvent) {
  const paypalOrderId = event.resource?.id?.trim();
  if (!paypalOrderId) {
    throw new Error("PayPal approved-order webhook is missing the order id.");
  }

  // A verified webhook belongs to the PayPal app, but that app may also be
  // used by another product. Never capture until this exact provider order is
  // already bound to a fixed-price LifeSpace membership order.
  const payment = await findPaymentByProviderOrderId(paypalOrderId);
  if (!payment) return;
  if (!isBoundMembershipPayment(payment)) {
    throw new Error("PayPal webhook is bound to an invalid membership payment.");
  }
  if (payment.status === "confirmed" || payment.status === "refunded") return;
  if (!CAPTURABLE_STATUSES.has(payment.status)) {
    throw new Error("LifeSpace payment is not eligible for PayPal capture.");
  }

  let order = await getPayPalOrder(paypalOrderId);
  if (order.status === "APPROVED") {
    order = await capturePayPalOrder(paypalOrderId);
  } else if (order.status !== "COMPLETED") {
    throw new Error("PayPal approved order is not ready to capture.");
  }

  const capture = getCompletedMembershipCapture(order);
  // A capture can remain pending after PayPal accepts it. In that case the
  // PAYMENT.CAPTURE.COMPLETED event performs activation later. That handler
  // reads the canonical order again and enforces the full metadata check.
  if (!capture) return;

  await confirmMembershipFromPayPalOrder(order, expectedPayment(payment));
}

async function handleCompletedCapture(event: PayPalWebhookEvent) {
  const payment = await findPaymentFromCaptureEvent(event);
  if (!payment) return;
  if (!isBoundMembershipPayment(payment)) {
    throw new Error("PayPal capture is bound to an invalid membership payment.");
  }
  if (payment.status === "refunded") return;
  if (
    payment.status !== "confirmed" &&
    !CAPTURABLE_STATUSES.has(payment.status)
  ) {
    throw new Error("LifeSpace payment is not eligible for PayPal confirmation.");
  }

  const eventCaptureId = event.resource?.id?.trim();
  if (!eventCaptureId) {
    throw new Error("PayPal completed-capture webhook is missing the capture id.");
  }
  if (payment.status === "confirmed") {
    if (payment.provider_capture_id === eventCaptureId) return;
    throw new Error(
      "PayPal webhook capture id conflicts with the confirmed payment."
    );
  }

  const order = await getPayPalOrder(payment.provider_order_id);
  const capture = getCompletedMembershipCapture(order);
  if (!capture) {
    throw new Error("PayPal webhook order is not a completed membership capture.");
  }

  if (eventCaptureId !== capture.paypalCaptureId) {
    throw new Error("PayPal webhook capture id does not match the canonical order.");
  }

  await confirmMembershipFromPayPalOrder(order, expectedPayment(payment));
}

export async function POST(request: Request) {
  let event: PayPalWebhookEvent;
  try {
    event = (await request.json()) as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const verified = await verifyPayPalWebhookSignature(request.headers, event);
    if (!verified) {
      return NextResponse.json(
        { ok: false, error: "invalid_paypal_signature" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("PayPal webhook verification error:", error);
    // A missing deployment secret or temporary PayPal failure should be retried
    // by PayPal rather than acknowledged as if the event were processed.
    return NextResponse.json(
      { ok: false, error: "paypal_webhook_verification_unavailable" },
      { status: 503 }
    );
  }

  try {
    if (event.event_type === "CHECKOUT.ORDER.APPROVED") {
      await handleApprovedOrder(event);
    } else if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      await handleCompletedCapture(event);
    }

    return ok();
  } catch (error) {
    console.error("PayPal webhook processing error:", error);
    return NextResponse.json(
      { ok: false, error: "paypal_webhook_processing_failed" },
      { status: 500 }
    );
  }
}
