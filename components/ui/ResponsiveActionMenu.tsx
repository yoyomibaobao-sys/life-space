"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className={`${styles.root} ${open ? styles.rootOpen : ""}`}>
      <div className={styles.desktop}>{children}</div>
      <div className={styles.mobile}>
        <button
          type="button"
          className={styles.summary}
          aria-label={resolvedLabel}
          aria-expanded={open}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((current) => !current);
          }}
        >
          <UiIcon name="more" size={19} />
        </button>
        {open ? (
          <div className={styles.menu} onClick={() => setOpen(false)}>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
