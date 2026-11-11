import { Capacitor, registerPlugin } from "@capacitor/core";

type GalleryResponse = { status: "selected" | "canceled"; count: number; truncated?: boolean; requestId?: string };
type GalleryPhoto = { name: string; mime: string; data: string };
type RecordGallery = {
  pick(options?: { requestId?: string }): Promise<GalleryResponse>;
  read(options: { index: number; requestId?: string }): Promise<GalleryPhoto>;
  clear(options?: { requestId: string }): Promise<void>;
};

const gallery = registerPlugin<RecordGallery>("RecordGallery");

export function isAndroidRecordGallery() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function pickAndroidRecordPhotos(options?: { requestId: string }): Promise<{ files: File[]; truncated: boolean }> {
  // Preserve the old no-argument picker contract for local RecordForm.
  const selection = options ? await gallery.pick({ requestId: options.requestId }) : await gallery.pick();
  if (options && selection?.requestId !== options.requestId) throw new Error("gallery_request_mismatch");
  return readSelectedGalleryPhotos(selection);
}

export async function readRestoredAndroidRecordPhotos(
  selection: GalleryResponse,
): Promise<{ files: File[]; truncated: boolean }> {
  return readSelectedGalleryPhotos(selection);
}

async function readSelectedGalleryPhotos(selection: GalleryResponse): Promise<{ files: File[]; truncated: boolean }> {
  if (selection?.status === "canceled") return { files: [], truncated: false };
  // A confirmed native selection with no readable result is an error, not a
  // user cancellation or an invisible zero-photo success.
  if (selection?.status !== "selected" ||
      !Number.isSafeInteger(selection.count) ||
      selection.count < 1 || selection.count > 10) {
    throw new Error("gallery_result_unreadable");
  }
  const files: File[] = [];
  try {
    for (let index = 0; index < selection.count; index++) {
      const photo = await gallery.read({ index, requestId: selection.requestId });
      if (!photo || !photo.mime?.startsWith("image/") ||
          !photo.name || !photo.data) {
        throw new Error("gallery_photo_unavailable");
      }
      const decoded = atob(photo.data);
      const bytes = new Uint8Array(decoded.length);
      for (let byte = 0; byte < decoded.length; byte++) bytes[byte] = decoded.charCodeAt(byte);
      files.push(new File([bytes], photo.name, { type: photo.mime }));
    }
    return { files, truncated: Boolean(selection.truncated) };
  } finally {
    // Cleanup failure cannot discard successfully read, ordered photos.
    const cleanup = selection.requestId
      ? gallery.clear({ requestId: selection.requestId }) : gallery.clear();
    await cleanup.catch(() => undefined);
  }
}

// One private, single-use interruption marker; NOT a drafts list or pending queue.
// Written immediately before the cloud composer launches an Android picker,
// erased on normal return, explicit abandon, or confirmed complete publication.
const CLOUD_PICK_RESUME_KEY = "lifespace-cloud-record-picker-once-v1";

export type CloudPickerFields = {
  text: string;
  timeMode: string;
  customTime: string;
  visibility: "private" | "public";
  splitByDate: boolean;
  isHelpRecord: boolean;
  selectedCycleId: string | null;
  endSelectedCycleAfterSave: boolean;
  previousPhotoCount: number;
};

export type CloudPickerResume = {
  version: 1;
  ownerId: string;
  archiveId: string;
  requestId: string;
  phase: "picking" | "selected" | "canceled" | "unavailable" | "submitting-unknown" | "reconcile-only";
  fields: CloudPickerFields;
  result?: GalleryResponse;
};

function publicationKey(ownerId: string, archiveId: string) {
  return JSON.stringify([CLOUD_PICK_RESUME_KEY, ownerId, archiveId]);
}

function isUnconfirmedPublication(entry: CloudPickerResume) {
  return entry.phase === "submitting-unknown" || entry.phase === "reconcile-only";
}

function readCloudPickerResume(key = CLOUD_PICK_RESUME_KEY): CloudPickerResume | null {
  if (!isAndroidRecordGallery() || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const entry = value as CloudPickerResume;
    if (entry.version !== 1 || typeof entry.ownerId !== "string" ||
      typeof entry.archiveId !== "string" || !/^[0-9a-f-]{36}$/i.test(entry.requestId) ||
      !["picking", "selected", "canceled", "unavailable", "submitting-unknown", "reconcile-only"].includes(entry.phase) ||
      !entry.fields || typeof entry.fields.text !== "string" ||
      typeof entry.fields.timeMode !== "string" || typeof entry.fields.customTime !== "string" ||
      !Number.isInteger(entry.fields.previousPhotoCount)) return null;
    return entry;
  } catch {
    return null;
  }
}

