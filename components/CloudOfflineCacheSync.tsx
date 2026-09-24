"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";
import type { CloudOfflineCacheArchiveSource } from "@/lib/cloud-offline-cache";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Warm private, thumbnail-only copies after sign-in even if the owner never
// visits My space. The offline document can only read what was saved here.
export default function CloudOfflineCacheSync() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

    let disposed = false;
    let currentUserId = "";
    let inFlight = false;
    let lastCompletedAt = 0;
    let unsubscribe: (() => void) | undefined;

    async function refresh() {
      if (disposed || inFlight || !navigator.onLine || !currentUserId) return;
      if (Date.now() - lastCompletedAt < REFRESH_INTERVAL_MS) return;
      inFlight = true;
      const userId = currentUserId;
      try {
        const { supabase } = await import("@/lib/supabase");
        const { refreshCloudOfflineCaches } = await import("@/lib/cloud-offline-cache");
        const { data, error } = await supabase
          .from("archives")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (disposed || currentUserId !== userId) return;
        await refreshCloudOfflineCaches(
          (data || []) as CloudOfflineCacheArchiveSource[],
          { userId },
        );
        lastCompletedAt = Date.now();
      } catch (error) {
        console.warn("cloud offline cache refresh failed", error);
      } finally {
        inFlight = false;
      }
    }

    async function start() {
      const { supabase } = await import("@/lib/supabase");
      if (disposed) return;
      const { data } = await supabase.auth.getSession();
      if (disposed) return;
      currentUserId = data.session?.user.id || "";
      void refresh();
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          const nextUserId = session?.user.id || "";
          if (currentUserId !== nextUserId) lastCompletedAt = 0;
          currentUserId = nextUserId;
          // Schedule database calls outside the auth callback.
          window.setTimeout(() => void refresh(), 0);
        },
      );
      unsubscribe = () => subscription.unsubscribe();
    }

    void start().catch((error) => console.warn("cloud offline cache setup failed", error));
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      unsubscribe?.();
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
