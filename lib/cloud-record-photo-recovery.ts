import { supabase } from "@/lib/supabase";
import { standardizeRecordPhotoFile, createImageThumbnailFile } from "@/lib/image-compression";
import { uploadMediaStorageObject } from "@/lib/media-storage-upload";
import { reserveStorageUpload, settleStorageUploadReservation } from "@/lib/storage-usage";
import { canCreateMembershipContent, normalizeMembershipRpcResult } from "@/lib/membership";
import { isStorageUploadMaintenance } from "@/lib/storage-upload-maintenance";

// Isolated durable journal: never use the legacy offline pending queue.
const DB = "life-space-cloud-photo-recovery-v1";
const STORE = "publications";
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const activeRecoveries = new Map<string, Promise<RecoveryEntry>>();

export type RecoveryPhoto = {
  mediaId: string;
  reservationId: string;
  path: string;
  thumbPath: string | null;
  originalName: string;
  image: Blob;
  thumbnail: Blob | null;
  imageHash: string;
  thumbHash: string | null;
  width: number | null;
  height: number | null;
};
export type RecoveryEntry = {
  key: string;
  version: 1;
  ownerId: string;
  archiveId: string;
  requestId: string;
  recordId: string | null;
  recordProof?: "create-receipt";
  note: string;
  phase: "prepared" | "record-confirmed" | "media-unknown" | "media-confirmed";
  lastError?: string;
  photos: RecoveryPhoto[];
};

function entryKey(ownerId: string, archiveId: string, requestId: string) {
  if (![ownerId, archiveId, requestId].every((item) => UUID.test(item)))
    throw new Error("recovery_invalid_identifiers");
  return ownerId + ":" + archiveId + ":" + requestId;
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("recovery_db_open_failed"));
    request.onblocked = () => reject(new Error("recovery_db_blocked"));
  });
}

async function queryDb<T>(mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      let result: T;
      req.onsuccess = () => { result = req.result; };
      req.onerror = () => reject(req.error || new Error("recovery_db_request_failed"));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("recovery_db_transaction_failed"));
      tx.onabort = () => reject(tx.error || new Error("recovery_db_transaction_aborted"));
    });
  } finally { db.close(); }
}

export async function readRecovery(ownerId: string, archiveId: string, requestId: string) {
  const entry = await queryDb<RecoveryEntry | undefined>("readonly",
    (store) => store.get(entryKey(ownerId, archiveId, requestId)));
  if (!entry) return null;
  if (entry.ownerId !== ownerId || entry.archiveId !== archiveId ||
      entry.requestId !== requestId || entry.version !== 1 ||
      !Array.isArray(entry.photos)) throw new Error("recovery_journal_identity_mismatch");
  return entry;
}
export async function writeRecovery(entry: RecoveryEntry) {
  if (entry.key !== entryKey(entry.ownerId, entry.archiveId, entry.requestId))
    throw new Error("recovery_bad_key");
  await queryDb<IDBValidKey>("readwrite", (store) => store.put(entry));
}
export async function eraseRecovery(ownerId: string, archiveId: string, requestId: string) {
  await queryDb<undefined>("readwrite",
    (store) => store.delete(entryKey(ownerId, archiveId, requestId)));
}

async function digest(blob: Blob) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function stageRecovery(params: {
  ownerId: string; archiveId: string; requestId: string; note: string; files: File[];
}) {
  const key = entryKey(params.ownerId, params.archiveId, params.requestId);
  if (await readRecovery(params.ownerId, params.archiveId, params.requestId))
    throw new Error("recovery_operation_already_exists");
  const photos: RecoveryPhoto[] = [];
  for (const [index, original] of params.files.entries()) {
    const standardized = await standardizeRecordPhotoFile(original, { requireSanitized: true });
    const thumbnail = await createImageThumbnailFile(standardized.file);
    const safe = standardized.file.name.replace(/[^\w.\-]+/g, "_");
    const temporary = params.ownerId + "/pending/" + params.requestId + "-" + index + "-";
    const originalHash = await digest(standardized.file);
    photos.push({
      mediaId: crypto.randomUUID(), reservationId: crypto.randomUUID(),
      path: temporary + safe,
      thumbPath: thumbnail.wasGenerated ? temporary + "thumb.jpg" : null,
      originalName: original.name, image: standardized.file,
      thumbnail: thumbnail.wasGenerated ? thumbnail.file : null,
      imageHash: originalHash,
      thumbHash: thumbnail.wasGenerated ? await digest(thumbnail.file) : null,
      width: standardized.width ?? null, height: standardized.height ?? null,
    });
  }
  const entry: RecoveryEntry = {
    key, version: 1, ownerId: params.ownerId, archiveId: params.archiveId,
    requestId: params.requestId, recordId: null, note: params.note,
    phase: "prepared", photos,
  };
  await writeRecovery(entry);
  const stored = await readRecovery(params.ownerId, params.archiveId, params.requestId);
  if (!stored || stored.photos.length !== photos.length) throw new Error("recovery_storage_not_durable");
  for (const [index, file] of stored.photos.entries()) {
    if (await digest(file.image) !== photos[index].imageHash)
      throw new Error("recovery_photo_integrity_failed");
  }
  return stored;
}

