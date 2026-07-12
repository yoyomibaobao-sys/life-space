export type DiscoveryDiversityCandidate = {
  archive_id: string;
  owner_user_id: string | null;
};

export type DiscoveryDiversityState<T extends DiscoveryDiversityCandidate> = {
  candidates: T[];
  recentOwnerIds: string[];
};

export type DiscoveryDiversityRelaxation = {
  strictCount: number;
  capRelaxedCount: number;
  adjacencyRelaxedCount: number;
};

export type DiscoveryDiversityResult<T extends DiscoveryDiversityCandidate> = {
  selected: T[];
  deferred: T[];
  nextRecentOwnerIds: string[];
  relaxation: DiscoveryDiversityRelaxation;
  sourceExhausted: boolean;
};

type SelectDiverseDiscoveryBatchParams<T extends DiscoveryDiversityCandidate> = {
  candidates: readonly T[];
  limit: number;
  recentOwnerIds?: readonly string[];
  sourceExhausted: boolean;
};

const DISCOVERY_DIVERSITY_WINDOW_SIZE = 40;
const DISCOVERY_OWNER_WINDOW_LIMIT = 3;
const RECENT_OWNER_HISTORY_LIMIT = DISCOVERY_DIVERSITY_WINDOW_SIZE - 1;

export function getDiscoveryOwnerKey(candidate: DiscoveryDiversityCandidate) {
  return candidate.owner_user_id || `archive:${candidate.archive_id}`;
}

function dedupeCandidates<T extends DiscoveryDiversityCandidate>(
  candidates: readonly T[]
) {
  const seenArchiveIds = new Set<string>();
  return candidates.filter((candidate) => {
    if (seenArchiveIds.has(candidate.archive_id)) return false;
    seenArchiveIds.add(candidate.archive_id);
    return true;
  });
}

function countOwnerOccurrences(ownerIds: readonly string[], ownerKey: string) {
  return ownerIds.reduce(
    (count, currentOwnerKey) =>
      currentOwnerKey === ownerKey ? count + 1 : count,
    0
  );
}

function appendRecentOwner(ownerIds: readonly string[], ownerKey: string) {
  return [...ownerIds, ownerKey].slice(-RECENT_OWNER_HISTORY_LIMIT);
}

export function selectDiverseDiscoveryBatch<
  T extends DiscoveryDiversityCandidate,
>({
  candidates,
  limit,
  recentOwnerIds = [],
  sourceExhausted,
}: SelectDiverseDiscoveryBatchParams<T>): DiscoveryDiversityResult<T> {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
  const pool = dedupeCandidates(candidates);
  const selected: T[] = [];
  let nextRecentOwnerIds = recentOwnerIds.slice(-RECENT_OWNER_HISTORY_LIMIT);
  const relaxation: DiscoveryDiversityRelaxation = {
    strictCount: 0,
    capRelaxedCount: 0,
    adjacencyRelaxedCount: 0,
  };

  while (selected.length < safeLimit && pool.length > 0) {
    const lastOwnerKey = nextRecentOwnerIds[nextRecentOwnerIds.length - 1] || null;
    let selectedIndex = pool.findIndex((candidate) => {
      const ownerKey = getDiscoveryOwnerKey(candidate);
      return (
        ownerKey !== lastOwnerKey &&
        countOwnerOccurrences(nextRecentOwnerIds, ownerKey) <
          DISCOVERY_OWNER_WINDOW_LIMIT
      );
    });
    let selectionMode: keyof DiscoveryDiversityRelaxation = "strictCount";

    if (selectedIndex < 0) {
      selectedIndex = pool.findIndex(
        (candidate) => getDiscoveryOwnerKey(candidate) !== lastOwnerKey
      );
      selectionMode = "capRelaxedCount";
    }

    if (selectedIndex < 0) {
      selectedIndex = 0;
      selectionMode = "adjacencyRelaxedCount";
    }

    const [candidate] = pool.splice(selectedIndex, 1);
    if (!candidate) break;

    selected.push(candidate);
    relaxation[selectionMode] += 1;
    nextRecentOwnerIds = appendRecentOwner(
      nextRecentOwnerIds,
      getDiscoveryOwnerKey(candidate)
    );
  }

  return {
    selected,
    deferred: pool,
    nextRecentOwnerIds,
    relaxation,
    sourceExhausted,
  };
}
