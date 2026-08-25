"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { buildLoginHref } from "@/lib/auth-return";
import { formatPreciseDateTime } from "@/lib/date-time";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/Toast";
import styles from "./refund.module.css";

type RefundPolicyBand = "full_7d" | "half_180d" | "unused_renewal_full";
type RefundRequestStatus =
  | "submitted"
  | "approved_pending_refund"
  | "completed"
  | "rejected"
  | "canceled";

type RefundRequest = {
  id: string;
  status: RefundRequestStatus;
  policy_band: RefundPolicyBand;
  refund_amount: number | string;
  currency: string;
  request_reason: string | null;
  requested_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  refund_reference: string | null;
  refunded_at: string | null;
  benefits_ended_at: string | null;
};

type RefundPaymentItem = {
  payment_id: string;
  order_number: string | null;
  payment_status: string;
  amount: number | string;
  currency: string;
  payment_method: string;
  payment_reference: string | null;
  confirmed_at: string | null;
  service_started_at: string | null;
  service_ends_at: string | null;
  eligibility_ends_at: string | null;
  eligible: boolean;
  eligibility_reason: string | null;
  quoted_policy_band: RefundPolicyBand;
  quoted_refund_amount: number | string;
  refund_request: RefundRequest | null;
};

type RefundListResult = {
  ok?: boolean;
  error_message?: string | null;
  items?: RefundPaymentItem[];
};

type RefundRequestResult = {
  ok?: boolean;
  error_message?: string | null;
};

function formatAmount(amount: number | string, currency: string) {
  const value = Number(amount || 0);
  if (currency === "CNY") return `¥${value.toFixed(2)}`;
  if (currency === "USD") return `US$${value.toFixed(2)}`;
  return `${value.toFixed(2)} ${currency}`;
}

function firstRpcObject<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] || null) as T | null;
  return value && typeof value === "object" ? (value as T) : null;
}

