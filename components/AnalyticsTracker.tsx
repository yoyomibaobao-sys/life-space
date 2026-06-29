"use client";

import { useEffect } from "react";
import { trackFirstOpenOnce } from "@/lib/analytics-events";

function readLocalCount(key: string) {
  if (typeof window === "undefined") return 0;

  const raw = window.localStorage.getItem(key);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export default function AnalyticsTracker() {
  useEffect(() => {
    void trackFirstOpenOnce({
      local_project_count: readLocalCount("lifespace_local_project_count"),
      local_record_count: readLocalCount("lifespace_local_record_count"),
      first_local_used_at: window.localStorage.getItem("lifespace_first_local_used_at") || null,
    });
  }, []);

  return null;
}
