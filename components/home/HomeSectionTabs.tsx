"use client";

import { useLanguage } from "@/lib/i18n/useLanguage";
import MobileContentTopBar from "@/components/mobile/MobileContentTopBar";

export type HomeSection = "activity" | "experience" | "guide";

export default function HomeSectionTabs({
  active,
  searchEnabled = true,
  showNotification = false,
  onSearch,
}: {
  active: HomeSection;
  searchEnabled?: boolean;
  showNotification?: boolean;
  onSearch?: () => void;
}) {
  const { t } = useLanguage();
  const items = [
    { key: "activity" as const, label: t.nav.activity, href: "/discover" },
    { key: "experience" as const, label: t.nav.experience, href: "/experience" },
    { key: "guide" as const, label: t.nav.guide, href: "/plant" },
  ];

  return (
    <MobileContentTopBar
      ariaLabel={t.nav.home_sections}
      searchHref={
        searchEnabled
          ? active === "activity"
            ? "/discover/search"
            : active === "experience" && !onSearch
              ? "/experience/search"
              : undefined
          : undefined
      }
      onSearch={searchEnabled ? onSearch : undefined}
      searchLabel={t.nav.search}
      showNotification={showNotification}
      items={items.map((item) => ({
        ...item,
        active: item.key === active,
      }))}
    />
  );
}
