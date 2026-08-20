"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/useLanguage";

export type HomeSection = "activity" | "experience" | "guide";

export default function HomeSectionTabs({ active }: { active: HomeSection }) {
  const { t } = useLanguage();
  const items = [
    { key: "activity" as const, label: t.nav.activity, href: "/discover" },
    { key: "experience" as const, label: t.nav.experience, href: "/experience" },
    { key: "guide" as const, label: t.nav.guide, href: "/plant" },
  ];

  return (
    <nav
      className="mobile-app-flex-only"
      aria-label={t.nav.home_sections}
      style={{
        position: "sticky",
        top: "calc(50px + var(--app-safe-area-top))",
        zIndex: 90,
        alignItems: "stretch",
        margin: "-10px -14px 12px",
        padding: "0 14px",
        borderBottom: "1px solid #e2e9df",
        background: "rgba(250,252,248,0.97)",
        backdropFilter: "blur(10px)",
      }}
    >
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={selected ? "page" : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "11px 6px 9px",
              borderBottom: selected
                ? "2px solid #5f875b"
                : "2px solid transparent",
              color: selected ? "#315b34" : "#728071",
              textAlign: "center",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: selected ? 800 : 650,
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
