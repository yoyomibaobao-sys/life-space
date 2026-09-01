"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getLegalContent } from "@/lib/legal-content";
import styles from "./SiteFooter.module.css";
import BrandMark from "@/components/BrandMark";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function SiteFooter() {
  const { language, t } = useLanguage();
  const legal = getLegalContent(language);

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <BrandMark size={20} tone="quiet" />
          <span>{legal.serviceName}</span>
        </div>
        <div className={styles.actions}>
          <LanguageSwitcher compact />
          <Link href="/legal/privacy" className={styles.link}>
            {legal.nav.privacy.title}
          </Link>
          <Link href="/legal/terms" className={styles.link}>
            {legal.nav.terms.title}
          </Link>
          <Link href="/legal/refunds" className={styles.link}>
            {legal.nav.refunds.title}
          </Link>
          <Link href="/legal/contact" className={styles.link}>
            {legal.nav.contact.title}
          </Link>
          <Link href="/feedback" className={styles.link}>
            {t.feedback_and_contact}
          </Link>
        </div>
      </div>
    </footer>
  );
}
