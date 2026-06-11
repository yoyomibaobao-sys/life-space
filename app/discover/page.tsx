"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { DiscoverEmptyState } from "@/components/discover/DiscoverEmptyState";
import { DiscoverFilterBar } from "@/components/discover/DiscoverFilterBar";
import { DiscoverHeader } from "@/components/discover/DiscoverHeader";
import { DiscoverHelpList } from "@/components/discover/DiscoverHelpList";
import { DiscoverUserSections } from "@/components/discover/DiscoverUserSections";
import DiscoverMarketTabs from "@/components/mobile/DiscoverMarketTabs";
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
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileSearchText, setMobileSearchText] = useState("");

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

  function submitMobileSearch() {
    const text = mobileSearchText.trim();
    window.location.href = text
      ? `/discover/search?content=${encodeURIComponent(text)}`
      : "/discover/search";
  }

  useEffect(() => {
    function updateViewportMode() {
      setIsMobileViewport(window.innerWidth < 760);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useEffect(() => {
    if (isMobileViewport && filterMode === "help") {
      changeFilter("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileViewport, filterMode]);

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
  const visibleFilterOptions = isMobileViewport
    ? filterOptions.filter((item) => item.value !== "help")
    : filterOptions;

  return (
    <main
      style={{
        padding: 14,
        maxWidth: 860,
        margin: "0 auto",
      }}
    >
      <DiscoverMarketTabs active="discover" />

      <div className="mobile-app-desktop-only">
        <DiscoverHeader />
      </div>

      <DiscoverFilterBar
        options={visibleFilterOptions}
        activeMode={filterMode}
        onChange={changeFilter}
      />

      <button
        type="button"
        className="mobile-app-flex-only"
        onClick={() => setMobileSearchOpen(true)}
        style={{
          width: "100%",
          minHeight: 38,
          alignItems: "center",
          gap: 10,
          margin: "-4px 0 14px",
          border: "1px solid #e1e8dd",
          borderRadius: 999,
          background: "#fff",
          color: "#7a8577",
          padding: "0 14px",
          fontSize: 14,
          textAlign: "left",
        }}
      >
        <span aria-hidden="true">🔍</span>
        <span>搜索</span>
      </button>

      {mobileSearchOpen ? (
        <div style={mobileSearchOverlayStyle}>
          <div style={mobileSearchPanelStyle}>
            <div style={mobileSearchHeaderStyle}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1f2d1f" }}>
                搜索
              </div>
              <button
                type="button"
                onClick={() => setMobileSearchOpen(false)}
                style={mobileSearchCancelStyle}
              >
                取消
              </button>
            </div>

            <input
              autoFocus
              value={mobileSearchText}
              onChange={(event) => setMobileSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitMobileSearch();
              }}
              placeholder="搜索记录、项目或关键词"
              style={mobileSearchInputStyle}
            />

            <button
              type="button"
              onClick={submitMobileSearch}
              style={mobileSearchSubmitStyle}
            >
              搜索
            </button>
          </div>
        </div>
      ) : null}

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
            <span style={{ color: "#aaa", fontSize: 12 }}>已到底</span>
          ) : (
            ""
          )
        ) : sections.length > 0 ? (
          <span style={{ color: "#aaa", fontSize: 12 }}>已到底</span>
        ) : (
          ""
        )}
      </div>
    </main>
  );
}

const mobileSearchOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 230,
  background: "rgba(31, 42, 31, 0.24)",
  display: "flex",
  justifyContent: "flex-end",
};

const mobileSearchPanelStyle: CSSProperties = {
  width: "min(88vw, 360px)",
  height: "100%",
  background: "#fff",
  borderLeft: "1px solid #e1e8dd",
  boxShadow: "-16px 0 36px rgba(31, 42, 31, 0.16)",
  padding: "16px 14px",
  transform: "translateX(0)",
};

const mobileSearchHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
};

const mobileSearchCancelStyle: CSSProperties = {
  border: "1px solid #dfe7d9",
  borderRadius: 999,
  background: "#fff",
  color: "#5f6f5b",
  fontSize: 13,
  fontWeight: 700,
  padding: "7px 12px",
  cursor: "pointer",
};

const mobileSearchInputStyle: CSSProperties = {
  width: "100%",
  height: 42,
  border: "1px solid #dfe7d9",
  borderRadius: 14,
  padding: "0 12px",
  fontSize: 14,
  outline: "none",
  color: "#273327",
};

const mobileSearchSubmitStyle: CSSProperties = {
  width: "100%",
  height: 40,
  marginTop: 12,
  border: "none",
  borderRadius: 999,
  background: "#2f6a31",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};
