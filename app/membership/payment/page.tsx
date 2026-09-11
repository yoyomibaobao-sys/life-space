"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ChangeEvent } from "react";
import UiIcon from "@/components/ui/UiIcon";
import { showToast } from "@/components/Toast";
import { buildLoginHref } from "@/lib/auth-return";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { supabase } from "@/lib/supabase";

type PaymentOption = "alipay" | "paypal";
type PaymentOrderStatus =
  | "pending_payment"
  | "submitted"
  | "needs_update"
  | "confirmed"
  | "refunded"
  | "canceled"
  | "expired";

type PaymentOrder = {
  id: string;
  order_number: string;
  status: PaymentOrderStatus;
  amount: number | string;
  currency: "CNY" | "USD";
  payment_method: PaymentOption;
  payment_reference: string | null;
  proof_path: string | null;
  submitted_at: string | null;
  review_note: string | null;
  created_at: string | null;
  expires_at: string | null;
  payment_destination_key: string | null;
  payment_destination_label: string | null;
  payment_destination_url: string | null;
  payment_destination_version: string | null;
};

type PaymentOrderRpcResult = Partial<PaymentOrder> & {
  ok?: boolean;
  found?: boolean;
  error_message?: string | null;
};

type PayPalCheckoutResult = {
  ok?: boolean;
  approveUrl?: string;
  redirectUrl?: string;
  error?: string;
};

const DEFAULT_ALIPAY_PAYMENT_QR_URL =
  "/payments/alipay-cloud-membership-64.jpg";
const DEFAULT_ALIPAY_PAYEE_NAME = "有时空间";
const configuredAlipayQrUrl =
  process.env.NEXT_PUBLIC_ALIPAY_PAYMENT_QR_URL?.trim() ||
  DEFAULT_ALIPAY_PAYMENT_QR_URL;
const ALIPAY_PAYMENT_QR_URL =
  configuredAlipayQrUrl.startsWith("/") ||
  configuredAlipayQrUrl.startsWith("https://")
    ? configuredAlipayQrUrl
    : "";
const ALIPAY_PAYEE_NAME =
  process.env.NEXT_PUBLIC_ALIPAY_PAYEE_NAME?.trim() ||
  DEFAULT_ALIPAY_PAYEE_NAME;
const ALIPAY_PAYMENT_READY = Boolean(
  ALIPAY_PAYMENT_QR_URL && ALIPAY_PAYEE_NAME
);

function normalizeOrder(value: unknown): PaymentOrder | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as PaymentOrderRpcResult;
  if (!row.id || !row.order_number || !row.status || !row.currency || !row.payment_method) {
    return null;
  }
  return row as PaymentOrder;
}

function formatAmount(order: Pick<PaymentOrder, "amount" | "currency">) {
  const amount = Number(order.amount || 0);
  return order.currency === "CNY" ? `¥${amount.toFixed(2)}` : `US$${amount.toFixed(2)}`;
}

function safePaymentDestinationUrl(value: string | null | undefined, fallback: string) {
  const candidate = value?.trim() || fallback;
  return candidate.startsWith("/") || candidate.startsWith("https://")
    ? candidate
    : fallback;
}

