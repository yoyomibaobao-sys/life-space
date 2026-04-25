"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DiscoverEmptyState } from "@/components/discover/DiscoverEmptyState";
import { DiscoverFilterBar } from "@/components/discover/DiscoverFilterBar";
import { DiscoverHeader } from "@/components/discover/DiscoverHeader";
import { DiscoverHelpList } from "@/components/discover/DiscoverHelpList";
import { DiscoverUserSections } from "@/components/discover/DiscoverUserSections";
import { fetchDiscoverFeedRange, mergeDiscoverFeedItems } from "@/lib/discover-feed-shared";
import {
  type FeedItem,
  type FilterMode,
  RECORD_BATCH_SIZE,
  filterOptions,
} from "@/lib/discover-types";
import { buildUserSections, compareArchiveDisplayOrder } from "@/lib/discover-utils";

export default function DiscoverPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [hasMore, setHasMore] = useState(true);
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);

  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const sections = useMemo(() => buildUserSections(items), [items]);
  const helpStreamItems = useMemo(
    () => [...items].sort(compareArchiveDisplayOrder),
    [items]
  );

  async function goUser(userId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id === userId) {
      window.location.href = "/archive";
    } else {
      window.location.href = `/user/${userId}`;
    }
  }

  function toggleUserSection(userId: string) {
    setExpandedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  async function load(pageIndex = 0, mode: FilterMode = filterMode) {
    if (loadingRef.current) return;
    if (!hasMore && pageIndex !== 0) return;

    loadingRef.current = true;
    setLoading(true);

    const from = pageIndex * RECORD_BATCH_SIZE;
    const to = from + RECORD_BATCH_SIZE - 1;

    const { items: nextItems, hasError } = await fetchDiscoverFeedRange({
      from,
      to,
      category: mode,
    });

    if (hasError) {
      setLoading(false);
      loadingRef.current = false;
      return;
    }

    if (pageIndex === 0) {
      setItems(nextItems);
      setExpandedUserIds([]);
    } else {
      setItems((prev) => mergeDiscoverFeedItems(prev, nextItems));
    }

    setHasMore(nextItems.length >= RECORD_BATCH_SIZE);
    setLoading(false);
    loadingRef.current = false;
  }

  function changeFilter(mode: FilterMode) {
    if (mode === filterMode) return;

    setFilterMode(mode);
    setItems([]);
    setPage(0);
    setHasMore(true);
    setExpandedUserIds([]);
    load(0, mode);
  }

  useEffect(() => {
    setItems([]);
    setPage(0);
    setHasMore(true);
    load(0, filterMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaderRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !loadingRef.current &&
          hasMore &&
          items.length > 0
        ) {
          const nextPage = page + 1;
          setPage(nextPage);
          load(nextPage, filterMode);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [page, hasMore, items.length, filterMode]);

  const activeFilterLabel =
    filterOptions.find((item) => item.value === filterMode)?.label || "全部";
  const isEmpty = !loading && (filterMode === "help" ? helpStreamItems.length === 0 : sections.length === 0);

  return (
    <main
      style={{
        padding: 14,
        maxWidth: 860,
        margin: "0 auto",
      }}
    >
      <DiscoverHeader />

      <DiscoverFilterBar
        options={filterOptions}
        activeMode={filterMode}
        onChange={changeFilter}
      />

      {filterMode === "help" ? (
        <DiscoverHelpList items={helpStreamItems} />
      ) : (
        <DiscoverUserSections
          sections={sections}
          expandedUserIds={expandedUserIds}
          onToggle={toggleUserSection}
          onGoUser={goUser}
        />
      )}

      {isEmpty ? (
        <DiscoverEmptyState
          filterMode={filterMode}
          activeFilterLabel={activeFilterLabel}
        />
      ) : null}

      <div ref={loaderRef} style={{ height: 44, textAlign: "center" }}>
        {loading ? (
          <span style={{ color: "#8a998a", fontSize: 13 }}>加载中...</span>
        ) : hasMore ? (
          ""
        ) : filterMode === "help" ? (
          helpStreamItems.length > 0 ? (
            <span style={{ color: "#aaa", fontSize: 12 }}>没有更多了</span>
          ) : (
            ""
          )
        ) : sections.length > 0 ? (
          <span style={{ color: "#aaa", fontSize: 12 }}>没有更多了</span>
        ) : (
          ""
        )}
      </div>
    </main>
  );
}
