"use client";

import { App } from "@capacitor/app";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import {
  checkAndroidUpdate, getAndroidUpdateSnapshot, getAndroidUpdateServerSnapshot,
  isNativeAndroid, snoozeAndroidUpdate, subscribeAndroidUpdates,
} from "@/lib/android-app-update";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./AppUpdateNotifier.module.css";

export default function AppUpdateNotifier() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const update = useSyncExternalStore(subscribeAndroidUpdates, getAndroidUpdateSnapshot, getAndroidUpdateServerSnapshot);

  useEffect(() => {
    if (!isNativeAndroid()) return;
    let disposed = false;
    let handle: { remove: () => Promise<void> } | undefined;
    const check = () => {
      if (!disposed && document.visibilityState === "visible" && navigator.onLine) {
        void checkAndroidUpdate();
      }
    };
    const reconnected = () => { if (!disposed) void checkAndroidUpdate(true); };
    check();
    window.addEventListener("online", reconnected);
    document.addEventListener("visibilitychange", check);
    // Also detect a release published while the app remains in the foreground.
    const timer = window.setInterval(check, 5 * 60_000);
    void App.addListener("appStateChange", ({ isActive }) => { if (isActive) check(); }).then(
      (listener) => { if (disposed) void listener.remove(); else handle = listener; },
      () => { /* visibilitychange remains available on older shells. */ },
    );
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("online", reconnected);
      document.removeEventListener("visibilitychange", check);
      if (handle) void handle.remove();
    };
  }, []);

  const release = update.release;
  const legacy = update.status === "unsupported";
  const version = legacy ? "legacy" : release?.version_code;
  if ((!legacy && update.status !== "available") || version === undefined ||
      pathname === "/app-update" || pathname.startsWith("/download/android") ||
      !update.remind) return null;

  const dismiss = () => {
    snoozeAndroidUpdate(version);
  };
  const title = legacy ? t.app_update.legacy_title : t.app_update.new_release;
  const message = legacy ? t.app_update.legacy_message
    : t.app_update.available_version.replace("{version}", release?.version_name || "");

  return (
    <aside className={styles.notice} aria-label={title}>
      <div className={styles.headingRow}>
        <div role="status">
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.message}>{message}</p>
        </div>
        <button type="button" className={styles.closeButton} onClick={dismiss} aria-label={t.app_update.dismiss_reminder}>×</button>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.laterButton} onClick={dismiss}>{t.app_update.later}</button>
        <Link className={styles.updateLink} href="/app-update" onClick={dismiss}>{t.app_update.view_update}</Link>
      </div>
    </aside>
  );
}
