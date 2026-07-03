import type { ArchiveCategory } from "@/lib/archive-categories";

const DB_NAME = "life-space-local-offline";
const DB_VERSION = 1;
const ARCHIVE_STORE = "archives";
const RECORD_STORE = "records";
const IMAGE_STORE = "images";
const MAX_LOCAL_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_LOCAL_IMAGE_EDGE = 1600;
const LOCAL_IMAGE_QUALITY = 0.82;

export type LocalSyncStatus = "local-only" | "pending-cloud-sync" | "synced";

export type LocalSyncMeta = {
  status: LocalSyncStatus;
  cloud_archive_id?: string | null;
  cloud_record_id?: string | null;
  last_sync_at?: string | null;
};

export type LocalArchive = {
  id: string;
  title: string;
  category: ArchiveCategory;
  system_name?: string | null;
  note?: string | null;
  status: "active" | "ended";
  created_at: string;
  updated_at: string;
  local_only: true;
  sync: LocalSyncMeta;
};

export type LocalRecord = {
  id: string;
  archive_id: string;
  note: string;
  record_time: string;
  created_at: string;
  updated_at: string;
  local_only: true;
  sync: LocalSyncMeta;
};

export type LocalImage = {
  id: string;
  archive_id: string;
  record_id: string;
  blob: Blob;
  mime_type: string;
  name: string;
  original_size: number;
  cached_size: number;
  width?: number | null;
  height?: number | null;
  sort_order: number;
  created_at: string;
  local_only: true;
  sync: LocalSyncMeta;
};

export type LocalArchiveSummary = LocalArchive & {
  record_count: number;
  image_count: number;
  latest_record_time?: string | null;
  latest_record_note?: string | null;
  cover_image?: LocalImage | null;
};

export type LocalRecordWithImages = LocalRecord & {
  images: LocalImage[];
};

export type LocalArchiveDetail = {
  archive: LocalArchive;
  records: LocalRecordWithImages[];
};

export function assertLocalOfflineAvailable() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw new Error("当前浏览器不支持本地离线存储。");
  }
}

