"use client";

import { useMemo, useState } from "react";
import HomeSectionTabs, { type HomeSection } from "@/components/home/HomeSectionTabs";
import GuideCategoryTabs from "@/components/plant/GuideCategoryTabs";
import GuideResultsBar from "@/components/plant/GuideResultsBar";
import PublicGuideCard from "@/components/plant/PublicGuideCard";
import {
  publicGuideEmptyStyle,
  publicGuideGridStyle,
  publicGuidePanelStyle,
} from "@/components/plant/publicGuideCardStyles";
import MobileSearchField from "@/components/search/MobileSearchField";
import {
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import { useLanguage } from "@/lib/i18n/useLanguage";
import {
  getOfflineGuideKey,
  getOfflineGuideName,
  getOfflineGuideOverview,
  type OfflineGuideDirectoryEntry,
} from "@/lib/offline-guide-directory";
import { publicGuideCopy } from "@/lib/public-guide-library";

export default function OfflineGuideDirectoryView({
  directory,
  signedIn,
  onSelectGuide,
  onSelectHomeSection,
}: {
  directory: OfflineGuideDirectoryEntry[];
  signedIn: boolean;
  onSelectGuide: (guide: OfflineGuideDirectoryEntry) => void;
  onSelectHomeSection: (section: HomeSection) => void;
}) {
  const { language, t } = useLanguage();
  const copy = publicGuideCopy[language];
  const [guideSection, setGuideSection] = useState<ArchiveCategory>("plant");
  const [query, setQuery] = useState("");

  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return directory.filter((row) => {
      if (row.category !== guideSection) return false;
      if (!needle) return true;
      return `${row.label} ${row.nameEn || ""} ${(row.aliases || []).join(" ")} ${row.searchText || ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [directory, guideSection, query]);

  return (
    <>
      <HomeSectionTabs
        active="guide"
        searchEnabled={false}
        showGuestLanguageSwitcher={false}
        onSelect={(section) => {
          if (section === "guide") return;
          onSelectHomeSection(section);
        }}
      />
      <main style={{ padding: "6px 10px 10px", maxWidth: 1080, margin: "0 auto" }}>
        <GuideCategoryTabs value={guideSection} onChange={setGuideSection} />
        <section style={publicGuidePanelStyle(true)}>
          <MobileSearchField
            value={query}
            onChange={setQuery}
            onClear={() => setQuery("")}
            placeholder={copy.searchPlaceholder}
            ariaLabel={t.plant.global_search}
            clearAriaLabel={t.plant.clear_search}
          />
        </section>
        <GuideResultsBar count={visibleEntries.length} loading={false} savedLink={<span />} />
        {visibleEntries.length === 0 ? (
          <div style={publicGuideEmptyStyle}>{query ? copy.noMatch : copy.empty}</div>
        ) : (
          <div style={publicGuideGridStyle(true)}>
            {visibleEntries.map((guide) => {
              const name = getOfflineGuideName(guide, language);
              const overview = signedIn ? getOfflineGuideOverview(guide, language) : copy.registerForOverview;
              return (
                <PublicGuideCard
                  key={getOfflineGuideKey(guide)}
                  name={name}
                  categoryLabel={getArchiveCategoryLabel(guide.category, language)}
                  secondaryName={guide.nameEn}
                  summary={overview || copy.contentPending}
                  hasSummaryAccess={signedIn}
                  onClick={() => onSelectGuide(guide)}
                />
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
