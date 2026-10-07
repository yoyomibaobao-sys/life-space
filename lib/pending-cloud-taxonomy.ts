import type { ProjectTaxonomyEntry } from "@/lib/android-project-taxonomy";
import type { LocalArchive } from "@/lib/local-offline-db";

export const TAXONOMY_SYNC_WARNING = "原选择的云端分组已不存在，项目已同步为未分组，请联网后重新设置。";

export function resolvePendingCloudTaxonomy(archive: LocalArchive, entries: ProjectTaxonomyEntry[]) {
  const subId = archive.intended_cloud_sub_tag_id || null;
  const groupId = archive.intended_cloud_group_tag_id || null;
  const hadSelection = Boolean(subId || groupId || archive.subcategory || archive.group_name);
  if (!hadSelection) return { sub_tag_id: null, group_tag_id: null, warning: null };
  const sub = entries.find((entry) => entry.kind === "subcategory" && entry.id === subId && entry.category === archive.category);
  const group = entries.find((entry) => entry.kind === "group" && entry.id === groupId && entry.parentId === sub?.id && entry.category === archive.category);
  if (!sub || (groupId && !group)) return {
    sub_tag_id: null, group_tag_id: null, warning: TAXONOMY_SYNC_WARNING,
  };
  return { sub_tag_id: sub.id, group_tag_id: group?.id || null, warning: null };
}
