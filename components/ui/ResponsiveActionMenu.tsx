import type { ReactNode } from "react";
import styles from "@/components/ui/ResponsiveActionMenu.module.css";
import UiIcon from "@/components/ui/UiIcon";

export default function ResponsiveActionMenu({
  children,
  label = "更多操作",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className={styles.root}>
      <div className={styles.desktop}>{children}</div>
      <details className={styles.mobile}>
        <summary className={styles.summary} aria-label={label}>
          <UiIcon name="more" size={19} />
        </summary>
        <div className={styles.menu}>{children}</div>
      </details>
    </div>
  );
}
