"use client";

import { useEffect, useState } from "react";
import DiscoverSearchForm from "@/components/discover-search/DiscoverSearchForm";
import DiscoverSearchFromArchiveNotice from "@/components/discover-search/DiscoverSearchFromArchiveNotice";
import DiscoverSearchHeader from "@/components/discover-search/DiscoverSearchHeader";
import DiscoverSearchResults from "@/components/discover-search/DiscoverSearchResults";
import DiscoverSearchTabs from "@/components/discover-search/DiscoverSearchTabs";
import {
  fetchDiscoverProjectSearchResults,
  fetchDiscoverSearchResults,
} from "@/lib/discover-search-data";
import {
  emptySearchFilters,
  type DiscoverSearchKind,
  type SearchFilters,
} from "@/lib/discover-search-types";
import {
  buildDiscoverSearchUrl,
  parseDiscoverSearchKind,
  parseSearchFiltersFromUrl,
} from "@/lib/discover-search-utils";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import type { FeedItem } from "@/lib/discover-types";

export default function DiscoverSearchPage() {
  const [filters, setFilters] = useState<SearchFilters>(emptySearchFilters);
  const [searchKind, setSearchKind] =
    useState<DiscoverSearchKind>("projects");
  const [projectResults, setProjectResults] =
    useState<DiscoveryProjectFeedItem[]>([]);
  const [recordResults, setRecordResults] = useState<FeedItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHasRun, setSearchHasRun] = useState(false);
  const [fromArchiveId, setFromArchiveId] = useState("");
  const [fromArchiveTitle, setFromArchiveTitle] = useState("");

async function performSearch(
  nextFilters: SearchFilters,
  nextKind: DiscoverSearchKind,
  options?: { syncUrl?: boolean }
) {
  const activityKind = nextKind === "records" ? "records" : "projects";

  if (options?.syncUrl) {
    const extraParams: Record<string, string> = {};

    if (fromArchiveId) extraParams.fromArchive = fromArchiveId;
    if (fromArchiveTitle) extraParams.fromTitle = fromArchiveTitle;

    window.history.pushState(
      null,
      "",
      buildDiscoverSearchUrl(nextFilters, extraParams, activityKind)
    );
  }

  setSearchLoading(true);
  setSearchHasRun(true);
  if (activityKind === "projects") {
    setProjectResults(await fetchDiscoverProjectSearchResults(nextFilters));
  } else {
    setRecordResults(await fetchDiscoverSearchResults(nextFilters));
  }
  setSearchLoading(false);
}

function runSearch() {
  void performSearch(filters, searchKind, { syncUrl: true });
}

function changeSearchKind(nextKind: DiscoverSearchKind) {
  const activityKind = nextKind === "records" ? "records" : "projects";
  const nextFilters =
    activityKind === "records"
      ? filters
      : { ...filters, tag: "", content: "", helpOnly: false };
  setSearchKind(activityKind);
  setFilters(nextFilters);
  void performSearch(nextFilters, activityKind, { syncUrl: true });
}

  function resetSearchFilters() {
  setFilters(emptySearchFilters);
  setFromArchiveId("");
  setFromArchiveTitle("");
  void performSearch(emptySearchFilters, searchKind, { syncUrl: true });
}

 useEffect(() => {
  function loadFromUrl() {
    const initialFilters = parseSearchFiltersFromUrl(window.location.search);
    const parsedKind = parseDiscoverSearchKind(window.location.search);
    const initialKind = parsedKind === "records" ? "records" : "projects";
    const params = new URLSearchParams(window.location.search);

    setFromArchiveId(params.get("fromArchive") || "");
    setFromArchiveTitle(params.get("fromTitle") || "");
    setFilters(initialFilters);
    setSearchKind(initialKind);
    void performSearch(initialFilters, initialKind);
  }

  loadFromUrl();

  window.addEventListener("popstate", loadFromUrl);

  return () => {
    window.removeEventListener("popstate", loadFromUrl);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

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
        onSubmit={runSearch}
        onReset={resetSearchFilters}
      />

      <DiscoverSearchResults
        kind={searchKind}
        projectItems={projectResults}
        recordItems={recordResults}
        experienceItems={[]}
        loading={searchLoading}
        hasRun={searchHasRun}
      />
    </main>
  );
}
