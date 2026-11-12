const DEFAULT_SIGNED_IN_PATH = "/archive";
export const OFFICIAL_AUTH_ORIGIN = "https://life-space.uk";
const PRODUCTION_SUPABASE = "https://eidltoikfpnrzxruvawf.supabase.co";
const QA_SUPABASE = "https://mablwxlipcgbmbnfdbkc.supabase.co";

function resolveAuthRedirectOrigin() {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const configured = process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim();
  if (!projectUrl && !configured) return OFFICIAL_AUTH_ORIGIN; // Legacy production web builds.
  if (projectUrl === PRODUCTION_SUPABASE && !configured) return OFFICIAL_AUTH_ORIGIN;
  if (projectUrl !== PRODUCTION_SUPABASE && projectUrl !== QA_SUPABASE) throw new Error("unknown_auth_environment");
  if (projectUrl === QA_SUPABASE && !configured) throw new Error("qa_auth_redirect_origin_missing");
  const url = new URL(configured || OFFICIAL_AUTH_ORIGIN);
  if (url.protocol !== "https:" || url.origin !== (configured || OFFICIAL_AUTH_ORIGIN) || url.username || url.password) {
    throw new Error("invalid_auth_redirect_origin");
  }
  if (projectUrl === QA_SUPABASE && url.origin === OFFICIAL_AUTH_ORIGIN) throw new Error("qa_auth_redirect_to_production_rejected");
  if (projectUrl === PRODUCTION_SUPABASE && url.origin !== OFFICIAL_AUTH_ORIGIN) throw new Error("production_auth_redirect_mismatch");
  return url.origin;
}

export function buildAuthEmailRedirect(kind: "signup" | "recovery", returnTo?: string | null) {
  const origin = resolveAuthRedirectOrigin();
  if (kind === "recovery") return `${origin}/auth/confirm?type=recovery`;
  return `${origin}/auth/confirm?returnTo=${encodeURIComponent(getSafeReturnTo(returnTo))}`;
}

function isSafeInternalPath(value: string) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function getSafeReturnTo(
  value: string | null | undefined,
  fallback = DEFAULT_SIGNED_IN_PATH,
) {
  const candidate = String(value || "").trim();
  if (!isSafeInternalPath(candidate)) return fallback;

  const pathOnly = candidate.split(/[?#]/, 1)[0];
  if (["/login", "/register", "/check-email", "/reset-password"].includes(pathOnly) || pathOnly.startsWith("/auth/")) return fallback;

  return candidate;
}

export function buildLoginHref(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(getSafeReturnTo(returnTo))}`;
}

export function buildRegisterHref(returnTo: string) {
  return `/register?returnTo=${encodeURIComponent(getSafeReturnTo(returnTo))}`;
}

export function getCurrentInternalPath() {
  if (typeof window === "undefined") return DEFAULT_SIGNED_IN_PATH;
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
