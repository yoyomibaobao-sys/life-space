export const OFFICIAL_SITE_ORIGIN = "https://life-space.uk";
export const CLOUD_PROBE_TIMEOUT_MS = 8_000;

const SHELL_FLAG = "__LIFESPACE_OFFLINE_SHELL__";

declare global {
  interface Window {
    __LIFESPACE_OFFLINE_SHELL__?: boolean;
  }
}

export function markBundledOfflineShell() {
  if (typeof window === "undefined") return;
  window.__LIFESPACE_OFFLINE_SHELL__ = true;
}

export function isBundledOfflineShell() {
  return typeof window !== "undefined" && window.__LIFESPACE_OFFLINE_SHELL__ === true;
}

export function getCloudProbeOrigin() {
  if (typeof window === "undefined") return OFFICIAL_SITE_ORIGIN;
  if (isBundledOfflineShell()) return OFFICIAL_SITE_ORIGIN;
  return window.location.origin;
}

function errorText(error: unknown) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "object") {
    const record = error as {
      name?: unknown;
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    return [record.name, record.message, record.details, record.hint, record.code]
      .filter(Boolean)
      .join(" ");
  }
  return String(error);
}

function numericStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    status_code?: unknown;
  };
  const value = Number(record.status ?? record.statusCode ?? record.status_code);
  return Number.isFinite(value) ? value : null;
}

export function isCloudUnavailableError(error: unknown) {
  if (!error) return false;

  const status = numericStatus(error);
  if (status === 0 || status === 408 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  const name =
    error instanceof Error
      ? error.name
      : error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name || "")
        : "";
  if (
    name === "TypeError" ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "NetworkError"
  ) {
    const message = errorText(error);
    if (name === "TypeError" && !/fetch|network|load failed|failed to load/i.test(message)) {
      return false;
    }
    if (name === "TypeError") return true;
    return true;
  }

  const text = errorText(error);
  return /failed to fetch|network request failed|load failed|err_internet|err_name_not_resolved|err_connection|err_timed_out|err_address|econnrefused|enotfound|etimedout|timeout|dns|offline/i.test(
    text
  );
}

export async function probeOfficialSite(timeoutMs = CLOUD_PROBE_TIMEOUT_MS) {
  if (typeof window === "undefined") return false;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const url = `${getCloudProbeOrigin()}/login?ls_cloud_probe=${Date.now()}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      headers: { Accept: "text/html" },
      signal: controller.signal,
    });
    if (response.status === 408 || response.status === 502 || response.status === 503 || response.status === 504) {
      return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function probeSupabaseAuth(timeoutMs = CLOUD_PROBE_TIMEOUT_MS) {
  if (typeof window === "undefined") return false;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  if (!supabaseUrl || !supabaseKey) return false;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (response.status === 408 || response.status === 502 || response.status === 503 || response.status === 504) {
      return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function probeCloudReachable(timeoutMs = CLOUD_PROBE_TIMEOUT_MS) {
  const siteOk = await probeOfficialSite(timeoutMs);
  if (!siteOk) return false;
  return probeSupabaseAuth(timeoutMs);
}

export function replaceWithOfficialSite() {
  if (typeof window === "undefined" || !isBundledOfflineShell()) return;
  window.location.replace(`${OFFICIAL_SITE_ORIGIN}/`);
}
