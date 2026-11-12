import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { validateMediaR2Key, sha256Media } from "./r2-media-adapter.mjs";
import {
  createR2MediaServiceHeaders,
  R2_BUSINESS_STAGE_BYTES_PATH,
} from "../lib/r2-media-service-auth.mjs";

export const R2_BUSINESS_MIRROR_PATH = "/__internal/r2/business-media/mirror";

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JSON_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function respond(body, status) {
  return Response.json(body, { status, headers: JSON_HEADERS });
}

function safeConfig(env) {
  const rawUrl = env?.SUPABASE_URL || env?.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env?.SUPABASE_ANON_KEY;
  const serviceRoleKey = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof rawUrl !== "string" || typeof anonKey !== "string" ||
      typeof serviceRoleKey !== "string") return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) return null;
    return { url: url.origin, anonKey, serviceRoleKey };
  } catch {
    return null;
  }
}

function parseCookies(header) {
  if (typeof header !== "string" || !header) return [];
  return header.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index <= 0) return null;
    const name = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();
    if (!name) return null;
    let value = rawValue;
    try { value = decodeURIComponent(rawValue); } catch {}
    return { name, value };
  }).filter(Boolean);
}

function serializeCookie(cookie) {
  const options = cookie?.options || {};
  const parts = [cookie.name + "=" + encodeURIComponent(cookie.value ?? "")];
  if (options.maxAge !== undefined) parts.push("Max-Age=" + Math.trunc(options.maxAge));
  if (options.domain) parts.push("Domain=" + options.domain);
  if (options.path) parts.push("Path=" + options.path);
  if (options.expires) parts.push("Expires=" + new Date(options.expires).toUTCString());
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const value = String(options.sameSite).toLowerCase();
    parts.push("SameSite=" + (value === "strict" ? "Strict" : value === "none" ? "None" : "Lax"));
  }
  return parts.join("; ");
}

function withCookies(response, cookies) {
  if (!cookies?.length) return response;
  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append("Set-Cookie", serializeCookie(cookie));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createRequestUserClient(request, env) {
  const config = safeConfig(env);
  if (!config) throw new Error("supabase_not_configured");
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) {
    return {
      supabase: createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: "Bearer " + bearer } },
      }),
      accessToken: bearer,
      cookieWrites: [],
    };
  }

  const cookieWrites = [];
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() { return parseCookies(request.headers.get("cookie") || ""); },
      setAll(values) { cookieWrites.push(...values); },
    },
  });
  return { supabase, accessToken: null, cookieWrites };
}

