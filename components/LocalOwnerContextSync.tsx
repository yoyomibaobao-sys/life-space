"use client";

import { rememberDefaultPlantingRegion } from "@/lib/planting-region";
import { rememberDefaultRecordLocation } from "@/lib/record-location";
import { useEffect } from "react";
import { rememberLocalOwnerContext } from "@/lib/local-owner-context";

export default function LocalOwnerContextSync() {
  useEffect(() => {
    let cancelled = false;
    let rememberedUserId = "";
    let unsubscribe: (() => void) | undefined;

    function remember(user?: { id?: string; email?: string | null } | null) {
      if (!user?.id) { rememberedUserId = ""; return; }
      if (rememberedUserId !== user.id) {
        rememberedUserId = user.id;
        const id = user.id;
        void import("@/lib/supabase").then(async ({ supabase }) => {
          const { data, error } = await supabase.from("profiles").select("location,country_code,country_name,region_name,city_name").eq("id", id).maybeSingle();
          if (!cancelled && !error && rememberedUserId === id) {
            rememberDefaultRecordLocation(id, data?.location);
            rememberDefaultPlantingRegion(id, data);
          }
        }).catch(() => { /* Retain the last known optional address while offline. */ });
      }
      rememberLocalOwnerContext({
        userId: user.id,
        email: user.email || null,
      });
    }

    async function start() {
      // Keep Supabase out of server-side layout evaluation. It is configured
      // only in the deployed browser environment.
      const { supabase } = await import("@/lib/supabase");
      if (cancelled) return;

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      remember(data.session?.user);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        remember(session?.user);
      });
      unsubscribe = () => subscription.unsubscribe();
    }

    void start().catch(() => { /* Offline operation does not require a cloud session. */ });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return null;
}
