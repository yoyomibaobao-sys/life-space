"use client";

import type { ReactNode } from "react";
import styles from "@/components/ui/ResponsiveActionMenu.module.css";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ResponsiveActionMenu({
  children,
  label,
}: {
  children: ReactNode;
  label?: string;
}) {
  const { t } = useLanguage();
  const resolvedLabel = label || t.nav.more_actions;

  return (
    <div className={styles.root}>
      <div className={styles.desktop}>{children}</div>
      <details className={styles.mobile}>
        <summary className={styles.summary} aria-label={resolvedLabel}>
          <UiIcon name="more" size={19} />
        </summary>
        <div className={styles.menu}>{children}</div>
      </details>
    </div>
  );
}
