"use client";

import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "@/components/discover/DiscoverProjectFeed.module.css";

export default function MobileNetworkUnavailableState({
  onReconnect,
}: {
  onReconnect?: () => void;
}) {
  const { t } = useLanguage();

  return (
    <section
      className={styles.statePanel}
      data-mobile-network-unavailable="true"
    >
      <p className={styles.stateText}>{t.archive_workspace.offline_notice}</p>
      {onReconnect ? (
        <button
          type="button"
          className={styles.retryButton}
          onClick={onReconnect}
        >
          {t.discover.reload}
        </button>
      ) : null}
    </section>
  );
}
