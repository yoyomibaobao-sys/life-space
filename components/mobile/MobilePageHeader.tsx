"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import UiIcon from "@/components/ui/UiIcon";
import MobilePageHeaderFrame from "@/components/mobile/MobilePageHeaderFrame";
import {
  getCurrentMobileRoute,
  getMobileSourceRoute,
  prepareMobileSourceReturn,
} from "@/lib/mobile-navigation";

export default function MobilePageHeader({
  title,
  titleText,
  fallbackHref,
  right,
  showBack = true,
  compact = false,
  ariaLabel,
}: {
  title: ReactNode;
  titleText?: string;
  fallbackHref: string;
  right?: ReactNode;
  showBack?: boolean;
  compact?: boolean;
  ariaLabel?: string;
}) {
  const router = useRouter();

  function goBack() {
    const currentRoute = getCurrentMobileRoute();
    const destination = getMobileSourceRoute(currentRoute, fallbackHref);
    prepareMobileSourceReturn(currentRoute, destination);
    router.push(destination, { scroll: false });
  }

  return (
    <MobilePageHeaderFrame
      title={title}
      titleText={titleText}
      compact={compact}
      ariaLabel={ariaLabel}
      right={right}
      left={showBack ? (
        <button type="button" onClick={goBack} aria-label={ariaLabel} title={ariaLabel} style={backButtonStyle}>
          <UiIcon name="arrow-left" size={19} strokeWidth={1.8} />
        </button>
      ) : undefined}
    />
  );
}

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

