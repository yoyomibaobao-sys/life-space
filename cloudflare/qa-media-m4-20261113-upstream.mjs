var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../lib/r2-media-business.mjs
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var SHA256 = /^[a-f0-9]{64}$/;
var MAX_IMAGE_BYTES = 25 * 1024 * 1024;
function businessMediaPath(path, ownerId) {
  if (typeof ownerId !== "string" || !UUID.test(ownerId)) return null;
  if (typeof path !== "string" || !path || path !== path.trim()) return null;
  if (path.length > 1024 || path.startsWith("/") || path.includes("\\") || path.includes("?") || path.includes("#") || /[\x00-\x1f\x7f]/.test(path)) return null;
  const parts = path.split("/");
  if (parts.length < 2 || parts.some((part) => !part || part === "." || part === "..")) return null;
  if (parts[0].toLowerCase() !== ownerId.toLowerCase()) return null;
  return path;
}
__name(businessMediaPath, "businessMediaPath");
function r2BusinessKey(path, ownerId) {
  const clean = businessMediaPath(path, ownerId);
  return clean;
}
__name(r2BusinessKey, "r2BusinessKey");
async function sha256Hex(bytes2) {
  const buffer = bytes2 instanceof Uint8Array ? bytes2 : new Uint8Array(bytes2);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
function validateExpected(expectedBytes, expectedSha256) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > MAX_IMAGE_BYTES || typeof expectedSha256 !== "string" || !SHA256.test(expectedSha256)) {
    throw new Error("invalid_manifest_integrity");
  }
}
__name(validateExpected, "validateExpected");
async function verifiedR2Bytes(bucket, key, expectedBytes, expectedSha256, expectedContentType = null) {
  const object = await bucket.get(key);
  if (!object) return null;
  if (object.size !== void 0 && object.size !== expectedBytes) throw new Error("r2_size_mismatch");
  const bytes2 = new Uint8Array(await object.arrayBuffer());
  if (bytes2.byteLength !== expectedBytes || await sha256Hex(bytes2) !== expectedSha256) {
    throw new Error("r2_sha256_or_size_mismatch");
  }
  const contentType = object.httpMetadata?.contentType || "application/octet-stream";
  if (expectedContentType && contentType.toLowerCase() !== expectedContentType.toLowerCase()) {
    throw new Error("r2_content_type_mismatch");
  }
  return { bytes: bytes2, contentType };
}
__name(verifiedR2Bytes, "verifiedR2Bytes");
async function stageVerifiedR2Photo({ bucket, ownerId, path, sourceBytes, contentType, expectedBytes, expectedSha256 }) {
  const key = r2BusinessKey(path, ownerId);
  if (!key) throw new Error("unsafe_or_foreign_media_path");
  validateExpected(expectedBytes, expectedSha256);
  if (!/^image\/(?:jpeg|png|webp|gif|avif|heic|heif)$/i.test(contentType || "")) {
    throw new Error("unsupported_media_content_type");
  }
  const bytes2 = sourceBytes instanceof Uint8Array ? sourceBytes : new Uint8Array(sourceBytes);
  if (bytes2.byteLength !== expectedBytes || await sha256Hex(bytes2) !== expectedSha256) {
    throw new Error("source_sha256_or_size_mismatch");
  }
  if (await verifiedR2Bytes(bucket, key, expectedBytes, expectedSha256, contentType)) {
    return { key, path, bytes: expectedBytes, sha256: expectedSha256, status: "already_verified" };
  }
  const result = await bucket.put(key, bytes2, {
    // A race must not overwrite an existing copy.
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType, cacheControl: "private, no-store" },
    customMetadata: { sha256: expectedSha256, sourceBucket: "media", ownerId }
  });
  if (!result && !await verifiedR2Bytes(bucket, key, expectedBytes, expectedSha256, contentType)) {
    throw new Error("r2_conditional_copy_failed");
  }
  await verifiedR2Bytes(bucket, key, expectedBytes, expectedSha256, contentType);
  return { key, path, bytes: expectedBytes, sha256: expectedSha256, status: result ? "copied_verified" : "already_verified" };
}
__name(stageVerifiedR2Photo, "stageVerifiedR2Photo");
async function readVerifiedR2Photo({ bucket, ownerId, path, expectedBytes, expectedSha256 }) {
  const key = r2BusinessKey(path, ownerId);
  if (!key) throw new Error("unsafe_or_foreign_media_path");
  validateExpected(expectedBytes, expectedSha256);
  const result = await verifiedR2Bytes(bucket, key, expectedBytes, expectedSha256);
  if (!result) throw new Error("r2_object_missing");
  return result;
}
__name(readVerifiedR2Photo, "readVerifiedR2Photo");
function toBase64Url(data2) {
  let binary = "";
  for (const byte of data2) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(toBase64Url, "toBase64Url");
function fromBase64Url(encoded) {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 4096) throw new Error("invalid_read_ticket");
  const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
__name(fromBase64Url, "fromBase64Url");
async function signingKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("signing_secret_missing");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
__name(signingKey, "signingKey");
async function createR2ReadTicket({ secret, ownerId, path, expectedBytes, expectedSha256, now = Date.now(), ttlSeconds = 120 }) {
  if (!r2BusinessKey(path, ownerId)) throw new Error("unsafe_or_foreign_media_path");
  validateExpected(expectedBytes, expectedSha256);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) throw new Error("invalid_ticket_ttl");
  const payload = { v: 1, ownerId, path, bytes: expectedBytes, sha256: expectedSha256, exp: Math.floor(now / 1e3) + ttlSeconds };
  const data2 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign("HMAC", await signingKey(secret), new TextEncoder().encode(data2));
  return data2 + "." + toBase64Url(new Uint8Array(mac));
}
__name(createR2ReadTicket, "createR2ReadTicket");
async function verifyR2ReadTicket(ticket, secret, now = Date.now()) {
  try {
    if (typeof ticket !== "string" || ticket.length > 4096) return null;
    const parts = ticket.split(".");
    if (parts.length !== 2) return null;
    const signed = new TextEncoder().encode(parts[0]);
    const signature = fromBase64Url(parts[1]);
    if (signature.byteLength !== 32 || !await crypto.subtle.verify("HMAC", await signingKey(secret), signature, signed)) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
    if (payload.v !== 1 || !r2BusinessKey(payload.path, payload.ownerId)) return null;
    validateExpected(payload.bytes, payload.sha256);
    const current = Math.floor(now / 1e3);
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= current || payload.exp > current + 300) return null;
    return payload;
  } catch {
    return null;
  }
}
__name(verifyR2ReadTicket, "verifyR2ReadTicket");
async function deleteUnreferencedR2Copy({ bucket, ownerId, path, deletionJobConfirmed, hasCurrentReferences }) {
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
__name(deleteUnreferencedR2Copy, "deleteUnreferencedR2Copy");

// ../../lib/r2-media-service-auth.mjs
var OWNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var SHA2562 = /^[a-f0-9]{64}$/;
var NONCE = /^[A-Za-z0-9_-]{22,128}$/;
var MIME_TYPES = /* @__PURE__ */ new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif"
]);
var R2_BUSINESS_STAGE_BYTES_PATH = "/__internal/r2/business-media/stage-bytes";
var R2_MEDIA_SERVICE_MAX_SKEW_SECONDS = 60;
function fromHex(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), (pair) => Number.parseInt(pair, 16));
}
__name(fromHex, "fromHex");
function canonicalPayload({ ownerId, path, bytes: bytes2, sha256, contentType, timestamp, nonce }) {
  return [
    "POST",
    R2_BUSINESS_STAGE_BYTES_PATH,
    ownerId,
    path,
    String(bytes2),
    sha256,
    contentType,
    String(timestamp),
    nonce
  ].join("\n");
}
__name(canonicalPayload, "canonicalPayload");
async function signingKey2(secret, usages) {
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("r2_media_service_secret_missing");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}
__name(signingKey2, "signingKey");
function parseR2MediaServiceRequest(request) {
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
    if (!OWNER.test(ownerId) || !encodedPath || encodedPath.length > 3072 || encodeURIComponent(path) !== encodedPath || !/^[1-9][0-9]{0,8}$/.test(bytesText) || !SHA2562.test(sha256) || contentTypeRaw !== contentType || !MIME_TYPES.has(contentType) || !/^[1-9][0-9]{0,10}$/.test(timestampText) || !NONCE.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return null;
    const bytes2 = Number(bytesText), timestamp = Number(timestampText);
    if (!Number.isSafeInteger(bytes2) || !Number.isSafeInteger(timestamp)) return null;
    return { ownerId, path, bytes: bytes2, sha256, contentType, timestamp, nonce, signature };
  } catch {
    return null;
  }
}
__name(parseR2MediaServiceRequest, "parseR2MediaServiceRequest");
async function verifyR2MediaServiceRequest(request, secret, nowSeconds = Math.floor(Date.now() / 1e3)) {
  const metadata = parseR2MediaServiceRequest(request);
  if (!metadata || !Number.isSafeInteger(nowSeconds) || Math.abs(nowSeconds - metadata.timestamp) > R2_MEDIA_SERVICE_MAX_SKEW_SECONDS) return null;
  try {
    const signature = fromHex(metadata.signature);
    const data2 = new TextEncoder().encode(canonicalPayload(metadata));
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey2(secret, ["verify"]),
      signature,
      data2
    );
    return valid ? metadata : null;
  } catch {
    return null;
  }
}
__name(verifyR2MediaServiceRequest, "verifyR2MediaServiceRequest");

