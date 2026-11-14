import {
  businessMediaPath, stageVerifiedR2Photo, createR2ReadTicket,
  verifyR2ReadTicket, readVerifiedR2Photo,
} from "../lib/r2-media-business.mjs";
import { sha256Hex } from "../lib/r2-media-business.mjs";
import { R2_BUSINESS_INTERNAL_READ_PATH, verifyR2InternalReadRequest } from "../lib/r2-media-read-service-auth.mjs";

/**
 * WP10/C owns the Worker entry, R2_BUSINESS_MEDIA binding and secrets.
 * This D-only handler is deliberately not registered in worker-entry.mjs.
 * Must remain disabled in production until object-level authorization to wire.
 */
export const R2_BUSINESS_STAGE_PATH = "/__internal/r2/business-media/stage";
export const R2_BUSINESS_READ_PATH = "/__internal/r2/business-media/read";

const JSON_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
function respond(body, status) { return Response.json(body, { status, headers: JSON_HEADERS }); }
function bearer(request, secret) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Only the privileged migration runner is permitted to issue read tickets.
  if (!secret || secret.length < 32 || !token) return false;
  const left = new TextEncoder().encode(token);
  const right = new TextEncoder().encode(secret);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}


/** Service-binding-only image GET, HMAC gated. Never expose arbitrary R2 keys. */
export async function handleR2InternalReadRequest(request, env,
  nowSeconds = Math.floor(Date.now() / 1000)) {
  const headers = { ...JSON_HEADERS, "CDN-Cache-Control": "no-store",
    "Surrogate-Control": "no-store", "Cross-Origin-Resource-Policy": "same-origin" };
  if (env?.R2_BUSINESS_MEDIA_MODE !== "isolated" || !env?.R2_BUSINESS_MEDIA) {
    return Response.json({ error: "disabled" }, { status: 404, headers });
  }
  const identity = await verifyR2InternalReadRequest(request, env.R2_MEDIA_SERVICE_AUTH_SECRET, nowSeconds);
  if (!identity) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const obj = await env.R2_BUSINESS_MEDIA.get(identity.path);
    if (!obj) return Response.json({ error: "r2_object_missing" }, { status: 404, headers });
    if (obj.size > 25 * 1024 * 1024) return Response.json({ error: "invalid_image" }, { status: 409, headers });
    const contentType = (obj.httpMetadata?.contentType || "").toLowerCase();
    const expected = obj.customMetadata?.sha256;
    if (!/^image\/(?:jpeg|png|webp|gif|avif|heic|heif)$/.test(contentType) ||
        !/^[a-f0-9]{64}$/.test(expected || "")) {
      return Response.json({ error: "r2_integrity_unknown" }, { status: 409, headers });
    }
    const bytes = new Uint8Array(await obj.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 25 * 1024 * 1024 ||
        (obj.size !== undefined && bytes.length !== obj.size) ||
        await sha256Hex(bytes) !== expected) {
      return Response.json({ error: "r2_integrity_mismatch" }, { status: 409, headers });
    }
    return new Response(bytes, { status: 200,
      headers: { ...headers, "Content-Type": contentType, "Content-Length": String(bytes.length) } });
  } catch {
    return Response.json({ error: "r2_unavailable" }, { status: 503, headers });
  }
}

