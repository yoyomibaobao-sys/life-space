"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function DiscoverMarketTabs({ active }: { active: "discover" | "market" }) {
  const { t } = useLanguage();

  return (
    <nav
      className="mobile-app-flex-only"
      style={wrapStyle}
      aria-label={t.nav.discover_market_tabs}
    >
      <Link href="/discover" style={tabStyle(active === "discover")}>
        {t.nav.activity}
      </Link>
      <Link href="/market" style={tabStyle(active === "market")}>
        {t.nav.market}
      </Link>
    </nav>
  );
}

const wrapStyle: CSSProperties = {
  margin: "0 0 12px",
  padding: 4,
  border: "1px solid #e2ecd9",
  borderRadius: 16,
  background: "#fff",
  alignItems: "center",
  gap: 4,
};

function tabStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    minHeight: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    borderRadius: 12,
    background: active ? "#e3f1dd" : "transparent",
    color: active ? "#2f6a31" : "#61705d",
    fontSize: 14,
    fontWeight: 800,
  };
}
