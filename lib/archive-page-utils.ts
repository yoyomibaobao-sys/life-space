import {
  getArchiveCategoryLabel,
  getArchiveNamePlaceholder,
} from "@/lib/archive-categories";
import type { ArchiveItem } from "@/lib/archive-page-types";
import { formatCardDate } from "@/lib/date-time";

export function formatArchiveDate(value?: string | null) {
  return formatCardDate(value);
}

export function getArchiveSortTime(
  item: ArchiveItem,
  field: "created" | "updated"
) {
  if (field === "created") {
    return new Date(item.created_at || 0).getTime();
  }

  return new Date(item.latest_record_time || item.last_record_time || item.created_at || 0).getTime();
}

export function getArchiveSystemName(item: ArchiveItem) {
  if (item.category === "plant") {
    return item.species_display_name || item.species_name_snapshot || "未选择植物";
  }

  return item.system_name || `未填写${getArchiveNamePlaceholder(item.category)}`;
}

export function buildArchiveSearchText(
  item: ArchiveItem,
  subTagNameMap: Map<string, string>,
  groupTagNameMap: Map<string, string>
) {
  return [
    item.title,
    item.system_name,
    item.species_display_name,
    item.species_name_snapshot,
    item.note,
    item.latest_record_note,
    getArchiveCategoryLabel(item.category),
    item.sub_tag_id ? subTagNameMap.get(item.sub_tag_id) : "",
    item.group_tag_id ? groupTagNameMap.get(item.group_tag_id) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