function createId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${random}`;
}

function nowIso() {
  return new Date().toISOString();
}

function localSyncMeta(extra?: Partial<LocalSyncMeta>): LocalSyncMeta {
  return {
    status: "local-only",
    cloud_archive_id: null,
    cloud_record_id: null,
    last_sync_at: null,
    ...extra,
  };
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 操作失败"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("IndexedDB 事务失败"));
    transaction.onabort = () =>
      reject(transaction.error || new Error("IndexedDB 事务已取消"));
  });
}

function openLocalDb() {
  assertLocalOfflineAvailable();

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ARCHIVE_STORE)) {
        const store = db.createObjectStore(ARCHIVE_STORE, { keyPath: "id" });
        store.createIndex("updated_at", "updated_at");
        store.createIndex("category", "category");
        store.createIndex("sync_status", "sync.status");
      }

      if (!db.objectStoreNames.contains(RECORD_STORE)) {
        const store = db.createObjectStore(RECORD_STORE, { keyPath: "id" });
        store.createIndex("archive_id", "archive_id");
        store.createIndex("record_time", "record_time");
        store.createIndex("sync_status", "sync.status");
      }

      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        const store = db.createObjectStore(IMAGE_STORE, { keyPath: "id" });
        store.createIndex("archive_id", "archive_id");
        store.createIndex("record_id", "record_id");
        store.createIndex("created_at", "created_at");
        store.createIndex("sync_status", "sync.status");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败"));
  });
}

async function getAllRows<T>(storeName: string) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const rows = await requestToPromise<T[]>(
      transaction.objectStore(storeName).getAll()
    );
    await done;
    return rows;
  } finally {
    db.close();
  }
}

async function getRowById<T>(storeName: string, id: string) {
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const row = await requestToPromise<T | undefined>(
      transaction.objectStore(storeName).get(id)
    );
    await done;
    return row || null;
  } finally {
    db.close();
  }
}

function updateLocalUsageHints(archiveCount: number, recordCount: number) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem("lifespace_local_project_count", String(archiveCount));
  window.localStorage.setItem("lifespace_local_record_count", String(recordCount));
  if (!window.localStorage.getItem("lifespace_first_local_used_at")) {
    window.localStorage.setItem("lifespace_first_local_used_at", nowIso());
  }
}

async function refreshLocalUsageHints() {
  const [archives, records] = await Promise.all([
    getAllRows<LocalArchive>(ARCHIVE_STORE),
    getAllRows<LocalRecord>(RECORD_STORE),
  ]);

  updateLocalUsageHints(archives.length, records.length);
}

function buildSummary(
  archive: LocalArchive,
  records: LocalRecord[],
  images: LocalImage[]
): LocalArchiveSummary {
  const archiveRecords = records
    .filter((record) => record.archive_id === archive.id)
    .sort(
      (a, b) =>
        new Date(b.record_time || b.created_at).getTime() -
        new Date(a.record_time || a.created_at).getTime()
    );
  const archiveImages = images.filter((image) => image.archive_id === archive.id);
  const latestRecord = archiveRecords[0] || null;
  const coverRecord = archiveRecords.find((record) =>
    archiveImages.some((image) => image.record_id === record.id)
  );
  const coverImage =
    (coverRecord &&
      archiveImages
        .filter((image) => image.record_id === coverRecord.id)
        .sort((a, b) => a.sort_order - b.sort_order)[0]) ||
    archiveImages.sort((a, b) => a.sort_order - b.sort_order)[0] ||
    null;

  return {
    ...archive,
    record_count: archiveRecords.length,
    image_count: archiveImages.length,
    latest_record_time: latestRecord?.record_time || null,
    latest_record_note: latestRecord?.note || null,
    cover_image: coverImage,
  };
}

export async function listLocalArchiveSummaries() {
  const [archives, records, images] = await Promise.all([
    getAllRows<LocalArchive>(ARCHIVE_STORE),
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);

  updateLocalUsageHints(archives.length, records.length);

  return archives
    .map((archive) => buildSummary(archive, records, images))
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime()
    );
}

export async function createLocalArchive(input: {
  title: string;
  category: ArchiveCategory;
  system_name?: string | null;
  note?: string | null;
}) {
  const timestamp = nowIso();
  const archive: LocalArchive = {
    id: createId("local_archive"),
    title: input.title.trim(),
    category: input.category,
    system_name: input.system_name?.trim() || null,
    note: input.note?.trim() || null,
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
    local_only: true,
    sync: localSyncMeta(),
  };
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(ARCHIVE_STORE, "readwrite");
    const done = transactionDone(transaction);
    await requestToPromise(transaction.objectStore(ARCHIVE_STORE).add(archive));
    await done;
    await refreshLocalUsageHints();
    return archive;
  } finally {
    db.close();
  }
}

export async function getLocalArchiveDetail(archiveId: string) {
  const [archive, records, images] = await Promise.all([
    getRowById<LocalArchive>(ARCHIVE_STORE, archiveId),
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);

  if (!archive) return null;

  const imageMap = new Map<string, LocalImage[]>();
  images
    .filter((image) => image.archive_id === archiveId)
    .forEach((image) => {
      const list = imageMap.get(image.record_id) || [];
      list.push(image);
      imageMap.set(image.record_id, list);
    });

  const detailRecords = records
    .filter((record) => record.archive_id === archiveId)
    .sort(
      (a, b) =>
        new Date(b.record_time || b.created_at).getTime() -
        new Date(a.record_time || a.created_at).getTime()
    )
    .map((record) => ({
      ...record,
      images: (imageMap.get(record.id) || []).sort(
        (a, b) => a.sort_order - b.sort_order
      ),
    }));

  return { archive, records: detailRecords } satisfies LocalArchiveDetail;
}

function ensureLocalImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} 不是图片文件。`);
  }

  if (file.size > MAX_LOCAL_IMAGE_BYTES) {
    throw new Error(`${file.name} 超过 25MB，请先选择较小的图片。`);
  }
}

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败"));
    image.src = url;
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("图片缓存生成失败"));
      },
      mimeType,
      quality
    );
  });
}

