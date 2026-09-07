"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";
import { useIsNativeApp } from "@/lib/capacitor/useIsNativeApp";
import {
  ANDROID_RELEASE_FALLBACK,
  ANDROID_RELEASE_MANIFEST_PATH,
  isAndroidReleaseManifest,
  type AndroidReleaseManifest,
} from "@/lib/android-release";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./page.module.css";

function formatFileSize(bytes: number, language: "zh" | "en") {
  const megabytes = bytes / 1024 / 1024;
  return language === "en"
    ? `${megabytes.toFixed(2)} MB`
    : `${megabytes.toFixed(2)} MB`;
}

function formatPublishedDate(value: string, language: "zh" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "en" ? "en" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default function AndroidDownloadPage() {
  const { language, t } = useLanguage();
  const isNativeApp = useIsNativeApp();
  const [release, setRelease] = useState<AndroidReleaseManifest>(
    ANDROID_RELEASE_FALLBACK,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadManifest() {
      try {
        const response = await fetch(ANDROID_RELEASE_MANIFEST_PATH, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const value: unknown = await response.json();
        if (!cancelled && isAndroidReleaseManifest(value)) setRelease(value);
      } catch {
        // The verified build metadata below remains visible if R2 is transiently unavailable.
      }
    }

    void loadManifest();
    return () => {
      cancelled = true;
    };
  }, []);

  const channelLabel =
    release.channel === "stable"
      ? t.android_download.stable_badge
      : t.android_download.test_badge;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.brandRow}>
          <BrandMark size={34} tone="quiet" />
          <span>{t.home.brand}</span>
        </div>
        <div className={styles.eyebrow}>{t.android_download.eyebrow}</div>
        <h1>{t.android_download.title}</h1>
        <p className={styles.intro}>{t.android_download.intro}</p>

        <div className={styles.releaseCard}>
          <div className={styles.releaseHeading}>
            <strong>{release.version_name}</strong>
            <span>{channelLabel}</span>
          </div>
          <dl className={styles.releaseMeta}>
            <div>
              <dt>{t.android_download.published}</dt>
              <dd>{formatPublishedDate(release.published_at, language)}</dd>
            </div>
            <div>
              <dt>{t.android_download.file_size}</dt>
              <dd>{formatFileSize(release.size_bytes, language)}</dd>
            </div>
            <div>
              <dt>{t.android_download.compatibility}</dt>
              <dd>Android {release.minimum_android}+</dd>
            </div>
          </dl>

          {isNativeApp === true ? (
            <div className={styles.installedNotice}>
              {t.android_download.already_in_app}
            </div>
          ) : (
            <a
              className={styles.downloadButton}
              href="/api/download/android?source=download_page"
            >
              {t.android_download.download_now}
            </a>
          )}
        </div>
      </section>

      <section className={styles.infoGrid}>
        <article className={styles.infoCard}>
          <h2>{t.android_download.install_title}</h2>
          <ol>
            {t.android_download.install_steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>

        <article className={styles.infoCard}>
          <h2>{t.android_download.update_title}</h2>
          <p>{t.android_download.update_text}</p>
        </article>
      </section>

      <section className={styles.checksumCard}>
        <h2>{t.android_download.checksum_title}</h2>
        <p>{t.android_download.checksum_intro}</p>
        <code>{release.sha256}</code>
      </section>

      <div className={styles.bottomLinks}>
        <Link href="/">{t.android_download.website_home}</Link>
        <Link href="/login">{t.nav.login}</Link>
      </div>
    </main>
  );
}
