"use client";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { showToast } from "@/components/Toast";
import {
  getCurrentMobileRoute,
  readMobileRouteHistory,
  rememberMobileRouteSource,
  restoreMobileRouteScroll,
  writeMobileRouteHistory,
} from "@/lib/mobile-navigation";

const MOBILE_BREAKPOINT = 760;
const EXIT_CONFIRM_WINDOW_MS = 2_000;

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
  return pathname === "/discover";
}

function hasActiveMobileOverlay() {
  return document.documentElement.dataset.mobileOverlayOpen === "true";
}

export default function MobileBackNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const navigatingRef = useRef(false);
  const lastExitRequestRef = useRef(0);
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
      writeMobileRouteHistory([currentRoute]);
      restoreMobileRouteScroll(currentRoute);
      return;
    }

    const history = readMobileRouteHistory();
    const lastRoute = history[history.length - 1];
    const previousRoute = history[history.length - 2];

    if (lastRoute === currentRoute) return;

    if (previousRoute === currentRoute) {
      writeMobileRouteHistory(history.slice(0, -1));
      restoreMobileRouteScroll(currentRoute);
      return;
    }

    const isNativeHomeRedirect =
      Capacitor.isNativePlatform() && lastRoute === "/" && pathname === "/archive";
    if (isNativeHomeRedirect) {
      writeMobileRouteHistory([currentRoute]);
      return;
    }

    writeMobileRouteHistory([...history, currentRoute]);
    restoreMobileRouteScroll(currentRoute);
  }, [currentRoute, pathname]);

  useEffect(() => {
    if (window.innerWidth >= MOBILE_BREAKPOINT) return;

    function rememberBeforeInternalNavigation(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

      try {
        const destination = new URL(link.href, window.location.href);
        if (destination.origin !== window.location.origin) return;
        rememberMobileRouteSource(getCurrentMobileRoute());
      } catch {
        // Ignore malformed third-party hrefs.
      }
    }

    document.addEventListener("click", rememberBeforeInternalNavigation, true);
    return () => document.removeEventListener("click", rememberBeforeInternalNavigation, true);
  }, []);

  const navigateBack = useCallback(() => {
    if (navigatingRef.current) return;

    if (pathname === "/experience" || pathname === "/plant") {
      navigatingRef.current = true;
      writeMobileRouteHistory(["/discover"]);
      router.replace("/discover");
      window.setTimeout(() => {
        navigatingRef.current = false;
      }, 450);
      return;
    }

    if (isAppExitRoot(pathname)) {
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
        const now = Date.now();
        if (now - lastExitRequestRef.current <= EXIT_CONFIRM_WINDOW_MS) {
          void App.exitApp();
          return;
        }
        lastExitRequestRef.current = now;
        showToast("再返回一次退出应用");
      }
      return;
    }

    const history = readMobileRouteHistory();
    if (history.length > 1) {
      navigatingRef.current = true;
      window.history.back();
      window.setTimeout(() => {
        navigatingRef.current = false;
      }, 450);
      return;
    }

    const destination = getLogicalParent(pathname);
    writeMobileRouteHistory([destination]);
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
