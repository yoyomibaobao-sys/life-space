"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import {
  androidInstallFailure, checkAndroidUpdate, getAndroidUpdateSnapshot,
  getAndroidUpdateServerSnapshot, installAndroidUpdate, subscribeAndroidUpdates,
} from "@/lib/android-app-update";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./page.module.css";

type InstallState = "idle" | "preparing" | "downloading" | "permission_required" | "installer_opened";
type InstallFailure = ReturnType<typeof androidInstallFailure> | null;

export default function AndroidAppUpdatePage() {
  const { t } = useLanguage();
  const update = useSyncExternalStore(subscribeAndroidUpdates, getAndroidUpdateSnapshot, getAndroidUpdateServerSnapshot);
  const [installState, setInstallState] = useState<InstallState>("idle");
  const [installFailure, setInstallFailure] = useState<InstallFailure>(null);
  const installing = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void checkAndroidUpdate(true);
    return () => { mounted.current = false; };
  }, []);

  async function install() {
    if (installing.current) return;
    installing.current = true;
    setInstallFailure(null);
    setInstallState("preparing");
    try {
      // A release can change between the startup reminder and this tap.
      const checked = await checkAndroidUpdate(true);
      if (!mounted.current) return;
      if (checked.status !== "available" || !checked.release) {
        setInstallState("idle");
        return;
      }
      setInstallState("downloading");
      const result = await installAndroidUpdate(checked.release);
      if (mounted.current) setInstallState(result.status);
    } catch (error) {
      if (mounted.current) {
        setInstallFailure(androidInstallFailure(error));
        setInstallState("idle");
      }
    } finally {
      installing.current = false;
    }
  }

  const checking = update.status === "idle" || update.status === "checking" || installState === "preparing";
  const busy = checking || installState === "downloading";
  const available = update.status === "available";
  const androidOnly = update.status === "android_only";
  const unsupported = update.status === "unsupported";
  const failed = update.status === "failed" || Boolean(installFailure);
  const failureText = installFailure === "permission" ? t.app_update.permission_failed
    : installFailure === "installer" ? t.app_update.installer_failed
      : installFailure === "download" ? t.app_update.download_failed : t.app_update.failed;
  const actionLabel = installState === "permission_required" ? t.app_update.continue_update
    : available ? t.app_update.download_update : t.app_update.check_now;

  return (
    <main className={styles.page}>
      <MobilePageHeader title={t.app_update.title} titleText={t.app_update.title} fallbackHref="/profile" ariaLabel={t.nav.back} />
      <section className={styles.card}>
        <h1>{t.app_update.title}</h1>
        <p className={styles.intro}>{t.app_update.intro}</p>
        <div className={styles.versionRow}>
          <span>{t.app_update.current_version}</span>
          <strong>{update.currentVersion?.versionName || (unsupported ? t.app_update.legacy_version : androidOnly ? "—" : t.app_update.reading_version)}</strong>
        </div>
        {available && update.release ? (
          <div className={styles.versionRow}>
            <span>{t.app_update.new_version}</span>
            <strong>{update.release.version_name}</strong>
          </div>
        ) : null}
        <div aria-live="polite">
          {checking ? <p className={styles.status}>{t.app_update.checking}</p> : null}
          {installState === "downloading" ? (
            <p className={styles.status}>{t.app_update.downloading.replace("{version}", update.release?.version_name || "")}</p>
          ) : null}
          {update.status === "latest" && !busy ? <p className={styles.success}>{t.app_update.latest}</p> : null}
          {installState === "installer_opened" ? <p className={styles.success}>{t.app_update.opening_installer}</p> : null}
          {installState === "permission_required" ? <p className={styles.notice}>{t.app_update.permission_required}</p> : null}
          {failed ? <p className={styles.notice}>{failureText}</p> : null}
          {unsupported ? <p className={styles.notice}>{t.app_update.legacy_message}</p> : null}
          {androidOnly ? <p className={styles.notice}>{t.app_update.android_only}</p> : null}
        </div>
        {!androidOnly && !unsupported && !busy ? (
          <button type="button" className={styles.primaryButton} onClick={() => {
            if (available) void install();
            else { setInstallFailure(null); setInstallState("idle"); void checkAndroidUpdate(true); }
          }}>{actionLabel}</button>
        ) : null}
        {(failed || unsupported) ? (
          <div className={styles.noticeBlock}>
            <a href="https://life-space.uk/download/android" target="_blank" rel="noreferrer">{t.app_update.website_download}</a>
          </div>
        ) : null}
        {androidOnly ? <Link className={styles.websiteLink} href="/download/android">{t.app_update.website_download}</Link> : null}
      </section>
    </main>
  );
}
