export function parseTags(text: string): string[] {
  const tags: string[] = [];

  if (!text) return tags;

  // 行为类
  if (text.includes("扦插")) tags.push("扦插");
  if (text.includes("播种")) tags.push("播种");
  if (text.includes("修剪")) tags.push("修剪");
  if (text.includes("施肥")) tags.push("施肥");
  if (text.includes("浇水")) tags.push("浇水");
  if (text.includes("换盆")) tags.push("换盆");

  // 状态类
  if (text.includes("发芽")) tags.push("发芽");
  if (text.includes("生长")) tags.push("生长");
  if (text.includes("开花")) tags.push("开花");
  if (text.includes("结果")) tags.push("结果");

  // 病害（宽松匹配）
  if (
    text.includes("虫") ||
    text.includes("病") ||
    text.includes("黄") ||
    text.includes("枯")
  ) {
    tags.push("病害");
  }

  return tags;
}