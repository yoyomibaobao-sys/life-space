"use client";
import { useEffect } from "react";
export default function GuideDirectoryCache() {
  useEffect(() => {
    let canceled = false;
    let busy = false;
    async function refresh() {
      if (!navigator.onLine || canceled || busy) return;
      busy = true;
      try {
        const [{ supabase }, { getSystemNameCandidates }] = await Promise.all([import("@/lib/supabase"), import("@/lib/system-name-candidates")]);
        if (!canceled) await getSystemNameCandidates({ supabase, includeOtherCategories: true, limit: null });
      } catch { /* Retain the last usable directory. */ } finally { busy = false; }
    }
    const timer = window.setTimeout(refresh, 1500);
    window.addEventListener("online", refresh);
    return () => { canceled = true; clearTimeout(timer); window.removeEventListener("online", refresh); };
  }, []);
  return null;
}
