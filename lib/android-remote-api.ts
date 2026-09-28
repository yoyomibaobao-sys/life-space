import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { supabase } from "@/lib/supabase";

const PRODUCTION_ORIGIN = "https://life-space.uk";
export type RemoteApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type NativeResponse = { status: number; data: unknown; headers: Record<string, string>; url?: string };
type NativeRequest = (options: {
  url: string; method: RemoteApiMethod; headers: Record<string, string>;
  data?: string; disableRedirects: boolean; responseType: "json";
  connectTimeout: number; readTimeout: number;
}) => Promise<NativeResponse>;

export type RemoteApiResult<T> = { status: number; ok: boolean; data: T | null; error: string | null };

export function remoteApiUrl(path: string) {
  if (!path.startsWith("/api/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("invalid_remote_api_path");
  }
  const url = new URL(path, PRODUCTION_ORIGIN);
  if (url.origin !== PRODUCTION_ORIGIN || !url.pathname.startsWith("/api/")) throw new Error("invalid_remote_api_origin");
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
    if (responseUrl.origin !== PRODUCTION_ORIGIN || result.status >= 300 && result.status < 400) {
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
