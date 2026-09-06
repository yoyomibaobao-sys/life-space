"use client";

import Link from "next/link";
import { useSyncExternalStore, type CSSProperties } from "react";
import { useIsNativeApp } from "@/lib/capacitor/useIsNativeApp";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function AndroidAppDownloadPrompt() {
  const { t } = useLanguage();
  const isNativeApp = useIsNativeApp();
  const isAndroidBrowser = useSyncExternalStore(
    subscribeToBrowserState,
    getAndroidBrowserSnapshot,
    getServerSnapshot,
  );

  if (!isAndroidBrowser || isNativeApp !== false) return null;

  return (
    <aside style={promptStyle}>
      <span style={copyStyle}>{t.android_download.experience_prompt}</span>
      <Link href="/download/android" style={linkStyle}>
        {t.android_download.experience_action}
      </Link>
    </aside>
  );
}

function subscribeToBrowserState() {
  return () => undefined;
}

function getAndroidBrowserSnapshot() {
  return /Android/i.test(window.navigator.userAgent);
}

function getServerSnapshot() {
  return false;
}

const promptStyle: CSSProperties = {
  margin: "0 0 14px",
  padding: "12px 14px",
  border: "1px solid #dce7d7",
  borderRadius: 14,
  background: "#f7faf5",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const copyStyle: CSSProperties = {
  color: "#687664",
  fontSize: 13,
  lineHeight: 1.55,
};

const linkStyle: CSSProperties = {
  flexShrink: 0,
  color: "#3f6f3a",
  fontSize: 13,
  fontWeight: 850,
  textUnderlineOffset: 3,
};
