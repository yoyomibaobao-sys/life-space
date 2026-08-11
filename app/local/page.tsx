"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function LocalModePage() {
  const { t } = useLanguage();

  return (
    <main
      style={{
        minHeight: "calc(100vh - 70px)",
        padding: "36px 20px",
        background: "#fbfcf7",
        color: "#263326",
      }}
    >
      <section
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: 24,
          borderRadius: 18,
          border: "1px solid #e0ead8",
          background: "#fff",
          boxShadow: "0 12px 32px rgba(75, 95, 62, 0.08)",
        }}
      >
        <div style={{ color: "#6c7a63", fontSize: 13, marginBottom: 8 }}>
          {t.local_mode.eyebrow}
        </div>
        <h1 style={{ margin: "0 0 14px", fontSize: 28 }}>{t.local_mode.title}</h1>
        <p style={{ margin: 0, lineHeight: 1.9, color: "#4f5d4a" }}>
          {t.local_mode.intro}
        </p>

        <ul
          style={{
            margin: "18px 0 0",
            padding: "0 0 0 18px",
            color: "#4f5d4a",
            lineHeight: 1.85,
            fontSize: 14,
          }}
        >
          <li>{t.local_mode.free}</li>
          <li>{t.local_mode.one_device}</li>
          <li>{t.local_mode.private}</li>
          <li>{t.local_mode.loss_risk}</li>
        </ul>

        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 14,
            background: "#f6faf3",
            border: "1px solid #e3eddb",
            color: "#5f6f58",
            lineHeight: 1.8,
            fontSize: 14,
          }}
        >
          {t.local_mode.backup_notice}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
          <Link href="/local/archive" style={primaryLinkStyle}>
            {t.local_mode.enter}
          </Link>
          <Link href="/register" style={primaryLinkStyle}>
            {t.local_mode.register}
          </Link>
          <Link href="/login" style={secondaryLinkStyle}>
            {t.local_mode.login}
          </Link>
          <Link href="/" style={ghostLinkStyle}>
            {t.local_mode.home}
          </Link>
        </div>
      </section>
    </main>
  );
}

const primaryLinkStyle = {
  padding: "11px 18px",
  borderRadius: 999,
  background: "#3f7d3d",
  color: "#fff",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};

const secondaryLinkStyle = {
  padding: "11px 18px",
  borderRadius: 999,
  background: "#eef6e8",
  color: "#2f5f2d",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};

const ghostLinkStyle = {
  padding: "11px 18px",
  borderRadius: 999,
  background: "#fff",
  color: "#6f7b69",
  border: "1px solid #e0e8dc",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};
