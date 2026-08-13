const DEFAULT_SIGNED_IN_PATH = "/archive";

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
  if (pathOnly === "/login" || pathOnly === "/register") return fallback;

  return candidate;
}

export function buildLoginHref(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(getSafeReturnTo(returnTo))}`;
}

export function getCurrentInternalPath() {
  if (typeof window === "undefined") return DEFAULT_SIGNED_IN_PATH;
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
