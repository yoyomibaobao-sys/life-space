/// <reference types="@capacitor/keyboard" />
/// <reference types="@capacitor/status-bar" />

import type { CapacitorConfig } from "@capacitor/cli";

const DEFAULT_SERVER_URL =
  "https://life-space-mobile-ui-polish.vercel.app";

function resolveServerUrl() {
  const raw = process.env.CAPACITOR_SERVER_URL || DEFAULT_SERVER_URL;
  const url = new URL(raw);

  if (url.protocol !== "https:") {
    throw new Error("CAPACITOR_SERVER_URL must use HTTPS.");
  }

  return url;
}

const serverUrl = resolveServerUrl();

const config: CapacitorConfig = {
  appId: "com.youshi.cultivation",
  appName: "有时·耕作",
  webDir: "mobile-shell",
  backgroundColor: "#f6f8f3ff",
  appendUserAgent: " LifeSpaceAndroid/1.0",
  loggingBehavior: "debug",
  android: {
    backgroundColor: "#f6f8f3ff",
    minWebViewVersion: 120,
    webContentsDebuggingEnabled: false,
  },
  server: {
    url: serverUrl.origin,
    cleartext: false,
    allowNavigation: [serverUrl.hostname],
    errorPath: "offline.html",
  },
  plugins: {
    App: {
      disableBackButtonHandler: false,
    },
    Keyboard: {
      // The status bar does not overlay this WebView, so Android's
      // adjustResize is the single source of truth for the keyboard height.
      // Enabling the full-screen workaround here causes a second resize on
      // some Huawei keyboards and leaves a large blank panel above the IME.
      resizeOnFullScreen: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "LIGHT",
      backgroundColor: "#f6f8f3",
    },
    SystemBars: {
      insetsHandling: "css",
      style: "LIGHT",
      hidden: false,
      animation: "NONE",
    },
  },
};

export default config;
