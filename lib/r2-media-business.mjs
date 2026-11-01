/**
 * R2 business-photo shadow candidate. No production routing, DB updates or
 * Supabase Storage deletion. The current Storage reservation/settlement path
 * remains authoritative until an independently approved cutover.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
// This private bucket is already dedicated to business media. Keys must be
// owner-prefixed to match the C-group R2 adapter; do not add a second prefix.

export function businessMediaPath(path, ownerId) {
  if (typeof ownerId !== "string" || !UUID.test(ownerId)) return null;
  if (typeof path !== "string" || !path || path !== path.trim()) return null;
  if (path.length > 1024 || path.startsWith("/") || path.includes("\\") ||
      path.includes("?") || path.includes("#") || /[\x00-\x1f\x7f]/.test(path)) return null;
  const parts = path.split("/");
  if (parts.length < 2 || parts.some((part) => !part || part === "." || part === "..")) return null;
  if (parts[0].toLowerCase() !== ownerId.toLowerCase()) return null;
  return path;
}

export function r2BusinessKey(path, ownerId) {
  const clean = businessMediaPath(path, ownerId);
  return clean;
}

export function extractLegacyMediaPath(url, ownerId, sourceOrigin) {
  if (!url || !sourceOrigin) return null;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(sourceOrigin).origin) return null;
    const marker = /^\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/media\/(.+)$/;
    const match = parsed.pathname.match(marker);
    if (!match) return null;
    const raw = match[1].split("/").map(decodeURIComponent).join("/");
    return businessMediaPath(raw, ownerId);
  } catch {
    return null;
  }
}

/**
 * Deduped list of actual media-bucket objects referenced by business tables.
 * Covers and experience-card IDs reuse their source picture key.
 * Avatars and payment-proofs are separate buckets, intentionally excluded.
 */
export function collectR2MediaCandidates(data, sourceOrigin) {
  const entries = new Map();
  const unresolved = [];
  const groups = [
    ["media", data.media || [], [["storage_path", "url", "full"], ["thumb_path", "thumb_url", "thumb"]]],
    ["records", data.records || [], [["primary_image_path", "primary_image_url", "full"], ["primary_thumb_path", "primary_thumb_url", "thumb"]]],
    ["archives", data.archives || [], [["cover_image_path", "cover_image_url", "full"], ["cover_thumb_path", "cover_thumb_url", "thumb"]]],
    ["market_posts", data.market_posts || [], [["cover_image_path", "cover_image_url", "full"], ["cover_thumb_path", "cover_thumb_url", "thumb"]]],
    ["market_media", data.market_media || [], [["path", "url", "full"], ["thumb_path", "thumb_url", "thumb"]]],
  ];
  for (const [table, rows, columns] of groups) {
    for (const row of rows) {
      const ownerId = row.user_id;
      for (const [pathCol, urlCol, kind] of columns) {
        const present = row[pathCol] || row[urlCol];
        if (!present) continue;
        const path = row[pathCol]
          ? businessMediaPath(row[pathCol], ownerId)
          : extractLegacyMediaPath(row[urlCol], ownerId, sourceOrigin);
        if (!path) {
          unresolved.push({ table, id: String(row.id || ""), field: pathCol, reason: "invalid_or_external_path" });
          continue;
        }
        const key = r2BusinessKey(path, ownerId);
        const reference = { table, id: String(row.id || ""), kind };
        if (entries.has(key)) entries.get(key).references.push(reference);
        else entries.set(key, { key, path, ownerId, references: [reference] });
      }
    }
  }
  return { entries: Array.from(entries.values()), unresolved };
}

export async function sha256Hex(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function validateExpected(expectedBytes, expectedSha256) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > MAX_IMAGE_BYTES ||
      typeof expectedSha256 !== "string" || !SHA256.test(expectedSha256)) {
    throw new Error("invalid_manifest_integrity");
  }
}

async function verifiedR2Bytes(bucket, key, expectedBytes, expectedSha256, expectedContentType = null) {
  const object = await bucket.get(key);
  if (!object) return null;
  if (object.size !== undefined && object.size !== expectedBytes) throw new Error("r2_size_mismatch");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== expectedBytes || (await sha256Hex(bytes)) !== expectedSha256) {
    throw new Error("r2_sha256_or_size_mismatch");
  }
  const contentType = object.httpMetadata?.contentType || "application/octet-stream";
  if (expectedContentType && contentType.toLowerCase() !== expectedContentType.toLowerCase()) {
    throw new Error("r2_content_type_mismatch");
  }
  return { bytes, contentType };
}

