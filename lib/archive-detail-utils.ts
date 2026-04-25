import { getArchiveNamePlaceholder } from "@/lib/archive-categories";
import type {
  ArchiveDetailArchive,
  LightboxImage,
  PlantSpeciesLite,
} from "@/lib/archive-detail-types";

export const RECORD_TAG_OPTIONS = [
  "扦插",
  "播种",
  "发芽",
  "修剪",
  "施肥",
  "浇水",
  "换盆",
  "开花",
  "病害",
] as const;

export function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getDayNumber(start: string, current: string) {
  const startDate = new Date(start).getTime();
  const currentDate = new Date(current).getTime();
  const diff = currentDate - startDate;
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

export function getDisplayName(
  archive: ArchiveDetailArchive | null | undefined,
  species: PlantSpeciesLite | null | undefined
) {
  if (archive?.category === "plant") {
    return (
      archive?.species_name_snapshot ||
      species?.common_name ||
      species?.scientific_name ||
      "未命名"
    );
  }

  return (
    archive?.system_name ||
    archive?.species_name_snapshot ||
    getArchiveNamePlaceholder(archive?.category)
  );
}

export function buildMediaList(
  media: any[] | undefined,
  archiveTitle: string
): LightboxImage[] {
  return (media || [])
    .map((item: any) => item?.url || item?.file_url || item?.path)
    .filter(Boolean)
    .map((url: string, index: number) => ({
      url,
      alt: `${archiveTitle} 图片 ${index + 1}`,
    }));
}

export function getTouchDistance(touches: TouchList) {
  if (touches.length < 2) return null;
  const [first, second] = [touches[0], touches[1]];
  return Math.hypot(
    second.clientX - first.clientX,
    second.clientY - first.clientY
  );
}

export function smallActionButtonStyle(
  background = "#fff",
  color = "#667066",
  border = "#dfe5dc"
) {
  return {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${border}`,
    background,
    color,
    cursor: "pointer",
  } as const;
}
