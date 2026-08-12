"use client";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const MOBILE_BREAKPOINT = 760;
const MIN_HORIZONTAL_DISTANCE = 72;
const MAX_VERTICAL_DISTANCE = 56;
const MAX_GESTURE_DURATION_MS = 700;
const SESSION_HISTORY_KEY = "lifespace:mobile-route-history:v1";

type TouchOrigin = {
  x: number;
  y: number;
  at: number;
  target: EventTarget | null;
};

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
    sessionStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(paths.slice(-30)));
  } catch {
    // Session history is only a fallback; navigation still works without storage.
  }
}

function getLogicalParent(pathname: string) {
  if (/^\/archive\/[^/]+/.test(pathname)) return "/archive";
  if (/^\/local\/archive\/[^/]+/.test(pathname)) return "/archive";
  if (/^\/experience-cards\/[^/]+/.test(pathname)) return "/experience-cards";
  if (pathname === "/experience-cards") return "/archive";
  if (pathname.startsWith("/discover/search")) return "/discover";
  if (/^\/plant\/[^/]+/.test(pathname)) return "/plant";
  if (/^\/market\/(new|mine|[^/]+)/.test(pathname)) return "/market";
  if (pathname.startsWith("/notifications")) return "/profile";
  if (pathname.startsWith("/membership")) return "/profile";
  if (pathname.startsWith("/admin")) return "/profile";
  if (/^\/profile\/.+/.test(pathname)) return "/profile";

  const publicProfileMatch = pathname.match(/^\/user\/([^/]+)\/profile/);
  if (publicProfileMatch) return `/user/${publicProfileMatch[1]}`;
  if (/^\/user\/[^/]+/.test(pathname)) return "/discover";

  return "/discover";
}

function isAppHome(pathname: string) {
  return pathname === "/" || pathname === "/discover";
}

function shouldIgnoreGestureTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.closest(
      "input, textarea, select, button, video, [data-mobile-swipe-ignore='true']"
    )
  ) {
    return true;
  }

  let current: HTMLElement | null = target;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const canScrollHorizontally =
      /(auto|scroll)/.test(style.overflowX) &&
      current.scrollWidth > current.clientWidth + 2;
    if (canScrollHorizontally) return true;
    current = current.parentElement;
  }

  return false;
}

function hasActiveMobileOverlay() {
  return document.documentElement.dataset.mobileOverlayOpen === "true";
}

export default function MobileBackNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const originRef = useRef<TouchOrigin | null>(null);
  const navigatingRef = useRef(false);
  const historyInitializedRef = useRef(false);

  const navigateToPreviousPath = useCallback(() => {
    if (navigatingRef.current || isAppHome(pathname)) return false;

    navigatingRef.current = true;
    const history = readSessionHistory();
    const currentIndex = history.lastIndexOf(pathname);
    const previousPath = currentIndex > 0 ? history[currentIndex - 1] : null;
    const destination = previousPath || getLogicalParent(pathname);
    writeSessionHistory(
      previousPath ? history.slice(0, currentIndex) : [destination]
    );
    router.replace(destination);

    window.setTimeout(() => {
      navigatingRef.current = false;
    }, 450);

    return true;
  }, [pathname, router]);

  useEffect(() => {
    if (window.innerWidth >= MOBILE_BREAKPOINT) return;
    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      writeSessionHistory([pathname]);
      return;
    }
    const history = readSessionHistory();
    if (history[history.length - 1] !== pathname) {
      writeSessionHistory([...history, pathname]);
    }
  }, [pathname]);

  useEffect(() => {
    if (window.innerWidth >= MOBILE_BREAKPOINT || isAppHome(pathname)) return;

    const guardState = {
      ...(window.history.state || {}),
      __lifespaceMobileBackGuard: pathname,
    };
    window.history.pushState(guardState, "", window.location.href);

    function handlePopState() {
      if (navigatingRef.current || hasActiveMobileOverlay()) return;
      navigateToPreviousPath();
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [navigateToPreviousPath, pathname]);

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

      if (!isAppHome(pathname)) {
        if (
          window.history.state?.__lifespaceMobileBackGuard === pathname
        ) {
          window.history.back();
        } else {
          navigateToPreviousPath();
        }
        return;
      }

      void App.exitApp();
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        listener = handle;
      }
    });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [navigateToPreviousPath, pathname]);

  useEffect(() => {
    function handleTouchStart(event: TouchEvent) {
      if (
        window.innerWidth >= MOBILE_BREAKPOINT ||
        event.touches.length !== 1 ||
        hasActiveMobileOverlay()
      ) {
        originRef.current = null;
        return;
      }

      const touch = event.touches[0];
      if (shouldIgnoreGestureTarget(event.target)) {
        originRef.current = null;
        return;
      }

      originRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        at: Date.now(),
        target: event.target,
      };
    }

    function handleTouchMove(event: TouchEvent) {
      const origin = originRef.current;
      const touch = event.touches[0];
      if (!origin || !touch || event.touches.length !== 1) return;

      const horizontalDistance = Math.abs(touch.clientX - origin.x);
      const verticalDistance = Math.abs(touch.clientY - origin.y);
      if (
        horizontalDistance > 14 &&
        horizontalDistance > verticalDistance * 1.25
      ) {
        event.preventDefault();
      }
    }

    function handleTouchEnd(event: TouchEvent) {
      const origin = originRef.current;
      originRef.current = null;
      if (!origin || navigatingRef.current || event.changedTouches.length !== 1) return;

      const touch = event.changedTouches[0];
      const horizontalDistance = Math.abs(touch.clientX - origin.x);
      const verticalDistance = Math.abs(touch.clientY - origin.y);
      const duration = Date.now() - origin.at;
      if (
        horizontalDistance < MIN_HORIZONTAL_DISTANCE ||
        verticalDistance > MAX_VERTICAL_DISTANCE ||
        horizontalDistance < verticalDistance * 1.35 ||
        duration > MAX_GESTURE_DURATION_MS ||
        isAppHome(pathname)
      ) {
        return;
      }

      navigateToPreviousPath();
    }

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [navigateToPreviousPath, pathname]);

  return null;
}
