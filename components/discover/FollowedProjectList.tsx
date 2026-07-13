"use client";

import type { RefObject } from "react";
import { FollowedProjectCard } from "@/components/discover/FollowedProjectCard";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import styles from "@/components/discover/FollowedProjects.module.css";

type Props = {
  items: DiscoveryProjectFeedItem[];
  mode: "followed-project" | "followed-user-project";
  initialLoading: boolean;
  loadingMore: boolean;
  initialError: boolean;
  loadMoreError: boolean;
  hasMore: boolean;
  emptyMessage: string;
  emptyActionLabel?: string;
  listAnchorRef?: RefObject<HTMLDivElement | null>;
  loaderRef?: RefObject<HTMLDivElement | null>;
  unfollowingArchiveId?: string | null;
  onEmptyAction?: () => void;
  onRequestUnfollow?: (archiveId: string) => void;
  onRetryInitial: () => void;
  onRetryMore: () => void;
};

function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className={styles.list} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.skeletonCard}>
          <div className={`${styles.skeletonImage} ${styles.skeletonPulse}`} />
          <div className={styles.skeletonBody}>
            {[68, 44, 88, 58, 76].map((width) => (
              <div
                key={width}
                className={`${styles.skeletonLine} ${styles.skeletonPulse}`}
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FollowedProjectList({
  items,
  mode,
  initialLoading,
  loadingMore,
  initialError,
  loadMoreError,
  hasMore,
  emptyMessage,
  emptyActionLabel,
  listAnchorRef,
  loaderRef,
  unfollowingArchiveId,
  onEmptyAction,
  onRequestUnfollow,
  onRetryInitial,
  onRetryMore,
}: Props) {
  return (
    <div ref={listAnchorRef} className={styles.listAnchor}>
      {initialLoading && items.length === 0 ? <SkeletonList /> : null}

      {!initialLoading && initialError && items.length === 0 ? (
        <div className={styles.statePanel}>
          <p className={styles.stateText}>加载失败，请稍后重试。</p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={onRetryInitial}
          >
            重新加载
          </button>
        </div>
      ) : null}

      {!initialLoading && !initialError && items.length === 0 ? (
        <div className={styles.statePanel}>
          <p className={styles.stateText}>{emptyMessage}</p>
          {emptyActionLabel && onEmptyAction ? (
            <button
              type="button"
              className={styles.actionButton}
              onClick={onEmptyAction}
            >
              {emptyActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {items.length ? (
        <div className={styles.list}>
          {items.map((item) => (
            <FollowedProjectCard
              key={item.archive_id}
              item={item}
              mode={mode}
              unfollowing={unfollowingArchiveId === item.archive_id}
              onRequestUnfollow={onRequestUnfollow}
            />
          ))}
        </div>
      ) : null}

      {loadingMore ? (
        <div className={styles.loadingMore} aria-label="正在加载更多公开项目">
          <SkeletonList count={2} />
        </div>
      ) : null}

      {loadMoreError ? (
        <div className={styles.moreError}>
          <span>加载更多失败，请稍后重试。</span>
          <button
            type="button"
            className={styles.moreRetryButton}
            onClick={onRetryMore}
          >
            重试
          </button>
        </div>
      ) : null}

      {loaderRef ? (
        <div ref={loaderRef} className={styles.loader} aria-live="polite">
          {items.length > 0 && !hasMore && !loadingMore && !loadMoreError ? (
            <span className={styles.endText}>已到底</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
