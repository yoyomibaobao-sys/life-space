"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import UiIcon from "@/components/ui/UiIcon";
import { buildLoginHref } from "@/lib/auth-return";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { supabase } from "@/lib/supabase";

export default function MembershipPaymentPage() {
  const { language, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;
      setUserEmail(user?.email || "");
      setLoading(false);
    }

    void loadUser();
    return () => {
      active = false;
    };
  }, []);

  const alipayMailHref = useMemo(() => {
    const subject = language === "en"
      ? "Cloud Membership payment details"
      : "云会员付款方式";
    const body = language === "en"
      ? `Registered email: ${userEmail}\nPlan: Cloud Membership, 1 year`
      : `注册邮箱：${userEmail}\n开通方案：云会员 1 年`;
    return `mailto:yoyomibaobao@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [language, userEmail]);

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
        <p style={subtitleStyle}>{t.membership_page.payment_page_subtitle}</p>
      </header>

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

          <section style={paymentGridStyle}>
            <article style={paymentCardStyle}>
              <div style={paymentLabelStyle}>{t.membership_page.domestic_users}</div>
              <div style={priceStyle}>{t.membership_page.domestic_price}</div>
              <p style={bodyStyle}>
                {t.membership_page.domestic_before_email} yoyomibaobao@gmail.com
                {t.membership_page.domestic_after_email}
              </p>
              <a href={alipayMailHref} style={primaryButtonStyle}>
                {t.membership_page.domestic_payment_action}
              </a>
            </article>

            <article style={paymentCardStyle}>
              <div style={paymentLabelStyle}>{t.membership_page.overseas_users}</div>
              <div style={priceStyle}>{t.membership_page.overseas_price}</div>
              <p style={bodyStyle}>
                {t.membership_page.overseas_before_paypal}
                paypal.me/ying0chen/8
                {t.membership_page.overseas_after_paypal}
                yoyomibaobao@gmail.com {t.membership_page.overseas_after_email}
              </p>
              <a
                href="https://paypal.me/ying0chen/8"
                target="_blank"
                rel="noreferrer"
                style={primaryButtonStyle}
              >
                {t.membership_page.overseas_payment_action}
              </a>
            </article>
          </section>

          <section style={contactCardStyle}>
            {t.membership_page.payment_mobile_contact}{" "}
            <a href="mailto:yoyomibaobao@gmail.com" style={inlineLinkStyle}>
              yoyomibaobao@gmail.com
            </a>
          </section>
        </>
      )}

      <Link href="/membership/benefits" style={secondaryButtonStyle}>
        {t.membership_page.view_benefits_rules}
      </Link>
    </main>
  );
}

const pageStyle: CSSProperties = {
  width: "min(100%, 760px)",
  margin: "0 auto",
  padding: "18px 14px 40px",
};

const backRowStyle: CSSProperties = { marginBottom: 18 };

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  color: "#63745e",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
};

const heroStyle: CSSProperties = { marginBottom: 18 };

const eyebrowStyle: CSSProperties = {
  color: "#5f7d4c",
  fontSize: 13,
  fontWeight: 800,
  marginBottom: 6,
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#1f2a1f",
  fontSize: 27,
  lineHeight: 1.25,
};

const subtitleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#687563",
  fontSize: 14,
  lineHeight: 1.65,
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  marginBottom: 14,
  padding: 16,
  border: "1px solid #dfe8d8",
  borderRadius: 18,
  background: "#fff",
  color: "#596554",
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  color: "#243123",
  fontSize: 18,
  lineHeight: 1.45,
};

const summaryCardStyle: CSSProperties = {
  ...cardStyle,
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "start",
};

const summaryItemStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 4,
  color: "#243123",
  fontSize: 14,
};

const summaryLabelStyle: CSSProperties = {
  color: "#7a8774",
  fontSize: 12,
};

const emailStyle: CSSProperties = { overflowWrap: "anywhere" };

const paymentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
  marginBottom: 12,
};

const paymentCardStyle: CSSProperties = {
  ...cardStyle,
  marginBottom: 0,
  alignContent: "start",
  background: "#fffdf7",
  borderColor: "#eadfbd",
};

const paymentLabelStyle: CSSProperties = {
  color: "#6f5b24",
  fontSize: 14,
  fontWeight: 800,
};

const priceStyle: CSSProperties = {
  color: "#243123",
  fontSize: 25,
  fontWeight: 900,
};

const bodyStyle: CSSProperties = {
  margin: 0,
  color: "#6f6655",
  fontSize: 14,
  lineHeight: 1.7,
  overflowWrap: "anywhere",
};

const primaryButtonStyle: CSSProperties = {
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  background: "#3f7d3d",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  textAlign: "center",
  textDecoration: "none",
  padding: "8px 16px",
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  width: "100%",
  border: "1px solid #d7e5d0",
  background: "#fff",
  color: "#355235",
};

const contactCardStyle: CSSProperties = {
  ...cardStyle,
  display: "block",
  fontSize: 14,
  lineHeight: 1.7,
  overflowWrap: "anywhere",
};

const inlineLinkStyle: CSSProperties = {
  color: "#356b34",
  fontWeight: 800,
  textDecoration: "none",
};
