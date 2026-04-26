export { behaviorTagLabels, getBehaviorTagLabel } from "@/lib/record-tags";

export function getStatusTagLabel(tag: string | null | undefined): string {
  if (tag === "help") return "求助！";
  if (tag === "resolved") return "已解决";
  return "";
}
