"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/useLanguage";
import UiIcon from "@/components/ui/UiIcon";

export default function ProfileFeedbackEntry() {
  const { t } = useLanguage();

  return (
    <div
      style={{
        width: "min(1180px, calc(100% - 28px))",
        margin: "10px auto 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      <Link
        href="/feedback"
        style={{
          minHeight: 40,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "0 14px",
          border: "1px solid #d6e3d1",
          borderRadius: 999,
          background: "#fff",
          color: "#354f31",
          fontSize: 15,
          fontWeight: 800,
          textDecoration: "none",
          boxShadow: "0 3px 10px rgba(53, 83, 46, 0.06)",
        }}
      >
        <UiIcon name="mail" size={17} />
        <span>{t.feedback_and_contact}</span>
        <UiIcon name="arrow-right" size={15} />
      </Link>
    </div>
  );
}
