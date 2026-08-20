"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  const { t } = useLanguage();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>LifeSpace · 自然</div>
        <div className={styles.actions}>
          <Link href="/feedback" className={styles.link}>
            {t.feedback_and_contact}
          </Link>
        </div>
      </div>
    </footer>
  );
}
