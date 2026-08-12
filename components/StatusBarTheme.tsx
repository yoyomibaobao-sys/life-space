"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const APP_STATUS_BAR_LIGHT = "#f6f8f3";
export const APP_STATUS_BAR_DARK = "#000000";

function ensureThemeMeta() {
  let meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }

  return meta;
}

function setThemeColor(color: string) {
  ensureThemeMeta().setAttribute("content", color);
}

export function setAppStatusBarTheme(color: string) {
  if (typeof document === "undefined") return;
  setThemeColor(color);
}

export default function StatusBarTheme() {
  const pathname = usePathname();

  useEffect(() => {
    setThemeColor(APP_STATUS_BAR_LIGHT);

    return () => {
      setThemeColor(APP_STATUS_BAR_LIGHT);
    };
  }, [pathname]);

  return null;
}
