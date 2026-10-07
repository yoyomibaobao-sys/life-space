import type { CSSProperties } from "react";

export type ArchiveProjectDetailTabId = "records" | "profile" | "experience";

export function archiveProjectDetailMainStyle(isMobileViewport: boolean): CSSProperties {
  return {
    padding: isMobileViewport ? "10px 10px 46px" : "18px 16px 46px",
    maxWidth: 760,
    margin: "0 auto",
  };
}

export const archiveProjectDetailHeaderTitleStyle: CSSProperties = {
  minWidth: 0,
  width: "100%",
  display: "block",
  overflow: "hidden",
  whiteSpace: "nowrap",
};

export const archiveProjectDetailHeaderProjectStyle: CSSProperties = {
  minWidth: 0,
  width: "100%",
  display: "block",
  overflow: "hidden",
  color: "#243424",
  fontSize: 16,
  fontWeight: 850,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const archiveProjectDetailStatsStyle: CSSProperties = {
  minHeight: 34,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  minWidth: 0,
  margin: "0 0 8px",
  padding: "5px 8px",
  borderBottom: "1px solid #edf1e9",
};

export const archiveProjectDetailGuideTextStyle: CSSProperties = {
  minWidth: 0,
  maxWidth: "38%",
  flex: "0 1 auto",
  overflow: "hidden",
  color: "#52694f",
  fontSize: 14,
  fontWeight: 750,
  lineHeight: 1.35,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const archiveProjectDetailGuideLinkStyle: CSSProperties = {
  ...archiveProjectDetailGuideTextStyle,
  color: "#356f39",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

export const archiveProjectDetailLocalHintStyle: CSSProperties = {
  margin: "0 0 10px",
  color: "#617258",
  fontSize: 13,
  lineHeight: 1.45,
};

export const archiveProjectDetailBadgeStyle: CSSProperties = {
  flexShrink: 0,
  border: "1px solid #e2e8dc",
  borderRadius: 999,
  background: "#f4f7f1",
  color: "#5b6b57",
  fontSize: 12,
  fontWeight: 750,
  padding: "3px 8px",
};

export const archiveProjectDetailTabWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 6,
  marginBottom: 8,
  padding: 4,
  border: "1px solid #e2ecd9",
  borderRadius: 16,
  background: "#fff",
};

export function archiveProjectDetailTabButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: 42,
    border: "none",
    borderRadius: 12,
    color: active ? "#2f6a31" : "#40583a",
    background: active ? "#e3f1dd" : "transparent",
    fontSize: "clamp(14px, 3.6vw, 16px)",
    fontWeight: 800,
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
}

export const archiveProjectDetailReadOnlyNoticeStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  margin: "10px 0",
  border: "1px solid #dfe8d9",
  borderRadius: 13,
  background: "#f8fbf6",
  color: "#52624f",
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.5,
};

export const archiveProjectDetailEmptyStateStyle: CSSProperties = {
  border: "1px solid #ebefea",
  borderRadius: 18,
  background: "#fff",
  padding: 18,
  color: "#7d897a",
  fontSize: 14,
};

export const archiveProjectDetailExperienceHintStyle: CSSProperties = {
  marginTop: 8,
  lineHeight: 1.5,
};

export const archiveProjectDetailFloatingAddStyle: CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: "calc(78px + var(--app-safe-area-bottom))",
  zIndex: 60,
  height: 42,
  padding: "0 16px",
  borderRadius: 999,
  border: "1px solid #bcd8b5",
  background: "#3f7d3d",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  boxShadow: "0 12px 28px rgba(49, 90, 45, 0.22)",
};

export const archiveProjectDetailMetaLineStyle: CSSProperties = {
  minWidth: 0,
  flex: "1 1 auto",
  gap: "5px 10px",
  fontSize: 13,
};