export async function bindRecoveryRecord(original: RecoveryEntry, receipt: { id: string }) {
  const recordId = receipt.id;
  if (!UUID.test(recordId)) throw new Error("recovery_invalid_record_id");
  const current = await readRecovery(original.ownerId, original.archiveId, original.requestId);
  if (!current || (current.recordId && (current.recordId !== recordId ||
      current.recordProof !== "create-receipt")))
    throw new Error("recovery_record_conflict");
  if (current.recordId) return current;
  const entry: RecoveryEntry = {
    ...current, recordId, recordProof: "create-receipt", phase: "record-confirmed",
    photos: current.photos.map((photo) => ({
      ...photo,
      path: photo.path.replace("/pending/", "/" + recordId + "/"),
      thumbPath: photo.thumbPath?.replace("/pending/", "/" + recordId + "/") || null,
    })),
  };
  await writeRecovery(entry);
  return entry;
}

export async function markRecoveryUnknown(original: RecoveryEntry, cause: unknown) {
  const current = await readRecovery(original.ownerId, original.archiveId, original.requestId);
  if (!current || current.phase === "media-confirmed") return;
  await writeRecovery({
    ...current, phase: "media-unknown",
    lastError: cause instanceof Error ? cause.message.slice(0, 160) : "unknown_failure",
  });
}

async function checkOwner(ownerId: string, archiveId: string, recordId: string) {
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || auth.user?.id !== ownerId) throw new Error("recovery_auth_owner_mismatch");
  const [record, archive] = await Promise.all([
    supabase.from("records").select("id,archive_id,user_id").eq("id", recordId).maybeSingle(),
    supabase.from("archives").select("id,user_id").eq("id", archiveId)
      .eq("user_id", ownerId).maybeSingle(),
  ]);
  if (record.error || archive.error || !record.data || !archive.data ||
      record.data.id !== recordId || record.data.archive_id !== archiveId || record.data.user_id !== ownerId ||
      archive.data.id !== archiveId || archive.data.user_id !== ownerId)
    throw new Error("recovery_record_owner_denied");
}

async function readMedia(photo: RecoveryPhoto, recordId: string, ownerId: string) {
  const { data, error } = await supabase.from("media")
    .select("id,record_id,user_id,storage_path,size_bytes")
    .eq("storage_path", photo.path).limit(2);
  if (error) throw new Error("recovery_media_lookup_failed");
  if ((data || []).length > 1) throw new Error("recovery_duplicate_media_path");
  const row = data?.[0] || null;
  if (row && (row.id !== photo.mediaId || row.record_id !== recordId ||
      row.user_id !== ownerId || row.storage_path !== photo.path))
    throw new Error("recovery_media_identity_conflict");
  return row;
}

async function storageState(path: string, expectedHash: string) {
  const { data, error } = await supabase.storage.from("media").download(path);
  if (error) {
    const status = Number((error as { statusCode?: string | number }).statusCode || 0);
    if ([400, 404].includes(status) && /not.found|does.not.exist/i.test(error.message))
      return "missing" as const;
    throw new Error("recovery_storage_read_unknown");
  }
  if (!data || await digest(data) !== expectedHash) throw new Error("recovery_storage_sha_mismatch");
  return "present" as const;
}

// Idempotent media-only reconciliation: NEVER creates a record or deletes an
// unconfirmed remote object. A missing file is uploaded at its original path.
export function completeRecovery(original: RecoveryEntry) {
  const key = entryKey(original.ownerId, original.archiveId, original.requestId) + ":" + original.recordId;
  const active = activeRecoveries.get(key);
  if (active) return active;
  const work = uploadMissingPhotos(original).finally(() => activeRecoveries.delete(key));
  activeRecoveries.set(key, work);
  return work;
}

