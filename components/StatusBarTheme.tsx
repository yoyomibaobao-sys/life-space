"use client";

import {
  Capacitor,
  SystemBars,
  SystemBarsStyle,
} from "@capacitor/core";
import {
  StatusBar,
  Style as LegacyStatusBarStyle,
} from "@capacitor/status-bar";
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
  document.documentElement.style.setProperty(
    "--app-status-bar-background",
    color,
  );

  if (Capacitor.isNativePlatform()) {
    const useDarkBackground = color === APP_STATUS_BAR_DARK;
    const systemBarsStyle = useDarkBackground
      ? SystemBarsStyle.Dark
      : SystemBarsStyle.Light;
    const legacyStatusBarStyle = useDarkBackground
      ? LegacyStatusBarStyle.Dark
      : LegacyStatusBarStyle.Light;

    void Promise.allSettled([
      SystemBars.setStyle({ style: systemBarsStyle }),
      StatusBar.setStyle({ style: legacyStatusBarStyle }),
      StatusBar.setBackgroundColor({ color }),
    ]);
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

  return <div className="app-status-bar-surface" aria-hidden="true" />;
}