// ../../cloudflare/r2-media-stage-bytes.mjs
var MAX_IMAGE_BYTES2 = 25 * 1024 * 1024;
var NONCE_PREFIX = "__lifespace_internal_nonces/v1/";
var JSON_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff"
};
function respond(body, status) {
  return Response.json(body, { status, headers: JSON_HEADERS });
}
__name(respond, "respond");
function detectedImageMime(bytes2) {
  if (bytes2.length >= 3 && bytes2[0] === 255 && bytes2[1] === 216 && bytes2[2] === 255) {
    return "image/jpeg";
  }
  if (bytes2.length >= 8 && bytes2[0] === 137 && bytes2[1] === 80 && bytes2[2] === 78 && bytes2[3] === 71 && bytes2[4] === 13 && bytes2[5] === 10 && bytes2[6] === 26 && bytes2[7] === 10) {
    return "image/png";
  }
  if (bytes2.length >= 6) {
    const gif = String.fromCharCode(...bytes2.subarray(0, 6));
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  }
  if (bytes2.length >= 12 && String.fromCharCode(...bytes2.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes2.subarray(8, 12)) === "WEBP") {
    return "image/webp";
  }
  if (bytes2.length >= 12 && String.fromCharCode(...bytes2.subarray(4, 8)) === "ftyp") {
    const brands = [];
    for (const offset of [8, 16, 20, 24, 28, 32]) {
      if (bytes2.length >= offset + 4) brands.push(String.fromCharCode(...bytes2.subarray(offset, offset + 4)));
    }
    if (brands.some((brand) => brand === "avif" || brand === "avis")) return "image/avif";
    if (brands.some((brand) => ["heic", "heix", "hevc", "hevx"].includes(brand))) return "image/heic";
    if (brands.some((brand) => brand === "mif1" || brand === "msf1")) return "image/heif";
  }
  return null;
}
__name(detectedImageMime, "detectedImageMime");
async function readExactBody(request, expectedBytes) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expectedBytes || total > MAX_IMAGE_BYTES2) {
        await reader.cancel().catch(() => {
        });
        const error = new Error("request_body_too_large");
        error.code = "too_large";
        throw error;
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error?.code === "too_large") throw error;
    const interrupted = new Error("request_body_interrupted");
    interrupted.code = "interrupted";
    throw interrupted;
  }
  if (total !== expectedBytes) {
    const mismatch = new Error("request_body_length_mismatch");
    mismatch.code = "length_mismatch";
    throw mismatch;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
__name(readExactBody, "readExactBody");
async function handleR2MediaStageBytesRequest(request, env, nowSeconds = Math.floor(Date.now() / 1e3)) {
  if (env?.R2_BUSINESS_MEDIA_MODE !== "isolated" || !env?.R2_BUSINESS_MEDIA) {
    return respond({ error: "disabled" }, 404);
  }
  const secret = env.R2_MEDIA_SERVICE_AUTH_SECRET;
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32) {
    return respond({ error: "internal_auth_not_configured" }, 503);
  }
  const metadata = await verifyR2MediaServiceRequest(request, secret, nowSeconds);
  if (!metadata) return respond({ error: "invalid_internal_signature" }, 401);
  if (!businessMediaPath(metadata.path, metadata.ownerId)) {
    return respond({ error: "invalid_media_path" }, 400);
  }
  if (metadata.bytes > MAX_IMAGE_BYTES2) return respond({ error: "image_too_large" }, 413);
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(declaredLength)) {
      return respond({ error: "invalid_content_length" }, 400);
    }
    const parsedLength = Number(declaredLength);
    if (parsedLength > MAX_IMAGE_BYTES2) return respond({ error: "image_too_large" }, 413);
    if (parsedLength !== metadata.bytes) return respond({ error: "content_length_mismatch" }, 400);
  }
  let sourceBytes;
  try {
    sourceBytes = await readExactBody(request, metadata.bytes);
  } catch (error) {
    if (error?.code === "too_large") return respond({ error: "image_too_large" }, 413);
    if (error?.code === "length_mismatch") return respond({ error: "content_length_mismatch" }, 400);
    return respond({ error: "request_body_interrupted" }, 502);
  }
  if (detectedImageMime(sourceBytes) !== metadata.contentType) {
    return respond({ error: "image_mime_mismatch" }, 415);
  }
  if (await sha256Hex(sourceBytes) !== metadata.sha256) {
    return respond({ error: "image_sha256_mismatch" }, 409);
  }
  const nonceHash = await sha256Hex(new TextEncoder().encode(metadata.nonce));
  let reservation;
  try {
    reservation = await env.R2_BUSINESS_MEDIA.put(
      NONCE_PREFIX + nonceHash,
      new TextEncoder().encode(metadata.timestamp + "\n" + metadata.sha256),
      {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/octet-stream", cacheControl: "private, no-store" },
        customMetadata: {
          purpose: "lifespace-r2-stage-replay-guard",
          expiresAt: String(metadata.timestamp + 120)
        }
      }
    );
  } catch {
    return respond({ error: "replay_guard_unavailable" }, 503);
  }
  if (!reservation) return respond({ error: "replayed_internal_request" }, 409);
  try {
    const staged = await stageVerifiedR2Photo({
      bucket: recoveryStageBucket(env, nowSeconds),
      ownerId: metadata.ownerId,
      path: metadata.path,
      sourceBytes,
      contentType: metadata.contentType,
      expectedBytes: metadata.bytes,
      expectedSha256: metadata.sha256
    });
    return respond({
      status: staged.status,
      bytes: staged.bytes,
      sha256: staged.sha256,
      contentType: metadata.contentType
    }, 200);
  } catch (error) {
    const conflictCodes = /* @__PURE__ */ new Set([
      "r2_size_mismatch",
      "r2_sha256_or_size_mismatch",
      "r2_content_type_mismatch",
      "r2_conditional_copy_failed"
    ]);
    if (conflictCodes.has(error?.message)) return respond({ error: "r2_object_conflict" }, 409);
    return respond({ error: "r2_stage_unavailable" }, 503);
  }
}
__name(handleR2MediaStageBytesRequest, "handleR2MediaStageBytesRequest");

