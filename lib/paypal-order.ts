export const PAYPAL_MEMBERSHIP_AMOUNT = "8.00";
export const PAYPAL_MEMBERSHIP_CURRENCY = "USD";

export type PayPalLink = {
  href?: string;
  rel?: string;
  method?: string;
};

export type PayPalCapture = {
  id?: string;
  status?: string;
  amount?: {
    currency_code?: string;
    value?: string;
  };
  create_time?: string;
  update_time?: string;
};

export type PayPalOrder = {
  id?: string;
  status?: string;
  links?: PayPalLink[];
  purchase_units?: Array<{
    custom_id?: string;
    invoice_id?: string;
    amount?: {
      currency_code?: string;
      value?: string;
    };
    payments?: {
      captures?: PayPalCapture[];
    };
  }>;
};

export type CompletedPayPalMembershipCapture = {
  paymentId: string;
  invoiceId: string;
  paypalOrderId: string;
  paypalCaptureId: string;
  paidAt: string | null;
};

/**
 * Accept only the exact shape created for one LifeSpace membership payment.
 * Multiple purchase units or multiple completed captures are deliberately
 * rejected because there would be no unambiguous one-payment/one-extension
 * mapping.
 */
export function getCompletedMembershipCapture(
  order: PayPalOrder
): CompletedPayPalMembershipCapture | null {
  if (
    !order.id ||
    order.status !== "COMPLETED" ||
    order.purchase_units?.length !== 1
  ) {
    return null;
  }

  const purchaseUnit = order.purchase_units[0];
  const completedCaptures = (purchaseUnit.payments?.captures || []).filter(
    (item) => item.status === "COMPLETED"
  );

  if (completedCaptures.length !== 1) return null;

  const capture = completedCaptures[0];
  const paymentId = purchaseUnit.custom_id?.trim();
  const invoiceId = purchaseUnit.invoice_id?.trim();

  if (
    !capture.id ||
    !paymentId ||
    !invoiceId ||
    purchaseUnit.amount?.currency_code !== PAYPAL_MEMBERSHIP_CURRENCY ||
    purchaseUnit.amount?.value !== PAYPAL_MEMBERSHIP_AMOUNT ||
    capture.amount?.currency_code !== PAYPAL_MEMBERSHIP_CURRENCY ||
    capture.amount?.value !== PAYPAL_MEMBERSHIP_AMOUNT
  ) {
    return null;
  }

  return {
    paymentId,
    invoiceId,
    paypalOrderId: order.id,
    paypalCaptureId: capture.id,
    paidAt: capture.create_time || capture.update_time || null,
  };
}
