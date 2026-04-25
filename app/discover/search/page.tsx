"use client";

import { useEffect, useState } from "react";
import DiscoverSearchForm from "@/components/discover-search/DiscoverSearchForm";
import DiscoverSearchFromArchiveNotice from "@/components/discover-search/DiscoverSearchFromArchiveNotice";
import DiscoverSearchHeader from "@/components/discover-search/DiscoverSearchHeader";
import DiscoverSearchResults from "@/components/discover-search/DiscoverSearchResults";
import { fetchDiscoverSearchResults } from "@/lib/discover-search-data";
import {
  emptySearchFilters,
  type SearchFilters,
} from "@/lib/discover-search-types";
import { parseSearchFiltersFromUrl } from "@/lib/discover-search-utils";
import type { FeedItem } from "@/lib/discover-types";

export default function DiscoverSearchPage() {
  const [filters, setFilters] = useState<SearchFilters>(emptySearchFilters);
  const [searchResults, setSearchResults] = useState<FeedItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHasRun, setSearchHasRun] = useState(false);
  const [fromArchiveId, setFromArchiveId] = useState("");
  const [fromArchiveTitle, setFromArchiveTitle] = useState("");

  async function performSearch(nextFilters: SearchFilters) {
    setSearchLoading(true);
    setSearchHasRun(true);
    const nextItems = await fetchDiscoverSearchResults(nextFilters);
    setSearchResults(nextItems);
    setSearchLoading(false);
  }

  function runSearch() {
    performSearch(filters);
  }

  function resetSearchFilters() {
    setFilters(emptySearchFilters);
    window.history.replaceState(null, "", "/discover/search");
    performSearch(emptySearchFilters);
  }

  useEffect(() => {
    const initialFilters = parseSearchFiltersFromUrl(window.location.search);
    const params = new URLSearchParams(window.location.search);

    setFromArchiveId(params.get("fromArchive") || "");
    setFromArchiveTitle(params.get("fromTitle") || "");
    setFilters(initialFilters);
    performSearch(initialFilters);
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

      <DiscoverSearchFromArchiveNotice
        fromArchiveId={fromArchiveId}
        fromArchiveTitle={fromArchiveTitle}
      />

      <DiscoverSearchForm
        filters={filters}
        onFiltersChange={setFilters}
        onSubmit={runSearch}
        onReset={resetSearchFilters}
      />

      <DiscoverSearchResults
        items={searchResults}
        loading={searchLoading}
        hasRun={searchHasRun}
      />
    </main>
  );
}
