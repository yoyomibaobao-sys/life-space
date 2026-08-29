"use client";

import type { CSSProperties, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import UiIcon from "@/components/ui/UiIcon";
import {
  getCurrentMobileRoute,
  getMobileSourceRoute,
  prepareMobileSourceReturn,
} from "@/lib/mobile-navigation";

const HIDDEN_MOBILE_HEADER_ROUTES = new Set([
  "/archive",
  "/market/new",
  "/market/mine",
]);

export default function MobilePageHeader({
  title,
  titleText,
  fallbackHref,
  right,
  showBack = true,
  ariaLabel,
}: {
  title: ReactNode;
  titleText?: string;
  fallbackHref: string;
  right?: ReactNode;
  showBack?: boolean;
  ariaLabel?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  if (HIDDEN_MOBILE_HEADER_ROUTES.has(pathname)) return null;

  function goBack() {
    const currentRoute = getCurrentMobileRoute();
    const destination = getMobileSourceRoute(currentRoute, fallbackHref);
    prepareMobileSourceReturn(currentRoute, destination);
    router.push(destination, { scroll: false });
  }

  return (
    <header
      className="mobile-app-grid-only"
      data-mobile-page-header="true"
      aria-label={ariaLabel}
      style={headerStyle}
    >
      <div style={leftSlotStyle}>
        {showBack ? (
          <button
            type="button"
            onClick={goBack}
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
  minHeight: "calc(50px + var(--app-safe-area-top))",
  gridTemplateColumns: "96px minmax(0, 1fr) 96px",
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
