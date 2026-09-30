import type { ArchiveCategory } from "@/lib/archive-categories";
import type { LocalTaxonomyItem } from "@/lib/local-offline-db";
import { supabase } from "@/lib/supabase";
import { saveCloudTaxonomySnapshot } from "@/lib/cloud-taxonomy-snapshot";

export type ProjectTaxonomyEntry = {
  id: string;
  kind: "subcategory" | "group";
  label: string;
  category: ArchiveCategory;
  parentId: string | null;
};

type Client = typeof supabase;

export async function loadCloudProjectTaxonomy(userId: string, client: Client = supabase) {
  const [subs, groups] = await Promise.all([
    client.from("sub_tags").select("id, name, category, user_id").eq("user_id", userId),
    client.from("group_tags").select("id, name, sub_tag_id, user_id").eq("user_id", userId),
  ]);
  if (subs.error) throw subs.error;
  if (groups.error) throw groups.error;
  const parents = (subs.data || []).map((row) => ({
    id: row.id as string, kind: "subcategory" as const, label: row.name as string,
    category: row.category as ArchiveCategory, parentId: null,
  }));
  const byId = new Map(parents.map((row) => [row.id, row]));
  const entries = [...parents, ...(groups.data || []).flatMap((row) => {
    const parent = byId.get(row.sub_tag_id as string);
    return parent ? [{ id: row.id as string, kind: "group" as const,
      label: row.name as string, category: parent.category, parentId: parent.id }] : [];
  })] satisfies ProjectTaxonomyEntry[];
  if (typeof localStorage !== "undefined") {
    try { saveCloudTaxonomySnapshot(userId, entries); } catch { /* Cache is optional online. */ }
  }
  return entries;
}

export function mapLocalProjectTaxonomy(items: LocalTaxonomyItem[]): ProjectTaxonomyEntry[] {
  const parents = items.filter((row) => row.kind === "subcategory" && row.category)
    .map((row) => ({ id: row.id, kind: "subcategory" as const, label: row.label,
      category: row.category as ArchiveCategory, parentId: null }));
  return [...parents, ...items.filter((row) => row.kind === "group" && row.category).map((row) => ({
    id: row.id, kind: "group" as const, label: row.label, category: row.category as ArchiveCategory,
    parentId: parents.find((parent) => parent.category === row.category && parent.label === row.subcategory)?.id || null,
  }))];
}

export async function createCloudProjectTaxonomy(input: {
  userId: string; category: ArchiveCategory; label: string; parentId?: string | null;
}, client: Client = supabase) {
  const label = input.label.trim();
  if (!label) throw new Error("group_name_required");
  const table = input.parentId ? "group_tags" : "sub_tags";
  const values = input.parentId
    ? { user_id: input.userId, name: label, sub_tag_id: input.parentId }
    : { user_id: input.userId, name: label, category: input.category };
  const result = await client.from(table).insert(values);
  if (result.error) throw result.error;
}

export async function renameCloudProjectTaxonomy(input: {
  userId: string; entry: ProjectTaxonomyEntry; label: string;
}, client: Client = supabase) {
  const label = input.label.trim();
  if (!label) throw new Error("group_name_required");
  const table = input.entry.kind === "group" ? "group_tags" : "sub_tags";
  const result = await client.from(table).update({ name: label })
    .eq("id", input.entry.id).eq("user_id", input.userId);
  if (result.error) throw result.error;
}

export async function deleteCloudProjectTaxonomy(input: {
  userId: string; entry: ProjectTaxonomyEntry;
}, client: Client = supabase) {
  const { userId, entry } = input;
  if (entry.kind === "subcategory") {
    const clearProjects = await client.from("archives")
      .update({ sub_tag_id: null, group_tag_id: null }).eq("user_id", userId).eq("sub_tag_id", entry.id);
    if (clearProjects.error) throw clearProjects.error;
    const children = await client.from("group_tags").delete().eq("user_id", userId).eq("sub_tag_id", entry.id);
    if (children.error) throw children.error;
  } else {
    const clearProjects = await client.from("archives")
      .update({ group_tag_id: null }).eq("user_id", userId).eq("group_tag_id", entry.id);
    if (clearProjects.error) throw clearProjects.error;
  }
  const table = entry.kind === "group" ? "group_tags" : "sub_tags";
  const result = await client.from(table).delete().eq("id", entry.id).eq("user_id", userId);
  if (result.error) throw result.error;
}