// ../../cloudflare/r2-media-business.mjs
var R2_BUSINESS_STAGE_PATH = "/__internal/r2/business-media/stage";
var R2_BUSINESS_READ_PATH = "/__internal/r2/business-media/read";
var JSON_HEADERS2 = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
function respond2(body, status) {
  return Response.json(body, { status, headers: JSON_HEADERS2 });
}
__name(respond2, "respond");
function bearer(request, secret) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || secret.length < 32 || !token) return false;
  const left = new TextEncoder().encode(token);
  const right = new TextEncoder().encode(secret);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}
__name(bearer, "bearer");
async function handleR2BusinessMediaRequest(request, env, fetchSource = fetch) {
  if (env?.R2_BUSINESS_MEDIA_MODE !== "isolated" || !env?.R2_BUSINESS_MEDIA) return respond2({ error: "disabled" }, 404);
  const url = new URL(request.url);
  if (url.pathname === R2_BUSINESS_STAGE_BYTES_PATH && request.method === "POST") {
    return handleR2MediaStageBytesRequest(request, env);
  }
  if (url.pathname === R2_BUSINESS_STAGE_PATH && request.method === "POST") {
    if (!bearer(request, env.R2_MEDIA_MIGRATION_SECRET)) return respond2({ error: "unauthorized" }, 401);
    let input;
    try {
      input = await request.json();
    } catch {
      return respond2({ error: "invalid_manifest" }, 400);
    }
    if (!input || !businessMediaPath(input.path, input.ownerId) || !Number.isSafeInteger(input.bytes) || input.bytes <= 0 || input.bytes > 25 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(input.sha256 || "")) return respond2({ error: "invalid_manifest" }, 400);
    const origin = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    if (!origin || !/^https:\/\//.test(origin) || !env.SUPABASE_SERVICE_ROLE_KEY) return respond2({ error: "source_not_configured" }, 503);
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      return respond2({ error: "source_not_configured" }, 503);
    }
    if (parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== "/") return respond2({ error: "source_not_configured" }, 503);
    if (typeof env.R2_MEDIA_SIGNING_SECRET !== "string" || env.R2_MEDIA_SIGNING_SECRET.length < 32) {
      return respond2({ error: "signing_not_configured" }, 503);
    }
    const sourceUrl = new URL("/storage/v1/object/authenticated/media/" + input.path.split("/").map(encodeURIComponent).join("/"), parsedOrigin);
    try {
      let refResult;
      try {
        refResult = await fetchSource(new URL("/rest/v1/rpc/get_referenced_storage_paths", parsedOrigin), {
          method: "POST",
          headers: {
            authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ p_bucket_id: "media", p_object_paths: [input.path] }),
          redirect: "error",
          cache: "no-store"
        });
      } catch {
        return respond2({ error: "reference_check_unavailable" }, 503);
      }
      if (!refResult.ok) return respond2({ error: "reference_check_unavailable" }, 503);
      const references = await refResult.json().catch(() => null);
      if (!Array.isArray(references) || !references.some((item) => item?.object_path === input.path)) {
        return respond2({ error: "business_reference_not_found" }, 409);
      }
      let source;
      try {
        source = await fetchSource(sourceUrl, {
          method: "GET",
          headers: {
            authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
            apikey: env.SUPABASE_SERVICE_ROLE_KEY
          },
          redirect: "error",
          cache: "no-store"
        });
      } catch {
        return respond2({ error: "source_connection_failed" }, 502);
      }
      if (!source.ok) return respond2({ error: "source_unavailable" }, 502);
      if (Number(source.headers.get("content-length") || 0) > input.bytes) return respond2({ error: "source_length_mismatch" }, 409);
      const mime = (source.headers.get("content-type") || "").split(";")[0].toLowerCase();
      if (!/^image\/(?:jpeg|png|webp|gif|avif|heic|heif)$/.test(mime)) return respond2({ error: "not_an_image" }, 415);
      let sourceBytes;
      try {
        sourceBytes = new Uint8Array(await source.arrayBuffer());
      } catch {
        return respond2({ error: "source_stream_interrupted" }, 502);
      }
      const staged = await stageVerifiedR2Photo({
        bucket: env.R2_BUSINESS_MEDIA,
        ownerId: input.ownerId,
        path: input.path,
        sourceBytes,
        contentType: mime,
        expectedBytes: input.bytes,
        expectedSha256: input.sha256
      });
      const ticket = await createR2ReadTicket({
        secret: env.R2_MEDIA_SIGNING_SECRET,
        ownerId: input.ownerId,
        path: input.path,
        expectedBytes: input.bytes,
        expectedSha256: input.sha256,
        ttlSeconds: 60
      });
      return respond2({ ...staged, readPath: R2_BUSINESS_READ_PATH + "?ticket=" + encodeURIComponent(ticket) }, 200);
    } catch {
      return respond2({ error: "copy_verification_failed" }, 409);
    }
  }
  if (url.pathname === R2_BUSINESS_READ_PATH && request.method === "GET") {
    const ticket = await verifyR2ReadTicket(url.searchParams.get("ticket"), env.R2_MEDIA_SIGNING_SECRET);
    if (!ticket) return respond2({ error: "invalid_or_expired_ticket" }, 403);
    try {
      const result = await readVerifiedR2Photo({
        bucket: env.R2_BUSINESS_MEDIA,
        ownerId: ticket.ownerId,
        path: ticket.path,
        expectedBytes: ticket.bytes,
        expectedSha256: ticket.sha256
      });
      if (!/^image\//.test(result.contentType)) return respond2({ error: "invalid_type" }, 415);
      return new Response(result.bytes, {
        status: 200,
        headers: {
          ...JSON_HEADERS2,
          "Content-Type": result.contentType,
          "Content-Length": String(result.bytes.byteLength),
          "Cross-Origin-Resource-Policy": "same-origin"
        }
      });
    } catch {
      return respond2({ error: "r2_copy_unavailable" }, 404);
    }
  }
  return respond2({ error: "unsupported_media_request" }, 404);
}
__name(handleR2BusinessMediaRequest, "handleR2BusinessMediaRequest");