async function uploadMissingPhotos(original: RecoveryEntry) {
  const entry = await readRecovery(original.ownerId, original.archiveId, original.requestId);
  if (!entry?.recordId || entry.recordProof !== "create-receipt" || entry.recordId !== original.recordId)
    throw new Error("recovery_record_id_not_confirmed");
  await checkOwner(entry.ownerId, entry.archiveId, entry.recordId);
  if (entry.phase === "media-confirmed") return entry;
  const entitlement = await supabase.rpc("get_my_membership");
  if (entitlement.error || !canCreateMembershipContent(normalizeMembershipRpcResult(entitlement.data)))
    throw new Error("recovery_membership_denied");
  if (await isStorageUploadMaintenance()) throw new Error("recovery_storage_maintenance");

  for (const photo of entry.photos) {
    await checkOwner(entry.ownerId, entry.archiveId, entry.recordId);
    const row = await readMedia(photo, entry.recordId, entry.ownerId);
    const existing = await storageState(photo.path, photo.imageHash);
    if (row && existing !== "present") throw new Error("recovery_metadata_without_file");
    const reserve = await reserveStorageUpload({
      reservationId: photo.reservationId,
      preserveOnUncertainError: true, requireIdempotentReservation: true,
      targetType: "media", targetId: photo.mediaId, targetParentId: entry.recordId,
      storagePath: photo.path, storageBytes: photo.image.size,
      thumbPath: photo.thumbPath, thumbBytes: photo.thumbnail?.size || 0,
    });
    if (!reserve.ok || reserve.reservation_mode !== "reservation")
      throw new Error("recovery_reservation_unconfirmed");
    if (existing === "missing") {
      await checkOwner(entry.ownerId, entry.archiveId, entry.recordId);
      const result = await uploadMediaStorageObject(photo.path,
        new File([photo.image], photo.originalName, { type: photo.image.type }),
        { contentType: photo.image.type || "image/jpeg" });
      if (result.error || await storageState(photo.path, photo.imageHash) !== "present")
        throw new Error("recovery_upload_unknown");
    }
    if (photo.thumbnail && photo.thumbPath && photo.thumbHash) {
      const thumbExists = await storageState(photo.thumbPath, photo.thumbHash);
      if (thumbExists === "missing") {
        await checkOwner(entry.ownerId, entry.archiveId, entry.recordId);
        const result = await uploadMediaStorageObject(photo.thumbPath,
          new File([photo.thumbnail], "thumb.jpg", { type: "image/jpeg" }),
          { contentType: "image/jpeg" });
        if (result.error || await storageState(photo.thumbPath, photo.thumbHash) !== "present")
          throw new Error("recovery_thumbnail_upload_unknown");
      }
    }
    if (!row) {
      await checkOwner(entry.ownerId, entry.archiveId, entry.recordId);
      const size = photo.image.size + (photo.thumbnail?.size || 0);
      const payload = {
        id: photo.mediaId, record_id: entry.recordId, user_id: entry.ownerId,
        type: "image", url: null, storage_path: photo.path, thumb_path: photo.thumbPath,
        thumb_url: null, mime_type: photo.image.type || "image/jpeg",
        original_filename: photo.originalName,
        size_mb: size / (1024 * 1024), size_bytes: size,
        width: photo.width, height: photo.height,
        storage_class: "hot", upload_reservation_id: photo.reservationId,
      };
      const { error } = await supabase.from("media").insert([payload]).select("id").single();
      if (error && !(await readMedia(photo, entry.recordId, entry.ownerId)))
        throw new Error("recovery_media_insert_unknown");
    }
    if (!(await readMedia(photo, entry.recordId, entry.ownerId)) ||
        await storageState(photo.path, photo.imageHash) !== "present")
      throw new Error("recovery_media_commit_unconfirmed");
    const settled = await settleStorageUploadReservation({
      reservation: { reservation_id: photo.reservationId,
        reservation_mode: "reservation",
        reserved_bytes: photo.image.size + (photo.thumbnail?.size || 0) },
      targetType: "media", targetId: photo.mediaId,
      legacyActualBytes: photo.image.size + (photo.thumbnail?.size || 0),
    });
    if (!settled.ok) throw new Error("recovery_reservation_settle_unknown");
  }
  const complete: RecoveryEntry = { ...entry, phase: "media-confirmed" };
  await writeRecovery(complete);
  return complete;
}
