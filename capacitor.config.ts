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
    SystemBars: {
      insetsHandling: "css",
      style: "LIGHT",
      hidden: false,
      animation: "NONE",
    },
  },
};

export default config;
