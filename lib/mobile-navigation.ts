const ROUTE_HISTORY_KEY = "lifespace:mobile-route-history:v3";
const SCROLL_POSITIONS_KEY = "lifespace:mobile-scroll-positions:v1";
const RESTORE_SCROLL_KEY = "lifespace:mobile-restore-scroll:v1";

function isSafeInternalRoute(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  if (value.startsWith("//") || value.includes("\\")) return false;

  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function getCurrentMobileRoute() {
  if (typeof window === "undefined") return "/discover";
  return `${window.location.pathname}${window.location.search}`;
}

export function readMobileRouteHistory() {
  if (typeof window === "undefined") return [] as string[];

  try {
    const parsed = JSON.parse(sessionStorage.getItem(ROUTE_HISTORY_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter(isSafeInternalRoute)
      : [];
  } catch {
    return [];
  }
}

export function writeMobileRouteHistory(routes: string[]) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(
      ROUTE_HISTORY_KEY,
      JSON.stringify(routes.filter(isSafeInternalRoute).slice(-40)),
    );
  } catch {
    // Browser history remains available when session storage is unavailable.
  }
}

function readScrollPositions() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SCROLL_POSITIONS_KEY) || "{}");
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

export function rememberMobileRouteSource(route = getCurrentMobileRoute()) {
  if (typeof window === "undefined" || !isSafeInternalRoute(route)) return;

  const history = readMobileRouteHistory();
  if (history.length === 0) {
    writeMobileRouteHistory([route]);
  } else if (history[history.length - 1] !== route) {
    writeMobileRouteHistory([...history.slice(0, -1), route]);
  }

  try {
    const positions = readScrollPositions();
    positions[route] = Math.max(0, Math.round(window.scrollY));
    const recentRoutes = new Set(readMobileRouteHistory().slice(-30));
    const compact = Object.fromEntries(
      Object.entries(positions).filter(([key]) => recentRoutes.has(key)),
    );
    sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(compact));
  } catch {
    // Scroll restoration is best effort only.
  }
}

export function getMobileSourceRoute(
  currentRoute: string,
  fallbackHref: string,
) {
  const history = readMobileRouteHistory();
  const currentIndex = history.lastIndexOf(currentRoute);
  const source = currentIndex > 0 ? history[currentIndex - 1] : null;
  return isSafeInternalRoute(source) && source !== currentRoute
    ? source
    : fallbackHref;
}

export function prepareMobileSourceReturn(
  currentRoute: string,
  destination: string,
) {
  if (typeof window === "undefined" || !isSafeInternalRoute(destination)) return;

  rememberMobileRouteSource(currentRoute);
  const history = readMobileRouteHistory();
  const currentIndex = history.lastIndexOf(currentRoute);
  if (currentIndex > 0 && history[currentIndex - 1] === destination) {
    writeMobileRouteHistory(history.slice(0, currentIndex));
  } else {
    writeMobileRouteHistory([destination]);
  }

  try {
    const scrollY = readScrollPositions()[destination];
    if (Number.isFinite(scrollY)) {
      sessionStorage.setItem(
        RESTORE_SCROLL_KEY,
        JSON.stringify({ route: destination, scrollY }),
      );
    }
  } catch {
    // Returning to the page still works without scroll restoration.
  }
}

export function restoreMobileRouteScroll(currentRoute: string) {
  if (typeof window === "undefined") return;

  try {
    const parsed = JSON.parse(sessionStorage.getItem(RESTORE_SCROLL_KEY) || "null") as {
      route?: string;
      scrollY?: number;
    } | null;
    if (!parsed || parsed.route !== currentRoute || !Number.isFinite(parsed.scrollY)) {
      return;
    }

    sessionStorage.removeItem(RESTORE_SCROLL_KEY);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo(0, Number(parsed.scrollY)));
    });
  } catch {
    // Scroll restoration is best effort only.
  }
}

export function isSafeMobileInternalHref(value: string) {
  return typeof window !== "undefined" && isSafeInternalRoute(value);
}

export const MOBILE_ROUTE_HISTORY_KEY = ROUTE_HISTORY_KEY;
