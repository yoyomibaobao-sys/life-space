"use client";

import type { CSSProperties, ReactNode } from "react";
import UiIcon from "@/components/ui/UiIcon";

export default function MobilePageHeaderView({
  title,
  titleText,
  right,
  showBack = true,
  compact = false,
  ariaLabel,
  onBack,
  className,
}: {
  title: ReactNode;
  titleText?: string;
  right?: ReactNode;
  showBack?: boolean;
  compact?: boolean;
  ariaLabel?: string;
  onBack?: () => void;
  className?: string;
}) {
  const sideWidth = right ? 80 : 44;

  return (
    <header
      className={className}
      data-mobile-page-header="true"
      aria-label={ariaLabel}
      style={{
        ...headerStyle,
        ...(compact
          ? {
              minHeight:
                "calc(44px + var(--app-safe-area-top, env(safe-area-inset-top, 0px)))",
              padding:
                "calc(2px + var(--app-safe-area-top, env(safe-area-inset-top, 0px))) 8px 2px",
            }
          : {}),
        gridTemplateColumns: `${sideWidth}px minmax(0, 1fr) ${sideWidth}px`,
      }}
    >
      <div style={leftSlotStyle}>
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={ariaLabel}
            title={ariaLabel}
            style={backButtonStyle}
          >
            <UiIcon name="arrow-left" size={19} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>

      <div title={titleText} style={titleStyle}>
        {title}
      </div>

      <div style={rightSlotStyle}>{right}</div>
    </header>
  );
}

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  minHeight:
    "calc(50px + var(--app-safe-area-top, env(safe-area-inset-top, 0px)))",
  display: "grid",
  alignItems: "end",
  gap: 4,
  padding:
    "calc(5px + var(--app-safe-area-top, env(safe-area-inset-top, 0px))) 8px 5px",
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

const backButtonStyle: CSSProperties = {
  width: 40,
  height: 40,
  display: "inline-grid",
  placeItems: "center",
  padding: 0,
  border: 0,
  borderRadius: 999,
  background: "transparent",
  color: "#50694c",
  cursor: "pointer",
  touchAction: "manipulation",
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
