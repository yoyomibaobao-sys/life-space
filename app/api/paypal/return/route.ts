import { NextResponse } from "next/server";

import {
  capturePayPalOrder,
  getPayPalOrder,
  getPayPalSiteOrigin,
  PAYPAL_MEMBERSHIP_AMOUNT,
  PAYPAL_MEMBERSHIP_CURRENCY,
} from "@/lib/paypal";
import { confirmMembershipFromPayPalOrder } from "@/lib/paypal-membership";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type PaymentRow = {
  id: string;
  order_number: string | null;
  status: string;
  payment_method: string;
  currency: string;
  amount: number | string;
  provider_order_id: string | null;
};

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(
    new URL(path, getPayPalSiteOrigin(request.url)),
    303
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paypalOrderId = url.searchParams.get("token")?.trim() || "";

  if (!paypalOrderId || paypalOrderId.length > 128) {
    return redirectTo(request, "/membership/payment?paypal=invalid-return");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("membership_payments")
    .select("id,order_number,status,payment_method,currency,amount,provider_order_id")
    .eq("provider_order_id", paypalOrderId)
    .maybeSingle();

  if (error) {
    console.error("PayPal return payment lookup error:", error);
    return redirectTo(request, "/membership/payment?paypal=failed");
  }

  const payment = data as PaymentRow | null;
  if (!payment?.order_number) {
    return redirectTo(request, "/membership/payment?paypal=not-found");
  }

  if (
    payment.payment_method !== "paypal" ||
    payment.currency !== PAYPAL_MEMBERSHIP_CURRENCY ||
    Number(payment.amount) !== Number(PAYPAL_MEMBERSHIP_AMOUNT)
  ) {
    return redirectTo(request, "/membership/payment?paypal=invalid-order");
  }

  if (payment.status === "confirmed") {
    return redirectTo(request, "/membership/payment/success");
  }

  try {
    let paypalOrder = await getPayPalOrder(paypalOrderId);
    if (paypalOrder.status === "APPROVED") {
      paypalOrder = await capturePayPalOrder(paypalOrderId);
    } else if (paypalOrder.status !== "COMPLETED") {
      throw new Error("PayPal return order is not ready to capture.");
    }

    await confirmMembershipFromPayPalOrder(paypalOrder, {
      paymentId: payment.id,
      orderNumber: payment.order_number,
      paypalOrderId,
    });
    return redirectTo(request, "/membership/payment/success");
  } catch (error) {
    console.error("PayPal return capture error:", error);
    return redirectTo(request, "/membership/payment?paypal=failed");
  }
}
