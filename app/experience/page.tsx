"use client";

import { useEffect, useState, type CSSProperties } from "react";
import UiIcon from "@/components/ui/UiIcon";
import HomeSectionTabs from "@/components/home/HomeSectionTabs";
import PublicExperienceGallery from "@/components/experience-card/PublicExperienceGallery";
import { fetchDiscoverExperienceCardSearchResults } from "@/lib/discover-search-data";
import { emptySearchFilters } from "@/lib/discover-search-types";
import type { ExperienceCardListItem } from "@/lib/experience-card-types";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function PublicExperiencePage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<ExperienceCardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetchDiscoverExperienceCardSearchResults({
        ...emptySearchFilters,
        textQuery: query.trim(),
      }).then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setLoading(false);
      });
    }, query ? 260 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <>
      <HomeSectionTabs
        active="experience"
        onSearch={() => setSearchOpen((open) => !open)}
      />
      <main style={pageStyle}>
        {searchOpen ? (
          <label style={searchRowStyle}>
            <UiIcon name="search" size={17} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.experience.search_placeholder}
              aria-label={t.experience.search_title}
              style={searchInputStyle}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t.plant.clear_search}
                style={clearButtonStyle}
              >
                <UiIcon name="close" size={16} />
              </button>
            ) : null}
          </label>
        ) : null}
        {loading ? (
          <section style={emptyStyle}>{t.experience.reading}</section>
        ) : items.length === 0 ? (
          <section style={emptyStyle}>{t.experience.no_public_experience}</section>
        ) : (
          <PublicExperienceGallery items={items} />
        )}
      </main>
    </>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 1240,
  margin: "0 auto",
  padding: "8px 14px 90px",
};
const searchRowStyle: CSSProperties = {
  minHeight: 42,
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
  padding: "0 11px",
  border: "1px solid #dce5d9",
  borderRadius: 13,
  background: "#fff",
  color: "#687965",
};
const searchInputStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  height: 40,
  border: 0,
  outline: 0,
  background: "transparent",
  color: "#263826",
  fontSize: 15,
};
const clearButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  border: 0,
  borderRadius: 999,
  background: "transparent",
  color: "#748171",
  cursor: "pointer",
};
const emptyStyle: CSSProperties = {
  padding: "36px 14px",
  border: "1px solid #e6ece3",
  borderRadius: 16,
  background: "#fff",
  color: "#7b8777",
  textAlign: "center",
};
