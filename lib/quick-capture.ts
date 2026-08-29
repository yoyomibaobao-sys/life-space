import { MAX_RECORD_PHOTOS_PER_ADD } from "@/lib/record-photo-batches";

const DB_NAME = "lifespace-quick-capture";
const DB_VERSION = 1;
const STORE_NAME = "captures";

export type QuickCaptureTarget = "cloud" | "local" | null;

export type QuickCapturePhoto = {
  blob: Blob;
  name: string;
  mimeType: string;
  createdAt: string;
};

export type QuickCapture = {
  id: string;
  blob: Blob;
  name: string;
  mimeType: string;
  createdAt: string;
  sourcePath: string;
  targetType: QuickCaptureTarget;
  archiveId: string | null;
  photos?: QuickCapturePhoto[];
};

function openQuickCaptureDb() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw new Error("quick_capture_unavailable");
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("quick_capture_unavailable"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("quick_capture_failed"));
    transaction.onabort = () =>
      reject(transaction.error || new Error("quick_capture_failed"));
  });
}

export async function saveQuickCapture(
  input: File | File[],
  context: {
    sourcePath: string;
    targetType?: QuickCaptureTarget;
    archiveId?: string | null;
  }
) {
  const files = (Array.isArray(input) ? input : [input]).slice(
    0,
    MAX_RECORD_PHOTOS_PER_ADD,
  );
  const file = files[0];
  if (!file) throw new Error("quick_capture_failed");
  const createdAt = new Date().toISOString();
  const capture: QuickCapture = {
    id: crypto.randomUUID(),
    blob: file,
    name: file.name || `capture-${Date.now()}.jpg`,
    mimeType: file.type || "image/jpeg",
    createdAt,
    sourcePath: context.sourcePath,
    targetType: context.targetType || null,
    archiveId: context.archiveId || null,
    photos: files.map((item, index) => ({
      blob: item,
      name: item.name || `capture-${Date.now()}-${index + 1}.jpg`,
      mimeType: item.type || "image/jpeg",
      createdAt,
    })),
  };
  const db = await openQuickCaptureDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(capture);
  await transactionDone(transaction).finally(() => db.close());
  return capture;
}

export async function appendQuickCaptureFiles(
  id: string,
  files: File[],
  maxPhotosPerAdd = MAX_RECORD_PHOTOS_PER_ADD,
) {
  const capture = await getQuickCapture(id);
  if (!capture) throw new Error("quick_capture_missing");
  const existing = getQuickCapturePhotos(capture);
  const accepted = files.slice(0, Math.max(1, maxPhotosPerAdd));
  const now = new Date().toISOString();
  const nextPhotos = [
    ...existing,
    ...accepted.map((file, index) => ({
      blob: file,
      name: file.name || `capture-${Date.now()}-${index + 1}.jpg`,
      mimeType: file.type || "image/jpeg",
      createdAt: now,
    })),
  ];
  const first = nextPhotos[0];
  const nextCapture: QuickCapture = {
    ...capture,
    blob: first.blob,
    name: first.name,
    mimeType: first.mimeType,
    createdAt: first.createdAt,
    photos: nextPhotos,
  };
  const db = await openQuickCaptureDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(nextCapture);
  await transactionDone(transaction).finally(() => db.close());
  return {
    capture: nextCapture,
    acceptedCount: accepted.length,
    rejectedCount: files.length - accepted.length,
  };
}

export async function getQuickCapture(id: string) {
  const db = await openQuickCaptureDb();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const request = transaction.objectStore(STORE_NAME).get(id) as IDBRequest<
    QuickCapture | undefined
  >;
  const capture = await new Promise<QuickCapture | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("quick_capture_failed"));
  });
  await transactionDone(transaction).finally(() => db.close());
  return capture || null;
}

export async function deleteQuickCapture(id: string) {
  const db = await openQuickCaptureDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(id);
  await transactionDone(transaction).finally(() => db.close());
}

export function quickCaptureToFile(capture: QuickCapture) {
  return new File([capture.blob], capture.name, {
    type: capture.mimeType || capture.blob.type || "image/jpeg",
    lastModified: new Date(capture.createdAt).getTime(),
  });
}

export function getQuickCapturePhotos(capture: QuickCapture): QuickCapturePhoto[] {
  if (Array.isArray(capture.photos) && capture.photos.length > 0) return capture.photos;
  return [{
    blob: capture.blob,
    name: capture.name,
    mimeType: capture.mimeType,
    createdAt: capture.createdAt,
  }];
}

export function quickCaptureToFiles(capture: QuickCapture) {
  return getQuickCapturePhotos(capture).map((photo) =>
    new File([photo.blob], photo.name, {
      type: photo.mimeType || photo.blob.type || "image/jpeg",
      lastModified: new Date(photo.createdAt).getTime(),
    })
  );
}
