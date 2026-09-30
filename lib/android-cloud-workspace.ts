import type { LocalArchiveSummary, PendingCloudSyncSummary } from "@/lib/local-offline-db";

type CloudRow = { id: string };

export type PendingCloudProject<L extends LocalArchiveSummary, C extends CloudRow> = {
  key: string;
  summaries: PendingCloudSyncSummary[];
  local: L | null;
  cloud: C | null;
  cache: L | null;
  creating: boolean;
  failed: boolean;
  recordCount: number;
  imageCount: number;
};

// This model only projects existing rows. It never mutates IndexedDB or guesses
// whether an independent saved-local-copy should be merged with a cloud master.
export function buildAndroidCloudWorkspace<L extends LocalArchiveSummary, C extends CloudRow>(input: {
  local: L[];
  caches: L[];
  live: C[];
  pending: PendingCloudSyncSummary[];
  preferLive: boolean;
}) {
  const localById = new Map(input.local.map((row) => [row.id, row]));
  const cacheById = new Map(input.caches.map((row) => [row.id, row]));
  const cacheBySource = new Map(input.caches.map((row) => [row.source_cloud_archive_id, row]));
  const liveById = new Map(input.live.map((row) => [row.id, row]));
  const pendingByKey = new Map<string, PendingCloudProject<L, C>>();
  const pendingLocalIds = new Set<string>();
  const pendingCloudIds = new Set<string>();
  for (const summary of input.pending) {
    const cloudId = summary.cloud_archive_id;
    const key = cloudId ? `cloud:${cloudId}` : `pending:${summary.local_archive_id}`;
    pendingLocalIds.add(summary.local_archive_id);
    if (cloudId) pendingCloudIds.add(cloudId);
    let entry = pendingByKey.get(key);
    if (!entry) {
      entry = {
        key, summaries: [], local: null, cloud: cloudId ? liveById.get(cloudId) || null : null,
        cache: cloudId ? cacheBySource.get(cloudId) || null : null,
        creating: false, failed: false, recordCount: 0, imageCount: 0,
      };
      pendingByKey.set(key, entry);
    }
    entry.summaries.push(summary);
    entry.local ||= localById.get(summary.local_archive_id) || null;
    entry.cache ||= cacheById.get(summary.local_archive_id) || null;
    entry.creating ||= summary.archive_create_pending;
    entry.failed ||= summary.archive_failed || summary.failed_record_count > 0 || summary.failed_image_count > 0 || Boolean(summary.last_error);
    entry.recordCount += summary.record_count;
    entry.imageCount += summary.image_count;
  }

  const localOnly = input.local.filter((row) =>
    !pendingLocalIds.has(row.id) &&
    row.sync?.operation_kind !== "create-archive" &&
    (row.local_role === "saved-local-copy" || !row.source_cloud_archive_id),
  );
  const seenCloud = new Set(pendingCloudIds);
  const normalLive: C[] = [];
  const normalCache: L[] = [];
  if (input.preferLive) {
    for (const row of input.live) {
      if (seenCloud.has(row.id)) continue;
      seenCloud.add(row.id);
      normalLive.push(row);
    }
  } else {
    for (const row of input.caches) {
      const id = row.source_cloud_archive_id || row.id;
      if (seenCloud.has(id)) continue;
      seenCloud.add(id);
      normalCache.push(row);
    }
  }
  const pending = [...pendingByKey.values()];
  return {
    pending, normalLive, normalCache, localOnly,
    counts: {
      cloud: pending.length + normalLive.length + normalCache.length,
      local: localOnly.length,
      all: pending.length + normalLive.length + normalCache.length + localOnly.length,
    },
    pendingCounts: {
      archive: pending.filter((entry) => entry.creating).length,
      record: pending.reduce((n, entry) => n + entry.recordCount, 0),
      image: pending.reduce((n, entry) => n + entry.imageCount, 0),
    },
  };
}
