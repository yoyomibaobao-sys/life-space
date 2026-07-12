import type { RefObject } from "react";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import { DiscoverProjectCard } from "@/components/discover/DiscoverProjectCard";
import styles from "@/components/discover/DiscoverProjectFeed.module.css";

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
  if (initialLoading && items.length === 0) {
    return (
      <div aria-busy="true" aria-label="正在加载公开项目">
        <SkeletonGrid count={8} />
      </div>
    );
  }

  if (initialError && items.length === 0) {
    return (
      <div className={styles.statePanel}>
        <p className={styles.stateText}>加载失败，请稍后重试。</p>
        <button
          type="button"
          onClick={onRetryInitial}
          className={styles.retryButton}
        >
          重新加载
        </button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className={styles.statePanel}>
        {helpOnly ? "暂时没有正在求助的公开项目" : "暂时还没有公开项目"}
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
        <div className={styles.loadingMore} aria-busy="true" aria-label="正在加载更多公开项目">
          <SkeletonGrid count={4} />
        </div>
      ) : null}

      {loadMoreError ? (
        <div className={styles.moreError}>
          <span>加载更多失败，请稍后重试。</span>
          <button
            type="button"
            onClick={onRetryMore}
            className={styles.moreRetryButton}
          >
            重试
          </button>
        </div>
      ) : null}

      <div ref={loaderRef} className={styles.loader} aria-live="polite">
        {!hasMore && !loadingMore && !loadMoreError ? (
          <span className={styles.endText}>已到底</span>
        ) : null}
      </div>
    </>
  );
}
