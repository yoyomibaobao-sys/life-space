"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function MembershipBenefitsPage() {
  const { t } = useLanguage();
  const cloudPlan = t.membership_page.plans[2];
  const localPlan = t.membership_page.plans[1];

  return (
    <main style={pageStyle}>
      <Link href="/profile" className="mobile-app-desktop-only" style={backLinkStyle}>
        <UiIcon name="arrow-left" size={16} />
        {t.membership_page.back_to_profile}
      </Link>

      <header style={heroStyle}>
        <div className="mobile-app-desktop-only" style={eyebrowStyle}>{t.membership_page.eyebrow}</div>
        <h1 className="mobile-app-desktop-only" style={titleStyle}>{t.membership_page.benefits_rules_title}</h1>
        <p style={subtitleStyle}>{t.membership_page.benefits_rules_subtitle}</p>
      </header>

      <section style={featuredCardStyle}>
        <div style={planTopStyle}>
          <h2 style={sectionTitleStyle}>{cloudPlan.title}</h2>
          <strong style={priceStyle}>{cloudPlan.price}</strong>
        </div>
        <p style={bodyStyle}>{cloudPlan.description}</p>
        <ul style={listStyle}>
          {cloudPlan.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <Link href="/membership/payment" style={primaryButtonStyle}>
          {t.membership_page.open_now}
        </Link>
      </section>

      <details style={detailsStyle}>
        <summary style={summaryStyle}>{localPlan.title} · {localPlan.price}</summary>
        <p style={detailsBodyStyle}>{localPlan.description}</p>
        <ul style={listStyle}>
          {localPlan.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </details>

      <details style={detailsStyle}>
        <summary style={summaryStyle}>{t.membership_page.trial_title}</summary>
        <p style={detailsBodyStyle}>{t.membership_page.trial_description}</p>
      </details>

      <details style={detailsStyle}>
        <summary style={summaryStyle}>{t.membership_page.rules_title}</summary>
        <ul style={listStyle}>
          {t.membership_page.rules.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </details>

      <Link href="/membership/payment" style={primaryButtonStyle}>
        {t.membership_page.open_now}
      </Link>
    </main>
  );
}

const pageStyle: CSSProperties = {
  width: "min(100%, 760px)",
  margin: "0 auto",
  padding: "18px 14px 40px",
};

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  marginBottom: 18,
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

const featuredCardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  marginBottom: 12,
  padding: 16,
  border: "1px solid #aacb9b",
  borderRadius: 18,
  background: "#f7fbf4",
  boxShadow: "0 8px 22px rgba(63, 125, 61, 0.08)",
};

const planTopStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#243123",
  fontSize: 20,
  lineHeight: 1.35,
};

const priceStyle: CSSProperties = {
  color: "#3f7d3d",
  fontSize: 16,
};

const bodyStyle: CSSProperties = {
  margin: 0,
  color: "#5d6b57",
  fontSize: 14,
  lineHeight: 1.65,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  color: "#465541",
  fontSize: 14,
  lineHeight: 1.75,
};

const primaryButtonStyle: CSSProperties = {
  minHeight: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  padding: "8px 16px",
  borderRadius: 999,
  background: "#3f7d3d",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  textDecoration: "none",
};

const detailsStyle: CSSProperties = {
  marginBottom: 10,
  padding: "14px 16px",
  border: "1px solid #dfe8d8",
  borderRadius: 16,
  background: "#fff",
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  color: "#2f472e",
  fontSize: 15,
  fontWeight: 800,
  lineHeight: 1.5,
};

const detailsBodyStyle: CSSProperties = {
  ...bodyStyle,
  margin: "12px 0",
};
