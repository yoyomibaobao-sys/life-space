"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackAnalyticsEvent, trackFirstOpenOnce } from "@/lib/analytics-events";

const LAST_PAGE_VIEW_KEY = "lifespace_last_page_view";
const PAGE_VIEW_DEDUPE_MS = 30_000;

const STATIC_ANALYTICS_PATHS = new Set([
  "/",
  "/admin/memberships",
  "/archive",
  "/archive/interests",
  "/archive/new",
  "/archive/plans",
  "/check-email",
  "/discover",
  "/discover/search",
  "/experience",
  "/experience/search",
  "/experience-cards",
  "/experience-cards/new",
  "/feedback",
  "/follow",
  "/legal",
  "/legal/contact",
  "/legal/privacy",
  "/legal/refunds",
  "/legal/terms",
  "/local",
  "/local/archive",
  "/local/archive/new",
  "/login",
  "/market",
  "/market/messages",
  "/market/mine",
  "/market/new",
  "/membership",
  "/membership/benefits",
  "/membership/payment",
  "/membership/refund",
  "/notifications",
  "/plant",
  "/profile",
  "/profile/flowers",
  "/profile/followers",
  "/profile/helpful",
  "/profile/recent",
  "/profile/trash",
  "/quick-record",
  "/register",
  "/reset-password",
]);

const DYNAMIC_ROUTE_PATTERNS: Array<[RegExp, string]> = [
  [/^\/local\/archive\/[^/]+$/, "/local/archive/[id]"],
  [/^\/archive\/[^/]+$/, "/archive/[id]"],
  [/^\/experience-cards\/[^/]+\/edit$/, "/experience-cards/[id]/edit"],
  [/^\/experience-cards\/[^/]+$/, "/experience-cards/[id]"],
  [/^\/market\/[^/]+\/edit$/, "/market/[id]/edit"],
  [/^\/market\/[^/]+$/, "/market/[id]"],
  [/^\/user\/[^/]+\/profile$/, "/user/[id]/profile"],
  [/^\/user\/[^/]+$/, "/user/[id]"],
  [/^\/plant\/guide\/[^/]+$/, "/plant/guide/[id]"],
  [/^\/plant\/[^/]+$/, "/plant/[id]"],
];

export function normalizeAnalyticsPath(pathname: string) {
  const rawPath = pathname.startsWith("/") ? pathname : "/";
  const safePath = rawPath === "/" ? "/" : rawPath.replace(/\/+$/, "");
  if (STATIC_ANALYTICS_PATHS.has(safePath)) return safePath;
  for (const [pattern, replacement] of DYNAMIC_ROUTE_PATTERNS) {
    if (pattern.test(safePath)) return replacement;
  }
  return "/not-found";
}

function readLocalCount(key: string) {
  if (typeof window === "undefined") return 0;

  const raw = window.localStorage.getItem(key);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    void trackFirstOpenOnce({
      local_project_count: readLocalCount("lifespace_local_project_count"),
      local_record_count: readLocalCount("lifespace_local_record_count"),
      first_local_used_at: window.localStorage.getItem("lifespace_first_local_used_at") || null,
    });
  }, []);

  useEffect(() => {
    const path = normalizeAnalyticsPath(pathname || "/");
    const now = Date.now();

    try {
      const previous = JSON.parse(
        window.sessionStorage.getItem(LAST_PAGE_VIEW_KEY) || "null"
      ) as { path?: string; recorded_at?: number } | null;

      if (
        previous?.path === path &&
        Number.isFinite(previous.recorded_at) &&
        now - Number(previous.recorded_at) < PAGE_VIEW_DEDUPE_MS
      ) {
        return;
      }

      window.sessionStorage.setItem(
        LAST_PAGE_VIEW_KEY,
        JSON.stringify({ path, recorded_at: now })
      );
    } catch {
      // Analytics must never block navigation when browser storage is unavailable.
    }

    void trackAnalyticsEvent("page_view", { path });
  }, [pathname]);

  return null;
}
