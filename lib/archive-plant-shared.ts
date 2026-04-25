import type { CSSProperties } from "react";
import type { PlantSpeciesSummary } from "@/lib/domain-types";

export type BadgeStyle = {
  background: string;
  color: string;
  border?: string;
};

export function plantDisplayName(plant: PlantSpeciesSummary | null | undefined) {
  return plant?.common_name || plant?.scientific_name || "未命名植物";
}

export function categoryLabel(value?: string | null) {
  const labels: Record<string, string> = {
    vegetable: "蔬菜 / 蔬果",
    fruit: "果树 / 果类",
    herb: "香草 / 药草",
    flower: "花卉",
    houseplant: "观叶植物",
    succulent: "多肉 / 仙人掌",
    grain: "谷物 / 作物",
    field_crop: "谷物 / 作物",
    tree: "乔木 / 灌木",
  };

  if (!value) return "未分类";
  return labels[value] || value;
}

export const cardStyle: CSSProperties = {
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 18,
  background: "#fff",
  boxShadow: "0 6px 18px rgba(0,0,0,0.03)",
};

export const sectionHeaderStyle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 18,
};

export const subtleTextareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  resize: "vertical",
  lineHeight: 1.6,
};

export const neutralActionLinkStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 999,
  border: "1px solid #ddd",
  color: "#444",
  fontSize: 13,
  textDecoration: "none",
  background: "#fff",
};

export const dangerActionButtonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 999,
  border: "1px solid #ffe0e0",
  color: "#d44",
  fontSize: 13,
  background: "#fff",
  cursor: "pointer",
};
