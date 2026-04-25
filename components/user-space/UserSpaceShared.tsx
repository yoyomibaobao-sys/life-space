import type { CSSProperties } from "react";

export const categoryGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

export function mainFilterStyle(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid #b9d5ae" : "1px solid transparent",
    background: active ? "#edf6e9" : "transparent",
    color: active ? "#3f7d3d" : "#3d463b",
    borderRadius: 999,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: active ? 650 : 550,
  };
}

export function subFilterStyle(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid #4f8f46" : "1px solid #e1e9dc",
    background: active ? "#4f8f46" : "#f7faf5",
    color: active ? "#fff" : "#4f5d4a",
    borderRadius: 999,
    padding: "5px 10px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 650 : 450,
  };
}

export function groupFilterStyle(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid #6b8f62" : "1px solid #e4eadf",
    background: active ? "#eef6ea" : "#fff",
    color: active ? "#3f7d3d" : "#596456",
    borderRadius: 999,
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 650 : 450,
  };
}

export const typeBadgeStyle: CSSProperties = {
  flex: "0 0 auto",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#eef5e8",
  color: "#4f7b45",
  fontSize: 12,
  fontWeight: 600,
};

export const helpBadgeStyle: CSSProperties = {
  flex: "0 0 auto",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#fff4e8",
  color: "#a76524",
  fontSize: 12,
  fontWeight: 650,
};

export const endedBadgeStyle: CSSProperties = {
  flex: "0 0 auto",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#f0f0ec",
  color: "#77756b",
  fontSize: 12,
  fontWeight: 550,
};

export const followedBadgeStyle: CSSProperties = {
  flex: "0 0 auto",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#eef4ff",
  color: "#4b6bb0",
  fontSize: 12,
  fontWeight: 600,
};
