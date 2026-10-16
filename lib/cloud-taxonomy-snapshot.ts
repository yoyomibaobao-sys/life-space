import type { ProjectTaxonomyEntry } from "@/lib/android-project-taxonomy";

export type CloudTaxonomySnapshotEntry = ProjectTaxonomyEntry & {
  ownerUserId: string;
  cachedAt: string;
};

const prefix = "lifespace:cloud-taxonomy:";

export function saveCloudTaxonomySnapshot(ownerUserId: string, entries: ProjectTaxonomyEntry[], storage: Storage = localStorage) {
  if (!ownerUserId) return;
  const cachedAt = new Date().toISOString();
  storage.setItem(prefix + ownerUserId, JSON.stringify(entries.map((entry) => ({
    ...entry, ownerUserId, cachedAt,
  }))));
}

// The caller must supply the *authenticated* user, never a remembered local owner.
export function readCloudTaxonomySnapshot(ownerUserId: string | null, storage: Storage = localStorage): ProjectTaxonomyEntry[] {
  if (!ownerUserId) return [];
  try {
    const rows: unknown = JSON.parse(storage.getItem(prefix + ownerUserId) || "[]");
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is CloudTaxonomySnapshotEntry =>
      Boolean(row && typeof row === "object" && row.ownerUserId === ownerUserId &&
        typeof row.id === "string" && typeof row.label === "string" &&
        (row.kind === "subcategory" || row.kind === "group") &&
        typeof row.category === "string" &&
        (row.parentId === null || typeof row.parentId === "string")));
  } catch { return []; }
}

export function clearCloudTaxonomySnapshot(ownerUserId: string | null, storage: Storage = localStorage) {
  if (ownerUserId) storage.removeItem(prefix + ownerUserId);
}
