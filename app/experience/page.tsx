"use client";

import { useEffect, useState, type CSSProperties } from "react";
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

  useEffect(() => {
    let cancelled = false;
    void fetchDiscoverExperienceCardSearchResults(emptySearchFilters).then((rows) => {
      if (cancelled) return;
      setItems(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <HomeSectionTabs active="experience" />
      <main style={pageStyle}>
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
  maxWidth: 720,
  margin: "0 auto",
  padding: "8px 14px 90px",
};
const emptyStyle: CSSProperties = {
  padding: "36px 14px",
  border: "1px solid #e6ece3",
  borderRadius: 16,
  background: "#fff",
  color: "#7b8777",
  textAlign: "center",
};
