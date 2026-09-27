"use client";

import {
  isLocalArchiveVisibleToOwner,
  resolveLocalArchiveRole,
  type LocalArchive,
  type LocalArchiveOwnerContext,
} from "@/lib/local-offline-db";
import { loadRememberedLocalOwnerContext } from "@/lib/local-owner-context";

export const LIFESPACE_STORAGE_DIAGNOSTIC_TAG = "[lifespace-storage-diagnostic]";
const LOCAL_OFFLINE_DB_NAME = "life-space-local-offline";

async function listIndexedDatabases() {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") {
    return { apiAvailable: false, databases: [] as { name: string | null; version: number | null }[] };
  }
  try {
    const databases = await indexedDB.databases();
    return {
      apiAvailable: true,
      databases: (databases || []).map((item) => ({
        name: item.name || null,
        version: typeof item.version === "number" ? item.version : null,
      })),
    };
  } catch (error) {
    return {
      apiAvailable: false,
      databases: [] as { name: string | null; version: number | null }[],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readonlyGetAll(db: IDBDatabase, storeName: string) {
  if (!db.objectStoreNames.contains(storeName)) {
    return Promise.resolve([] as unknown[]);
  }
  return new Promise<unknown[]>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
  });
}

function openExistingLocalOfflineDb() {
  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(LOCAL_OFFLINE_DB_NAME);
    let upgraded = false;
    request.onupgradeneeded = () => {
      upgraded = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      if (upgraded) {
        request.result.close();
        resolve(null);
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    request.onblocked = () => resolve(null);
  });
}

export async function logLifespaceStorageDiagnostic(
  ownerContext?: LocalArchiveOwnerContext | null
) {
  const catalog = await listIndexedDatabases();
  const hasLocalOfflineDb = catalog.databases.some((item) => item.name === LOCAL_OFFLINE_DB_NAME);
  const remembered = loadRememberedLocalOwnerContext();
  const counts = {
    archives: 0,
    localProject: 0,
    savedLocalCopy: 0,
    cloudOfflineCache: 0,
    records: 0,
    images: 0,
    visibleCloudCache: 0,
  };

  if (hasLocalOfflineDb) {
    const db = await openExistingLocalOfflineDb();
    if (db) {
      try {
        const [archives, records, images] = await Promise.all([
          readonlyGetAll(db, "archives"),
          readonlyGetAll(db, "records"),
          readonlyGetAll(db, "images"),
        ]);
        counts.archives = archives.length;
        counts.records = records.length;
        counts.images = images.length;
        for (const raw of archives) {
          const archive = raw as LocalArchive;
          const role = resolveLocalArchiveRole(archive);
          if (role === "local-project") counts.localProject += 1;
          else if (role === "saved-local-copy") counts.savedLocalCopy += 1;
          else if (role === "cloud-offline-cache") {
            counts.cloudOfflineCache += 1;
            if (isLocalArchiveVisibleToOwner({ ...archive, local_role: role }, ownerContext)) {
              counts.visibleCloudCache += 1;
            }
          }
        }
      } finally {
        db.close();
      }
    }
  }

  const payload = {
    href: typeof window === "undefined" ? null : window.location.href,
    windowOrigin: typeof window === "undefined" ? null : window.location.origin,
    documentOrigin: typeof document === "undefined" ? null : document.location.origin,
    online: typeof navigator === "undefined" ? null : navigator.onLine,
    indexedDbApiAvailable: catalog.apiAvailable,
    indexedDatabases: catalog.databases,
    hasLifeSpaceLocalOffline: hasLocalOfflineDb,
    counts,
    rememberedOwnerUserId: remembered?.userId || null,
    ownerContextUserId: ownerContext?.userId || null,
  };

  console.info(LIFESPACE_STORAGE_DIAGNOSTIC_TAG, payload);
  return payload;
}
