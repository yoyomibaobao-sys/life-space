"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ANDROID_RELEASE_MANIFEST_PATH,
  isAndroidReleaseManifest,
} from "@/lib/android-release";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./AppUpdateNotifier.module.css";

type NativeAppVersion = {
  versionName: string;
  versionCode: number;
};

type NativeAppUpdatePlugin = {
  getCurrentVersion(): Promise<NativeAppVersion>;
};

type UpdateNotice =
  | { kind: "legacy" }
  | { kind: "release"; versionName: string; versionCode: number };

const NativeAppUpdate =
  registerPlugin<NativeAppUpdatePlugin>("NativeAppUpdate");

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const DISMISS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LAST_CHECK_KEY = "lifespace.android-update.last-check";
const DISMISSED_KEY = "lifespace.android-update.dismissed";

function readTimestamp(key: string) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Update reminders must never block the rest of the app.
  }
}

function wasRecentlyDismissed(identity: string) {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const [storedIdentity, storedAt] = raw.split("|");
    const timestamp = Number(storedAt);
    return storedIdentity === identity &&
      Number.isFinite(timestamp) &&
      Date.now() - timestamp < DISMISS_INTERVAL_MS;
  } catch {
    return false;
  }
}

export default function AppUpdateNotifier() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const [notice, setNotice] = useState<UpdateNotice | null>(null);

  const checkForUpdate = useCallback(async (force = false) => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      return;
    }

    const now = Date.now();
    if (!force && now - readTimestamp(LAST_CHECK_KEY) < CHECK_INTERVAL_MS) return;
    writeValue(LAST_CHECK_KEY, String(now));

    if (!Capacitor.isPluginAvailable("NativeAppUpdate")) {
      if (!wasRecentlyDismissed("legacy")) setNotice({ kind: "legacy" });
      return;
    }

    try {
      const [currentVersion, response] = await Promise.all([
        NativeAppUpdate.getCurrentVersion(),
        fetch(ANDROID_RELEASE_MANIFEST_PATH, { cache: "no-store" }),
      ]);
      if (!response.ok) return;

      const release: unknown = await response.json();
      if (!isAndroidReleaseManifest(release)) return;
      if (release.version_code <= currentVersion.versionCode) {
        setNotice(null);
        return;
      }

      const identity = `release-${release.version_code}`;
      if (!wasRecentlyDismissed(identity)) {
        setNotice({
          kind: "release",
          versionName: release.version_name,
          versionCode: release.version_code,
        });
      }
    } catch {
      // A failed background check stays silent. The manual update page remains available.
    }
  }, []);

  useEffect(() => {
    void checkForUpdate();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void checkForUpdate();
    }

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkForUpdate]);

  if (!notice || pathname === "/app-update" || pathname.startsWith("/download/android")) {
    return null;
  }

  const isEnglish = language === "en";
  const identity = notice.kind === "legacy"
    ? "legacy"
    : `release-${notice.versionCode}`;
  const title = notice.kind === "legacy"
    ? (isEnglish ? "One update is required" : "APP 需要先升级一次")
    : (isEnglish ? "A new version is available" : "发现新版本");
  const message = notice.kind === "legacy"
    ? (isEnglish
        ? "This installation uses the older update component. Complete this one upgrade first; later versions can update directly inside the app."
        : "当前安装的是旧版更新组件。完成这一次覆盖安装后，后续版本即可在 APP 内直接更新。")
    : (isEnglish
        ? `Version ${notice.versionName} is available. You can complete the update inside the app.`
        : `新版本 ${notice.versionName} 已可用，可在 APP 内完成更新。`);

  function dismiss() {
    writeValue(DISMISSED_KEY, `${identity}|${Date.now()}`);
    setNotice(null);
  }

  return (
    <aside className={styles.notice} role="status" aria-live="polite">
      <div className={styles.headingRow}>
        <div>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.message}>{message}</p>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={dismiss}
          aria-label={isEnglish ? "Dismiss update reminder" : "关闭更新提醒"}
        >
          ×
        </button>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.laterButton} onClick={dismiss}>
          {isEnglish ? "Later" : "稍后"}
        </button>
        <Link className={styles.updateLink} href="/app-update">
          {isEnglish ? "View update" : "查看更新"}
        </Link>
      </div>
    </aside>
  );
}
