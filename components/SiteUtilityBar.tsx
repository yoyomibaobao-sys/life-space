"use client";

import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./SiteUtilityBar.module.css";

export default function SiteUtilityBar() {
  const { t } = useLanguage();

  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        <div className={styles.hint}>{t.browser_translation_hint}</div>
        <div className={styles.actions}>
          <Link href="/feedback" className={styles.feedbackLink}>
            {t.feedback}
          </Link>
          <LanguageSwitcher compact />
        </div>
      </div>
    </div>
  );
}
