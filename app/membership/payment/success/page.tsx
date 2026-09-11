"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import { getPayPalPaymentCopy } from "@/lib/i18n/paypal-payment";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function MembershipPaymentSuccessPage() {
  const { language } = useLanguage();
  const copy = getPayPalPaymentCopy(language);

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={markStyle}>✓</div>
        <h1 style={titleStyle}>{copy.success_title}</h1>
        <p style={bodyStyle}>{copy.success_body}</p>
        <div style={actionsStyle}>
          <Link href="/profile" style={primaryButtonStyle}>
            {copy.success_profile}
          </Link>
          <Link href="/membership" style={secondaryButtonStyle}>
            {copy.success_membership}
          </Link>
        </div>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  width: "min(100%, 560px)",
  margin: "0 auto",
  padding: "40px 16px",
};

const cardStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  gap: 14,
  padding: "30px 22px",
  border: "1px solid #d9e6d3",
  borderRadius: 22,
  background: "#fff",
  textAlign: "center",
};

const markStyle: CSSProperties = {
  width: 48,
  height: 48,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  background: "#eaf4e5",
  color: "#3f7d3d",
  fontSize: 27,
  fontWeight: 900,
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#243123",
  fontSize: 24,
  lineHeight: 1.35,
};

const bodyStyle: CSSProperties = {
  margin: 0,
  color: "#667361",
  fontSize: 14,
  lineHeight: 1.7,
};

const actionsStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gap: 9,
  marginTop: 4,
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
  textDecoration: "none",
  padding: "8px 16px",
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  border: "1px solid #d7e5d0",
  background: "#fff",
  color: "#355235",
};
