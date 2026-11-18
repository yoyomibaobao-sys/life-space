import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

type PendingCookie = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

function json(status: number, body: { error?: string; ok?: boolean }) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function isSameOriginRequest(request: Request) {
  if ((request.headers.get("sec-fetch-site") || "").toLowerCase() === "cross-site") {
    return false;
  }
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("supabase_not_configured");

  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("supabase_url_invalid");
  }
  const projectRef = parsed.hostname.split(".")[0];
  if (!projectRef || !/^[a-z0-9-]+$/i.test(projectRef)) {
    throw new Error("supabase_project_ref_invalid");
  }
  return { url: parsed.origin, anonKey, projectRef };
}

function clearAuthCookies(
  response: NextResponse,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  projectRef: string,
  secure: boolean,
) {
  const prefix = `sb-${projectRef}-auth-token`;
  const names = new Set<string>([prefix, `${prefix}-code-verifier`]);
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name === prefix || cookie.name.startsWith(`${prefix}.`) ||
        cookie.name.startsWith(`${prefix}-`)) {
      names.add(cookie.name);
    }
  }
  for (const name of names) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      sameSite: "lax",
      secure,
    });
  }
}

function applyAuthCookies(response: NextResponse, pending: PendingCookie[]) {
  for (const cookie of pending) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json(403, { error: "same_origin_required" });
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !==
      "application/json") {
    return json(415, { error: "json_required" });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json(400, { error: "invalid_request" });
  }
  if (new TextEncoder().encode(raw).byteLength > 16_384) {
    return json(413, { error: "request_too_large" });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid_request" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(400, { error: "invalid_request" });
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["access_token", "refresh_token"].includes(key)) ||
      typeof input.access_token !== "string" || input.access_token.length < 20 ||
      input.access_token.length > 16_384 ||
      typeof input.refresh_token !== "string" || input.refresh_token.length < 20 ||
      input.refresh_token.length > 8_192) {
    return json(400, { error: "invalid_session" });
  }

  try {
    const { url, anonKey, projectRef } = getSupabaseConfig();
    const requestUrl = new URL(request.url);
    const secure = requestUrl.protocol === "https:";
    const cookieStore = await cookies();

    // Verify the supplied access token before writing any server-readable cookie.
    const verifier = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data: verifiedToken, error: tokenError } =
      await verifier.auth.getUser(input.access_token);
    if (tokenError || !verifiedToken.user?.id) {
      const response = json(401, { error: "invalid_session" });
      clearAuthCookies(response, cookieStore, projectRef, secure);
      return response;
    }

    const pending: PendingCookie[] = [];
    const cookieClient = createServerClient(url, anonKey, {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure,
        httpOnly: true,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(values) {
          pending.push(...values);
        },
      },
    });

    const { data: sessionData, error: sessionError } = await cookieClient.auth.setSession({
      access_token: input.access_token,
      refresh_token: input.refresh_token,
    });
    if (sessionError || sessionData.user?.id !== verifiedToken.user.id) {
      const response = json(401, { error: "invalid_session" });
      clearAuthCookies(response, cookieStore, projectRef, secure);
      return response;
    }

    const { data: verifiedCookie, error: cookieError } = await cookieClient.auth.getUser();
    if (cookieError || verifiedCookie.user?.id !== verifiedToken.user.id) {
      const response = json(401, { error: "invalid_session" });
      clearAuthCookies(response, cookieStore, projectRef, secure);
      return response;
    }

    return applyAuthCookies(json(200, { ok: true }), pending);
  } catch {
    return json(503, { error: "session_sync_unavailable" });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return json(403, { error: "same_origin_required" });

  try {
    const { projectRef } = getSupabaseConfig();
    const secure = new URL(request.url).protocol === "https:";
    const cookieStore = await cookies();
    const response = json(200, { ok: true });
    clearAuthCookies(response, cookieStore, projectRef, secure);
    return response;
  } catch {
    return json(503, { error: "session_sync_unavailable" });
  }
}
