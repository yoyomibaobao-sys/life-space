"use client";

import { useCallback, useEffect, useState } from "react";
import { probeCloudReachable } from "@/lib/cloud-reachability";

export function useCloudAvailability() {
  const [cloudAvailable, setCloudAvailable] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setCloudAvailable(false);
      return false;
    }
    const reachable = await probeCloudReachable();
    setCloudAvailable(reachable);
    return reachable;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const reachable = await refresh();
      if (cancelled) return;
      setCloudAvailable(reachable);
    }

    void check();

    function handleOffline() {
      setCloudAvailable(false);
    }

    function handleOnline() {
      void check();
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") void check();
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  return {
    cloudAvailable,
    cloudUnavailable: cloudAvailable === false,
    refresh,
  };
}
