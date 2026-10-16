import type { ArchiveCategory } from "@/lib/archive-categories";
import type { PlantingRegion } from "@/lib/planting-region";
import { loadCloudProjectTaxonomy } from "@/lib/android-project-taxonomy";
import { supabase } from "@/lib/supabase";
import { canCreateMembershipContent, normalizeMembershipRpcResult } from "@/lib/membership";

export async function createLiveCloudArchive(input: {
  id: string; userId: string; title: string; category: ArchiveCategory;
  subTagId?: string | null; groupTagId?: string | null;
  systemName: string; speciesId?: string | null; source?: string | null;
  plantingRegion?: PlantingRegion | null; note?: string | null;
  visibility?: "private" | "public";
  archiveSummary?: string | null; cycleEnabled?: boolean; nextCycleName?: string | null;
}) {
  const [identity, membership] = await Promise.all([
    supabase.auth.getUser(), supabase.rpc("get_my_membership"),
  ]);
  if (identity.error || identity.data.user?.id !== input.userId) throw new Error("请重新登录云账号。");
  if (membership.error) throw membership.error;
  if (!canCreateMembershipContent(normalizeMembershipRpcResult(membership.data))) {
    throw new Error("当前会员状态暂不能创建云端项目。");
  }
  const existing = await supabase.from("archives").select("id,user_id").eq("id", input.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.user_id !== input.userId) throw new Error("云端项目标识冲突。");
    return input.id;
  }
  const entries = await loadCloudProjectTaxonomy(input.userId);
  const sub = entries.find((entry) => entry.kind === "subcategory" && entry.id === input.subTagId && entry.category === input.category);
  const group = entries.find((entry) => entry.kind === "group" && entry.id === input.groupTagId && entry.parentId === sub?.id);
  if ((input.subTagId && !sub) || (input.groupTagId && !group)) throw new Error("云端分组已变化，请重新选择。");
  const payload = {
    id: input.id, user_id: input.userId, title: input.title.trim(), category: input.category,
    sub_tag_id: sub?.id || null, group_tag_id: group?.id || null,
    species_id: input.category === "plant" ? input.speciesId || null : null,
    species_name_snapshot: input.category === "plant" ? input.systemName : null,
    system_name: input.category === "plant" ? null : input.systemName,
    source: input.source || null, planting_region: input.plantingRegion || null,
    note: input.note || null, is_public: input.visibility !== "private",
    default_record_visibility: input.visibility === "private" ? "private" : "public",
    archive_summary: input.archiveSummary || null, cycle_enabled: Boolean(input.cycleEnabled),
    next_cycle_name: input.nextCycleName || null,
  };
  const created = await supabase.from("archives").insert([payload]).select("id,user_id").maybeSingle();
  if (created.data?.id === input.id && created.data.user_id === input.userId) return input.id;
  // The response can be lost after a successful insert. Query the stable ID before retrying.
  const recovered = await supabase.from("archives").select("id,user_id").eq("id", input.id).maybeSingle();
  if (recovered.data?.id === input.id && recovered.data.user_id === input.userId) return input.id;
  throw created.error || recovered.error || new Error("创建云端项目失败，请重试。");
}
