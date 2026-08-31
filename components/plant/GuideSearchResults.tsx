"use client";

import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getArchiveCategoryLabel } from "@/lib/archive-categories";
import type { GuideDirectoryMatch } from "@/lib/guide-directory-search";
import {
  buildPublicGuideContent,
  getPublicGuideName,
  publicGuideCopy,
} from "@/lib/public-guide-library";
import GuideResultsBar from "./GuideResultsBar";
import styles from "./GuideSearchResults.module.css";

export default function GuideSearchResults({
  matches,
  loading,
  loadError,
  visibleCount,
  signedIn,
  plantSummaries,
  onOpen,
  onClear,
  onLoadMore,
  savedLink,
  sectionRef,
}: {
  matches: GuideDirectoryMatch[];
  loading: boolean;
  loadError: boolean;
  visibleCount: number;
  signedIn: boolean;
  plantSummaries: Record<string, { summary?: string | null }>;
  onOpen: () => void;
  onClear: () => void;
  onLoadMore: () => void;
  savedLink: ReactNode;
  sectionRef?: Ref<HTMLElement>;
}) {
  const { language, t } = useLanguage();
  const copy = publicGuideCopy[language];
  return (
    <section ref={sectionRef} className={styles.searchResults} aria-label={t.plant.global_search}>
      <GuideResultsBar count={matches.length} loading={loading} global onClear={onClear} savedLink={savedLink} />
      {loadError ? <p role="alert" className={styles.notice}>{t.plant.search_load_error}</p> : null}
      {loading ? <p className={styles.notice}>{copy.loading}</p> : matches.length === 0 ? (
        <p className={styles.notice}>{loadError ? t.plant.search_retry : t.plant.no_global_results}</p>
      ) : (
        <div className={styles.grid}>
          {matches.slice(0, visibleCount).map((match) => {
            const name = match.kind === "plant"
              ? match.plant.common_name || match.plant.scientific_name || t.plant.unnamed
              : getPublicGuideName(match.entry, language);
            const secondaryName = match.kind === "plant" ? match.plant.scientific_name : language === "en" ? match.entry.name : match.entry.name_en;
            const summary = !signedIn ? copy.registerForOverview : match.kind === "plant"
              ? plantSummaries[match.plant.id]?.summary || t.plant.summary_pending
              : buildPublicGuideContent(match.entry, language).overview || copy.contentPending;
            const href = match.kind === "plant" ? `/plant/${match.plant.id}` : `/plant/guide/${match.entry.id}?from=${match.category}`;
            return (
              <Link key={match.key} href={href} onClick={onOpen} className={styles.card}>
                <span className={styles.titleRow}>
                  <strong className={styles.name}>{name}</strong>
                  <span className={styles.category}>{getArchiveCategoryLabel(match.category, language)}</span>
                </span>
                {secondaryName && secondaryName !== name ? <span className={styles.secondaryName}>{secondaryName}</span> : null}
                <span className={styles.summary}>{summary}</span>
              </Link>
            );
          })}
        </div>
      )}
      {!loading && matches.length > visibleCount ? (
        <button type="button" className={styles.loadMore} onClick={onLoadMore}>{t.plant.load_more}</button>
      ) : null}
    </section>
  );
}
