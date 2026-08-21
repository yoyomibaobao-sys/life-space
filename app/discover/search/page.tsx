"use client";

import { useEffect, useRef, useState } from "react";
import DiscoverSearchForm from "@/components/discover-search/DiscoverSearchForm";
import DiscoverSearchFromArchiveNotice from "@/components/discover-search/DiscoverSearchFromArchiveNotice";
import DiscoverSearchHeader from "@/components/discover-search/DiscoverSearchHeader";
import DiscoverSearchResults from "@/components/discover-search/DiscoverSearchResults";
import DiscoverSearchTabs, {
  type ActivitySearchScope,
} from "@/components/discover-search/DiscoverSearchTabs";
import {
  fetchDiscoverProjectSearchResults,
  fetchDiscoverSearchResults,
} from "@/lib/discover-search-data";
import {
  emptySearchFilters,
  type SearchFilters,
} from "@/lib/discover-search-types";
import {
  buildDiscoverSearchUrl,
  parseDiscoverSearchKind,
  parseSearchFiltersFromUrl,
} from "@/lib/discover-search-utils";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import type { FeedItem } from "@/lib/discover-types";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function DiscoverSearchPage() {
  const { t } = useLanguage();
  const [filters, setFilters] = useState<SearchFilters>(emptySearchFilters);
  const [searchKind, setSearchKind] = useState<ActivitySearchScope>("all");
  const [projectResults, setProjectResults] =
    useState<DiscoveryProjectFeedItem[]>([]);
  const [recordResults, setRecordResults] = useState<FeedItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHasRun, setSearchHasRun] = useState(false);
  const [fromArchiveId, setFromArchiveId] = useState("");
  const [fromArchiveTitle, setFromArchiveTitle] = useState("");
  const [initialized, setInitialized] = useState(false);
  const skipNextUrlSyncRef = useRef(false);

async function performSearch(
  nextFilters: SearchFilters,
  nextKind: ActivitySearchScope,
  options?: { syncUrl?: boolean }
) {
  if (options?.syncUrl) {
    const extraParams: Record<string, string> = {};

    if (fromArchiveId) extraParams.fromArchive = fromArchiveId;
    if (fromArchiveTitle) extraParams.fromTitle = fromArchiveTitle;

    const url = buildDiscoverSearchUrl(
      nextFilters,
      extraParams,
      nextKind === "records" ? "records" : "projects"
    );
    window.history.replaceState(
      null,
      "",
      nextKind === "all" ? url.replace("type=projects", "type=all") : url
    );
  }

  setSearchLoading(true);
  setSearchHasRun(true);
  if (nextKind === "all") {
    const [projects, records] = await Promise.all([
      fetchDiscoverProjectSearchResults(nextFilters),
      fetchDiscoverSearchResults(nextFilters),
    ]);
    setProjectResults(projects);
    setRecordResults(records);
  } else if (nextKind === "projects") {
    setProjectResults(await fetchDiscoverProjectSearchResults(nextFilters));
  } else {
    setRecordResults(await fetchDiscoverSearchResults(nextFilters));
  }
  setSearchLoading(false);
}

function changeSearchKind(nextKind: ActivitySearchScope) {
  const nextFilters =
    nextKind === "projects"
      ? { ...filters, tag: "", content: "", helpOnly: false }
      : filters;
  setSearchKind(nextKind);
  setFilters(nextFilters);
}

function clearSearchFilters() {
  setFilters(emptySearchFilters);
  setFromArchiveId("");
  setFromArchiveTitle("");
}

const hasFilters = Object.entries(filters).some(([key, value]) =>
  key === "category" ? value !== "all" : Boolean(value)
);

 useEffect(() => {
  function loadFromUrl() {
    const initialFilters = parseSearchFiltersFromUrl(window.location.search);
    const params = new URLSearchParams(window.location.search);
    const rawKind = params.get("type");
    const parsedKind = parseDiscoverSearchKind(window.location.search);
    const initialKind: ActivitySearchScope = rawKind === "all"
      ? "all"
      : parsedKind === "records"
        ? "records"
        : rawKind === "projects"
          ? "projects"
          : "all";

    skipNextUrlSyncRef.current = true;
    setFromArchiveId(params.get("fromArchive") || "");
    setFromArchiveTitle(params.get("fromTitle") || "");
    setFilters(initialFilters);
    setSearchKind(initialKind);
    setInitialized(true);
  }

  loadFromUrl();

  window.addEventListener("popstate", loadFromUrl);

  return () => {
    window.removeEventListener("popstate", loadFromUrl);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

 useEffect(() => {
  if (!initialized) return;
  const timer = window.setTimeout(() => {
    const syncUrl = !skipNextUrlSyncRef.current;
    skipNextUrlSyncRef.current = false;
    void performSearch(filters, searchKind, { syncUrl });
  }, 280);

  return () => window.clearTimeout(timer);
  // performSearch intentionally runs from the latest filter snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filters, initialized, searchKind]);

  return (
    <main
      style={{
        padding: "10px 14px 14px",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <DiscoverSearchHeader />

      <DiscoverSearchTabs value={searchKind} onChange={changeSearchKind} />

      {searchKind === "records" ? (
        <DiscoverSearchFromArchiveNotice
          fromArchiveId={fromArchiveId}
          fromArchiveTitle={fromArchiveTitle}
        />
      ) : null}

      <DiscoverSearchForm
        searchKind={searchKind}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {hasFilters ? (
        <button type="button" onClick={clearSearchFilters} style={clearFiltersStyle}>
          {t.discover.search_ui.clear_filters}
        </button>
      ) : null}

      {searchKind !== "records" ? (
        <DiscoverSearchResults
          kind="projects"
          projectItems={projectResults}
          recordItems={[]}
          experienceItems={[]}
          loading={searchLoading}
          hasRun={searchHasRun}
        />
      ) : null}
      {searchKind !== "projects" ? (
        <DiscoverSearchResults
          kind="records"
          projectItems={[]}
          recordItems={recordResults}
          experienceItems={[]}
          loading={searchLoading}
          hasRun={searchHasRun}
        />
      ) : null}
    </main>
  );
}

const clearFiltersStyle = {
  display: "block",
  margin: "-4px 0 10px auto",
  padding: "4px 2px",
  border: 0,
  background: "transparent",
  color: "#587552",
  fontSize: 13,
  cursor: "pointer",
} as const;
