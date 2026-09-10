"use client";

import { useEffect, useRef, useState } from "react";
import { loadDefaultPlantingRegion, normalizePlantingRegion, rememberDefaultPlantingRegion, type PlantingRegion } from "@/lib/planting-region";

export function usePlantingRegionDraft() {
  const [plantingRegion, setPlantingRegion] = useState<PlantingRegion | null>(null);
  const changed = useRef(false);
  useEffect(() => {
    let active = true;
    setPlantingRegion(loadDefaultPlantingRegion());
    void import("@/lib/supabase").then(async ({ supabase }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !active) return;
      const { data, error } = await supabase.from("profiles").select("country_code,country_name,region_name,city_name").eq("id", session.user.id).maybeSingle();
      if (error || !active) return;
      const latest = await supabase.auth.getSession();
      if (latest.data.session?.user.id !== session.user.id || !active) return;
      rememberDefaultPlantingRegion(session.user.id, data);
      if (!changed.current) setPlantingRegion(normalizePlantingRegion(data));
    }).catch(() => { /* Manual region entry must work without a connection. */ });
    return () => { active = false; };
  }, []);
  return { plantingRegion, changePlantingRegion: (value: PlantingRegion) => { changed.current = true; setPlantingRegion(value); } };
}
