"use client";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const MOBILE_BREAKPOINT = 760;
const SESSION_HISTORY_KEY = "lifespace:mobile-route-history:v2";

function readSessionHistory() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SESSION_HISTORY_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeSessionHistory(paths: string[]) {
  try {
    sessionStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(paths.slice(-40)));
  } catch {
    // Native browser history still works when session storage is unavailable.
  }
}

function getLogicalParent(pathname: string) {
  if (/^\/local\/archive\/[^/]+/.test(pathname)) return "/local/archive";
  if (/^\/archive\/[^/]+/.test(pathname)) return "/discover";
  if (/^\/experience-cards\/[^/]+/.test(pathname)) return "/discover";
  if (pathname === "/experience-cards") return "/archive";
  if (pathname.startsWith("/discover/search")) return "/discover";
  if (/^\/plant\/[^/]+/.test(pathname)) return "/plant";
  if (/^\/market\/(new|mine|[^/]+)/.test(pathname)) return "/market";
  if (pathname.startsWith("/notifications")) return "/profile";
  if (/^\/membership\/(payment|benefits)/.test(pathname)) return "/profile";
  if (pathname.startsWith("/membership")) return "/profile";
  if (/^\/legal\/(privacy|terms|refunds|contact)/.test(pathname)) return "/legal";
  if (pathname.startsWith("/legal")) return "/profile";
  if (pathname.startsWith("/feedback")) return "/profile";
  if (pathname.startsWith("/admin")) return "/profile";
  if (/^\/profile\/.+/.test(pathname)) return "/profile";
  if (pathname.startsWith("/follow")) return "/discover";

  const publicProfileMatch = pathname.match(/^\/user\/([^/]+)\/profile/);
  if (publicProfileMatch) return `/user/${publicProfileMatch[1]}`;
  if (/^\/user\/[^/]+/.test(pathname)) return "/discover";

  return "/discover";
}

function isAppExitRoot(pathname: string) {
  return ["/", "/archive", "/discover", "/local/archive"].includes(pathname);
}

function hasActiveMobileOverlay() {
  return document.documentElement.dataset.mobileOverlayOpen === "true";
}

export default function MobileBackNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const navigatingRef = useRef(false);
  const historyInitializedRef = useRef(false);
  const search = searchParams.toString();
  const currentRoute = useMemo(
    () => `${pathname}${search ? `?${search}` : ""}`,
    [pathname, search],
  );

  useEffect(() => {
    if (window.innerWidth >= MOBILE_BREAKPOINT) return;

    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      writeSessionHistory([currentRoute]);
      return;
    }

    const history = readSessionHistory();
    const lastRoute = history[history.length - 1];
    const previousRoute = history[history.length - 2];

    if (lastRoute === currentRoute) return;

    if (previousRoute === currentRoute) {
      writeSessionHistory(history.slice(0, -1));
      return;
    }

    const isNativeHomeRedirect =
      Capacitor.isNativePlatform() && lastRoute === "/" && pathname === "/archive";
    if (isNativeHomeRedirect) {
      writeSessionHistory([currentRoute]);
      return;
    }

    writeSessionHistory([...history, currentRoute]);
  }, [currentRoute, pathname]);

  const navigateBack = useCallback(() => {
    if (navigatingRef.current) return;

    const history = readSessionHistory();
    if (history.length > 1) {
      navigatingRef.current = true;
      window.history.back();
      window.setTimeout(() => {
        navigatingRef.current = false;
      }, 450);
      return;
    }

    if (isAppExitRoot(pathname)) {
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
        void App.exitApp();
      }
      return;
    }

    const destination = getLogicalParent(pathname);
    writeSessionHistory([destination]);
    router.replace(destination);
  }, [pathname, router]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      return;
    }

    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;

    void App.addListener("backButton", () => {
      if (hasActiveMobileOverlay()) {
        window.history.back();
        return;
      }

      navigateBack();
    }).then((handle) => {
      if (disposed) void handle.remove();
      else listener = handle;
    });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [navigateBack]);

  return null;
}
