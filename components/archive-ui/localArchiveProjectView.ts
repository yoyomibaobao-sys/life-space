import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import type {
  LocalArchiveOwnerContext,
  LocalArchiveSummary,
} from "@/lib/local-offline-db";
import type { ArchiveProjectView } from "@/components/archive-ui/types";

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
  ownerContext?: LocalArchiveOwnerContext | null
) {
  if (!archive.local_owner_user_id) return "未归属账号";
  if (archive.local_owner_user_id === ownerContext?.userId) return "已归属当前账号";
  return "已归属其他账号";
}

export function localArchiveToProjectView(
  archive: LocalArchiveSummary,
  ownerContext?: LocalArchiveOwnerContext | null
): ArchiveProjectView {
  const ongoingDays = getOngoingDays(archive.created_at);
  const latestTime = archive.latest_record_time || archive.updated_at;
  const latestSummary = archive.latest_record_note || archive.note || "暂无记录内容";

  return {
    id: archive.id,
    mode: "local",
    href: `/local/archive/${archive.id}`,
    title: archive.title || "未命名项目",
    category: archive.category,
    plantId: archive.plant_id,
    plantSlug: archive.plant_slug,
    categoryLabel: getArchiveCategoryLabel(archive.category),
    categoryIcon: getArchiveCategoryIcon(archive.category),
    systemName: archive.system_name || archive.species_name || "未填写",
    // Local labels come from IndexedDB only and are not Supabase sub_tags/group_tags.
    subcategoryLabel: archive.subcategory,
    groupLabel: archive.group_name,
    cover: archive.cover_image
      ? {
          kind: "blob",
          blob: archive.cover_image.blob,
          alt: archive.title || "本地项目封面",
        }
      : null,
    latestText: latestSummary,
    latestTime,
    recordCount: archive.record_count || 0,
    durationDays: ongoingDays,
    visibilityLabel: "本地",
    visibilityTone: "neutral",
    mobilePrimaryStatsText: null,
    mobileSecondaryStatsText: null,
    activityText: null,
    footerItems: [],
    badges: [],
  };
}
