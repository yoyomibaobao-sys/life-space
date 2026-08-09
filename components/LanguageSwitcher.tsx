"use client";

import type { CSSProperties } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useLanguage();
  const nextLanguage = language === "zh" ? "en" : "zh";

  return (
    <button
      type="button"
      onClick={() => setLanguage(nextLanguage)}
      aria-label={language === "zh" ? "Switch to English" : "切换到中文"}
      title={language === "zh" ? "Switch to English" : "切换到中文"}
      style={compact ? compactButtonStyle : buttonStyle}
    >
      {language === "zh" ? "EN" : "中文"}
    </button>
  );
}

const buttonStyle: CSSProperties = {
  minWidth: 58,
  height: 34,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid #d8e2d3",
  background: "#fff",
  color: "#43513f",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const compactButtonStyle: CSSProperties = {
  ...buttonStyle,
  minWidth: 44,
  height: 28,
  padding: "0 9px",
  fontSize: 12,
};
