"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from "react";
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
  | "canceled";

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
};

type PaymentOrderRpcResult = Partial<PaymentOrder> & {
  ok?: boolean;
  error_message?: string | null;
};

const OPEN_ORDER_STATUSES: PaymentOrderStatus[] = [
  "pending_payment",
  "submitted",
  "needs_update",
];

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

export default function MembershipPaymentPage() {
  const { language, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<PaymentOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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

      const { data, error } = await supabase
        .from("membership_payments")
        .select("id, order_number, status, amount, currency, payment_method, payment_reference, proof_path, submitted_at, review_note, created_at")
        .eq("user_id", user.id)
        .not("order_number", "is", null)
        .in("status", OPEN_ORDER_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (error) {
        console.error("load membership payment order error:", error);
        setErrorMessage(t.membership_page.order_load_failed);
      } else {
        const nextOrder = normalizeOrder(data);
        setOrder(nextOrder);
        setPaymentReference(nextOrder?.payment_reference || "");
      }
      setLoading(false);
    }

    void loadUserAndOrder();
    return () => {
      active = false;
    };
  }, [t.membership_page.order_load_failed]);

  const alipayMailHref = useMemo(() => {
    const orderNumber = order?.order_number || "";
    const subject = language === "en"
      ? `Alipay details · ${orderNumber}`
      : `支付宝收款方式 · ${orderNumber}`;
    const body = language === "en"
      ? `Order: ${orderNumber}\nRegistered email: ${userEmail}\nPlan: Cloud Membership, 1 year\nAmount: CNY 64`
      : `订单号：${orderNumber}\n注册邮箱：${userEmail}\n开通方案：云会员 1 年\n金额：人民币 64 元`;
    return `mailto:yoyomibaobao@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [language, order?.order_number, userEmail]);

  async function createOrder(option: PaymentOption) {
    if (creating || !userId) return;
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
    setPaymentReference(nextOrder.payment_reference || "");
    showToast(t.membership_page.order_created);
  }

  async function copyOrderNumber() {
    if (!order?.order_number) return;
    try {
      await navigator.clipboard.writeText(order.order_number);
      showToast(t.membership_page.order_number_copied);
    } catch {
      showToast(t.membership_page.copy_failed);
    }
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
    if (!order || !userId || !proofFile || submitting) {
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
      p_payment_reference: paymentReference.trim() || null,
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
      setErrorMessage(t.membership_page.order_submit_failed);
      showToast(t.membership_page.order_submit_failed);
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

  return (
    <main style={pageStyle}>
      <div style={backRowStyle}>
        <Link href="/membership" style={backLinkStyle}>
          <UiIcon name="arrow-left" size={16} />
          {t.membership_page.back_to_membership}
        </Link>
      </div>

      <header style={heroStyle}>
        <div style={eyebrowStyle}>{t.membership_page.payment_label}</div>
        <h1 style={titleStyle}>{t.membership_page.payment_page_title}</h1>
        <p style={subtitleStyle}>{t.membership_page.payment_order_intro}</p>
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
                <button type="button" onClick={() => void createOrder("alipay")} disabled={creating !== null} style={primaryButtonStyle}>
                  {creating === "alipay" ? t.membership_page.creating_order : t.membership_page.create_alipay_order}
                </button>
              </article>

              <article style={paymentCardStyle}>
                <div style={paymentLabelStyle}>{t.membership_page.overseas_users}</div>
                <div style={priceStyle}>{t.membership_page.overseas_price}</div>
                <p style={bodyStyle}>{t.membership_page.paypal_order_hint}</p>
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
                </div>
                <button type="button" style={copyButtonStyle} onClick={() => void copyOrderNumber()}>
                  {t.membership_page.copy_order_number}
                </button>
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
                        {order.payment_method === "alipay" ? t.membership_page.alipay_payment_steps : t.membership_page.paypal_payment_steps}
                      </p>
                      {order.payment_method === "alipay" ? (
                        <a href={alipayMailHref} style={primaryButtonStyle}>{t.membership_page.domestic_payment_action}</a>
                      ) : (
                        <a href="https://paypal.me/ying0chen/8" target="_blank" rel="noreferrer" style={primaryButtonStyle}>
                          {t.membership_page.overseas_payment_action}
                        </a>
                      )}
                    </div>
                  </section>

                  <section style={stepCardStyle}>
                    <div style={stepNumberStyle}>2</div>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={stepTitleStyle}>{t.membership_page.upload_payment_proof}</h2>
                      <p style={bodyStyle}>{t.membership_page.upload_payment_proof_hint}</p>
                      <label style={fieldLabelStyle} htmlFor="payment-reference">{t.membership_page.transaction_reference_optional}</label>
                      <input
                        id="payment-reference"
                        value={paymentReference}
                        onChange={(event) => setPaymentReference(event.target.value)}
                        maxLength={160}
                        placeholder={t.membership_page.transaction_reference_placeholder}
                        style={inputStyle}
                      />
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
                </>
              )}
            </>
          )}

          <section style={contactCardStyle}>
            {t.membership_page.payment_mobile_contact}{" "}
            <a href="mailto:yoyomibaobao@gmail.com" style={inlineLinkStyle}>yoyomibaobao@gmail.com</a>
          </section>
        </>
      )}

      <Link href="/membership/benefits" style={secondaryButtonStyle}>{t.membership_page.view_benefits_rules}</Link>
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
const contactCardStyle: CSSProperties = { ...cardStyle, display: "block", fontSize: 14, lineHeight: 1.7, overflowWrap: "anywhere" };
const inlineLinkStyle: CSSProperties = { color: "#356b34", fontWeight: 800, textDecoration: "none" };
const errorStyle: CSSProperties = { marginBottom: 12, padding: "10px 12px", borderRadius: 14, border: "1px solid #efc9bd", background: "#fff6f2", color: "#a04431", fontSize: 14, lineHeight: 1.55 };
const orderCardStyle: CSSProperties = { ...cardStyle, background: "#f8fbf5", borderColor: "#cfe0c6" };
const orderHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 };
const orderNumberStyle: CSSProperties = { display: "block", marginTop: 3, color: "#243123", fontSize: 18, overflowWrap: "anywhere" };
const orderStatusStyle = (status: PaymentOrderStatus): CSSProperties => ({ flexShrink: 0, padding: "5px 9px", borderRadius: 999, color: status === "needs_update" ? "#9d4a27" : "#3f6f3e", background: status === "needs_update" ? "#fff0e7" : "#eaf4e5", fontSize: 12, fontWeight: 800 });
const orderMetaGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 };
const copyButtonStyle: CSSProperties = { justifySelf: "start", border: "1px solid #d4dfce", borderRadius: 999, background: "#fff", color: "#40613f", padding: "7px 12px", fontSize: 13, fontWeight: 800 };
const stepCardStyle: CSSProperties = { ...cardStyle, gridTemplateColumns: "32px minmax(0, 1fr)", alignItems: "start" };
const stepNumberStyle: CSSProperties = { width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", color: "#fff", background: "#547d4d", fontSize: 14, fontWeight: 900 };
const stepTitleStyle: CSSProperties = { margin: "2px 0 7px", color: "#243123", fontSize: 18 };
const fieldLabelStyle: CSSProperties = { display: "block", margin: "13px 0 6px", color: "#4e5e49", fontSize: 13, fontWeight: 800 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 44, border: "1px solid #d8e0d4", borderRadius: 12, background: "#fff", color: "#263225", fontSize: 15, padding: "8px 11px", boxSizing: "border-box" };
const fileInputStyle: CSSProperties = { width: "100%", minHeight: 42, color: "#596554", fontSize: 14 };
const fileNameStyle: CSSProperties = { margin: "-4px 0 10px", color: "#6c7867", fontSize: 12, overflowWrap: "anywhere" };
const submittedCardStyle: CSSProperties = { ...cardStyle, background: "#f5faf2", borderColor: "#bfd8b5", color: "#355235" };
const needsUpdateStyle: CSSProperties = { ...cardStyle, background: "#fff6ef", borderColor: "#edc7ad", color: "#8d4729", lineHeight: 1.55 };
