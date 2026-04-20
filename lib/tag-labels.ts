export const behaviorTagLabels: Record<string, string> = {
  扦插: "扦插",
  播种: "播种",
  发芽: "发芽",
  移植: "移植",
  施肥: "施肥",
  修剪: "修剪",
  开花: "开花",
  结果: "结果",
  病害: "病害",
  浇水: "浇水",
  换盆: "换盆",
};

export function getBehaviorTagLabel(tag: string): string {
  return behaviorTagLabels[tag] || tag;
}

export function getStatusTagLabel(tag: string | null | undefined): string {
  if (tag === "help") return "求助！";
  return "";
}