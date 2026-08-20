"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import MobileNotificationLink from "@/components/mobile/MobileNotificationLink";
import UiIcon from "@/components/ui/UiIcon";

export type MobileContentTopBarItem = {
  key: string;
  label: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
};

export default function MobileContentTopBar({
  items,
  ariaLabel,
  searchHref,
  searchLabel,
  onSearch,
  showNotification = false,
}: {
  items: MobileContentTopBarItem[];
  ariaLabel: string;
  searchHref?: string;
  searchLabel?: string;
  onSearch?: () => void;
  showNotification?: boolean;
}) {
  return (
    <nav className="mobile-app-flex-only" aria-label={ariaLabel} style={barStyle}>
      <div style={itemsStyle}>
        {items.map((item) => {
          const style = itemStyle(item.active);
          if (item.href) {
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                onClick={item.onClick}
                style={style}
              >
                {item.label}
              </Link>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={item.active}
              onClick={item.onClick}
              style={style}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {searchHref ? (
        <Link
          href={searchHref}
          aria-label={searchLabel}
          title={searchLabel}
          style={actionStyle}
        >
          <UiIcon name="search" size={18} />
        </Link>
      ) : onSearch ? (
        <button
          type="button"
          onClick={onSearch}
          aria-label={searchLabel}
          title={searchLabel}
          style={actionStyle}
        >
          <UiIcon name="search" size={18} />
        </button>
      ) : null}
      {showNotification ? <MobileNotificationLink /> : null}
    </nav>
  );
}

const actionStyle: CSSProperties = {
  width: 34,
  height: 34,
  flex: "0 0 34px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #dfe8da",
  borderRadius: 999,
  background: "#fff",
  color: "#52634e",
  textDecoration: "none",
  cursor: "pointer",
};

const barStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  minHeight: "calc(50px + var(--app-safe-area-top))",
  alignItems: "flex-end",
  gap: 6,
  padding: "calc(7px + var(--app-safe-area-top)) 10px 6px",
  borderBottom: "1px solid #e2e9df",
  background: "rgba(250,252,248,0.97)",
  backdropFilter: "blur(10px)",
  boxSizing: "border-box",
};

const itemsStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "flex",
  alignItems: "stretch",
  overflowX: "auto",
  scrollbarWidth: "none",
};

function itemStyle(active: boolean): CSSProperties {
  return {
    minWidth: 54,
    minHeight: 34,
    flex: "1 0 auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 8px",
    border: 0,
    borderBottom: active ? "2px solid #5f875b" : "2px solid transparent",
    background: "transparent",
    color: active ? "#315b34" : "#728071",
    textAlign: "center",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: active ? 850 : 680,
    whiteSpace: "nowrap",
    cursor: "pointer",
    boxSizing: "border-box",
  };
}
