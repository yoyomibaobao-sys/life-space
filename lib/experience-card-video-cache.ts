import type { ExperienceCardDetail } from "@/lib/experience-card-types";

const DB_NAME = "lifespace-experience-card-video-cache";
const DB_VERSION = 1;
const STORE_NAME = "videos";
const CACHE_FORMAT_VERSION = 1;
const RENDER_FORMAT_VERSION = "experience-card-video-20260801-v3";
const MAX_CACHE_ITEMS = 12;
const MAX_CACHE_BYTES = 120 * 1024 * 1024;
const SELECTION_STORAGE_PREFIX = "lifespace-experience-card-selection:";

export type CachedExperienceCardVideo = {
  cardId: string;
  cacheFormatVersion: number;
  sourceSignature: string;
  blob: Blob;
  filename: string;
  selectedMediaIdsByRecordId: Record<string, string[]>;
  coverMediaId: string | null;
  createdAt: string;
  sizeBytes: number;
};

export type ExperienceCardVideoSelectionPreference = {
  selectedMediaIdsByRecordId: Record<string, string[]>;
  coverMediaId: string | null;
};

function cloneSelection(
  selection: Record<string, string[]>
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(selection).map(([recordId, mediaIds]) => [
      recordId,
      [...mediaIds],
    ])
  );
}

export function getExperienceCardVideoSelection(cardId: string) {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(
      `${SELECTION_STORAGE_PREFIX}${cardId}`
    );
    if (!stored) return null;
    const parsed = JSON.parse(stored) as ExperienceCardVideoSelectionPreference;
    if (!parsed || typeof parsed.selectedMediaIdsByRecordId !== "object") {
      return null;
    }
    return {
      selectedMediaIdsByRecordId: cloneSelection(
        parsed.selectedMediaIdsByRecordId
      ),
      coverMediaId: parsed.coverMediaId || null,
    };
  } catch {
    return null;
  }
}

export function saveExperienceCardVideoSelection(
  cardId: string,
  selection: ExperienceCardVideoSelectionPreference
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    `${SELECTION_STORAGE_PREFIX}${cardId}`,
    JSON.stringify({
      selectedMediaIdsByRecordId: cloneSelection(
        selection.selectedMediaIdsByRecordId
      ),
      coverMediaId: selection.coverMediaId,
    })
  );
}

function assertCacheAvailable() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw new Error("experience_card_video_cache_unavailable");
  }
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("experience_card_video_cache_failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error || new Error("experience_card_video_cache_failed")
      );
    transaction.onabort = () =>
      reject(
        transaction.error || new Error("experience_card_video_cache_failed")
      );
  });
}

function openCacheDb() {
  assertCacheAvailable();

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "cardId" });
        store.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("experience_card_video_cache_failed"));
  });
}

function closeDbAfter<T>(db: IDBDatabase, promise: Promise<T>) {
  return promise.finally(() => db.close());
}

export function getExperienceCardVideoSourceSignature(
  detail: ExperienceCardDetail
) {
  return JSON.stringify({
    renderFormatVersion: RENDER_FORMAT_VERSION,
    card: {
      id: detail.card.id,
      title: detail.card.title,
    },
    authorName: detail.author?.username || null,
    records: detail.records.map((record) => ({
      id: record.id,
      note: record.note,
      recordTime: record.record_time,
      tags: (record.record_tags || []).map((tag) => ({
        tag: tag.tag,
        type: tag.tag_type,
        active: tag.is_active !== false,
      })),
      media: record.media.map((media) => ({
        id: media.id,
        type: media.type,
        mimeType: media.mime_type,
        storagePath: media.storage_path || media.path || null,
        thumbPath: media.thumb_path || null,
        sizeBytes: media.size_bytes || null,
      })),
    })),
  });
}

export async function getCachedExperienceCardVideo(cardId: string) {
  const db = await openCacheDb();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const request = transaction
    .objectStore(STORE_NAME)
    .get(cardId) as IDBRequest<CachedExperienceCardVideo | undefined>;
  const result = await requestToPromise(request);
  await closeDbAfter(db, transactionDone(transaction));

  if (
    !result ||
    result.cacheFormatVersion !== CACHE_FORMAT_VERSION ||
    !(result.blob instanceof Blob) ||
    result.blob.type !== "video/mp4"
  ) {
    return null;
  }

  return result;
}

async function pruneCachedVideos() {
  const db = await openCacheDb();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const items = (await requestToPromise(
    transaction.objectStore(STORE_NAME).getAll() as IDBRequest<
      CachedExperienceCardVideo[]
    >
  )).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await closeDbAfter(db, transactionDone(transaction));
  let retainedBytes = 0;
  const cardIdsToDelete: string[] = [];

  items.forEach((item, index) => {
    retainedBytes += item.sizeBytes || item.blob?.size || 0;
    if (index >= MAX_CACHE_ITEMS || retainedBytes > MAX_CACHE_BYTES) {
      cardIdsToDelete.push(item.cardId);
    }
  });

  if (cardIdsToDelete.length === 0) return;

  const deleteDb = await openCacheDb();
  const deleteTransaction = deleteDb.transaction(STORE_NAME, "readwrite");
  const deleteStore = deleteTransaction.objectStore(STORE_NAME);
  cardIdsToDelete.forEach((cardId) => deleteStore.delete(cardId));
  await closeDbAfter(deleteDb, transactionDone(deleteTransaction));
}

export async function saveCachedExperienceCardVideo(input: {
  cardId: string;
  sourceSignature: string;
  blob: Blob;
  filename: string;
  selectedMediaIdsByRecordId: Record<string, string[]>;
  coverMediaId: string | null;
}) {
  const db = await openCacheDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const entry: CachedExperienceCardVideo = {
    ...input,
    cacheFormatVersion: CACHE_FORMAT_VERSION,
    selectedMediaIdsByRecordId: cloneSelection(
      input.selectedMediaIdsByRecordId
    ),
    createdAt: new Date().toISOString(),
    sizeBytes: input.blob.size,
  };

  transaction.objectStore(STORE_NAME).put(entry);
  await closeDbAfter(db, transactionDone(transaction));

  saveExperienceCardVideoSelection(input.cardId, {
    selectedMediaIdsByRecordId: input.selectedMediaIdsByRecordId,
    coverMediaId: input.coverMediaId,
  });

  try {
    await pruneCachedVideos();
  } catch {
    // The newly generated video remains usable even if best-effort pruning fails.
  }
}

export async function deleteCachedExperienceCardVideo(cardId: string) {
  const db = await openCacheDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(cardId);
  await closeDbAfter(db, transactionDone(transaction));
}
