import type { CSSProperties } from "react";

export function publicGuidePanelStyle(isMobile: boolean): CSSProperties {
  return {
    padding: isMobile ? "6px 10px 8px" : 22,
    border: "1px solid #e0e8dc",
    borderRadius: isMobile ? 16 : 20,
    background: "#fff",
    boxShadow: "0 8px 24px rgba(36, 58, 34, 0.04)",
  };
}

export function publicGuideGridStyle(isMobile: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: isMobile ? 8 : 12,
  };
}

export function publicGuideCardStyle(isMobile: boolean): CSSProperties {
  return {
    minWidth: 0,
    minHeight: isMobile ? 112 : 196,
    display: "block",
    padding: isMobile ? 10 : 16,
    border: "1px solid #e1e9de",
    borderRadius: isMobile ? 14 : 18,
    background: "#fff",
    boxShadow: "0 4px 14px rgba(0,0,0,0.03)",
    color: "inherit",
    textDecoration: "none",
  };
}

export const publicGuideCardTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

export function publicGuideNameStyle(isMobile: boolean): CSSProperties {
  return {
    minWidth: 0,
    overflow: "hidden",
    color: "#2b3e2a",
    fontSize: isMobile ? 16 : 18,
    lineHeight: 1.3,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

export const publicGuideCategoryBadgeStyle: CSSProperties = {
  flexShrink: 0,
  maxWidth: "42%",
  overflow: "hidden",
  padding: "4px 8px",
  borderRadius: 999,
  background: "#f0fff4",
  color: "#2e7d32",
  fontSize: 12,
  lineHeight: 1.2,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const publicGuideSecondaryNameStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  overflow: "hidden",
  color: "#747d71",
  fontSize: 12,
  fontStyle: "italic",
  lineHeight: 1.3,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const publicGuideTraitRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  marginTop: 7,
  overflow: "hidden",
};

export const publicGuideTraitStyle: CSSProperties = {
  flexShrink: 0,
  padding: "2px 7px",
  border: "1px solid #dfeedd",
  borderRadius: 999,
  background: "#f6fbf6",
  color: "#2e7d32",
  fontSize: 12,
  whiteSpace: "nowrap",
};

export function publicGuideSummaryStyle(
  isMobile: boolean,
  hasSummaryAccess: boolean,
): CSSProperties {
  return {
    display: "-webkit-box",
    marginTop: isMobile ? 7 : 12,
    overflow: "hidden",
    color: hasSummaryAccess ? "#444" : "#999",
    fontSize: isMobile ? 13 : 14,
    lineHeight: isMobile ? 1.4 : 1.65,
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: isMobile ? 2 : 4,
  };
}

export const publicGuideEmptyStyle: CSSProperties = {
  padding: 28,
  border: "1px dashed #dce5d8",
  borderRadius: 14,
  color: "#7a8776",
  textAlign: "center",
  background: "#fafcf9",
};
