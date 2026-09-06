"use client";

import { useEffect } from "react";
import { rememberLocalOwnerContext } from "@/lib/local-owner-context";

export default function LocalOwnerContextSync() {
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    function remember(user?: { id?: string; email?: string | null } | null) {
      if (!user?.id) return;
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

    void start();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return null;
}
