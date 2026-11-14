import { businessMediaPath } from "./r2-media-business.mjs";

export const R2_BUSINESS_INTERNAL_READ_PATH = "/__internal/r2/business-media/read-by-path";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE = /^[a-f0-9]{32}$/;
const MAX_SKEW_SECONDS = 60;
function payload(ownerId, path, timestamp, nonce) {
  return ["GET", R2_BUSINESS_INTERNAL_READ_PATH, ownerId, path, String(timestamp), nonce].join("\n");
}
async function key(secret, usages) {
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("r2_read_secret_missing");
  }
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);
}
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export async function createR2InternalReadHeaders({ secret, ownerId, path,
  timestamp = Math.floor(Date.now() / 1000),
  nonce = hex(crypto.getRandomValues(new Uint8Array(16))) }) {
  if (!UUID.test(ownerId || "") || !businessMediaPath(path, ownerId) ||
      !Number.isSafeInteger(timestamp) || timestamp <= 0 || !NONCE.test(nonce)) {
    throw new Error("invalid_r2_read_request");
  }
  const message = new TextEncoder().encode(payload(ownerId, path, timestamp, nonce));
  const signature = await crypto.subtle.sign("HMAC", await key(secret, ["sign"]), message);
  return {
    "X-LS-Owner-Id": ownerId,
    "X-LS-Media-Path": encodeURIComponent(path),
    "X-LS-Timestamp": String(timestamp),
    "X-LS-Nonce": nonce,
    "X-LS-Signature": hex(new Uint8Array(signature)),
    "Cache-Control": "private, no-store",
  };
}
export async function verifyR2InternalReadRequest(request, secret,
  now = Math.floor(Date.now() / 1000)) {
  try {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== R2_BUSINESS_INTERNAL_READ_PATH || url.search) return null;
    const ownerId = request.headers.get("x-ls-owner-id") || "";
    const encodedPath = request.headers.get("x-ls-media-path") || "";
    if (!encodedPath || encodedPath.length > 3072) return null;
    const path = decodeURIComponent(encodedPath);
    const timestampText = request.headers.get("x-ls-timestamp") || "";
    const nonce = request.headers.get("x-ls-nonce") || "";
    const mac = request.headers.get("x-ls-signature") || "";
    if (!UUID.test(ownerId) || !businessMediaPath(path, ownerId) ||
        encodeURIComponent(path) !== encodedPath ||
        !/^[1-9][0-9]{0,10}$/.test(timestampText) || !NONCE.test(nonce) ||
        !/^[a-f0-9]{64}$/.test(mac)) return null;
    const timestamp = Number(timestampText);
    if (!Number.isSafeInteger(now) || Math.abs(now - timestamp) > MAX_SKEW_SECONDS) return null;
    const actual = Uint8Array.from(mac.match(/.{2}/g), (pair) => parseInt(pair, 16));
    const message = new TextEncoder().encode(payload(ownerId, path, timestamp, nonce));
    return await crypto.subtle.verify("HMAC", await key(secret, ["verify"]), actual, message)
      ? { ownerId, path } : null;
  } catch {
    return null;
  }
}
