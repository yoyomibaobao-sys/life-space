"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import HomeSectionTabs from "@/components/home/HomeSectionTabs";
import PublicExperienceGallery from "@/components/experience-card/PublicExperienceGallery";
import MobileSearchField from "@/components/search/MobileSearchField";
import { fetchDiscoverExperienceCardSearchResults } from "@/lib/discover-search-data";
import { emptySearchFilters } from "@/lib/discover-search-types";
import type { ExperienceCardListItem } from "@/lib/experience-card-types";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import { useLanguage } from "@/lib/i18n/useLanguage";
import styles from "./page.module.css";
import filterStyles from "@/components/ui/CategoryFilterRow.module.css";

type CategoryFilter = "all" | ArchiveCategory;

export default function PublicExperiencePage() {
  const { language, t } = useLanguage();
  const [items, setItems] = useState<ExperienceCardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

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

  const filteredItems = useMemo(
    () =>
      categoryFilter === "all"
        ? items
        : items.filter((item) => item.archiveCategory === categoryFilter),
    [categoryFilter, items],
  );

  return (
    <>
      <HomeSectionTabs
        active="experience"
        onSearch={() => setSearchOpen((open) => !open)}
      />
      <main className={styles.page} style={pageStyle}>
        <section className={`${filterStyles.row} ${filterStyles.experience}`} lang={language} aria-label={language === "en" ? "Category" : "分类"}>
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={filterStyles.button}
            aria-pressed={categoryFilter === "all"}
          >
            {language === "en" ? "All" : "全部"}
          </button>
          {archiveCategoryOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCategoryFilter(option.value)}
              className={filterStyles.button}
              aria-pressed={categoryFilter === option.value}
            >
              {getArchiveCategoryLabel(option.value, language)}
            </button>
          ))}
        </section>

        {searchOpen ? (
          <div style={searchRowStyle}>
            <MobileSearchField
              autoFocus
              value={query}
              onChange={setQuery}
              placeholder={t.experience.search_placeholder}
              ariaLabel={t.experience.search_title}
              clearAriaLabel={t.plant.clear_search}
              onClear={() => setQuery("")}
            />
          </div>
        ) : null}
        {loading ? (
          <section style={emptyStyle}>{t.experience.reading}</section>
        ) : filteredItems.length === 0 ? (
          <section style={emptyStyle}>{t.experience.no_public_experience}</section>
        ) : (
          <PublicExperienceGallery items={filteredItems} />
        )}
      </main>
    </>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 860,
  margin: "0 auto",
};

const searchRowStyle: CSSProperties = {
  marginBottom: 7,
};
const emptyStyle: CSSProperties = {
  padding: "36px 14px",
  border: "1px solid #e6ece3",
  borderRadius: 16,
  background: "#fff",
  color: "#7b8777",
  textAlign: "center",
};
