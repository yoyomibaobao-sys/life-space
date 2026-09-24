"use client";

import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  constrained?: boolean;
};

export default function MobileBottomNavFrame({ children, ariaLabel, className, constrained = false }: Props) {
  return (
    <nav
      data-mobile-bottom-nav="true"
      className={className}
      style={{ ...navStyle, ...(constrained ? { maxWidth: 760, margin: "0 auto" } : {}) }}
      aria-label={ariaLabel}
    >
      {children}
    </nav>
  );
}

const navStyle: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1100,
  height: "calc(58px + var(--app-safe-area-bottom))",
  padding: "5px 8px calc(5px + var(--app-safe-area-bottom))",
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