// ../../cloudflare/r2-media-adapter.mjs
var OWNER2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var SHA = /^[0-9a-f]{64}$/i;
function validateMediaR2Key(key, ownerId) {
  if (typeof key !== "string" || typeof ownerId !== "string" || !OWNER2.test(ownerId) || key.length > 1024 || key.startsWith("/") || key.includes("\\") || /[\u0000-\u001f\u007f]/.test(key) || key.split("/").some((part) => !part || part === "." || part === "..")) {
    throw Error("invalid_r2_media_key");
  }
  if (key.split("/")[0].toLowerCase() !== ownerId.toLowerCase()) {
    throw Error("r2_media_owner_mismatch");
  }
  return key;
}
__name(validateMediaR2Key, "validateMediaR2Key");
function assertBucket(bucket) {
  if (!bucket || ["put", "get", "head", "delete"].some((m) => typeof bucket[m] !== "function")) {
    throw Error("r2_binding_missing");
  }
}
__name(assertBucket, "assertBucket");
function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw Error("invalid_media_bytes");
}
__name(bytes, "bytes");
async function sha256Media(value) {
  const hash = await crypto.subtle.digest("SHA-256", bytes(value));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Media, "sha256Media");
async function getVerifiedR2Media(bucket, { key, ownerId, size, sha256 }) {
  assertBucket(bucket);
  validateMediaR2Key(key, ownerId);
  if (!Number.isSafeInteger(size) || size <= 0 || !SHA.test(sha256 || "")) {
    throw Error("media_verification_required");
  }
  const object = await bucket.get(key);
  if (!object) throw Error("r2_media_missing");
  const result = new Uint8Array(await object.arrayBuffer());
  if (result.length !== size || await sha256Media(result) !== sha256.toLowerCase()) {
    throw Error("r2_media_integrity_mismatch");
  }
  return result;
}
__name(getVerifiedR2Media, "getVerifiedR2Media");
async function putVerifiedR2Media(bucket, { key, ownerId, data: data2, contentType }) {
  assertBucket(bucket);
  validateMediaR2Key(key, ownerId);
  const input = bytes(data2);
  if (!input.length) throw Error("empty_media");
  if (typeof contentType !== "string" || !/^image\/[a-z0-9.+-]+$/i.test(contentType)) {
    throw Error("invalid_media_type");
  }
  const sha256 = await sha256Media(input);
  const saved = await bucket.put(key, input, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType }
  });
  if (!saved) {
    await getVerifiedR2Media(bucket, { key, ownerId, size: input.length, sha256 });
    return { key, size: input.length, sha256, alreadyExisted: true };
  }
  await getVerifiedR2Media(bucket, { key, ownerId, size: input.length, sha256 });
  return { key, size: input.length, sha256 };
}
__name(putVerifiedR2Media, "putVerifiedR2Media");

