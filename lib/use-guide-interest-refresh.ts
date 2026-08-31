"use client";

import { useEffect } from "react";
import { GUIDE_INTERESTS_CHANGED } from "@/lib/guide-interests";
import { supabase } from "@/lib/supabase";

// Returning from the saved-guides page (including browser cache or another tab)
// must reflect removals. A failed read must not erase a confirmed saved state.
export function useGuideInterestRefresh(userId: string | null, guideId: string | undefined, plant: boolean, onChange: (saved: boolean) => void) {
  useEffect(() => {
    if (!userId || !guideId) return;
    let active = true;
    let latestRequest = 0;
    async function refresh() {
      const request = ++latestRequest;
      const { data, error } = await supabase
        .from(plant ? "user_plant_interests" : "user_guide_interests")
        .select(plant ? "species_id" : "guide_id")
        .eq("user_id", userId)
        .eq(plant ? "species_id" : "guide_id", guideId)
        .maybeSingle();
      if (active && request === latestRequest && !error) onChange(Boolean(data));
    }
    const refreshQuietly = () => { void refresh().catch(() => undefined); };
    window.addEventListener("focus", refreshQuietly);
    window.addEventListener("pageshow", refreshQuietly);
    window.addEventListener(GUIDE_INTERESTS_CHANGED, refreshQuietly);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshQuietly);
      window.removeEventListener("pageshow", refreshQuietly);
      window.removeEventListener(GUIDE_INTERESTS_CHANGED, refreshQuietly);
    };
  }, [userId, guideId, plant, onChange]);
}
