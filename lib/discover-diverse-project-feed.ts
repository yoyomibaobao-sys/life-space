import type { PostgrestError } from "@supabase/supabase-js";
import { fetchDiscoveryProjectCandidates } from "@/lib/discover-project-feed";
import {
  selectDiverseDiscoveryBatch,
  type DiscoveryDiversityRelaxation,
} from "@/lib/discover-project-diversity";
import type {
  DiscoveryProjectCursor,
  DiscoveryProjectFeedFilters,
  DiscoveryProjectFeedItem,
} from "@/lib/discover-project-types";

const DEFAULT_BATCH_LIMIT = 40;
const DEFAULT_CANDIDATE_POOL_LIMIT = 120;

export type DiscoveryDiverseProjectFeedState = {
  deferredCandidates: DiscoveryProjectFeedItem[];
  sourceCursor: DiscoveryProjectCursor | null;
  sourceHasMore: boolean;
  recentOwnerIds: string[];
  emittedArchiveIds: string[];
};

export type DiscoveryDiverseProjectFeedResult = {
  items: DiscoveryProjectFeedItem[];
  state: DiscoveryDiverseProjectFeedState;
  hasMore: boolean;
  error: PostgrestError | null;
  relaxation: DiscoveryDiversityRelaxation;
  fetchedSource: boolean;
};

type FetchDiverseDiscoveryProjectBatchParams = Pick<
  DiscoveryProjectFeedFilters,
  "category" | "helpOnly"
> & {
  state: DiscoveryDiverseProjectFeedState;
  limit?: number;
  candidatePoolLimit?: number;
};

export function createInitialDiscoveryDiversityState(): DiscoveryDiverseProjectFeedState {
  return {
    deferredCandidates: [],
    sourceCursor: null,
    sourceHasMore: true,
    recentOwnerIds: [],
    emittedArchiveIds: [],
  };
}

function normalizePositiveLimit(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

function mergeCandidatePool(
  deferredCandidates: readonly DiscoveryProjectFeedItem[],
  fetchedCandidates: readonly DiscoveryProjectFeedItem[],
  emittedArchiveIds: readonly string[]
) {
  const seenArchiveIds = new Set(emittedArchiveIds);
  return [...deferredCandidates, ...fetchedCandidates].filter((candidate) => {
    if (seenArchiveIds.has(candidate.archive_id)) return false;
    seenArchiveIds.add(candidate.archive_id);
    return true;
  });
}

export async function fetchDiverseDiscoveryProjectBatch({
  state,
  category,
  helpOnly,
  limit,
  candidatePoolLimit,
}: FetchDiverseDiscoveryProjectBatchParams): Promise<DiscoveryDiverseProjectFeedResult> {
  const batchLimit = normalizePositiveLimit(limit, DEFAULT_BATCH_LIMIT);
  const poolLimit = Math.max(
    batchLimit,
    normalizePositiveLimit(candidatePoolLimit, DEFAULT_CANDIDATE_POOL_LIMIT)
  );
  const availablePoolCapacity = Math.max(
    0,
    poolLimit - state.deferredCandidates.length
  );
  const shouldFetchSource = state.sourceHasMore && availablePoolCapacity > 0;
  let fetchedCandidates: DiscoveryProjectFeedItem[] = [];
  let nextSourceCursor = state.sourceCursor;
  let nextSourceHasMore = state.sourceHasMore;

  if (shouldFetchSource) {
    const sourceResult = await fetchDiscoveryProjectCandidates({
      category,
      helpOnly,
      cursor: state.sourceCursor,
      limit: availablePoolCapacity,
    });

    if (sourceResult.error) {
      return {
        items: [],
        state,
        hasMore:
          state.deferredCandidates.length > 0 || state.sourceHasMore,
        error: sourceResult.error,
        relaxation: {
          strictCount: 0,
          capRelaxedCount: 0,
          adjacencyRelaxedCount: 0,
        },
        fetchedSource: true,
      };
    }

    fetchedCandidates = sourceResult.items;
    nextSourceCursor = sourceResult.nextCursor;
    nextSourceHasMore =
      sourceResult.hasMore && sourceResult.nextCursor !== null;
  }

  const candidatePool = mergeCandidatePool(
    state.deferredCandidates,
    fetchedCandidates,
    state.emittedArchiveIds
  );
  const diversityResult = selectDiverseDiscoveryBatch({
    candidates: candidatePool,
    limit: batchLimit,
    recentOwnerIds: state.recentOwnerIds,
    sourceExhausted: !nextSourceHasMore,
  });
  const emittedArchiveIds = [
    ...state.emittedArchiveIds,
    ...diversityResult.selected.map((item) => item.archive_id),
  ];
  const nextState: DiscoveryDiverseProjectFeedState = {
    deferredCandidates: diversityResult.deferred,
    sourceCursor: nextSourceCursor,
    sourceHasMore: nextSourceHasMore,
    recentOwnerIds: diversityResult.nextRecentOwnerIds,
    emittedArchiveIds,
  };

  return {
    items: diversityResult.selected,
    state: nextState,
    hasMore:
      nextState.deferredCandidates.length > 0 || nextState.sourceHasMore,
    error: null,
    relaxation: diversityResult.relaxation,
    fetchedSource: shouldFetchSource,
  };
}
