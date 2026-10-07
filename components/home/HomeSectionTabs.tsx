"use client";

import { useLanguage } from "@/lib/i18n/useLanguage";
import MobileContentTopBar from "@/components/mobile/MobileContentTopBar";

export type HomeSection = "activity" | "experience" | "guide";

export default function HomeSectionTabs({
  active,
  searchEnabled = true,
  showNotification = false,
  onSearch,
  onSelect,
  showGuestLanguageSwitcher = true,
}: {
  active: HomeSection;
  searchEnabled?: boolean;
  showNotification?: boolean;
  onSearch?: () => void;
  onSelect?: (section: HomeSection) => void;
  showGuestLanguageSwitcher?: boolean;
}) {
  const { t } = useLanguage();
  const items = [
    { key: "activity" as const, label: t.nav.activity, href: "/discover" },
    {
      key: "experience" as const,
      label: t.nav.experience,
      href: "/experience",
    },
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
      showGuestLanguageSwitcher={showGuestLanguageSwitcher}
      items={items.map((item) => ({
        ...item,
        href: onSelect ? undefined : item.href,
        onClick: onSelect ? () => onSelect(item.key) : undefined,
        active: item.key === active,
      }))}
    />
  );
}
