"use client";

import { useEffect, useState } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// Page-managed mobile headers do not render Navbar's language action.
export default function GuestLanguageSwitcher() {
  const [isGuest, setIsGuest] = useState(false);
  useEffect(() => {
    let canceled = false;
    let unsubscribe: (() => void) | undefined;
    void import("@/lib/supabase").then(async ({ supabase }) => {
      if (canceled) return;
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!canceled) setIsGuest(!session?.user);
      });
      unsubscribe = () => subscription.unsubscribe();
      const { data } = await supabase.auth.getSession();
      if (!canceled) setIsGuest(!data.session?.user);
    }).catch(() => { if (!canceled) setIsGuest(true); });
    return () => { canceled = true; unsubscribe?.(); };
  }, []);
  return isGuest ? <LanguageSwitcher compact /> : null;
}
