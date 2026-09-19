"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useSupportIdentity() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let authChanged = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      authChanged = true;
      setError(false);
      setUserId(session?.user.id ?? null);
    });
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!active || authChanged) return;
      if (authError && authError.name !== "AuthSessionMissingError") setError(true);
      setUserId(data.user?.id ?? null);
    }).catch(() => { if (active && !authChanged) setError(true); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [revision]);
  return { userId, error, retry: () => { setError(false); setUserId(undefined); setRevision(value => value + 1); } };
}
