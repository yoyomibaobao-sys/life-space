"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
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
  onBack,
}: {
  title: ReactNode;
  titleText?: string;
  fallbackHref: string;
  right?: ReactNode;
  showBack?: boolean;
  compact?: boolean;
  ariaLabel?: string;
  onBack?: () => void;
}) {
  const router = useRouter();

  function goBack() {
    if (onBack) {
      onBack();
      return;
    }
    const currentRoute = getCurrentMobileRoute();
    const destination = getMobileSourceRoute(currentRoute, fallbackHref);
    prepareMobileSourceReturn(currentRoute, destination);
    router.push(destination, { scroll: false });
  }

  return (
    <MobilePageHeaderView
      className="mobile-app-grid-only"
      title={title}
      titleText={titleText}
      right={right}
      showBack={showBack}
      compact={compact}
      ariaLabel={ariaLabel}
      onBack={goBack}
    />
  );
}