// ../W4-joint-preview/media-qa.mjs
var OWNER3 = "45bf1d5f-73b3-455d-b598-3a652a14fd4f";
var FIXTURES = { "original": "iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAIAAAAUMWhjAAAAJElEQVR4nGOQW+BGU8QwasGoBaMWjFowasGoBaMWjFowNCwAAPDeDC5Y/JQmAAAAAElFTkSuQmCC", "thumb": "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAEUlEQVR4nGOQW+CGFTEMpAQAQigwwdKZqkwAAAAASUVORK5CYII=", "alternate": "iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAIAAAAUMWhjAAAAJElEQVR4nGPYYiNCU8QwasGoBaMWjFowasGoBaMWjFowNCwAAEkLDC7ISZ+uAAAAAElFTkSuQmCC" };
var data = /* @__PURE__ */ __name((n) => Uint8Array.from(atob(FIXTURES[n]), (c) => c.charCodeAt(0)), "data");
var eq = /* @__PURE__ */ __name((v, w, label) => {
  if (JSON.stringify(v) !== JSON.stringify(w)) throw Error(label + ": " + JSON.stringify(v));
}, "eq");
var req = /* @__PURE__ */ __name((path, method = "GET", body, token) => new Request("https://private.invalid" + path, { method, headers: { ...token ? { authorization: "Bearer " + token } : {}, ...body ? { "content-type": "application/json" } : {} }, body: body ? JSON.stringify(body) : void 0 }), "req");
var media_qa_default = { async fetch(request, env) {
  if (request.headers.get("authorization") !== "Bearer " + env.QA_TOKEN) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  if (url.pathname === "/__qa/health") return Response.json({ ok: true, scope: "synthetic-only", r2: !!env.R2_BUSINESS_MEDIA });
  if (url.pathname === "/__qa/object" && request.method === "POST") {
    try {
      const m = await request.json();
      if (m.ownerId !== OWNER3 || !m.path?.startsWith(OWNER3 + "/batch4/")) return Response.json({ error: "invalid_test_path" }, { status: 400 });
      const ticket = await createR2ReadTicket({ secret: env.R2_MEDIA_SIGNING_SECRET, ownerId: m.ownerId, path: m.path, expectedBytes: m.bytes, expectedSha256: m.sha256, ttlSeconds: 60 });
      return handleR2BusinessMediaRequest(req(R2_BUSINESS_READ_PATH + "?ticket=" + encodeURIComponent(ticket)), env);
    } catch {
      return Response.json({ error: "invalid_manifest" }, { status: 400 });
    }
  }
  if (url.pathname === "/__qa/run" && request.method === "POST" && (await request.clone().json().catch(() => null))?.scope === "w4-media-compat") {
    const run2 = crypto.randomUUID(), path = OWNER3 + "/batch4/" + run2 + "/mime-contract.png", bytes2 = data("original"), sha = await sha256Hex(bytes2), checks2 = [];
    const bucket2 = env.R2_BUSINESS_MEDIA, isolated2 = { ...env, SUPABASE_URL: "https://synthetic.invalid/", SUPABASE_SERVICE_ROLE_KEY: "synthetic-no-network" };
    const input = { ownerId: OWNER3, path, bytes: bytes2.length, sha256: sha };
    const make = /* @__PURE__ */ __name(() => req(R2_BUSINESS_STAGE_PATH, "POST", input, env.R2_MEDIA_MIGRATION_SECRET), "make");
    const saved = await bucket2.put(path, bytes2, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "text/plain", cacheControl: "private, no-store" }, customMetadata: { sha256: sha, scope: "w4-contract-only" } });
    if (!saved) throw Error("synthetic_fixture_create_failed");
    let rejected = false;
    try {
      await stageVerifiedR2Photo({ bucket: bucket2, ownerId: OWNER3, path, sourceBytes: bytes2, contentType: "image/png", expectedBytes: bytes2.length, expectedSha256: sha });
    } catch (e) {
      rejected = e.message === "r2_content_type_mismatch";
    }
    eq(rejected, true, "mime_mismatch_rejected");
    const existing = await bucket2.get(path);
    eq(existing.httpMetadata.contentType, "text/plain", "mime_not_overwritten");
    eq(await sha256Hex(new Uint8Array(await existing.arrayBuffer())), sha, "fixture_bytes_unchanged");
    checks2.push({ name: "existing_R2_MIME_mismatch_rejected", pass: true });
    const ref = await handleR2BusinessMediaRequest(make(), isolated2, async () => {
      throw Error("synthetic_rpc_connection_failure");
    });
    eq(ref.status, 503, "rpc_status");
    eq((await ref.json()).error, "reference_check_unavailable", "rpc_error");
    checks2.push({ name: "reference_RPC_connection_503", pass: true });
    const source2 = await handleR2BusinessMediaRequest(make(), isolated2, async (u) => {
      if (new URL(u).pathname.endsWith("/get_referenced_storage_paths")) return Response.json([{ object_path: path }]);
      throw Error("synthetic_source_connection_failure");
    });
    eq(source2.status, 502, "source_status");
    eq((await source2.json()).error, "source_connection_failed", "source_error");
    checks2.push({ name: "source_connection_502", pass: true });
    const stream = await handleR2BusinessMediaRequest(make(), isolated2, async (u) => {
      if (new URL(u).pathname.endsWith("/get_referenced_storage_paths")) return Response.json([{ object_path: path }]);
      return new Response(new ReadableStream({ start(c) {
        c.enqueue(bytes2.slice(0, 3));
        c.error(Error("synthetic_source_interruption"));
      } }), { headers: { "Content-Type": "image/png" } });
    });
    eq(stream.status, 502, "stream_status");
    eq((await stream.json()).error, "source_stream_interrupted", "stream_error");
    checks2.push({ name: "source_stream_interruption_502", pass: true });
    return Response.json({ ok: true, status: "W4_MEDIA_COMPAT_PASS", scope: "synthetic-only", run: run2, checks: checks2, objects: [{ path, bytes: bytes2.length, sha256: sha, contentType: "text/plain" }] });
  }
  if (url.pathname !== "/__qa/run" || request.method !== "POST") return Response.json({ error: "unsupported" }, { status: 404 });
  const run = crypto.randomUUID(), prefix = OWNER3 + "/batch4/" + run + "/", checks = [], objects = [];
  const bucket = env.R2_BUSINESS_MEDIA;
  const isolated = { ...env, SUPABASE_URL: "https://synthetic.invalid/", SUPABASE_SERVICE_ROLE_KEY: "synthetic-no-network" };
  const check = /* @__PURE__ */ __name((name, evidence) => checks.push({ name, pass: true, ...evidence }), "check");
  const source = /* @__PURE__ */ __name((path, bytes2, mode) => async (u) => new URL(u).pathname.endsWith("get_referenced_storage_paths") ? mode === "reference-failure" ? new Response("", { status: 503 }) : Response.json(mode === "unreferenced" ? [] : [{ object_path: path }]) : mode === "source-failure" ? new Response("", { status: 503 }) : new Response(bytes2, { headers: { "content-type": "image/png" } }), "source");
  const stage = /* @__PURE__ */ __name((manifest, bytes2, mode, overrides = {}) => handleR2BusinessMediaRequest(req(R2_BUSINESS_STAGE_PATH, "POST", manifest, env.R2_MEDIA_MIGRATION_SECRET), { ...isolated, ...overrides }, source(manifest.path, bytes2, mode)), "stage");
  try {
    for (const [method, path, status, body] of [["POST", R2_BUSINESS_STAGE_PATH, 401, {}], ["GET", R2_BUSINESS_READ_PATH, 403], ["GET", R2_BUSINESS_STAGE_PATH, 404], ["POST", R2_BUSINESS_READ_PATH, 404, {}]]) {
      const r = await handleR2BusinessMediaRequest(req(path, method, body), isolated);
      eq(r.status, status, "deny");
      check("handler-deny-" + method + "-" + path, { status: r.status });
    }
    for (const name of ["original", "thumb"]) {
      const bytes2 = data(name), path = prefix + name + ".png", manifest = { ownerId: OWNER3, path, bytes: bytes2.length, sha256: await sha256Hex(bytes2) };
      const r = await stage(manifest, bytes2);
      eq(r.status, 200, "stage");
      const body = await r.json();
      eq(body.status, "copied_verified", "copy");
      const read = await handleR2BusinessMediaRequest(req(body.readPath), isolated);
      eq(read.status, 200, "read");
      const downloaded = new Uint8Array(await read.arrayBuffer());
      eq([...downloaded], [...bytes2], "bytes");
      const obj = await bucket.get(path), actual = new Uint8Array(await obj.arrayBuffer());
      eq(await sha256Hex(actual), manifest.sha256, "r2-sha");
      objects.push({ key: path, bytes: actual.length, sha256: manifest.sha256, etag: obj.etag, width: name === "original" ? 32 : 8, height: name === "original" ? 24 : 6 });
      eq((await stage(manifest, bytes2)).status, 200, "idempotent");
      eq((await (await stage(manifest, bytes2)).json()).status, "already_verified", "idempotent-status");
      check("stage-read-idempotent-" + name, { bytes: bytes2.length, sha256: manifest.sha256 });
      eq((await handleR2BusinessMediaRequest(req(body.readPath + "x"), isolated)).status, 403, "tamper");
      check("tampered-ticket-" + name);
      const expired = await createR2ReadTicket({ secret: env.R2_MEDIA_SIGNING_SECRET, ...manifest, expectedBytes: manifest.bytes, expectedSha256: manifest.sha256, now: Date.now() - 12e4, ttlSeconds: 1 });
      eq((await handleR2BusinessMediaRequest(req(R2_BUSINESS_READ_PATH + "?ticket=" + expired), isolated)).status, 403, "expired");
      check("expired-ticket-" + name);
      const cross = await createR2ReadTicket({ secret: env.R2_MEDIA_SIGNING_SECRET, ownerId: "55bf1d5f-73b3-455d-b598-3a652a14fd4f", path: "55bf1d5f-73b3-455d-b598-3a652a14fd4f/batch4/absent.png", expectedBytes: manifest.bytes, expectedSha256: manifest.sha256, ttlSeconds: 60 });
      eq((await handleR2BusinessMediaRequest(req(R2_BUSINESS_READ_PATH + "?ticket=" + cross), isolated)).status, 404, "other-owner");
      check("other-owner-cannot-read-" + name);
      eq((await deleteUnreferencedR2Copy({ bucket, ownerId: OWNER3, path, deletionJobConfirmed: true, hasCurrentReferences: /* @__PURE__ */ __name(async () => true, "hasCurrentReferences") })).status, "retained_shared", "shared");
      check("shared-reference-retained-" + name);
    }
    const a = data("original"), b = data("alternate");
    for (const adapter of ["C", "D"]) {
      const key = prefix + adapter + "-race.png";
      const put = /* @__PURE__ */ __name(async (bytes3) => adapter === "C" ? putVerifiedR2Media(bucket, { key, ownerId: OWNER3, data: bytes3, contentType: "image/png" }) : stage({ ownerId: OWNER3, path: key, bytes: bytes3.length, sha256: await sha256Hex(bytes3) }, bytes3).then(async (r) => {
        if (r.status !== 200) throw Error("status_" + r.status);
        return r.json();
      }), "put");
      const conflict = await Promise.allSettled([put(a), put(b)]);
      eq(conflict.filter((x) => x.status === "fulfilled").length, 1, "conflict");
      check(adapter + "-different-content-race", { outcomes: conflict.map((x) => x.status) });
      const object = await bucket.get(key), bytes2 = new Uint8Array(await object.arrayBuffer());
      const sha = await sha256Hex(bytes2);
      if (![await sha256Hex(a), await sha256Hex(b)].includes(sha)) throw Error("corrupt-winner");
      objects.push({ key, bytes: bytes2.length, sha256: sha, etag: object.etag });
      const samekey = prefix + adapter + "-same.png";
      const sameput = /* @__PURE__ */ __name(async () => adapter === "C" ? putVerifiedR2Media(bucket, { key: samekey, ownerId: OWNER3, data: a, contentType: "image/png" }) : stage({ ownerId: OWNER3, path: samekey, bytes: a.length, sha256: await sha256Hex(a) }, a).then(async (r) => {
        if (r.status !== 200) throw Error("same-status");
        return r.json();
      }), "sameput");
      const same = await Promise.allSettled([sameput(), sameput(), sameput(), sameput()]);
      eq(same.filter((x) => x.status === "fulfilled").length, 4, "same-race");
      check(adapter + "-identical-content-race", { writers: 4 });
    }
    for (const mode of ["source-failure", "reference-failure", "unreferenced", "bad-sha", "missing-signing"]) {
      const path = prefix + mode + ".png", manifest = { ownerId: OWNER3, path, bytes: a.length, sha256: mode === "bad-sha" ? "0".repeat(64) : await sha256Hex(a) };
      const r = await stage(manifest, a, mode, mode === "missing-signing" ? { R2_MEDIA_SIGNING_SECRET: "" } : {});
      const expected = { "source-failure": 502, "reference-failure": 503, unreferenced: 409, "bad-sha": 409, "missing-signing": 503 }[mode];
      eq(r.status, expected, mode);
      eq(await bucket.head(path), null, "no-side-effect");
      const retry = await stage({ ...manifest, sha256: await sha256Hex(a) }, a);
      eq(retry.status, 200, "recovery");
      check("failure-and-recovery-" + mode, { initialStatus: r.status, retryStatus: retry.status });
    }
    const list = await bucket.list({ prefix });
    check("object-inventory", { count: list.objects.length });
    return Response.json({ ok: true, run, checks, objects, inventory: list.objects.map((o) => ({ key: o.key, size: o.size, etag: o.etag })), source: "synthetic fetchSource; no Supabase connection", r03Unmodified: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ ok: false, run, checks, objects, error: String(e) }, { status: 500 });
  }
} };

