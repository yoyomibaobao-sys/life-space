"use client";

import type { ReactNode } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./GuideSearchResults.module.css";

export default function GuideResultsBar({
  count,
  loading,
  global = false,
  onClear,
  savedLink,
}: {
  count: number;
  loading: boolean;
  global?: boolean;
  onClear?: () => void;
  savedLink: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className={styles.resultsBar}>
      <span className={styles.resultCount} role="status" aria-live="polite" aria-atomic="true">
        {loading ? t.plant.loading : `${global ? `${t.plant.global_scope} · ` : ""}${count}${t.plant.result_count_short}`}
      </span>
      {onClear ? (
        <button type="button" onClick={onClear} aria-label={t.plant.clear_search} className={styles.clearSearch}>
          {t.plant.clear_search_short}
        </button>
      ) : null}
      <span className={styles.savedLink}>{savedLink}</span>
    </div>
  );
}
