"use client";

import type { CSSProperties, ReactNode } from "react";

type Props = {
  title: ReactNode;
  titleText?: string;
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
  compact?: boolean;
  ariaLabel?: string;
};

export default function MobilePageHeaderFrame({
  title, titleText, left, right, className = "mobile-app-grid-only", compact = false, ariaLabel,
}: Props) {
  const sideWidth = right ? 80 : 44;
  return (
    <header
      className={className}
      data-mobile-page-header="true"
      aria-label={ariaLabel}
      style={{
        ...headerStyle,
        ...(compact ? { minHeight: "calc(44px + var(--app-safe-area-top))", padding: "calc(2px + var(--app-safe-area-top)) 8px 2px" } : {}),
        gridTemplateColumns: `${sideWidth}px minmax(0, 1fr) ${sideWidth}px`,
      }}
    >
      <div style={leftSlotStyle}>{left}</div>
      <div title={titleText} style={titleStyle}>{title}</div>
      <div style={rightSlotStyle}>{right}</div>
    </header>
  );
}

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  minHeight: "calc(50px + var(--app-safe-area-top))",
  display: "grid",
  alignItems: "end",
  gap: 4,
  padding: "calc(5px + var(--app-safe-area-top)) 8px 5px",
  borderBottom: "1px solid #e2e9df",
  background: "rgba(250,252,248,0.97)",
  backdropFilter: "blur(10px)",
  boxSizing: "border-box",
};

const leftSlotStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
};

const rightSlotStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
};

const titleStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  color: "#213121",
  fontSize: 17,
  fontWeight: 820,
  lineHeight: 1.2,
  textAlign: "center",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