async function prepareLocalImage(file: File, sortOrder: number) {
  ensureLocalImageFile(file);

  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return {
      blob: file,
      mime_type: file.type,
      original_size: file.size,
      cached_size: file.size,
      name: file.name || `local-image-${sortOrder + 1}`,
      width: null,
      height: null,
    };
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageElement(objectUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const maxEdge = Math.max(sourceWidth, sourceHeight);
    const scale = maxEdge > MAX_LOCAL_IMAGE_EDGE ? MAX_LOCAL_IMAGE_EDGE / maxEdge : 1;
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片缓存生成失败");

    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, "image/jpeg", LOCAL_IMAGE_QUALITY);

    return {
      blob,
      mime_type: "image/jpeg",
      original_size: file.size,
      cached_size: blob.size,
      name: file.name || `local-image-${sortOrder + 1}.jpg`,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function createLocalRecord(input: {
  archive_id: string;
  note: string;
  image_files?: File[];
}) {
  const note = input.note.trim();
  const files = input.image_files || [];

  if (!note && files.length === 0) {
    throw new Error("请填写记录内容，或至少选择一张图片。");
  }

  const timestamp = nowIso();
  const record: LocalRecord = {
    id: createId("local_record"),
    archive_id: input.archive_id,
    note,
    record_time: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    local_only: true,
    sync: localSyncMeta(),
  };
  const preparedImages = await Promise.all(
    files.map((file, index) => prepareLocalImage(file, index))
  );
  const images: LocalImage[] = preparedImages.map((image, index) => ({
    id: createId("local_image"),
    archive_id: input.archive_id,
    record_id: record.id,
    blob: image.blob,
    mime_type: image.mime_type,
    name: image.name,
    original_size: image.original_size,
    cached_size: image.cached_size,
    width: image.width,
    height: image.height,
    sort_order: index,
    created_at: timestamp,
    local_only: true,
    sync: localSyncMeta(),
  }));
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);
    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(input.archive_id)
    );

    if (!archive) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("本地项目不存在。");
    }

    await requestToPromise(recordStore.add(record));
    for (const image of images) {
      await requestToPromise(imageStore.add(image));
    }

    archive.updated_at = timestamp;
    archive.sync = localSyncMeta();
    await requestToPromise(archiveStore.put(archive));
    await done;
    await refreshLocalUsageHints();

    return record;
  } finally {
    db.close();
  }
}

export async function deleteLocalRecord(recordId: string) {
  const record = await getRowById<LocalRecord>(RECORD_STORE, recordId);
  if (!record) return;

  const images = await getAllRows<LocalImage>(IMAGE_STORE);
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const archiveStore = transaction.objectStore(ARCHIVE_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);

    await requestToPromise(transaction.objectStore(RECORD_STORE).delete(recordId));
    for (const image of images.filter((item) => item.record_id === recordId)) {
      await requestToPromise(imageStore.delete(image.id));
    }

    const archive = await requestToPromise<LocalArchive | undefined>(
      archiveStore.get(record.archive_id)
    );
    if (archive) {
      archive.updated_at = nowIso();
      await requestToPromise(archiveStore.put(archive));
    }

    await done;
    await refreshLocalUsageHints();
  } finally {
    db.close();
  }
}

export async function deleteLocalArchive(archiveId: string) {
  const [records, images] = await Promise.all([
    getAllRows<LocalRecord>(RECORD_STORE),
    getAllRows<LocalImage>(IMAGE_STORE),
  ]);
  const db = await openLocalDb();

  try {
    const transaction = db.transaction(
      [ARCHIVE_STORE, RECORD_STORE, IMAGE_STORE],
      "readwrite"
    );
    const done = transactionDone(transaction);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const imageStore = transaction.objectStore(IMAGE_STORE);

    for (const record of records.filter((item) => item.archive_id === archiveId)) {
      await requestToPromise(recordStore.delete(record.id));
    }
    for (const image of images.filter((item) => item.archive_id === archiveId)) {
      await requestToPromise(imageStore.delete(image.id));
    }
    await requestToPromise(transaction.objectStore(ARCHIVE_STORE).delete(archiveId));
    await done;
    await refreshLocalUsageHints();
  } finally {
    db.close();
  }
}