export function peekCloudPickerResume(ownerId: string, archiveId: string): CloudPickerResume | null {
  const entry = readCloudPickerResume(publicationKey(ownerId, archiveId)) || readCloudPickerResume();
  return entry?.ownerId === ownerId && entry.archiveId === archiveId ? entry : null;
}

export function saveCloudPickerResume(entry: CloudPickerResume): void {
  if (!isAndroidRecordGallery() || typeof window === "undefined") return;
  // A failed commit must prevent leaving the editor for an external Activity.
  const active = readCloudPickerResume();
  if (active && isUnconfirmedPublication(active)) {
    // Upgrade a legacy marker before replacing the single Activity slot.
    const key = publicationKey(active.ownerId, active.archiveId);
    if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, JSON.stringify(active));
    window.localStorage.removeItem(CLOUD_PICK_RESUME_KEY);
  }
  const key = isUnconfirmedPublication(entry)
    ? publicationKey(entry.ownerId, entry.archiveId) : CLOUD_PICK_RESUME_KEY;
  window.localStorage.setItem(key, JSON.stringify(entry));
}

export function clearCloudPickerResume(ownerId: string, archiveId: string, requestId?: string): void {
  const entry = peekCloudPickerResume(ownerId, archiveId);
  if (!entry || (requestId && entry.requestId !== requestId)) return;
  const key = publicationKey(ownerId, archiveId);
  const scoped = readCloudPickerResume(key);
  if (scoped?.requestId === entry.requestId) window.localStorage.removeItem(key);
  const active = readCloudPickerResume();
  if (active?.requestId === entry.requestId && active.ownerId === ownerId &&
      active.archiveId === archiveId) window.localStorage.removeItem(CLOUD_PICK_RESUME_KEY);
}

export function consumeCloudPickerResume(ownerId: string, archiveId: string): CloudPickerResume | null {
  const entry = peekCloudPickerResume(ownerId, archiveId);
  if (!entry) return null;
  // Keep an uncertain remote-publication marker until explicit abandon or
  // confirmed server outcome. Gallery interruption recovery is strictly once.
  if (entry.phase !== "submitting-unknown" && entry.phase !== "reconcile-only") {
    clearCloudPickerResume(ownerId, archiveId, entry.requestId);
  }
  return entry;
}

// Explicitly leaving an uncertain publication discards display text only.
// The minimal owner/project/request identity remains until a separate
// confirmed cloud reconciliation, so a new editor cannot blindly repost.
export function retainCloudPublicationReconciliation(ownerId: string, archiveId: string): void {
  const entry = peekCloudPickerResume(ownerId, archiveId);
  if (!entry || entry.phase !== "submitting-unknown") return;
  saveCloudPickerResume({ ...entry, phase: "reconcile-only", result: undefined,
    fields: { text: "", timeMode: "now", customTime: "", visibility: "private",
      splitByDate: false, isHelpRecord: false, selectedCycleId: null,
      endSelectedCycleAfterSave: false, previousPhotoCount: 0 },
  });
}

export function rememberRestoredCloudPickerResult(event: {
  pluginId: string;
  methodName: string;
  success: boolean;
  data?: unknown;
}): void {
  if (event.pluginId !== "RecordGallery" || event.methodName !== "pick") return;
  const current = readCloudPickerResume();
  if (!current || current.phase !== "picking") return;
  const result = event.data;
  if (!result || typeof result !== "object") return;
  const response = result as GalleryResponse;
  // Uncorrelated or late responses must never reopen another owner/project.
  if (response.requestId !== current.requestId) return;
  if (event.success && response.status === "selected" &&
    Number.isSafeInteger(response.count) && response.count >= 1 && response.count <= 10) {
    saveCloudPickerResume({ ...current, phase: "selected", result: response });
  } else if (event.success && response.status === "canceled") {
    saveCloudPickerResume({ ...current, phase: "canceled" });
  } else {
    saveCloudPickerResume({ ...current, phase: "unavailable" });
  }
}
