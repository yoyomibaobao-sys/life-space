"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function SavedGuideStatus({ category, showStatus = true }: { category: string; showStatus?: boolean }) {
  const { language } = useLanguage();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, minWidth: 0, color: "#587052", fontSize: 13, lineHeight: 1.6 }}>
      {showStatus ? <><span role="status">{language === "en" ? "Saved" : "已收藏"}</span><span aria-hidden="true">·</span></> : null}
      <Link href={`/archive/interests?section=${encodeURIComponent(category)}`} style={{ color: "#396a37", fontWeight: 700 }}>
        {language === "en" ? "Open my saved guides" : "打开我的收藏"}
      </Link>
    </div>
  );
}
