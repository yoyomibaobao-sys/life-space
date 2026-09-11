import { NextResponse } from "next/server";

import {
  capturePayPalOrder,
  getCompletedMembershipCapture,
  getPayPalOrder,
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

function ok(status = 200) {
  return NextResponse.json({ ok: true }, { status });
}

async function findOrderIdFromCaptureEvent(event: PayPalWebhookEvent) {
  const relatedOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
  if (relatedOrderId) return relatedOrderId;

  const paymentId = event.resource?.custom_id?.trim();
  if (!paymentId) return null;

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("membership_payments")
    .select("provider_order_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    console.error("PayPal webhook provider-order lookup error:", error);
    throw new Error("PayPal webhook order lookup failed.");
  }

  return (data as { provider_order_id?: string | null } | null)?.provider_order_id || null;
}

async function handleApprovedOrder(event: PayPalWebhookEvent) {
  const paypalOrderId = event.resource?.id?.trim();
  if (!paypalOrderId) {
    throw new Error("PayPal approved-order webhook is missing the order id.");
  }

  let order = await getPayPalOrder(paypalOrderId);
  if (order.status !== "COMPLETED") {
    order = await capturePayPalOrder(paypalOrderId);
  }

  await confirmMembershipFromPayPalOrder(order);
}

async function handleCompletedCapture(event: PayPalWebhookEvent) {
  const paypalOrderId = await findOrderIdFromCaptureEvent(event);
  if (!paypalOrderId) {
    throw new Error("PayPal completed-capture webhook is missing the order id.");
  }

  const order = await getPayPalOrder(paypalOrderId);
  const capture = getCompletedMembershipCapture(order);
  if (!capture) {
    throw new Error("PayPal webhook order is not a completed membership capture.");
  }

  const eventCaptureId = event.resource?.id?.trim();
  if (eventCaptureId && eventCaptureId !== capture.paypalCaptureId) {
    throw new Error("PayPal webhook capture id does not match the canonical order.");
  }

  await confirmMembershipFromPayPalOrder(order);
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
