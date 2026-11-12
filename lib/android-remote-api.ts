import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { supabase } from "@/lib/supabase";

const PRODUCTION_ORIGIN = "https://life-space.uk";
const PRODUCTION_SUPABASE = "https://eidltoikfpnrzxruvawf.supabase.co";
const ISOLATED_QA_SUPABASE = "https://mablwxlipcgbmbnfdbkc.supabase.co";

function resolveApiEnvironment() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const configuredOrigin = process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN?.trim() || "";
  if (supabaseUrl !== PRODUCTION_SUPABASE && supabaseUrl !== ISOLATED_QA_SUPABASE) {
    throw new Error("unsupported_android_api_environment");
  }
  if (supabaseUrl === ISOLATED_QA_SUPABASE && (!configuredOrigin || configuredOrigin === PRODUCTION_ORIGIN)) {
    throw new Error("qa_export_to_production_rejected");
  }
  if (supabaseUrl === PRODUCTION_SUPABASE && configuredOrigin && configuredOrigin !== PRODUCTION_ORIGIN) {
    throw new Error("production_api_origin_mismatch");
  }
  const origin = configuredOrigin || PRODUCTION_ORIGIN;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("invalid_remote_api_origin");
  }
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) {
    throw new Error("invalid_remote_api_origin");
  }
  return { origin, supabaseUrl };
}

// Check the session's Supabase issuer before passing its Bearer token to an
// external HTTPS origin. Server-side signature and Owner checks remain required.
function tokenMatchesEnvironment(token: string, supabaseUrl: string) {
  try {
    const payload = JSON.parse(atob((token.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/")));
    return payload.iss === `${supabaseUrl}/auth/v1`;
  } catch {
    return false;
  }
}
export type RemoteApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type NativeResponse = { status: number; data: unknown; headers: Record<string, string>; url?: string };
type NativeRequest = (options: {
  url: string; method: RemoteApiMethod; headers: Record<string, string>;
  data?: string; disableRedirects: boolean; responseType: "json";
  connectTimeout: number; readTimeout: number;
}) => Promise<NativeResponse>;

export type RemoteApiResult<T> = { status: number; ok: boolean; data: T | null; error: string | null };

export function remoteApiUrl(path: string) {
  const { origin } = resolveApiEnvironment();
  if (!path.startsWith("/api/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("invalid_remote_api_path");
  }
  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith("/api/")) throw new Error("invalid_remote_api_origin");
  return url.href;
}

// Native method calls run in Capacitor's HTTP plugin, outside WebView's
// shouldInterceptRequest and WebViewLocalServer. No global fetch patch.
export async function requestAndroidRemoteApi<T>(path: string, options: {
  method?: RemoteApiMethod;
  json?: unknown;
  // Explicit Bearer-only contract. Cookie-dependent routes stay web-only.
  token?: string | null;
  nativeRequest?: NativeRequest;
  isNative?: boolean;
} = {}): Promise<RemoteApiResult<T>> {
  const url = remoteApiUrl(path);
  const method = options.method || "GET";
  const native = options.isNative ?? Capacitor.isNativePlatform();
  if (!native) return { status: 0, ok: false, data: null, error: "native_transport_required" };
  if ((method === "GET" || method === "DELETE") && options.json !== undefined) {
    return { status: 0, ok: false, data: null, error: "invalid_request_body" };
  }
  try {
    const auth = options.token === undefined
      ? (await supabase.auth.getSession()).data.session?.access_token || null
      : options.token;
    if (!auth) return { status: 401, ok: false, data: null, error: "not_authenticated" };
    if (!tokenMatchesEnvironment(auth, resolveApiEnvironment().supabaseUrl)) {
      return { status: 0, ok: false, data: null, error: "api_session_environment_mismatch" };
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth}`,
      Accept: "application/json",
    };
    if (options.json !== undefined) headers["Content-Type"] = "application/json";
    const result = await (options.nativeRequest || CapacitorHttp.request)({
      url, method, headers, data: options.json === undefined ? undefined : JSON.stringify(options.json),
      disableRedirects: true, responseType: "json", connectTimeout: 10000, readTimeout: 30000,
    });
    const responseUrl = result.url ? new URL(result.url, url) : new URL(url);
    if (responseUrl.origin !== new URL(url).origin || result.status >= 300 && result.status < 400) {
      return { status: result.status, ok: false, data: null, error: "remote_redirect_rejected" };
    }
    let data: T | null = null;
    if (result.data !== "" && result.data != null) {
      data = (typeof result.data === "string" ? JSON.parse(result.data) : result.data) as T;
      if (typeof data !== "object" || data === null) throw new Error("invalid_json_response");
    }
    return { status: result.status, ok: result.status >= 200 && result.status < 300, data,
      error: result.status >= 200 && result.status < 300 ? null : "remote_api_error" };
  } catch {
    return { status: 0, ok: false, data: null, error: "network_or_response_error" };
  }
}