// media-m4.mjs
var media_m4_default = {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === R2_BUSINESS_STAGE_BYTES_PATH) {
      return handleR2BusinessMediaRequest(request, env);
    }
    return media_qa_default.fetch(request, env, ctx);
  }
};
export {
  media_m4_default as default
};
//# sourceMappingURL=media-m4.js.map

const QA_RECOVERY_THUMB_KEY = "f99fd44d-820f-41f2-ad4e-85feb7c990a6/7dcc0018-d785-44f9-9c79-27e2c12e8c25/thumbs/offline-18a0af65-834f-4495-9bef-c48e1222595a-thumb-LifeSpaceQA-R26-A.jpg";
function recoveryStageBucket(env, nowSeconds) {
  const bucket = env.R2_BUSINESS_MEDIA;
  if (env.R2_BUSINESS_MEDIA_MODE !== "isolated" ||
      env.M4_QA_FAIL_THUMB_WRITE !== "true" ||
      !(nowSeconds < Number(env.M4_QA_RECOVERY_UNTIL))) return bucket;

  return {
    get: (key) => bucket.get(key),
    put(key, bytes, options) {
      if (key === QA_RECOVERY_THUMB_KEY) throw new Error("qa_thumb_write_failure");
      return bucket.put(key, bytes, options);
    },
  };
}