export default function MembershipRefundPage() {
  const { t } = useLanguage();
  const copy = t.refund_request_page;
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [items, setItems] = useState<RefundPaymentItem[]>([]);
  const [reasonByPayment, setReasonByPayment] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const loadRefunds = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSignedIn(false);
      setItems([]);
      setLoading(false);
      return;
    }

    setSignedIn(true);
    const { data, error } = await supabase.rpc("get_my_membership_refunds_json");
    const result = firstRpcObject<RefundListResult>(data);

    if (error || !result?.ok) {
      console.error("load membership refunds error:", error || result);
      setItems([]);
      setErrorMessage(copy.load_failed);
    } else {
      setItems(Array.isArray(result.items) ? result.items : []);
    }
    setLoading(false);
  }, [copy.load_failed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRefunds();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRefunds]);

  function policyBandLabel(band: RefundPolicyBand) {
    if (band === "full_7d") return copy.band_full_7d;
    if (band === "unused_renewal_full") return copy.band_unused_renewal;
    return copy.band_half_180d;
  }

  function requestStatusLabel(status: RefundRequestStatus) {
    if (status === "submitted") return copy.status_submitted;
    if (status === "approved_pending_refund") return copy.status_approved;
    if (status === "completed") return copy.status_completed;
    if (status === "rejected") return copy.status_rejected;
    return copy.status_canceled;
  }

  function eligibilityHint(item: RefundPaymentItem) {
    if (item.eligibility_reason === "refund_window_closed") return copy.window_closed;
    if (item.eligibility_reason === "newer_membership_order_exists") return copy.newer_order_exists;
    if (item.eligibility_reason === "open_membership_order_exists") return copy.open_order_exists;
    if (item.eligibility_reason === "payment_not_confirmed") return copy.payment_not_confirmed;
    return copy.not_eligible;
  }

  async function requestRefund(item: RefundPaymentItem) {
    if (submittingId || !item.eligible) return;

    const refundAmount = formatAmount(item.quoted_refund_amount, item.currency);
    if (!window.confirm(`${copy.confirm_prefix}${refundAmount}${copy.confirm_suffix}`)) return;

    setSubmittingId(item.payment_id);
    setErrorMessage("");
    const { data, error } = await supabase.rpc("request_membership_refund_json", {
      p_payment_id: item.payment_id,
      p_reason: reasonByPayment[item.payment_id]?.trim() || null,
    });
    const result = firstRpcObject<RefundRequestResult>(data);

    if (error || !result?.ok) {
      console.error("request membership refund error:", error || result);
      setErrorMessage(copy.submit_failed);
      showToast(copy.submit_failed);
    } else {
      showToast(copy.submit_success);
      await loadRefunds();
    }
    setSubmittingId(null);
  }

  return (
    <main className={styles.page}>
      <div className={styles.backRow}>
        <Link href="/profile" className={styles.backLink}>{copy.back_to_profile}</Link>
      </div>

      <header className={styles.hero}>
        <div className={styles.eyebrow}>{copy.eyebrow}</div>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
      </header>

      <section className={styles.policyCard}>
        <h2>{copy.policy_title}</h2>
        <ol>
          <li>{copy.policy_full}</li>
          <li>{copy.policy_half}</li>
          <li>{copy.policy_closed}</li>
          <li>{copy.policy_exception}</li>
        </ol>
        <p>{copy.policy_original_route}</p>
        <Link href="/legal/refunds" className={styles.textLink}>{copy.read_full_policy}</Link>
      </section>

      {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

      {loading ? (
        <section className={styles.empty}>{copy.loading}</section>
      ) : !signedIn ? (
        <section className={styles.empty}>
          <p>{copy.login_required}</p>
          <Link href={buildLoginHref("/membership/refund")} className={styles.primaryLink}>
            {copy.login_action}
          </Link>
        </section>
      ) : items.length === 0 ? (
        <section className={styles.empty}>
          <p>{copy.no_orders}</p>
          <Link href="/membership/payment" className={styles.secondaryLink}>{copy.open_payment_page}</Link>
        </section>
      ) : (
        <section className={styles.orders} aria-label={copy.orders_aria}>
          {items.map((item) => {
            const request = item.refund_request;
            return (
              <article key={item.payment_id} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <div>
                    <div className={styles.amount}>{formatAmount(item.amount, item.currency)}</div>
                    <div className={styles.meta}>{item.payment_method === "alipay" ? copy.alipay : "PayPal"}</div>
                  </div>
                  <span className={styles.orderNumber}>{item.order_number || item.payment_reference || "—"}</span>
                </div>

                <dl className={styles.details}>
                  <div><dt>{copy.confirmed_at}</dt><dd>{formatPreciseDateTime(item.confirmed_at) || "—"}</dd></div>
                  <div><dt>{copy.service_period}</dt><dd>{formatPreciseDateTime(item.service_started_at) || "—"} – {formatPreciseDateTime(item.service_ends_at) || "—"}</dd></div>
                </dl>

                {request ? (
                  <div className={styles.requestPanel}>
                    <div className={styles.requestTitleRow}>
                      <strong>{requestStatusLabel(request.status)}</strong>
                      <span>{formatAmount(request.refund_amount, request.currency)}</span>
                    </div>
                    <div className={styles.meta}>{policyBandLabel(request.policy_band)}</div>
                    <div className={styles.meta}>{copy.requested_at}{formatPreciseDateTime(request.requested_at) || "—"}</div>
                    {request.review_note ? <div className={styles.note}>{copy.review_note}{request.review_note}</div> : null}
                    {request.status === "approved_pending_refund" ? (
                      <div className={styles.notice}>{copy.approved_notice}</div>
                    ) : null}
                    {request.status === "completed" ? (
                      <div className={styles.notice}>
                        {copy.completed_notice}{formatPreciseDateTime(request.refunded_at) || "—"}
                        {request.refund_reference ? ` · ${copy.refund_reference}${request.refund_reference}` : ""}
                      </div>
                    ) : null}
                  </div>
                ) : item.eligible ? (
                  <div className={styles.requestForm}>
                    <div className={styles.quote}>
                      <span>{policyBandLabel(item.quoted_policy_band)}</span>
                      <strong>{formatAmount(item.quoted_refund_amount, item.currency)}</strong>
                    </div>
                    <label>
                      <span>{copy.reason_label}</span>
                      <textarea
                        value={reasonByPayment[item.payment_id] || ""}
                        onChange={(event) => setReasonByPayment((current) => ({
                          ...current,
                          [item.payment_id]: event.target.value,
                        }))}
                        maxLength={600}
                        placeholder={copy.reason_placeholder}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void requestRefund(item)}
                      disabled={submittingId !== null}
                      className={styles.primaryButton}
                    >
                      {submittingId === item.payment_id ? copy.submitting : copy.submit_action}
                    </button>
                  </div>
                ) : (
                  <div className={styles.unavailable}>{eligibilityHint(item)}</div>
                )}
              </article>
            );
          })}
        </section>
      )}

      <section className={styles.contact}>
        {copy.contact_prefix}<a href="mailto:yoyomibaobao@gmail.com">yoyomibaobao@gmail.com</a>
      </section>
    </main>
  );
}
