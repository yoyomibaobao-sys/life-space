import "server-only";

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

type PayPalEnvironment = "sandbox" | "live";

type PayPalErrorBody = {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: unknown;
};

export class PayPalApiError extends Error {
  status: number;
  debugId: string | null;
  details: unknown;

  constructor(message: string, status: number, body?: PayPalErrorBody | null) {
    super(message);
    this.name = "PayPalApiError";
    this.status = status;
    this.debugId = body?.debug_id || null;
    this.details = body?.details ?? null;
  }
}

function getPayPalConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const rawEnvironment = process.env.PAYPAL_ENV?.trim().toLowerCase() || "sandbox";
  const environment: PayPalEnvironment = rawEnvironment === "live" ? "live" : "sandbox";

  if (!clientId || !clientSecret) {
    throw new Error("Missing PayPal server credentials.");
  }

  return {
    clientId,
    clientSecret,
    environment,
    apiBase:
      environment === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com",
  };
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function getAccessToken() {
  const config = getPayPalConfig();
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
    "utf8"
  ).toString("base64");

  const response = await fetch(`${config.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const body = await readJson<{ access_token?: string } & PayPalErrorBody>(response);
  if (!response.ok || !body?.access_token) {
    throw new PayPalApiError(
      body?.message || "PayPal authentication failed.",
      response.status,
      body
    );
  }

  return { accessToken: body.access_token, config };
}

async function paypalRequest<T>(
  path: string,
  init: RequestInit = {},
  requestId?: string
): Promise<T> {
  const { accessToken, config } = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");
  headers.set("Prefer", "return=representation");
  if (requestId) headers.set("PayPal-Request-Id", requestId);

  const response = await fetch(`${config.apiBase}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const body = await readJson<T & PayPalErrorBody>(response);

  if (!response.ok || !body) {
    const errorBody = body as PayPalErrorBody | null;
    throw new PayPalApiError(
      errorBody?.message || `PayPal request failed (${response.status}).`,
      response.status,
      errorBody
    );
  }

  return body;
}

export function getPayPalApprovalUrl(order: PayPalOrder) {
  const links = order.links || [];
  return (
    links.find((link) => link.rel === "payer-action")?.href ||
    links.find((link) => link.rel === "approve")?.href ||
    null
  );
}

export async function createPayPalMembershipOrder(input: {
  paymentId: string;
  orderNumber: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  return paypalRequest<PayPalOrder>(
    "/v2/checkout/orders",
    {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        payment_source: {
          paypal: {
            experience_context: {
              payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
              landing_page: "LOGIN",
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
        purchase_units: [
          {
            custom_id: input.paymentId,
            invoice_id: input.orderNumber,
            description: "LifeSpace Plus cloud membership - 1 year",
            amount: {
              currency_code: PAYPAL_MEMBERSHIP_CURRENCY,
              value: PAYPAL_MEMBERSHIP_AMOUNT,
            },
          },
        ],
      }),
    },
    `ys-create-${input.paymentId}`
  );
}

export async function getPayPalOrder(orderId: string) {
  return paypalRequest<PayPalOrder>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    { method: "GET" }
  );
}

export async function capturePayPalOrder(orderId: string) {
  try {
    return await paypalRequest<PayPalOrder>(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      { method: "POST", body: "{}" },
      `ys-capture-${orderId}`
    );
  } catch (error) {
    // A browser retry can reach this route after PayPal already captured the
    // order. Read the canonical order instead of ever attempting a second
    // membership extension.
    if (error instanceof PayPalApiError && error.status === 422) {
      const existing = await getPayPalOrder(orderId);
      if (existing.status === "COMPLETED") return existing;
    }
    throw error;
  }
}

export function getCompletedMembershipCapture(order: PayPalOrder) {
  const purchaseUnit = order.purchase_units?.[0];
  const capture = purchaseUnit?.payments?.captures?.find(
    (item) => item.status === "COMPLETED"
  );

  if (!order.id || order.status !== "COMPLETED" || !purchaseUnit || !capture?.id) {
    return null;
  }

  if (
    purchaseUnit.amount?.currency_code !== PAYPAL_MEMBERSHIP_CURRENCY ||
    purchaseUnit.amount?.value !== PAYPAL_MEMBERSHIP_AMOUNT ||
    capture.amount?.currency_code !== PAYPAL_MEMBERSHIP_CURRENCY ||
    capture.amount?.value !== PAYPAL_MEMBERSHIP_AMOUNT ||
    !purchaseUnit.custom_id
  ) {
    return null;
  }

  return {
    paymentId: purchaseUnit.custom_id,
    invoiceId: purchaseUnit.invoice_id || null,
    paypalOrderId: order.id,
    paypalCaptureId: capture.id,
    paidAt: capture.create_time || capture.update_time || new Date().toISOString(),
  };
}

export async function verifyPayPalWebhookSignature(
  headers: Headers,
  event: unknown
) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) {
    throw new Error("Missing PAYPAL_WEBHOOK_ID.");
  }

  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const certUrl = headers.get("paypal-cert-url");
  const authAlgo = headers.get("paypal-auth-algo");
  const transmissionSig = headers.get("paypal-transmission-sig");

  if (
    !transmissionId ||
    !transmissionTime ||
    !certUrl ||
    !authAlgo ||
    !transmissionSig
  ) {
    return false;
  }

  const result = await paypalRequest<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: event,
      }),
    }
  );

  return result.verification_status === "SUCCESS";
}
