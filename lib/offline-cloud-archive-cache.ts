import type { ArchiveCategory } from "@/lib/archive-categories";

const DB_NAME = "life-space-offline-cloud-cache";
const DB_VERSION = 1;
const ARCHIVE_STORE = "archives";

export const OFFLINE_CLOUD_CACHE_MAX_ARCHIVES = 200;
export const OFFLINE_CLOUD_CACHE_MAX_THUMBNAIL_BYTES = 128 * 1024;
export const OFFLINE_CLOUD_CACHE_MAX_THUMBNAILS = 80;

export type OfflineCloudArchiveCacheInput = {
  id: string;
  title?: string | null;
  category?: string | null;
  system_name?: string | null;
  species_name_snapshot?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_record_time?: string | null;
  record_count?: number | null;
  is_public?: boolean | null;
  cover_thumbnail?: Blob | null;
};

export type OfflineCloudArchiveSnapshot = {
  cache_key: string;
  owner_user_id: string;
  id: string;
  title: string | null;
  category: ArchiveCategory;
  system_name: string | null;
  species_name_snapshot: string | null;
  status: "active";
  created_at: string | null;
  updated_at: string | null;
  last_record_time: string | null;
  record_count: number;
  is_public: boolean;
  cover_thumbnail: Blob | null;
  cached_at: string;
};

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Offline cloud cache request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error || new Error("Offline cloud cache transaction failed"),
      );
    transaction.onabort = () =>
      reject(
        transaction.error || new Error("Offline cloud cache transaction aborted"),
      );
  });
}

function openCacheDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable");
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(ARCHIVE_STORE)) return;

      const store = db.createObjectStore(ARCHIVE_STORE, {
        keyPath: "cache_key",
      });
      store.createIndex("owner_user_id", "owner_user_id");
      store.createIndex("updated_at", "updated_at");
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Offline cloud cache could not open"));
  });
}

async function readAllSnapshots() {
  const db = await openCacheDb();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readonly");
    const done = transactionDone(transaction);
    const rows = await requestToPromise<OfflineCloudArchiveSnapshot[]>(
      transaction.objectStore(ARCHIVE_STORE).getAll(),
    );
    await done;
    return rows;
  } finally {
    db.close();
  }
}

function cleanText(value?: string | null) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeCategory(value?: string | null): ArchiveCategory {
  if (
    value === "plant" ||
    value === "system" ||
    value === "insect_fish" ||
    value === "other"
  ) {
    return value;
  }
  return "other";
}

function timeValue(value?: string | null) {
  const result = Date.parse(String(value || ""));
  return Number.isFinite(result) ? result : 0;
}

function isCacheableThumbnail(value: unknown): value is Blob {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Blob).size === "number" &&
      (value as Blob).size > 0 &&
      (value as Blob).size <= OFFLINE_CLOUD_CACHE_MAX_THUMBNAIL_BYTES,
  );
}

function normalizeSnapshot(
  ownerUserId: string,
  input: OfflineCloudArchiveCacheInput,
  existing: OfflineCloudArchiveSnapshot | undefined,
  cachedAt: string,
): OfflineCloudArchiveSnapshot {
  const suppliedThumbnail = input.cover_thumbnail;
  const coverThumbnail =
    suppliedThumbnail === undefined
      ? existing?.cover_thumbnail || null
      : isCacheableThumbnail(suppliedThumbnail)
        ? suppliedThumbnail
        : null;

  return {
    cache_key: `${ownerUserId}:${input.id}`,
    owner_user_id: ownerUserId,
    id: input.id,
    title: cleanText(input.title),
    category: normalizeCategory(input.category),
    system_name: cleanText(input.system_name),
    species_name_snapshot: cleanText(input.species_name_snapshot),
    status: "active",
    created_at: cleanText(input.created_at),
    updated_at: cleanText(input.updated_at),
    last_record_time: cleanText(input.last_record_time),
    record_count: Math.max(0, Math.floor(Number(input.record_count) || 0)),
    is_public: Boolean(input.is_public),
    cover_thumbnail: coverThumbnail,
    cached_at: cachedAt,
  };
}

export async function replaceOfflineCloudArchiveCache(
  ownerUserId: string,
  archives: OfflineCloudArchiveCacheInput[],
) {
  const normalizedOwnerUserId = cleanText(ownerUserId);
  if (!normalizedOwnerUserId) return [];

  const existingRows = await readAllSnapshots();
  const existingForOwner = new Map(
    existingRows
      .filter((row) => row.owner_user_id === normalizedOwnerUserId)
      .map((row) => [row.id, row]),
  );
  const uniqueActive = new Map<string, OfflineCloudArchiveCacheInput>();

  for (const archive of archives) {
    const id = cleanText(archive.id);
    if (!id || archive.status === "ended") continue;
    uniqueActive.set(id, { ...archive, id });
  }

  const cachedAt = new Date().toISOString();
  const nextRows = Array.from(uniqueActive.values())
    .sort(
      (left, right) =>
        timeValue(right.updated_at || right.last_record_time) -
        timeValue(left.updated_at || left.last_record_time),
    )
    .slice(0, OFFLINE_CLOUD_CACHE_MAX_ARCHIVES)
    .map((archive, index) => {
      const snapshot = normalizeSnapshot(
        normalizedOwnerUserId,
        archive,
        existingForOwner.get(archive.id),
        cachedAt,
      );
      return index < OFFLINE_CLOUD_CACHE_MAX_THUMBNAILS
        ? snapshot
        : { ...snapshot, cover_thumbnail: null };
    });
  const nextKeys = new Set(nextRows.map((row) => row.cache_key));
  const db = await openCacheDb();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ARCHIVE_STORE);

    for (const row of existingForOwner.values()) {
      if (!nextKeys.has(row.cache_key)) store.delete(row.cache_key);
    }
    for (const row of nextRows) store.put(row);

    await done;
  } finally {
    db.close();
  }

  return nextRows;
}

export async function listOfflineCloudArchiveCache(ownerUserId: string) {
  const normalizedOwnerUserId = cleanText(ownerUserId);
  if (!normalizedOwnerUserId) return [];

  const rows = await readAllSnapshots();
  return rows
    .filter(
      (row) =>
        row.owner_user_id === normalizedOwnerUserId && row.status === "active",
    )
    .sort(
      (left, right) =>
        timeValue(right.updated_at || right.last_record_time) -
        timeValue(left.updated_at || left.last_record_time),
    )
    .slice(0, OFFLINE_CLOUD_CACHE_MAX_ARCHIVES);
}

export async function clearOfflineCloudArchiveCache(ownerUserId: string) {
  const normalizedOwnerUserId = cleanText(ownerUserId);
  if (!normalizedOwnerUserId) return;

  const existingRows = await readAllSnapshots();
  const targets = existingRows.filter(
    (row) => row.owner_user_id === normalizedOwnerUserId,
  );
  if (targets.length === 0) return;

  const db = await openCacheDb();
  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ARCHIVE_STORE);
    for (const row of targets) store.delete(row.cache_key);
    await done;
  } finally {
    db.close();
  }
}