export async function handleR2BusinessMediaRequest(request, env, fetchSource = fetch) {
  if (env?.R2_BUSINESS_MEDIA_MODE !== "isolated" || !env?.R2_BUSINESS_MEDIA) return respond({ error: "disabled" }, 404);
  const url = new URL(request.url);
  if (url.pathname === R2_BUSINESS_INTERNAL_READ_PATH) return handleR2InternalReadRequest(request, env);
  if (url.pathname === R2_BUSINESS_STAGE_PATH && request.method === "POST") {
    if (!bearer(request, env.R2_MEDIA_MIGRATION_SECRET)) return respond({ error: "unauthorized" }, 401);
    let input;
    try { input = await request.json(); } catch { return respond({ error: "invalid_manifest" }, 400); }
    if (!input || !businessMediaPath(input.path, input.ownerId) ||
        !Number.isSafeInteger(input.bytes) || input.bytes <= 0 || input.bytes > 25 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/.test(input.sha256 || "")) return respond({ error: "invalid_manifest" }, 400);
    const origin = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    if (!origin || !/^https:\/\//.test(origin) || !env.SUPABASE_SERVICE_ROLE_KEY) return respond({ error: "source_not_configured" }, 503);
    let parsedOrigin;
    try { parsedOrigin = new URL(origin); } catch { return respond({ error: "source_not_configured" }, 503); }
    if (parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== "/") return respond({ error: "source_not_configured" }, 503);
    // No bytes may be staged if the short-lived read credential cannot be signed.
    if (typeof env.R2_MEDIA_SIGNING_SECRET !== "string" || env.R2_MEDIA_SIGNING_SECRET.length < 32) {
      return respond({ error: "signing_not_configured" }, 503);
    }
    const sourceUrl = new URL("/storage/v1/object/authenticated/media/" +
      input.path.split("/").map(encodeURIComponent).join("/"), parsedOrigin);
    try {
      // Read-only authoritative database reference check. An arbitrary path
      // in an operator manifest is insufficient to copy private user media.
      let refResult;
      try {
        refResult = await fetchSource(new URL("/rest/v1/rpc/get_referenced_storage_paths", parsedOrigin), {
          method: "POST",
          headers: { authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
            apikey: env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ p_bucket_id: "media", p_object_paths: [input.path] }),
          redirect: "error", cache: "no-store",
        });
      } catch {
        return respond({ error: "reference_check_unavailable" }, 503);
      }
      if (!refResult.ok) return respond({ error: "reference_check_unavailable" }, 503);
      const references = await refResult.json().catch(() => null);
      if (!Array.isArray(references) || !references.some((item) => item?.object_path === input.path)) {
        return respond({ error: "business_reference_not_found" }, 409);
      }
      let source;
      try {
        source = await fetchSource(sourceUrl, {
          method: "GET",
          headers: { authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
            apikey: env.SUPABASE_SERVICE_ROLE_KEY },
          redirect: "error",
          cache: "no-store",
        });
      } catch {
        return respond({ error: "source_connection_failed" }, 502);
      }
      if (!source.ok) return respond({ error: "source_unavailable" }, 502);
      if (Number(source.headers.get("content-length") || 0) > input.bytes) return respond({ error: "source_length_mismatch" }, 409);
      const mime = (source.headers.get("content-type") || "").split(";")[0].toLowerCase();
      if (!/^image\/(?:jpeg|png|webp|gif|avif|heic|heif)$/.test(mime)) return respond({ error: "not_an_image" }, 415);
      let sourceBytes;
      try {
        sourceBytes = new Uint8Array(await source.arrayBuffer());
      } catch {
        return respond({ error: "source_stream_interrupted" }, 502);
      }
      const staged = await stageVerifiedR2Photo({
        bucket: env.R2_BUSINESS_MEDIA, ownerId: input.ownerId, path: input.path,
        sourceBytes, contentType: mime, expectedBytes: input.bytes,
        expectedSha256: input.sha256,
      });
      // Ticket is for isolated verification, never used for production display.
      const ticket = await createR2ReadTicket({
        secret: env.R2_MEDIA_SIGNING_SECRET, ownerId: input.ownerId, path: input.path,
        expectedBytes: input.bytes, expectedSha256: input.sha256, ttlSeconds: 60,
      });
      return respond({ ...staged, readPath: R2_BUSINESS_READ_PATH + "?ticket=" + encodeURIComponent(ticket) }, 200);
    } catch {
      return respond({ error: "copy_verification_failed" }, 409);
    }
  }
  if (url.pathname === R2_BUSINESS_READ_PATH && request.method === "GET") {
    const ticket = await verifyR2ReadTicket(url.searchParams.get("ticket"), env.R2_MEDIA_SIGNING_SECRET);
    if (!ticket) return respond({ error: "invalid_or_expired_ticket" }, 403);
    try {
      const result = await readVerifiedR2Photo({
        bucket: env.R2_BUSINESS_MEDIA, ownerId: ticket.ownerId, path: ticket.path,
        expectedBytes: ticket.bytes, expectedSha256: ticket.sha256,
      });
      if (!/^image\//.test(result.contentType)) return respond({ error: "invalid_type" }, 415);
      return new Response(result.bytes, {
        status: 200, headers: {
          ...JSON_HEADERS, "Content-Type": result.contentType,
          "Content-Length": String(result.bytes.byteLength),
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      });
    } catch { return respond({ error: "r2_copy_unavailable" }, 404); }
  }
  return respond({ error: "unsupported_media_request" }, 404);
}
