import type { RefObject } from "react";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import { DiscoverProjectCard } from "@/components/discover/DiscoverProjectCard";
import styles from "@/components/discover/DiscoverProjectFeed.module.css";
import { useLanguage } from "@/lib/i18n/useLanguage";

type Props = {
  items: DiscoveryProjectFeedItem[];
  helpOnly: boolean;
  initialLoading: boolean;
  loadingMore: boolean;
  initialError: boolean;
  loadMoreError: boolean;
  hasMore: boolean;
  loaderRef: RefObject<HTMLDivElement | null>;
  onRetryInitial: () => void;
  onRetryMore: () => void;
};

function ProjectCardSkeleton() {
  return (
    <div className={styles.skeletonCard} aria-hidden="true">
      <div className={`${styles.skeletonImage} ${styles.skeletonPulse}`} />
      <div className={styles.skeletonBody}>
        <div className={`${styles.skeletonLine} ${styles.skeletonPulse}`} style={{ width: "66%" }} />
        <div className={`${styles.skeletonLine} ${styles.skeletonPulse}`} />
        <div className={`${styles.skeletonLine} ${styles.skeletonPulse}`} style={{ width: "80%" }} />
        <div className={`${styles.skeletonLine} ${styles.skeletonPulse}`} style={{ width: "60%", height: 10 }} />
      </div>
    </div>
  );
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <div className={styles.grid}>
      {Array.from({ length: count }, (_, index) => (
        <ProjectCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function DiscoverProjectGrid({
  items,
  helpOnly,
  initialLoading,
  loadingMore,
  initialError,
  loadMoreError,
  hasMore,
  loaderRef,
  onRetryInitial,
  onRetryMore,
}: Props) {
  const { t } = useLanguage();

  if (initialLoading && items.length === 0) {
    return (
      <div aria-busy="true" aria-label={t.discover.grid.loading_aria}>
        <SkeletonGrid count={8} />
      </div>
    );
  }

  if (initialError && items.length === 0) {
    return (
      <div className={styles.statePanel}>
        <p className={styles.stateText}>{t.discover.grid.load_failed}</p>
        <button
          type="button"
          onClick={onRetryInitial}
          className={styles.retryButton}
        >
          {t.discover.grid.reload}
        </button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className={styles.statePanel}>
        {helpOnly ? t.discover.grid.empty_help : t.discover.grid.empty}
      </div>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {items.map((item, index) => (
          <DiscoverProjectCard
            key={item.archive_id}
            item={item}
            eager={index < 4}
          />
        ))}
      </div>

      {loadingMore ? (
        <div className={styles.loadingMore} aria-busy="true" aria-label={t.discover.grid.loading_more_aria}>
          <SkeletonGrid count={4} />
        </div>
      ) : null}

      {loadMoreError ? (
        <div className={styles.moreError}>
          <span>{t.discover.grid.load_more_failed}</span>
          <button
            type="button"
            onClick={onRetryMore}
            className={styles.moreRetryButton}
          >
            {t.discover.grid.retry}
          </button>
        </div>
      ) : null}

      <div ref={loaderRef} className={styles.loader} aria-live="polite">
        {!hasMore && !loadingMore && !loadMoreError ? (
          <span className={styles.endText}>{t.discover.grid.end}</span>
        ) : null}
      </div>
    </>
  );
}
