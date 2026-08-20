const DB_NAME = "lifespace-quick-capture";
const DB_VERSION = 1;
const STORE_NAME = "captures";

export type QuickCaptureTarget = "cloud" | "local" | null;

export type QuickCapture = {
  id: string;
  blob: Blob;
  name: string;
  mimeType: string;
  createdAt: string;
  sourcePath: string;
  targetType: QuickCaptureTarget;
  archiveId: string | null;
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
  file: File,
  context: {
    sourcePath: string;
    targetType?: QuickCaptureTarget;
    archiveId?: string | null;
  }
) {
  const capture: QuickCapture = {
    id: crypto.randomUUID(),
    blob: file,
    name: file.name || `capture-${Date.now()}.jpg`,
    mimeType: file.type || "image/jpeg",
    createdAt: new Date().toISOString(),
    sourcePath: context.sourcePath,
    targetType: context.targetType || null,
    archiveId: context.archiveId || null,
  };
  const db = await openQuickCaptureDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(capture);
  await transactionDone(transaction).finally(() => db.close());
  return capture;
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
