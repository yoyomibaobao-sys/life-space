"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ProfileFeedbackEntry() {
  const { t } = useLanguage();

  return (
    <div
      style={{
        width: "min(1180px, calc(100% - 28px))",
        margin: "14px auto 0",
        padding: "10px 14px",
        border: "1px solid #e4eadf",
        borderRadius: 14,
        background: "#fafbf7",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ color: "#687364", fontSize: 12, lineHeight: 1.55 }}>
        {t.feedback_priority}
      </div>
      <Link
        href="/feedback"
        style={{
          color: "#4f6448",
          fontSize: 12,
          fontWeight: 700,
          textDecoration: "none",
          flexShrink: 0,
        }}
      >
        {t.feedback_and_contact}
      </Link>
    </div>
  );
}
