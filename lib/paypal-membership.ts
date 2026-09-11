import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getCompletedMembershipCapture,
  type PayPalOrder,
} from "@/lib/paypal";

type ConfirmResult = {
  ok?: boolean;
  already_confirmed?: boolean;
  error_message?: string | null;
  payment_id?: string;
  user_id?: string;
  service_ends_at?: string;
};

export async function confirmMembershipFromPayPalOrder(
  order: PayPalOrder,
  expectedPaymentId?: string
) {
  const capture = getCompletedMembershipCapture(order);
  if (!capture) {
    throw new Error("PayPal order is not a valid completed LifeSpace membership payment.");
  }

  if (expectedPaymentId && capture.paymentId !== expectedPaymentId) {
    throw new Error("PayPal order does not match the LifeSpace payment order.");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc(
    "confirm_paypal_membership_payment_json",
    {
      p_payment_id: capture.paymentId,
      p_paypal_order_id: capture.paypalOrderId,
      p_paypal_capture_id: capture.paypalCaptureId,
      p_paid_at: capture.paidAt,
    }
  );

  if (error) {
    console.error("confirm PayPal membership RPC error:", error);
    throw new Error("Could not activate the LifeSpace membership.");
  }

  const result = (Array.isArray(data) ? data[0] : data) as ConfirmResult | null;
  if (!result?.ok) {
    console.error("confirm PayPal membership rejected:", result);
    throw new Error(result?.error_message || "Could not activate the LifeSpace membership.");
  }

  return { result, capture };
}