/**
 * Immutable/idempotent R2 copy. The source blob is always read and hashed first.
 * Existing destination mismatches STOP: never overwrite an unrelated R2 object.
 * Concurrent copies must use a per-key exclusive runner/conditional put.
 */
export async function stageVerifiedR2Photo({ bucket, ownerId, path, sourceBytes, contentType, expectedBytes, expectedSha256 }) {
  const key = r2BusinessKey(path, ownerId);
  if (!key) throw new Error("unsafe_or_foreign_media_path");
  validateExpected(expectedBytes, expectedSha256);
  if (!/^image\/(?:jpeg|png|webp|gif|avif|heic|heif)$/i.test(contentType || "")) {
    throw new Error("unsupported_media_content_type");
  }
  const bytes = sourceBytes instanceof Uint8Array ? sourceBytes : new Uint8Array(sourceBytes);
  if (bytes.byteLength !== expectedBytes || (await sha256Hex(bytes)) !== expectedSha256) {
    throw new Error("source_sha256_or_size_mismatch");
  }

  if (await verifiedR2Bytes(bucket, key, expectedBytes, expectedSha256, contentType)) {
    return { key, path, bytes: expectedBytes, sha256: expectedSha256, status: "already_verified" };
  }
  const result = await bucket.put(key, bytes, {
    // A race must not overwrite an existing copy.
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType, cacheControl: "private, no-store" },
    customMetadata: { sha256: expectedSha256, sourceBucket: "media", ownerId },
  });
  if (!result && !(await verifiedR2Bytes(bucket, key, expectedBytes, expectedSha256, contentType))) {
    throw new Error("r2_conditional_copy_failed");
  }
  await verifiedR2Bytes(bucket, key, expectedBytes, expectedSha256, contentType);
  return { key, path, bytes: expectedBytes, sha256: expectedSha256, status: result ? "copied_verified" : "already_verified" };
}

export async function readVerifiedR2Photo({ bucket, ownerId, path, expectedBytes, expectedSha256 }) {
  const key = r2BusinessKey(path, ownerId);
  if (!key) throw new Error("unsafe_or_foreign_media_path");
  validateExpected(expectedBytes, expectedSha256);
  const result = await verifiedR2Bytes(bucket, key, expectedBytes, expectedSha256);
  if (!result) throw new Error("r2_object_missing");
  return result;
}

function toBase64Url(data) {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(encoded) {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 4096) throw new Error("invalid_read_ticket");
  const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
async function signingKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("signing_secret_missing");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createR2ReadTicket({ secret, ownerId, path, expectedBytes, expectedSha256, now = Date.now(), ttlSeconds = 120 }) {
  if (!r2BusinessKey(path, ownerId)) throw new Error("unsafe_or_foreign_media_path");
  validateExpected(expectedBytes, expectedSha256);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) throw new Error("invalid_ticket_ttl");
  const payload = { v: 1, ownerId, path, bytes: expectedBytes, sha256: expectedSha256, exp: Math.floor(now / 1000) + ttlSeconds };
  const data = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign("HMAC", await signingKey(secret), new TextEncoder().encode(data));
  return data + "." + toBase64Url(new Uint8Array(mac));
}

export async function verifyR2ReadTicket(ticket, secret, now = Date.now()) {
  try {
    if (typeof ticket !== "string" || ticket.length > 4096) return null;
    const parts = ticket.split(".");
    if (parts.length !== 2) return null;
    const signed = new TextEncoder().encode(parts[0]);
    const signature = fromBase64Url(parts[1]);
    if (signature.byteLength !== 32 || !(await crypto.subtle.verify("HMAC", await signingKey(secret), signature, signed))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
    if (payload.v !== 1 || !r2BusinessKey(payload.path, payload.ownerId)) return null;
    validateExpected(payload.bytes, payload.sha256);
    const current = Math.floor(now / 1000);
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= current || payload.exp > current + 300) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Only R2 copies may be removed; caller must present a settled delete job
 * and recheck shared business references at deletion time. Never touch Storage.
 */
export async function deleteUnreferencedR2Copy({ bucket, ownerId, path, deletionJobConfirmed, hasCurrentReferences }) {
  const key = r2BusinessKey(path, ownerId);
  if (!key) throw new Error("unsafe_or_foreign_media_path");
  if (deletionJobConfirmed !== true || typeof hasCurrentReferences !== "function") {
    throw new Error("deletion_authority_missing");
  }
  if (await hasCurrentReferences(path)) return { status: "retained_shared", key };
  await bucket.delete(key);
  if (await bucket.head(key)) throw new Error("r2_delete_not_confirmed");
  return { status: "r2_copy_deleted", key };
}
