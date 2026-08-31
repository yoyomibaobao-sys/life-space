import { supabase } from "@/lib/supabase";

export const GUIDE_INTERESTS_CHANGED = "guide-interests-changed";

export async function getGuideInterestCount(userId: string) {
  const results = await Promise.all([
    supabase.from("user_plant_interests").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("user_guide_interests").select("guide_id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  // Do not present a partial total as if it were the complete favorites count.
  if (results.some((result) => result.error)) return null;
  return results.reduce((total, result) => total + (result.count || 0), 0);
}

export async function setGuideInterest(userId: string, guideId: string, saved: boolean) {
  const result = saved
    ? await supabase.from("user_guide_interests").upsert(
        { user_id: userId, guide_id: guideId },
        { onConflict: "user_id,guide_id", ignoreDuplicates: true },
      )
    : await supabase.from("user_guide_interests").delete().eq("user_id", userId).eq("guide_id", guideId);
  if (result.error) throw result.error;
  window.dispatchEvent(new Event(GUIDE_INTERESTS_CHANGED));
}
