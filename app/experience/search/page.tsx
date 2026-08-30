"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import HomeSectionTabs from "@/components/home/HomeSectionTabs";
import DiscoverSearchResults from "@/components/discover-search/DiscoverSearchResults";
import UiIcon from "@/components/ui/UiIcon";
import MobileSearchField from "@/components/search/MobileSearchField";
import { fetchDiscoverExperienceCardSearchResults } from "@/lib/discover-search-data";
import { emptySearchFilters } from "@/lib/discover-search-types";
import type { ExperienceCardListItem } from "@/lib/experience-card-types";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ExperienceSearchPage() {
  return (
    <Suspense fallback={<main style={pageStyle} />}>
      <ExperienceSearchContent />
    </Suspense>
  );
}

function ExperienceSearchContent() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<ExperienceCardListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(Boolean(initialQuery));

  async function search(value: string, syncUrl = true) {
    const clean = value.trim();
    setLoading(true);
    setHasRun(true);
    if (syncUrl) {
      window.history.pushState(null, "", clean ? `/experience/search?q=${encodeURIComponent(clean)}` : "/experience/search");
    }
    setItems(
      await fetchDiscoverExperienceCardSearchResults({
        ...emptySearchFilters,
        textQuery: clean,
      })
    );
    setLoading(false);
  }

  useEffect(() => {
    if (initialQuery) void search(initialQuery, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search(query);
  }

  return (
    <>
      <HomeSectionTabs active="experience" searchEnabled={false} showNotification={false} />
      <main style={pageStyle}>
        <header className="mobile-app-desktop-only" style={headerStyle}>
          <h1 style={titleStyle}>{t.experience.search_title}</h1>
          <Link href="/experience" style={backLinkStyle}>
            <UiIcon name="arrow-left" size={15} /> {t.experience.back_to_experience}
          </Link>
        </header>
        <form onSubmit={handleSubmit} style={searchFormStyle}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <MobileSearchField
              value={query}
              onChange={setQuery}
              placeholder={t.experience.search_placeholder}
              ariaLabel={t.experience.search_title}
              clearAriaLabel={t.plant.clear_search}
              onClear={() => setQuery("")}
            />
          </div>
          <button type="submit" style={searchButtonStyle}>
            <UiIcon name="search" size={16} /> {t.nav.search}
          </button>
        </form>
        <DiscoverSearchResults
          kind="experience"
          projectItems={[]}
          recordItems={[]}
          experienceItems={items}
          loading={loading}
          hasRun={hasRun}
        />
      </main>
    </>
  );
}

const pageStyle: CSSProperties = { maxWidth: 960, margin: "0 auto", padding: "10px 14px 90px" };
const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};
const titleStyle: CSSProperties = { margin: 0, color: "#223422", fontSize: 22 };
const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  color: "#61735e",
  textDecoration: "none",
  fontSize: 13,
};
const searchFormStyle: CSSProperties = { display: "flex", gap: 8, marginBottom: 14 };
const searchButtonStyle: CSSProperties = {
  minWidth: 86,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  border: 0,
  borderRadius: 12,
  background: "#557d52",
  color: "#fff",
  fontWeight: 800,
};
