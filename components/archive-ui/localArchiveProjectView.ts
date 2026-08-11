import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import type {
  LocalArchiveOwnerContext,
  LocalArchiveSummary,
} from "@/lib/local-offline-db";
import type { ArchiveProjectView } from "@/components/archive-ui/types";
import { getTranslations, type Language } from "@/lib/i18n";

function getOngoingDays(createdAt?: string | null) {
  if (!createdAt) return null;

  const startedAt = new Date(createdAt);
  if (Number.isNaN(startedAt.getTime())) return null;

  const startDate = new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.max(1, Math.floor((today - startDate) / dayMs) + 1);
}

export function getLocalArchiveOwnerLabel(
  archive: LocalArchiveSummary,
  ownerContext?: LocalArchiveOwnerContext | null,
  language: Language = "zh"
) {
  const copy = getTranslations(language).archive_workspace;
  if (!archive.local_owner_user_id) return copy.not_assigned;
  if (archive.local_owner_user_id === ownerContext?.userId) return copy.assigned_current;
  return copy.assigned_other;
}

export function localArchiveToProjectView(
  archive: LocalArchiveSummary,
  ownerContext?: LocalArchiveOwnerContext | null,
  language: Language = "zh"
): ArchiveProjectView {
  const copy = getTranslations(language).archive_workspace;
  const ongoingDays = getOngoingDays(archive.created_at);
  const latestTime = archive.latest_record_time || archive.updated_at;
  const latestSummary = archive.latest_record_note || archive.note || copy.no_record_summary;

  return {
    id: archive.id,
    mode: "local",
    href: `/local/archive/${archive.id}`,
    title: archive.title || copy.unnamed_project,
    category: archive.category,
    plantId: archive.plant_id,
    plantSlug: archive.plant_slug,
    categoryLabel: getArchiveCategoryLabel(archive.category, language),
    categoryIcon: getArchiveCategoryIcon(archive.category),
    systemName: archive.system_name || archive.species_name || copy.not_filled,
    // Local labels come from IndexedDB only and are not Supabase sub_tags/group_tags.
    subcategoryLabel: archive.subcategory,
    groupLabel: archive.group_name,
    cover: archive.cover_image
      ? {
          kind: "blob",
          blob: archive.cover_image.blob,
          alt: archive.title || copy.local_project_cover,
        }
      : null,
    latestText: latestSummary,
    latestTime,
    recordCount: archive.record_count || 0,
    durationDays: ongoingDays,
    visibilityLabel: copy.local,
    visibilityTone: "neutral",
    mobilePrimaryStatsText: null,
    mobileSecondaryStatsText: null,
    activityText: null,
    footerItems: [],
    badges: [],
  };
}
