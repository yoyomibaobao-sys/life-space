"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function CloudTrialEntry() {
  const { language } = useLanguage();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  if (!online) return null;

  return (
    <Link href="/membership#cloud-trial" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
      gap: "6px 12px", margin: "10px 0 14px", padding: "12px 14px", borderRadius: 16,
      background: "#edf5e8", color: "#315d31", textDecoration: "none", fontSize: 14, lineHeight: 1.5,
    }}>
      <strong>{language === "en" ? "Start cloud trial" : "开启云端体验"}</strong>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{language === "en" ? "30 MB · 90 days" : "30MB · 90天"}<UiIcon name="arrow-right" size={16} /></span>
    </Link>
  );
}
