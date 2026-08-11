export const RECORD_TAG_OPTIONS = [
  "播种",
  "育苗",
  "发芽",
  "移植",
  "扦插",
  "分株",
  "换盆",
  "浇水",
  "施肥",
  "修剪",
  "除虫",
  "开花",
  "结果",
  "采收",
  "病害",
  "虫害",
  "堆肥",
  "补光",
  "越冬",
] as const;

export type RecordBehaviorTag = (typeof RECORD_TAG_OPTIONS)[number];

export const behaviorTagLabels: Record<string, string> = {
  播种: "播种",
  育苗: "育苗",
  发芽: "发芽",
  移植: "移植",
  扦插: "扦插",
  分株: "分株",
  换盆: "换盆",
  浇水: "浇水",
  施肥: "施肥",
  修剪: "修剪",
  除虫: "除虫",
  开花: "开花",
  结果: "结果",
  采收: "采收",
  病害: "病害",
  虫害: "虫害",
  堆肥: "堆肥",
  补光: "补光",
  越冬: "越冬",
};

const behaviorTagLabelsEn: Record<string, string> = {
  播种: "Sowing",
  育苗: "Seedling care",
  发芽: "Germination",
  移植: "Transplanting",
  扦插: "Cuttings",
  分株: "Division",
  换盆: "Repotting",
  浇水: "Watering",
  施肥: "Fertilizing",
  修剪: "Pruning",
  除虫: "Pest removal",
  开花: "Flowering",
  结果: "Fruiting",
  采收: "Harvest",
  病害: "Disease",
  虫害: "Pests",
  堆肥: "Composting",
  补光: "Grow light",
  越冬: "Overwintering",
};

export function getBehaviorTagLabel(
  tag: string,
  language: Language = "zh"
): string {
  return (language === "en" ? behaviorTagLabelsEn : behaviorTagLabels)[tag] || tag;
}
import type { Language } from "@/lib/i18n";
