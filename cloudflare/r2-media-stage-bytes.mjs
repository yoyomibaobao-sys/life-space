import {
  businessMediaPath,
  sha256Hex,
  stageVerifiedR2Photo,
} from "../lib/r2-media-business.mjs";
import {
  R2_BUSINESS_STAGE_BYTES_PATH,
  verifyR2MediaServiceRequest,
} from "../lib/r2-media-service-auth.mjs";

export { R2_BUSINESS_STAGE_BYTES_PATH };

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const NONCE_PREFIX = "__lifespace_internal_nonces/v1/";
const JSON_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function respond(body, status) {
  return Response.json(body, { status, headers: JSON_HEADERS });
}

function detectedImageMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 6) {
    const gif = String.fromCharCode(...bytes.subarray(0, 6));
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  }
  if (bytes.length >= 12 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp") {
    const brands = [];
    for (const offset of [8, 16, 20, 24, 28, 32]) {
      if (bytes.length >= offset + 4) brands.push(String.fromCharCode(...bytes.subarray(offset, offset + 4)));
    }
    if (brands.some((brand) => brand === "avif" || brand === "avis")) return "image/avif";
    if (brands.some((brand) => ["heic", "heix", "hevc", "hevx"].includes(brand))) return "image/heic";
    if (brands.some((brand) => brand === "mif1" || brand === "msf1")) return "image/heif";
  }
  return null;
}

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
      if (total > expectedBytes || total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => {});
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

/**
 * Internal-only receiver. Supabase identity, business authorization and source
 * download are deliberately completed by the site Worker before this call.
 */
export async function handleR2MediaStageBytesRequest(
  request,
  env,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
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
  if (metadata.bytes > MAX_IMAGE_BYTES) return respond({ error: "image_too_large" }, 413);

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(declaredLength)) {
      return respond({ error: "invalid_content_length" }, 400);
    }
    const parsedLength = Number(declaredLength);
    if (parsedLength > MAX_IMAGE_BYTES) return respond({ error: "image_too_large" }, 413);
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

  // The existing private R2 binding is the atomic replay ledger. Its reserved
  // prefix is outside owner-prefixed media keys and is not a business image.
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
          expiresAt: String(metadata.timestamp + 120),
        },
      },
    );
  } catch {
    return respond({ error: "replay_guard_unavailable" }, 503);
  }
  if (!reservation) return respond({ error: "replayed_internal_request" }, 409);

  try {
    const staged = await stageVerifiedR2Photo({
      bucket: env.R2_BUSINESS_MEDIA,
      ownerId: metadata.ownerId,
      path: metadata.path,
      sourceBytes,
      contentType: metadata.contentType,
      expectedBytes: metadata.bytes,
      expectedSha256: metadata.sha256,
    });
    return respond({
      status: staged.status,
      bytes: staged.bytes,
      sha256: staged.sha256,
      contentType: metadata.contentType,
    }, 200);
  } catch (error) {
    const conflictCodes = new Set([
      "r2_size_mismatch",
      "r2_sha256_or_size_mismatch",
      "r2_content_type_mismatch",
      "r2_conditional_copy_failed",
    ]);
    if (conflictCodes.has(error?.message)) return respond({ error: "r2_object_conflict" }, 409);
    return respond({ error: "r2_stage_unavailable" }, 503);
  }
}