export default function MembershipPaymentPage() {
  const { language, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<PaymentOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [paypalStarting, setPaypalStarting] = useState(false);
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const zh = language !== "en";
  const paymentIntro = zh
    ? "PayPal 付款成功后自动开通一年；支付宝付款后上传凭证，由管理员确认。"
    : "PayPal activates one year automatically after payment. Alipay still uses proof upload and administrator confirmation.";
  const paypalOrderHint = zh
    ? "生成订单后进入 PayPal 支付 US$8；付款成功后自动开通一年，无需上传凭证。"
    : "Create an order and pay US$8 through PayPal. One year is activated automatically after payment, with no proof upload.";
  const paypalPaymentSteps = zh
    ? "进入 PayPal 核对 US$8 订单并完成付款。付款确认后会自动返回并开通或顺延一年 Plus。"
    : "Open PayPal, verify the US$8 order, and complete payment. After confirmation, Plus is activated or extended by one year automatically.";
  const paypalCheckoutFailed = zh
    ? "暂时无法进入 PayPal 付款，请稍后重试。"
    : "PayPal checkout could not be opened. Try again later.";

  useEffect(() => {
    let active = true;

    async function loadUserAndOrder() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;
      setUserId(user?.id || "");
      setUserEmail(user?.email || "");

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc(
        "get_my_open_membership_payment_order_json"
      );

      if (!active) return;
      if (error) {
        console.error("load membership payment order error:", error);
        setErrorMessage(t.membership_page.order_load_failed);
      } else {
        const result = (Array.isArray(data) ? data[0] : data) as PaymentOrderRpcResult | null;
        const nextOrder = result?.ok && result.found !== false ? normalizeOrder(result) : null;
        setOrder(nextOrder);
      }
      setLoading(false);
    }

    void loadUserAndOrder();
    return () => {
      active = false;
    };
  }, [t.membership_page.order_load_failed]);

  async function createOrder(option: PaymentOption) {
    if (creating || !userId || (option === "alipay" && !ALIPAY_PAYMENT_READY)) {
      if (option === "alipay" && !ALIPAY_PAYMENT_READY) {
        showToast(t.membership_page.alipay_not_configured);
      }
      return;
    }
    setCreating(option);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("create_membership_payment_order_json", {
      p_currency: option === "alipay" ? "CNY" : "USD",
      p_payment_method: option,
    });

    setCreating(null);
    if (error) {
      console.error("create membership payment order error:", error);
      setErrorMessage(t.membership_page.order_create_failed);
      showToast(t.membership_page.order_create_failed);
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as PaymentOrderRpcResult | null;
    const nextOrder = normalizeOrder(result);
    if (!result?.ok || !nextOrder) {
      setErrorMessage(t.membership_page.order_create_failed);
      showToast(t.membership_page.order_create_failed);
      return;
    }

    setOrder(nextOrder);
    showToast(t.membership_page.order_created);
  }

  async function startPayPalCheckout() {
    if (
      !order ||
      order.payment_method !== "paypal" ||
      order.status !== "pending_payment" ||
      paypalStarting
    ) {
      return;
    }

    setPaypalStarting(true);
    setErrorMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch("/api/paypal/checkout", {
        method: "POST",
        headers,
        body: JSON.stringify({ paymentId: order.id }),
      });
      const result = (await response.json().catch(() => null)) as PayPalCheckoutResult | null;

      if (!response.ok || !result?.ok) {
        console.error("start PayPal checkout failed:", result);
        setErrorMessage(paypalCheckoutFailed);
        showToast(paypalCheckoutFailed);
        return;
      }

      const destination = result.redirectUrl || result.approveUrl;
      if (!destination) {
        setErrorMessage(paypalCheckoutFailed);
        showToast(paypalCheckoutFailed);
        return;
      }

      window.location.assign(destination);
    } catch (error) {
      console.error("start PayPal checkout error:", error);
      setErrorMessage(paypalCheckoutFailed);
      showToast(paypalCheckoutFailed);
    } finally {
      setPaypalStarting(false);
    }
  }

  async function copyPaymentEmail() {
    if (!userEmail) return;
    try {
      await navigator.clipboard.writeText(userEmail);
      showToast(t.membership_page.payment_email_copied);
    } catch {
      showToast(t.membership_page.copy_failed);
    }
  }

  async function cancelPendingOrder() {
    if (!order || order.status !== "pending_payment" || canceling) return;
    if (!window.confirm(t.membership_page.cancel_order_confirm)) return;

    setCanceling(true);
    setErrorMessage("");
    const { data, error } = await supabase.rpc(
      "cancel_membership_payment_order_json",
      { p_order_id: order.id }
    );
    setCanceling(false);

    const result = (Array.isArray(data) ? data[0] : data) as PaymentOrderRpcResult | null;
    if (error || !result?.ok) {
      console.error("cancel membership payment order error:", error || result);
      setErrorMessage(t.membership_page.cancel_order_failed);
      showToast(t.membership_page.cancel_order_failed);
      return;
    }

    setOrder(null);
    setProofFile(null);
    showToast(t.membership_page.order_canceled);
  }

  function selectProof(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setProofFile(null);
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setProofFile(null);
      setErrorMessage(t.membership_page.proof_image_required);
      showToast(t.membership_page.proof_image_required);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProofFile(null);
      setErrorMessage(t.membership_page.proof_size_limit);
      showToast(t.membership_page.proof_size_limit);
      return;
    }

    setErrorMessage("");
    setProofFile(file);
  }

  async function submitProof() {
    if (!order || !userId || !proofFile || submitting || order.payment_method !== "alipay") {
      if (!proofFile) showToast(t.membership_page.proof_required);
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    const proofPath = `${userId}/${order.id}/proof`;
    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(proofPath, proofFile, { cacheControl: "0", contentType: proofFile.type, upsert: true });

    if (uploadError) {
      console.error("upload payment proof error:", uploadError);
      setSubmitting(false);
      setErrorMessage(t.membership_page.proof_upload_failed);
      showToast(t.membership_page.proof_upload_failed);
      return;
    }

    const { data, error } = await supabase.rpc("submit_membership_payment_order_json", {
      p_order_id: order.id,
      p_proof_path: proofPath,
      p_payment_reference: null,
    });

    setSubmitting(false);
    if (error) {
      console.error("submit membership payment order error:", error);
      setErrorMessage(t.membership_page.order_submit_failed);
      showToast(t.membership_page.order_submit_failed);
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as PaymentOrderRpcResult | null;
    const nextOrder = normalizeOrder(result);
    if (!result?.ok || !nextOrder) {
      const expired = result?.error_message === "order_expired";
      const message = expired
        ? t.membership_page.order_expired
        : t.membership_page.order_submit_failed;
      if (expired) {
        setOrder(null);
        setProofFile(null);
      }
      setErrorMessage(message);
      showToast(message);
      return;
    }

    setOrder(nextOrder);
    setProofFile(null);
    showToast(t.membership_page.order_submitted);
  }

  const orderStatusLabel = order
    ? order.status === "submitted"
      ? t.membership_page.order_status_submitted
      : order.status === "needs_update"
        ? t.membership_page.order_status_needs_update
        : t.membership_page.order_status_pending
    : "";
  const orderDestinationUrl = order?.payment_method === "alipay"
    ? safePaymentDestinationUrl(order.payment_destination_url, ALIPAY_PAYMENT_QR_URL)
    : "";
  const orderDestinationLabel = order?.payment_destination_label
    || (order?.payment_method === "alipay" ? ALIPAY_PAYEE_NAME : "LifeSpace");
  const orderDestinationReady = Boolean(
    order?.payment_method === "alipay" && orderDestinationUrl && orderDestinationLabel
  );
  const expiryText = order?.expires_at
    ? new Intl.DateTimeFormat(language === "en" ? "en" : "zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(order.expires_at))
    : "";

  return (
    <main style={pageStyle}>
      <div className="mobile-app-desktop-only" style={backRowStyle}>
        <Link href="/profile" style={backLinkStyle}>
          <UiIcon name="arrow-left" size={16} />
          {t.membership_page.back_to_profile}
        </Link>
      </div>

      <header style={heroStyle}>
        <div className="mobile-app-desktop-only" style={eyebrowStyle}>{t.membership_page.payment_label}</div>
        <h1 className="mobile-app-desktop-only" style={titleStyle}>{t.membership_page.payment_page_title}</h1>
        <h2 className="mobile-app-block-only" style={{ ...cardTitleStyle, fontSize: 20 }}>{t.membership_page.payment_label}</h2>
        <p style={subtitleStyle}>{paymentIntro}</p>
      </header>

      {errorMessage ? <div style={errorStyle}>{errorMessage}</div> : null}

      {loading ? (
        <section style={cardStyle}>{t.membership_page.reading_status}</section>
      ) : !userEmail ? (
        <section style={cardStyle}>
          <h2 style={cardTitleStyle}>{t.membership_page.login_before_payment}</h2>
          <Link href={buildLoginHref("/membership/payment")} style={primaryButtonStyle}>
            {t.membership_page.login_and_continue_payment}
          </Link>
        </section>
      ) : (
        <>
          <section style={summaryCardStyle}>
            <div style={summaryItemStyle}>
              <span style={summaryLabelStyle}>{t.membership_page.payment_account}</span>
              <strong style={emailStyle}>{userEmail}</strong>
            </div>
            <div style={summaryItemStyle}>
              <span style={summaryLabelStyle}>{t.membership_page.payment_term}</span>
              <strong>{t.membership_page.one_year}</strong>
            </div>
          </section>

          {!order ? (
            <section style={paymentGridStyle}>
              <article style={paymentCardStyle}>
                <div style={paymentLabelStyle}>{t.membership_page.domestic_users}</div>
                <div style={priceStyle}>{t.membership_page.domestic_price}</div>
                <p style={bodyStyle}>{t.membership_page.alipay_order_hint}</p>
                <button
                  type="button"
                  onClick={() => void createOrder("alipay")}
                  disabled={creating !== null || !ALIPAY_PAYMENT_READY}
                  style={{
                    ...primaryButtonStyle,
                    opacity: ALIPAY_PAYMENT_READY ? 1 : 0.55,
                    cursor: ALIPAY_PAYMENT_READY ? "pointer" : "not-allowed",
                  }}
                >
                  {creating === "alipay"
                    ? t.membership_page.creating_order
                    : ALIPAY_PAYMENT_READY
                      ? t.membership_page.create_alipay_order
                      : t.membership_page.alipay_not_configured_action}
                </button>
                {!ALIPAY_PAYMENT_READY ? (
                  <div style={paymentUnavailableStyle}>
                    {t.membership_page.alipay_not_configured}
                  </div>
                ) : null}
              </article>

              <article style={paymentCardStyle}>
                <div style={paymentLabelStyle}>{t.membership_page.overseas_users}</div>
                <div style={priceStyle}>{t.membership_page.overseas_price}</div>
                <p style={bodyStyle}>{paypalOrderHint}</p>
                <button type="button" onClick={() => void createOrder("paypal")} disabled={creating !== null} style={primaryButtonStyle}>
                  {creating === "paypal" ? t.membership_page.creating_order : t.membership_page.create_paypal_order}
                </button>
              </article>
            </section>
          ) : (
            <>
              <section style={orderCardStyle}>
                <div style={orderHeaderStyle}>
                  <div>
                    <div style={summaryLabelStyle}>{t.membership_page.order_number}</div>
                    <strong style={orderNumberStyle}>{order.order_number}</strong>
                  </div>
                  <span style={orderStatusStyle(order.status)}>{orderStatusLabel}</span>
                </div>
                <div style={orderMetaGridStyle}>
                  <div><span>{t.membership_page.order_amount}</span><strong>{formatAmount(order)}</strong></div>
                  <div><span>{t.membership_page.payment_method_label}</span><strong>{order.payment_method === "alipay" ? t.profile.payment_methods.alipay : "PayPal"}</strong></div>
                  <div><span>{t.membership_page.payment_destination}</span><strong>{orderDestinationLabel}</strong></div>
                  {order.status === "pending_payment" && expiryText ? (
                    <div><span>{t.membership_page.order_expires_at}</span><strong>{expiryText}</strong></div>
                  ) : null}
                </div>
                {order.status === "pending_payment" ? (
                  <div style={orderActionsStyle}>
                    <button
                      type="button"
                      style={cancelOrderButtonStyle}
                      onClick={() => void cancelPendingOrder()}
                      disabled={canceling || paypalStarting}
                    >
                      {canceling
                        ? t.membership_page.canceling_order
                        : t.membership_page.cancel_and_choose_again}
                    </button>
                  </div>
                ) : null}
                {order.status === "pending_payment" ? (
                  <div style={expiryNoticeStyle}>{t.membership_page.order_expiry_notice}</div>
                ) : null}
              </section>

              {order.status === "submitted" ? (
                <section style={submittedCardStyle}>
                  <strong>{t.membership_page.submitted_title}</strong>
                  <p style={bodyStyle}>{t.membership_page.submitted_hint}</p>
                  <Link href="/profile" style={secondaryButtonStyle}>{t.membership_page.view_payment_status}</Link>
                </section>
              ) : (
                <>
                  {order.status === "needs_update" ? (
                    <section style={needsUpdateStyle}>
                      <strong>{t.membership_page.needs_update_title}</strong>
                      <div>{order.review_note || t.membership_page.needs_update_default}</div>
                    </section>
                  ) : null}

                  <section style={stepCardStyle}>
                    <div style={stepNumberStyle}>1</div>
                    <div>
                      <h2 style={stepTitleStyle}>{t.membership_page.complete_payment}</h2>
                      <p style={bodyStyle}>
                        {order.payment_method === "alipay" ? t.membership_page.alipay_payment_steps : paypalPaymentSteps}
                      </p>
                      {order.payment_method === "alipay" ? (
                        <div style={paymentNoteStyle}>
                          <span>{t.membership_page.payment_note_email}</span>
                          <strong>{userEmail}</strong>
                          <button type="button" onClick={() => void copyPaymentEmail()} style={copyButtonStyle}>
                            {t.membership_page.copy_payment_email}
                          </button>
                        </div>
                      ) : null}
                      {order.payment_method === "alipay" ? (
                        orderDestinationReady ? (
                          <div style={alipayQrPanelStyle}>
                            <div style={alipayQrTitleStyle}>{t.membership_page.alipay_qr_title}</div>
                            {/* Keep the original QR pixels and allow the configured public image host. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={orderDestinationUrl}
                              alt={t.membership_page.alipay_qr_alt}
                              style={alipayQrImageStyle}
                            />
                            <div style={alipayPayeeStyle}>
                              <span>{t.membership_page.alipay_payee}</span>
                              <strong>{orderDestinationLabel}</strong>
                            </div>
                            <div style={alipayQrHintStyle}>{t.membership_page.alipay_qr_hint}</div>
                            <a
                              href={orderDestinationUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={primaryButtonStyle}
                            >
                              {t.membership_page.domestic_payment_action}
                            </a>
                          </div>
                        ) : (
                          <div style={paymentUnavailableStyle}>
                            {t.membership_page.alipay_not_configured}
                          </div>
                        )
                      ) : (
                        <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
                          <button
                            type="button"
                            onClick={() => void startPayPalCheckout()}
                            disabled={paypalStarting}
                            style={{
                              ...primaryButtonStyle,
                              opacity: paypalStarting ? 0.7 : 1,
                            }}
                          >
                            {paypalStarting
                              ? (zh ? "正在进入 PayPal..." : "Opening PayPal...")
                              : t.membership_page.overseas_payment_action}
                          </button>
                          <div style={paypalAutoNoticeStyle}>
                            {zh
                              ? "付款成功后自动开通，无需上传付款凭证。"
                              : "Membership activates automatically after payment. No proof upload is needed."}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {order.payment_method === "alipay" ? (
                    <section style={stepCardStyle}>
                      <div style={stepNumberStyle}>2</div>
                      <div style={{ minWidth: 0 }}>
                        <h2 style={stepTitleStyle}>{t.membership_page.upload_payment_proof}</h2>
                        <p style={bodyStyle}>{t.membership_page.upload_payment_proof_hint}</p>
                        <label style={fieldLabelStyle} htmlFor="payment-proof">{t.membership_page.payment_proof}</label>
                        <input
                          id="payment-proof"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={selectProof}
                          style={fileInputStyle}
                        />
                        {proofFile ? <div style={fileNameStyle}>{proofFile.name}</div> : null}
                        <button type="button" onClick={() => void submitProof()} disabled={submitting || !proofFile} style={primaryButtonStyle}>
                          {submitting ? t.membership_page.submitting_order : t.membership_page.submit_for_confirmation}
                        </button>
                      </div>
                    </section>
                  ) : null}
                </>
              )}
            </>
          )}

        </>
      )}
    </main>
  );
}

const pageStyle: CSSProperties = { width: "min(100%, 760px)", margin: "0 auto", padding: "14px 14px 40px" };
const backRowStyle: CSSProperties = { marginBottom: 14 };
const backLinkStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, color: "#63745e", fontSize: 14, fontWeight: 700, textDecoration: "none" };
const heroStyle: CSSProperties = { marginBottom: 16 };
const eyebrowStyle: CSSProperties = { color: "#5f7d4c", fontSize: 13, fontWeight: 800, marginBottom: 5 };
const titleStyle: CSSProperties = { margin: 0, color: "#1f2a1f", fontSize: 27, lineHeight: 1.25 };
const subtitleStyle: CSSProperties = { margin: "7px 0 0", color: "#687563", fontSize: 14, lineHeight: 1.6 };
const cardStyle: CSSProperties = { display: "grid", gap: 12, marginBottom: 12, padding: 15, border: "1px solid #dfe8d8", borderRadius: 18, background: "#fff", color: "#596554" };
const cardTitleStyle: CSSProperties = { margin: 0, color: "#243123", fontSize: 18, lineHeight: 1.45 };
const summaryCardStyle: CSSProperties = { ...cardStyle, gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "start" };
const summaryItemStyle: CSSProperties = { minWidth: 0, display: "grid", gap: 4, color: "#243123", fontSize: 14 };
const summaryLabelStyle: CSSProperties = { color: "#7a8774", fontSize: 12 };
const emailStyle: CSSProperties = { overflowWrap: "anywhere" };
const paymentGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 12 };
const paymentCardStyle: CSSProperties = { ...cardStyle, marginBottom: 0, alignContent: "start", background: "#fffdf7", borderColor: "#eadfbd" };
const paymentLabelStyle: CSSProperties = { color: "#6f5b24", fontSize: 14, fontWeight: 800 };
const priceStyle: CSSProperties = { color: "#243123", fontSize: 25, fontWeight: 900 };
const bodyStyle: CSSProperties = { margin: 0, color: "#6f6655", fontSize: 14, lineHeight: 1.65, overflowWrap: "anywhere" };
const primaryButtonStyle: CSSProperties = { minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", border: 0, borderRadius: 999, background: "#3f7d3d", color: "#fff", fontSize: 14, fontWeight: 800, textAlign: "center", textDecoration: "none", padding: "8px 16px", cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { ...primaryButtonStyle, width: "100%", border: "1px solid #d7e5d0", background: "#fff", color: "#355235" };
const errorStyle: CSSProperties = { marginBottom: 12, padding: "10px 12px", borderRadius: 14, border: "1px solid #efc9bd", background: "#fff6f2", color: "#a04431", fontSize: 14, lineHeight: 1.55 };
const paymentUnavailableStyle: CSSProperties = { padding: "9px 11px", borderRadius: 12, border: "1px solid #ead7b9", background: "#fffaf0", color: "#81653b", fontSize: 13, lineHeight: 1.5 };
const alipayQrPanelStyle: CSSProperties = { width: "min(100%, 360px)", display: "grid", justifyItems: "center", gap: 10, marginTop: 12, padding: 14, border: "1px solid #dce8d7", borderRadius: 16, background: "#fff" };
const alipayQrTitleStyle: CSSProperties = { color: "#2d422c", fontSize: 15, fontWeight: 850, textAlign: "center" };
const alipayQrImageStyle: CSSProperties = { width: "min(100%, 320px)", height: "auto", display: "block", objectFit: "contain", borderRadius: 12, background: "#fff" };
const alipayPayeeStyle: CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6, color: "#6f7b69", fontSize: 13, textAlign: "center", flexWrap: "wrap" };
const alipayQrHintStyle: CSSProperties = { color: "#6f7b69", fontSize: 12, lineHeight: 1.55, textAlign: "center" };
const orderCardStyle: CSSProperties = { ...cardStyle, background: "#f8fbf5", borderColor: "#cfe0c6" };
const orderHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 };
const orderNumberStyle: CSSProperties = { display: "block", marginTop: 3, color: "#243123", fontSize: 18, overflowWrap: "anywhere" };
const orderStatusStyle = (status: PaymentOrderStatus): CSSProperties => ({ flexShrink: 0, padding: "5px 9px", borderRadius: 999, color: status === "needs_update" ? "#9d4a27" : "#3f6f3e", background: status === "needs_update" ? "#fff0e7" : "#eaf4e5", fontSize: 12, fontWeight: 800 });
const orderMetaGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 };
const orderActionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const copyButtonStyle: CSSProperties = { justifySelf: "start", border: "1px solid #d4dfce", borderRadius: 999, background: "#fff", color: "#40613f", padding: "7px 12px", fontSize: 13, fontWeight: 800 };
const cancelOrderButtonStyle: CSSProperties = { ...copyButtonStyle, color: "#9a4f3d", borderColor: "#ead2ca", cursor: "pointer" };
const expiryNoticeStyle: CSSProperties = { color: "#7a6b4f", fontSize: 12, lineHeight: 1.55 };
const stepCardStyle: CSSProperties = { ...cardStyle, gridTemplateColumns: "32px minmax(0, 1fr)", alignItems: "start" };
const stepNumberStyle: CSSProperties = { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", color: "#fff", background: "#547d4d", fontSize: 14, fontWeight: 900 };
const stepTitleStyle: CSSProperties = { margin: "2px 0 7px", color: "#243123", fontSize: 18 };
const paymentNoteStyle: CSSProperties = { display: "grid", gap: 5, marginTop: 10, padding: "10px 11px", border: "1px solid #dce6d7", borderRadius: 12, background: "#f8fbf6", color: "#556650", fontSize: 12 };
const paypalAutoNoticeStyle: CSSProperties = { color: "#5f7059", fontSize: 12, lineHeight: 1.55 };
const fieldLabelStyle: CSSProperties = { display: "block", margin: "13px 0 6px", color: "#4e5e49", fontSize: 13, fontWeight: 800 };
const fileInputStyle: CSSProperties = { width: "100%", minHeight: 42, color: "#596554", fontSize: 14 };
const fileNameStyle: CSSProperties = { margin: "-4px 0 10px", color: "#6c7867", fontSize: 12, overflowWrap: "anywhere" };
const submittedCardStyle: CSSProperties = { ...cardStyle, background: "#f5faf2", borderColor: "#bfd8b5", color: "#355235" };
const needsUpdateStyle: CSSProperties = { ...cardStyle, background: "#fff6ef", borderColor: "#edc7ad", color: "#8d4729", lineHeight: 1.55 };
