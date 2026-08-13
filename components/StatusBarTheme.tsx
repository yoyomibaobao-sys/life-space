"use client";

import {
  Capacitor,
  registerPlugin,
  SystemBars,
  SystemBarType,
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

type NativeSystemUiPlugin = {
  setStatusBarAppearance(options: {
    color: string;
    darkIcons: boolean;
  }): Promise<void>;
};

const NativeSystemUi = registerPlugin<NativeSystemUiPlugin>("NativeSystemUi");
let nativeThemeRevision = 0;

function nativeWindowAlreadyInsetsWebView() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return false;
  }

  const versionMatch = navigator.userAgent.match(/Android\s+(\d+)/i);
  const androidMajor = Number(versionMatch?.[1] || 0);
  return androidMajor > 0 && androidMajor < 15;
}

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

  if (!Capacitor.isNativePlatform()) return;

  const useDarkBackground = color === APP_STATUS_BAR_DARK;
  const systemBarsStyle = useDarkBackground
    ? SystemBarsStyle.Dark
    : SystemBarsStyle.Light;
  const legacyStatusBarStyle = useDarkBackground
    ? LegacyStatusBarStyle.Dark
    : LegacyStatusBarStyle.Light;
  const revision = ++nativeThemeRevision;

  void (async () => {
    await Promise.allSettled([
      SystemBars.setStyle({
        style: systemBarsStyle,
        bar: SystemBarType.StatusBar,
      }),
      StatusBar.setStyle({ style: legacyStatusBarStyle }),
    ]);

    if (revision !== nativeThemeRevision) return;

    if (
      Capacitor.getPlatform() === "android" &&
      Capacitor.isPluginAvailable("NativeSystemUi")
    ) {
      await NativeSystemUi.setStatusBarAppearance({
        color,
        darkIcons: !useDarkBackground,
      });
      return;
    }

    await StatusBar.setBackgroundColor({ color });
  })().catch(() => {
    // Older installed shells do not include the native bridge yet. Their
    // existing status-bar configuration remains a safe fallback.
  });
}

export default function StatusBarTheme() {
  const pathname = usePathname();

  useEffect(() => {
    if (!nativeWindowAlreadyInsetsWebView()) return;

    document.documentElement.dataset.nativeWindowInsets = "true";
    return () => {
      delete document.documentElement.dataset.nativeWindowInsets;
    };
  }, []);

  useEffect(() => {
    setAppStatusBarTheme(APP_STATUS_BAR_LIGHT);

    return () => {
      setAppStatusBarTheme(APP_STATUS_BAR_LIGHT);
    };
  }, [pathname]);

  return <div className="app-status-bar-surface" aria-hidden="true" />;
}
