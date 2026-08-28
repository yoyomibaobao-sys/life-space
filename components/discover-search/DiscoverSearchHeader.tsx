import Link from "next/link";
import type { CSSProperties } from "react";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import UiIcon from "@/components/ui/UiIcon";
import type { ActivitySearchScope } from "@/components/discover-search/DiscoverSearchTabs";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function DiscoverSearchHeader({
  searchKind,
  onSearchKindChange,
}: {
  searchKind: ActivitySearchScope;
  onSearchKindChange: (kind: ActivitySearchScope) => void;
}) {
  const { t } = useLanguage();

  return (
    <>
      <MobilePageHeader
        title={
          <nav aria-label={t.discover.search_ui.search_type} style={mobileTabsStyle}>
            <button
              type="button"
              aria-current={searchKind === "projects" ? "page" : undefined}
              onClick={() => onSearchKindChange("projects")}
              style={mobileTabStyle(searchKind === "projects")}
            >
              {t.discover.search_ui.projects}
            </button>
            <button
              type="button"
              aria-current={searchKind === "records" ? "page" : undefined}
              onClick={() => onSearchKindChange("records")}
              style={mobileTabStyle(searchKind === "records")}
            >
              {t.discover.search_ui.records}
            </button>
          </nav>
        }
        titleText={`${t.discover.search_ui.projects} · ${t.discover.search_ui.records}`}
        fallbackHref="/discover"
        ariaLabel={t.nav.back}
      />

      <header className="mobile-app-desktop-only" style={desktopHeaderStyle}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1f2d1f" }}>
          {t.discover.search_ui.title}
        </div>

        <Link href="/discover" style={desktopBackStyle}>
          <UiIcon name="arrow-left" size={14} /> {t.discover.search_ui.back_to_discover}
        </Link>
      </header>
    </>
  );
}

const mobileTabsStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  alignItems: "stretch",
};

function mobileTabStyle(active: boolean): CSSProperties {
  return {
    minWidth: 0,
    minHeight: 38,
    overflow: "hidden",
    border: 0,
    borderBottom: active ? "2px solid #5f875b" : "2px solid transparent",
    background: "transparent",
    color: active ? "#315b34" : "#728071",
    padding: "0 5px",
    fontSize: 14.5,
    fontWeight: active ? 850 : 680,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
}

const desktopHeaderStyle: CSSProperties = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "10px 14px 0",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const desktopBackStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  color: "#6f7f6f",
  fontSize: 13,
  textDecoration: "none",
  whiteSpace: "nowrap",
};
