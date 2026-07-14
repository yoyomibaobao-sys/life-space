import { getArchiveNamePlaceholder } from "@/lib/archive-categories";
export { RECORD_TAG_OPTIONS } from "@/lib/record-tags";
import type {
  ArchiveDetailArchive,
  LightboxImage,
  PlantSpeciesLite,
} from "@/lib/archive-detail-types";


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

function getLocalDayStartTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function getDayNumber(start: string, current: string) {
  const startDate = getLocalDayStartTime(start);
  const currentDate = getLocalDayStartTime(current);

  if (startDate === null || currentDate === null) return 1;

  const diff = currentDate - startDate;
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
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
    .map((item: any) => ({
      id: item?.id,
      recordId: item?.record_id,
      url: item?.display_url,
    }))
    .filter((item) => Boolean(item.url))
    .map((item, index: number) => ({
      id: item.id,
      recordId: item.recordId,
      url: item.url,
      alt: `${archiveTitle} 图片 ${index + 1}`,
    }));
}

type TouchPointList = {
  length: number;
  [index: number]: { clientX: number; clientY: number } | undefined;
};

export function getTouchDistance(touches: TouchPointList) {
  if (touches.length < 2) return null;

  const first = touches[0];
  const second = touches[1];

  if (!first || !second) return null;

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
