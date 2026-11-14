// QA-only bookkeeping for completed Supabase uploads awaiting R2 shadow mirroring.
// The key and value contain only Owner/media UUIDs and a variant; never tokens or paths.
const PREFIX = "lifespace:r2-qa-mirror:v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PendingR2Mirror = {
  ownerId: string;
  mediaId: string;
  needsThumb: boolean;
  nextVariant: "full" | "thumb";
};

function storage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage || null : null; }
  catch { return null; }
}

function key(ownerId: string, mediaId: string): string {
  return PREFIX + ownerId.toLowerCase() + ":" + mediaId.toLowerCase();
}

function valid(entry: PendingR2Mirror): boolean {
  return UUID.test(entry.ownerId) && UUID.test(entry.mediaId) &&
    typeof entry.needsThumb === "boolean" &&
    (entry.nextVariant === "full" || (entry.nextVariant === "thumb" && entry.needsThumb));
}

function decode(value: string | null, ownerId: string, mediaId: string): PendingR2Mirror | null | undefined {
  if (value === null) return null;
  try {
    const decoded = JSON.parse(value) as PendingR2Mirror;
    if (!decoded || !valid(decoded) ||
        decoded.ownerId.toLowerCase() !== ownerId.toLowerCase() ||
        decoded.mediaId.toLowerCase() !== mediaId.toLowerCase()) return undefined;
    return decoded;
  } catch { return undefined; }
}

// null = no entry, undefined = storage unavailable or invalid: fail closed.
export function readPendingR2Mirror(ownerId: string, mediaId: string): PendingR2Mirror | null | undefined {
  if (!UUID.test(ownerId) || !UUID.test(mediaId)) return undefined;
  const store = storage();
  if (!store) return undefined;
  try { return decode(store.getItem(key(ownerId, mediaId)), ownerId, mediaId); }
  catch { return undefined; }
}

export function writePendingR2Mirror(entry: PendingR2Mirror): boolean {
  if (!valid(entry)) return false;
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key(entry.ownerId, entry.mediaId), JSON.stringify({
      ownerId: entry.ownerId.toLowerCase(),
      mediaId: entry.mediaId.toLowerCase(),
      needsThumb: entry.needsThumb,
      nextVariant: entry.nextVariant,
    }));
    return true;
  } catch { return false; }
}

export function clearPendingR2Mirror(ownerId: string, mediaId: string): boolean {
  const store = storage();
  if (!store || !UUID.test(ownerId) || !UUID.test(mediaId)) return false;
  try { store.removeItem(key(ownerId, mediaId)); return true; }
  catch { return false; }
}

// null signals an unreadable/corrupt journal; do not silently discard entries.
export function listPendingR2Mirrors(ownerId: string): PendingR2Mirror[] | null {
  if (!UUID.test(ownerId)) return null;
  const store = storage();
  if (!store) return null;
  const prefix = PREFIX + ownerId.toLowerCase() + ":";
  const entries: PendingR2Mirror[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const itemKey = store.key(i);
      if (!itemKey?.startsWith(prefix)) continue;
      const mediaId = itemKey.slice(prefix.length);
      const entry = decode(store.getItem(itemKey), ownerId, mediaId);
      if (!entry || !valid(entry)) return null;
      entries.push(entry);
    }
    return entries.sort((a, b) => a.mediaId.localeCompare(b.mediaId));
  } catch { return null; }
}
