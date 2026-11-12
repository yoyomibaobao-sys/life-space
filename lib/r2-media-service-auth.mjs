const OWNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{22,128}$/;
const MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "image/avif", "image/heic", "image/heif",
]);

export const R2_BUSINESS_STAGE_BYTES_PATH = "/__internal/r2/business-media/stage-bytes";
export const R2_MEDIA_SERVICE_MAX_SKEW_SECONDS = 60;

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function fromHex(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), (pair) => Number.parseInt(pair, 16));
}
function canonicalPayload({ ownerId, path, bytes, sha256, contentType, timestamp, nonce }) {
  return [
    "POST",
    R2_BUSINESS_STAGE_BYTES_PATH,
    ownerId,
    path,
    String(bytes),
    sha256,
    contentType,
    String(timestamp),
    nonce,
  ].join("\n");
}
async function signingKey(secret, usages) {
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("r2_media_service_secret_missing");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

export function createR2MediaServiceNonce() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

/** Shared by the trusted site Worker when it calls the media Worker binding. */
export async function createR2MediaServiceHeaders({
  secret,
  ownerId,
  path,
  bytes,
  sha256,
  contentType,
  timestamp = Math.floor(Date.now() / 1000),
  nonce = createR2MediaServiceNonce(),
}) {
  const mime = typeof contentType === "string" ? contentType.trim().toLowerCase() : "";
  if (!OWNER.test(ownerId || "") ||
      typeof path !== "string" || !path || path.length > 1024 ||
      path.startsWith("/") || path.includes("\\") || path.includes("?") || path.includes("#") ||
      /[\x00-\x1f\x7f]/.test(path) ||
      !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 25 * 1024 * 1024 ||
      !SHA256.test(sha256 || "") || !MIME_TYPES.has(mime) ||
      !Number.isSafeInteger(timestamp) || timestamp <= 0 || !NONCE.test(nonce)) {
    throw new Error("invalid_r2_media_service_manifest");
  }
  const metadata = { ownerId, path, bytes, sha256, contentType: mime, timestamp, nonce };
  const data = new TextEncoder().encode(canonicalPayload(metadata));
  const mac = await crypto.subtle.sign("HMAC", await signingKey(secret, ["sign"]), data);
  return {
    "Content-Type": mime,
    "X-LS-Owner-Id": ownerId,
    "X-LS-Media-Path": encodeURIComponent(path),
    "X-LS-Media-Bytes": String(bytes),
    "X-LS-Media-SHA256": sha256,
    "X-LS-Timestamp": String(timestamp),
    "X-LS-Nonce": nonce,
    "X-LS-Signature": hex(new Uint8Array(mac)),
  };
}

/** Parse only the fixed internal wire contract; malformed headers fail closed. */
export function parseR2MediaServiceRequest(request) {
  try {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== R2_BUSINESS_STAGE_BYTES_PATH || url.search) return null;
    const ownerId = request.headers.get("x-ls-owner-id") || "";
    const encodedPath = request.headers.get("x-ls-media-path") || "";
    const path = decodeURIComponent(encodedPath);
    const bytesText = request.headers.get("x-ls-media-bytes") || "";
    const sha256 = request.headers.get("x-ls-media-sha256") || "";
    const contentTypeRaw = request.headers.get("content-type") || "";
    const contentType = contentTypeRaw.trim().toLowerCase();
    const timestampText = request.headers.get("x-ls-timestamp") || "";
    const nonce = request.headers.get("x-ls-nonce") || "";
    const signature = request.headers.get("x-ls-signature") || "";
    if (!OWNER.test(ownerId) || !encodedPath || encodedPath.length > 3072 ||
        encodeURIComponent(path) !== encodedPath ||
        !/^[1-9][0-9]{0,8}$/.test(bytesText) ||
        !SHA256.test(sha256) || contentTypeRaw !== contentType || !MIME_TYPES.has(contentType) ||
        !/^[1-9][0-9]{0,10}$/.test(timestampText) ||
        !NONCE.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return null;
    const bytes = Number(bytesText), timestamp = Number(timestampText);
    if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(timestamp)) return null;
    return { ownerId, path, bytes, sha256, contentType, timestamp, nonce, signature };
  } catch {
    return null;
  }
}

export async function verifyR2MediaServiceRequest(request, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const metadata = parseR2MediaServiceRequest(request);
  if (!metadata || !Number.isSafeInteger(nowSeconds) ||
      Math.abs(nowSeconds - metadata.timestamp) > R2_MEDIA_SERVICE_MAX_SKEW_SECONDS) return null;
  try {
    const signature = fromHex(metadata.signature);
    const data = new TextEncoder().encode(canonicalPayload(metadata));
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret, ["verify"]),
      signature,
      data,
    );
    return valid ? metadata : null;
  } catch {
    return null;
  }
}
