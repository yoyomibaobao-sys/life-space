"use client";

import {
  Capacitor,
  SystemBars,
  SystemBarsStyle,
} from "@capacitor/core";
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

  if (Capacitor.isNativePlatform()) {
    const style =
      color === APP_STATUS_BAR_DARK
        ? SystemBarsStyle.Dark
        : SystemBarsStyle.Light;
    void SystemBars.setStyle({ style }).catch(() => {
      // The browser/PWA path has no native system bars to update.
    });
  }
}

export default function StatusBarTheme() {
  const pathname = usePathname();

  useEffect(() => {
    setAppStatusBarTheme(APP_STATUS_BAR_LIGHT);

    return () => {
      setAppStatusBarTheme(APP_STATUS_BAR_LIGHT);
    };
  }, [pathname]);

  return null;
}
