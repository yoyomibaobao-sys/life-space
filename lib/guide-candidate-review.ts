import type { SupabaseClient } from "@supabase/supabase-js";
export type GuideCandidateReviewRow = {
  id: string;
  status: "approved" | "rejected";
  reviewed_at: string;
  reviewed_by: string;
  review_note: string | null;
  public_guide_id: string | null;
};
export async function reviewGuideCandidate(
  client: Pick<SupabaseClient, "rpc" | "from">,
  candidateId: string,
  decision: "approve" | "reject",
  note: string,
): Promise<{ accepted: boolean; review: GuideCandidateReviewRow | null }> {
  const { data, error } = await client.rpc("review_guide_candidate", {
    p_candidate_id: candidateId, p_decision: decision, p_review_note: note.trim() || null,
  });
  if (error) throw error;
  if (data !== true) return { accepted: false, review: null };
  // A successful RPC is not a verified readback. Never repeat the mutation here.
  try {
    const { data: row, error: readError } = await client.from("guide_candidates")
      .select("id,status,reviewed_at,reviewed_by,review_note,public_guide_id")
      .eq("id", candidateId).maybeSingle();
    const expected = decision === "approve" ? "approved" : "rejected";
    if (readError || row?.id !== candidateId || row.status !== expected ||
        !row.reviewed_at || !row.reviewed_by ||
        (decision === "approve" && !row.public_guide_id)) return { accepted: true, review: null };
    return { accepted: true, review: row as GuideCandidateReviewRow };
  } catch {
    return { accepted: true, review: null };
  }
}
