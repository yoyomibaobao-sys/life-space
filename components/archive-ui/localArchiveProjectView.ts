import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import type {
  LocalArchiveOwnerContext,
  LocalArchiveSummary,
} from "@/lib/local-offline-db";
import type { ArchiveProjectView } from "@/components/archive-ui/types";

function formatLocalDate(value?: string | null) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无记录";

  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const ownerLabel = getLocalArchiveOwnerLabel(archive, ownerContext);

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
    // These labels are local IndexedDB labels only, not Supabase sub_tags/group_tags.
    subcategoryLabel: archive.subcategory,
    groupLabel: archive.group_name,
    cover: archive.cover_image
      ? {
          kind: "blob",
          blob: archive.cover_image.blob,
          alt: archive.title || "本地项目封面",
        }
      : null,
    latestText: archive.latest_record_note || archive.note || "暂无记录内容",
    visibilityLabel: "本地离线",
    visibilityTone: "neutral",
    activityText: `${archive.record_count} 条记录 · ${archive.image_count} 张图片`,
    footerItems: [
      "只保存在这台设备",
      "本地分类独立于云空间",
      ownerLabel,
      "未同步",
      `最近 ${formatLocalDate(archive.latest_record_time || archive.updated_at)}`,
    ],
    badges: ["本地离线", "本地分类", ownerLabel, "未同步"],
  };
}
