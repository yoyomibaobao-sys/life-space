"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import HomeSectionTabs from "@/components/home/HomeSectionTabs";
import PublicExperienceFeedItem from "@/components/experience-card/PublicExperienceFeedItem";
import feedStyles from "@/components/experience-card/PublicExperienceFeed.module.css";
import UiIcon from "@/components/ui/UiIcon";
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
    <main style={pageStyle}>
      <HomeSectionTabs active="experience" />
      <header style={headerStyle}>
        <div>
          <h1 style={headingStyle}>{t.experience.public_feed}</h1>
          <p style={introStyle}>{t.experience.public_feed_hint}</p>
        </div>
        <Link href="/experience/search" style={searchLinkStyle}>
          <UiIcon name="search" size={16} /> {t.nav.search}
        </Link>
      </header>

      {loading ? (
        <section style={emptyStyle}>{t.experience.reading}</section>
      ) : items.length === 0 ? (
        <section style={emptyStyle}>{t.experience.no_public_experience}</section>
      ) : (
        <section className={feedStyles.feed} aria-label={t.experience.public_feed}>
          {items.map((item) => (
            <PublicExperienceFeedItem key={item.id} cardId={item.id} />
          ))}
        </section>
      )}
    </main>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  padding: "10px 14px 90px",
};
const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  marginBottom: 13,
};
const headingStyle: CSSProperties = { margin: 0, color: "#223422", fontSize: 22 };
const introStyle: CSSProperties = { margin: "4px 0 0", color: "#768273", fontSize: 13 };
const searchLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  minHeight: 34,
  padding: "0 10px",
  border: "1px solid #dde6da",
  borderRadius: 999,
  color: "#4f704d",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 750,
};
const emptyStyle: CSSProperties = {
  padding: "36px 14px",
  border: "1px solid #e6ece3",
  borderRadius: 16,
  background: "#fff",
  color: "#7b8777",
  textAlign: "center",
};
