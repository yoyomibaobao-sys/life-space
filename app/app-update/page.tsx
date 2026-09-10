"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import Link from "next/link";
import { useEffect, useState } from "react";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import {
  ANDROID_RELEASE_APK_URL,
  ANDROID_RELEASE_MANIFEST_PATH,
  isAndroidReleaseManifest,
} from "@/lib/android-release";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./page.module.css";

type NativeAppVersion = {
  versionName: string;
  versionCode: number;
};

type NativeInstallResult = {
  status: "permission_required" | "installer_opened";
};

type NativeAppUpdatePlugin = {
  getCurrentVersion(): Promise<NativeAppVersion>;
  installUpdate(options: {
    downloadUrl: string;
    versionCode: number;
    sizeBytes: number;
    sha256: string;
  }): Promise<NativeInstallResult>;
};

type UpdateState =
  | "loading"
  | "ready"
  | "checking"
  | "downloading"
  | "latest"
  | "permission_required"
  | "installer_opened"
  | "unsupported"
  | "android_only"
  | "failed";

const NativeAppUpdate =
  registerPlugin<NativeAppUpdatePlugin>("NativeAppUpdate");

function withVersion(template: string, version: string) {
  return template.replace("{version}", version);
}

export default function AndroidAppUpdatePage() {
  const { language, t } = useLanguage();
  const [currentVersion, setCurrentVersion] = useState<NativeAppVersion | null>(null);
  const [availableVersion, setAvailableVersion] = useState("");
  const [state, setState] = useState<UpdateState>("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentVersion() {
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
        if (!cancelled) setState("android_only");
        return;
      }
      if (!Capacitor.isPluginAvailable("NativeAppUpdate")) {
        if (!cancelled) setState("unsupported");
        return;
      }

      try {
        const version = await NativeAppUpdate.getCurrentVersion();
        if (!cancelled) {
          setCurrentVersion(version);
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("failed");
      }
    }

    void loadCurrentVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  async function checkAndInstallUpdate() {
    if (!currentVersion) return;
    setState("checking");
    setAvailableVersion("");

    try {
      const response = await fetch(ANDROID_RELEASE_MANIFEST_PATH, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Release metadata is unavailable.");

      const value: unknown = await response.json();
      if (!isAndroidReleaseManifest(value)) {
        throw new Error("Release metadata is invalid.");
      }
      if (value.version_code <= currentVersion.versionCode) {
        setState("latest");
        return;
      }

      setAvailableVersion(value.version_name);
      setState("downloading");
      const result = await NativeAppUpdate.installUpdate({
        downloadUrl: ANDROID_RELEASE_APK_URL,
        versionCode: value.version_code,
        sizeBytes: value.size_bytes,
        sha256: value.sha256,
      });
      setState(result.status);
    } catch {
      setState("failed");
    }
  }

  const canCheck = Boolean(currentVersion) && [
    "ready",
    "latest",
    "permission_required",
    "failed",
  ].includes(state);
  const actionLabel = state === "permission_required"
    ? t.app_update.continue_update
    : t.app_update.check_now;
  const legacyVersionLabel = language === "en" ? "Legacy app" : "旧版 APP";
  const legacyUpdateMessage = language === "en"
    ? "This installation uses the older update component. Complete this one upgrade in the system browser; later versions can update directly inside the app."
    : "当前安装的是旧版更新组件。请先通过系统浏览器完成这一次覆盖安装；升级后，后续版本即可在 APP 内直接更新。";

  return (
    <main className={styles.page}>
      <MobilePageHeader
        title={t.app_update.title}
        titleText={t.app_update.title}
        fallbackHref="/profile"
        ariaLabel={t.nav.back}
      />

      <section className={styles.card}>
        <h1>{t.app_update.title}</h1>
        <p className={styles.intro}>{t.app_update.intro}</p>

        <div className={styles.versionRow}>
          <span>{t.app_update.current_version}</span>
          <strong>
            {currentVersion?.versionName ||
              (state === "unsupported" ? legacyVersionLabel : t.app_update.reading_version)}
          </strong>
        </div>

        {state === "checking" ? (
          <p className={styles.status}>{t.app_update.checking}</p>
        ) : null}
        {state === "downloading" ? (
          <p className={styles.status}>
            {withVersion(t.app_update.downloading, availableVersion)}
          </p>
        ) : null}
        {state === "latest" ? (
          <p className={styles.success}>{t.app_update.latest}</p>
        ) : null}
        {state === "installer_opened" ? (
          <p className={styles.success}>{t.app_update.opening_installer}</p>
        ) : null}
        {state === "permission_required" ? (
          <p className={styles.notice}>{t.app_update.permission_required}</p>
        ) : null}
        {state === "failed" ? (
          <p className={styles.notice}>{t.app_update.failed}</p>
        ) : null}
        {state === "unsupported" ? (
          <div className={styles.noticeBlock}>
            <p>{legacyUpdateMessage}</p>
            <a href="https://life-space.uk/download/android" target="_blank" rel="noreferrer">
              {t.app_update.website_download}
            </a>
          </div>
        ) : null}
        {state === "android_only" ? (
          <div className={styles.noticeBlock}>
            <p>{t.app_update.android_only}</p>
            <Link href="/download/android">{t.app_update.website_download}</Link>
          </div>
        ) : null}

        {canCheck ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void checkAndInstallUpdate()}
          >
            {actionLabel}
          </button>
        ) : null}
      </section>
    </main>
  );
}