function createAdminClient(env) {
  const config = safeConfig(env);
  if (!config) throw new Error("supabase_not_configured");
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function readRow(client, table, columns, id) {
  const { data, error } = await client.from(table).select(columns).eq("id", id).maybeSingle();
  if (error) throw new Error("business_row_lookup_failed");
  return data || null;
}

function choosePath(fullPath, thumbPath, variant) {
  return variant === "thumb" ? (thumbPath || fullPath || null) : (fullPath || null);
}

function ownerReadable(viewerId, ownerId, isPublic) {
  return viewerId === ownerId || isPublic === true;
}

async function resolveBusinessMedia(admin, input, viewerId) {
  const { businessType, businessId, variant } = input;
  let ownerId = null;
  let path = null;
  let accountedBytes = null;
  let mediaPaths = null;
  let publicReadable = false;

  if (businessType === "media") {
    const media = await readRow(admin, "media",
      "id,user_id,record_id,type,trashed_at,storage_path,thumb_path,size_bytes", businessId);
    if (!media || media.type !== "image" || media.trashed_at || !media.record_id) return null;
    const record = await readRow(admin, "records",
      "id,user_id,archive_id,visibility,trashed_at", media.record_id);
    if (!record || record.trashed_at) return null;
    const archive = await readRow(admin, "archives",
      "id,user_id,is_public,trashed_at", record.archive_id);
    if (!archive || archive.trashed_at) return null;
    ownerId = media.user_id;
    if (!ownerId || record.user_id !== ownerId || archive.user_id !== ownerId) return null;
    publicReadable = archive.is_public === true && record.visibility === "public";
    path = choosePath(media.storage_path, media.thumb_path, variant);
    mediaPaths = [...new Set([media.storage_path, media.thumb_path].filter(Boolean))];
    // This is the combined billing usage of full + thumb, never the size of full alone.
    if (Number.isSafeInteger(media.size_bytes) && media.size_bytes > 0) {
      accountedBytes = media.size_bytes;
    }
  } else if (businessType === "record") {
    const record = await readRow(admin, "records",
      "id,user_id,archive_id,visibility,trashed_at,primary_image_path,primary_thumb_path", businessId);
    if (!record || record.trashed_at) return null;
    const archive = await readRow(admin, "archives",
      "id,user_id,is_public,trashed_at", record.archive_id);
    if (!archive || archive.trashed_at || archive.user_id !== record.user_id) return null;
    ownerId = record.user_id;
    publicReadable = archive.is_public === true && record.visibility === "public";
    path = choosePath(record.primary_image_path, record.primary_thumb_path, variant);
  } else if (businessType === "archive") {
    const archive = await readRow(admin, "archives",
      "id,user_id,is_public,trashed_at,cover_image_path,cover_thumb_path", businessId);
    if (!archive || archive.trashed_at) return null;
    ownerId = archive.user_id;
    publicReadable = archive.is_public === true;
    path = choosePath(archive.cover_image_path, archive.cover_thumb_path, variant);
  } else if (businessType === "market_post") {
    const post = await readRow(admin, "market_posts",
      "id,user_id,archive_id,source_record_id,status,ended_at,cover_image_path,cover_thumb_path", businessId);
    if (!post) return null;
    ownerId = post.user_id;
    publicReadable = post.status === "active" && !post.ended_at;
    if (post.archive_id) {
      const archive = await readRow(admin, "archives", "id,user_id,trashed_at", post.archive_id);
      if (!archive || archive.trashed_at || archive.user_id !== ownerId) return null;
    }
    if (post.source_record_id) {
      const record = await readRow(admin, "records", "id,user_id,trashed_at", post.source_record_id);
      if (!record || record.trashed_at || record.user_id !== ownerId) return null;
    }
    path = choosePath(post.cover_image_path, post.cover_thumb_path, variant);
  } else if (businessType === "market_media") {
    const marketMedia = await readRow(admin, "market_media",
      "id,user_id,market_post_id,path,thumb_path,source_media_id,source_record_id", businessId);
    if (!marketMedia) return null;
    const post = await readRow(admin, "market_posts",
      "id,user_id,status,ended_at", marketMedia.market_post_id);
    if (!post || post.user_id !== marketMedia.user_id) return null;
    ownerId = marketMedia.user_id;
    publicReadable = post.status === "active" && !post.ended_at;
    if (marketMedia.source_record_id) {
      const record = await readRow(admin, "records", "id,user_id,trashed_at", marketMedia.source_record_id);
      if (!record || record.trashed_at || record.user_id !== ownerId) return null;
    }
    if (marketMedia.source_media_id) {
      const sourceMedia = await readRow(admin, "media", "id,user_id,trashed_at", marketMedia.source_media_id);
      if (!sourceMedia || sourceMedia.trashed_at || sourceMedia.user_id !== ownerId) return null;
    }
    path = choosePath(marketMedia.path, marketMedia.thumb_path, variant);
  } else {
    return null;
  }

  if (!ownerId || !UUID.test(ownerId) || !path || !ownerReadable(viewerId, ownerId, publicReadable)) return null;
  try {
    for (const objectPath of mediaPaths || [path]) validateMediaR2Key(objectPath, ownerId);
  } catch { return null; }
  return { ownerId, path, mediaPaths, accountedBytes };
}

async function readSourceObjectLengths(admin, source) {
  if (!source.mediaPaths) return { expectedBytes: null };
  let totalBytes = 0;
  let expectedBytes = null;
  for (const path of source.mediaPaths) {
    // Storage object metadata is per file; media.size_bytes is an aggregate.
    const { data, error } = await admin.storage.from("media").info(path);
    const length = data?.metadata?.size ?? data?.size;
    if (error || !Number.isSafeInteger(length) || length <= 0 || length > MAX_MEDIA_BYTES) {
      return { error: "source_unavailable" };
    }
    totalBytes += length;
    if (!Number.isSafeInteger(totalBytes)) return { error: "source_unavailable" };
    if (path === source.path) expectedBytes = length;
  }
  if (expectedBytes === null) return { error: "source_unavailable" };
  if (source.accountedBytes !== null && source.accountedBytes !== totalBytes) {
    return { error: "source_length_mismatch" };
  }
  return { expectedBytes };
}

async function hasBusinessReference(admin, path) {
  const { data, error } = await admin.rpc("get_referenced_storage_paths", {
    p_bucket_id: "media",
    p_object_paths: [path],
  });
  if (error || !Array.isArray(data)) throw new Error("reference_check_unavailable");
  return data.some((item) => item?.object_path === path);
}

function sniffImageMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
      bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 6) {
    const gif = String.fromCharCode(...bytes.subarray(0, 6));
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
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

export async function handleR2BusinessUserMirrorRequest(request, env, dependencies = {}) {
  const url = new URL(request.url);
  if (url.pathname !== R2_BUSINESS_MIRROR_PATH) return respond({ error: "unsupported_media_request" }, 404);
  if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);
  if (env?.R2_BUSINESS_MEDIA_MODE !== "isolated") return respond({ error: "disabled" }, 404);
  if (!env?.R2_BUSINESS_MEDIA_SERVICE || typeof env.R2_BUSINESS_MEDIA_SERVICE.fetch !== "function") {
    return respond({ error: "media_service_unavailable" }, 503);
  }
  if (typeof env.R2_MEDIA_SERVICE_AUTH_SECRET !== "string" ||
      new TextEncoder().encode(env.R2_MEDIA_SERVICE_AUTH_SECRET).byteLength < 32) {
    return respond({ error: "gateway_not_configured" }, 503);
  }
  // Cookie-authenticated writes require a verified same-origin browser request.
  // Bearer clients may omit Origin but must not send a conflicting Origin.
  const requestOrigin = request.headers.get("origin");
  const hasBearer = /^Bearer\s+\S+/i.test(request.headers.get("authorization") || "");
  if (!hasBearer && !requestOrigin) return respond({ error: "origin_required" }, 403);
  if (requestOrigin) {
    try {
      if (new URL(requestOrigin).origin !== url.origin) return respond({ error: "origin_not_allowed" }, 403);
    } catch {
      return respond({ error: "origin_not_allowed" }, 403);
    }
  }
  if ((request.headers.get("sec-fetch-site") || "").toLowerCase() === "cross-site") {
    return respond({ error: "cross_site_not_allowed" }, 403);
  }
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return respond({ error: "json_required" }, 415);
  }

  let bodyText;
  try { bodyText = await request.text(); } catch { return respond({ error: "invalid_request" }, 400); }
  if (new TextEncoder().encode(bodyText).byteLength > 2048) return respond({ error: "request_too_large" }, 413);
  let input;
  try { input = JSON.parse(bodyText); } catch { return respond({ error: "invalid_request" }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !["businessType", "businessId", "variant"].includes(key)) ||
      !["media", "record", "archive", "market_post", "market_media"].includes(input.businessType) ||
      !UUID.test(input.businessId || "") || !["full", "thumb"].includes(input.variant || "full")) {
    return respond({ error: "invalid_request" }, 400);
  }
  input.variant ||= "full";

  let cookieWrites = [];
  try {
    const userContext = await (dependencies.createUserClient || createRequestUserClient)(request, env, cookieWrites);
    cookieWrites = userContext.cookieWrites || cookieWrites;
    const userResult = await userContext.supabase.auth.getUser(userContext.accessToken || undefined);
    const viewerId = userResult?.data?.user?.id;
    if (userResult?.error || !viewerId || !UUID.test(viewerId)) {
      return withCookies(respond({ error: "authentication_required" }, 401), cookieWrites);
    }
    // This must be a configured Cloudflare rate-limit binding, not an
    // in-memory counter that can be bypassed by another Worker isolate.
    const limiter = env.R2_MEDIA_MIRROR_RATE_LIMITER;
    if (!limiter || typeof limiter.limit !== "function") {
      return withCookies(respond({ error: "mirror_rate_limit_not_configured" }, 503), cookieWrites);
    }
    let permitted;
    try { ({ success: permitted } = await limiter.limit({ key: "mirror:" + viewerId })); }
    catch { return withCookies(respond({ error: "mirror_rate_limit_unavailable" }, 503), cookieWrites); }
    if (permitted !== true) return withCookies(respond({ error: "rate_limited" }, 429), cookieWrites);

    const admin = await (dependencies.createAdminClient || createAdminClient)(env);
    const source = await resolveBusinessMedia(admin, input, viewerId);
    if (!source || source.ownerId !== viewerId) {
      // Public readability does not authorize a non-owner to trigger R2 writes.
      return withCookies(respond({ error: "media_unavailable" }, 404), cookieWrites);
    }
    if (!await hasBusinessReference(admin, source.path)) {
      return withCookies(respond({ error: "business_reference_not_found" }, 409), cookieWrites);
    }
    const lengthCheck = await readSourceObjectLengths(admin, source);
    if (lengthCheck.error) {
      const status = lengthCheck.error === "source_length_mismatch" ? 409 : 502;
      return withCookies(respond({ error: lengthCheck.error }, status), cookieWrites);
    }

    const { data: blob, error: downloadError } = await userContext.supabase.storage
      .from("media").download(source.path);
    if (downloadError || !blob) return withCookies(respond({ error: "source_unavailable" }, 502), cookieWrites);
    if (!Number.isSafeInteger(blob.size) || blob.size <= 0 || blob.size > MAX_MEDIA_BYTES) {
      return withCookies(respond({ error: "source_size_invalid" }, 413), cookieWrites);
    }
    let bytes;
    try { bytes = new Uint8Array(await blob.arrayBuffer()); }
    catch { return withCookies(respond({ error: "source_read_interrupted" }, 502), cookieWrites); }
    if (bytes.byteLength !== blob.size ||
        (lengthCheck.expectedBytes !== null && lengthCheck.expectedBytes !== bytes.byteLength)) {
      return withCookies(respond({ error: "source_length_mismatch" }, 409), cookieWrites);
    }
    const contentType = sniffImageMime(bytes);
    if (!contentType || (blob.type && blob.type.toLowerCase().split(";")[0] !== contentType)) {
      return withCookies(respond({ error: "source_mime_mismatch" }, 415), cookieWrites);
    }
    if (!await hasBusinessReference(admin, source.path)) {
      return withCookies(respond({ error: "business_reference_changed" }, 409), cookieWrites);
    }

    const sha256 = await sha256Media(bytes);
    const headers = await createR2MediaServiceHeaders({
      secret: env.R2_MEDIA_SERVICE_AUTH_SECRET,
      ownerId: source.ownerId,
      path: source.path,
      bytes: bytes.byteLength,
      sha256,
      contentType,
    });
    headers["Cache-Control"] = "private, no-store";
    const internalRequest = new Request(
      "https://media.internal" + R2_BUSINESS_STAGE_BYTES_PATH,
      { method: "POST", headers, body: bytes },
    );
    const mediaResponse = await env.R2_BUSINESS_MEDIA_SERVICE.fetch(internalRequest);
    return withCookies(new Response(mediaResponse.body, {
      status: mediaResponse.status,
      statusText: mediaResponse.statusText,
      headers: mediaResponse.headers,
    }), cookieWrites);
  } catch {
    return withCookies(respond({ error: "media_mirror_unavailable" }, 503), cookieWrites);
  }
}
