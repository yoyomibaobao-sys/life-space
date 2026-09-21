"use client";

import {
  Fragment,
  type CSSProperties,
  type ReactNode,
} from "react";
import UiIcon, { type UiIconName } from "@/components/ui/UiIcon";

export type MobileBottomNavigationItem = {
  id: string;
  label: string;
  icon: UiIconName;
  active?: boolean;
  badge?: string | null;
  href?: string;
  onSelect?: () => void;
};

type Props = {
  ariaLabel: string;
  items: readonly [
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
  ];
  centerAction: ReactNode;
  renderItem?: (
    item: MobileBottomNavigationItem,
    content: ReactNode,
    style: CSSProperties,
  ) => ReactNode;
};

export default function MobileBottomNavigationView({
  ariaLabel,
  items,
  centerAction,
  renderItem,
}: Props) {
  function renderNavigationItem(item: MobileBottomNavigationItem) {
    const content = (
      <span
        style={{
          ...mobileBottomNavLabelStyle,
          fontSize: item.label.length > 8 ? 10.5 : undefined,
        }}
      >
        <UiIcon name={item.icon} size={17} strokeWidth={1.7} />
        {item.label}
        {item.badge ? (
          <span style={mobileBottomBadgeStyle}>{item.badge}</span>
        ) : null}
      </span>
    );
    const style = mobileBottomNavItemStyle(Boolean(item.active));

    if (renderItem) return renderItem(item, content, style);

    return (
      <button
        type="button"
        aria-current={item.active ? "page" : undefined}
        onClick={item.onSelect}
        style={{
          ...style,
          border: 0,
          padding: 0,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <nav
      data-mobile-bottom-nav="true"
      style={mobileBottomNavStyle}
      aria-label={ariaLabel}
    >
      {items.slice(0, 2).map((item) => (
        <Fragment key={item.id}>{renderNavigationItem(item)}</Fragment>
      ))}
      {centerAction}
      {items.slice(2).map((item) => (
        <Fragment key={item.id}>{renderNavigationItem(item)}</Fragment>
      ))}
    </nav>
  );
}

const mobileBottomNavStyle: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1100,
  height:
    "calc(58px + var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)))",
  padding:
    "5px 8px calc(5px + var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)))",
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 4,
  borderTop: "1px solid #dfe8da",
  background: "rgba(255,255,255,0.98)",
  boxShadow: "0 -8px 22px rgba(40, 62, 34, 0.08)",
  boxSizing: "border-box",
  transform: "translateZ(0)",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  willChange: "transform",
  touchAction: "manipulation",
  overflow: "visible",
};

function mobileBottomNavItemStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    color: active ? "#2f6a31" : "#657160",
    background: active ? "#edf6e8" : "transparent",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: active ? 800 : 650,
    lineHeight: 1,
  };
}

const mobileBottomNavLabelStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
  maxWidth: "100%",
  gap: 3,
  whiteSpace: "nowrap",
};

const mobileBottomBadgeStyle: CSSProperties = {
  position: "absolute",
  top: -5,
  right: -13,
  minWidth: 16,
  height: 16,
  borderRadius: 999,
  background: "#e85d3f",
  color: "#fff",
  fontSize: 10,
  lineHeight: "16px",
  textAlign: "center",
  fontWeight: 800,
  padding: "0 4px",
};
