"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { DiscoverEmptyState } from "@/components/discover/DiscoverEmptyState";
import { DiscoverFilterBar } from "@/components/discover/DiscoverFilterBar";
import { DiscoverHeader } from "@/components/discover/DiscoverHeader";
import { DiscoverHelpList } from "@/components/discover/DiscoverHelpList";
import { DiscoverUserSections } from "@/components/discover/DiscoverUserSections";
import FollowProjectList from "@/components/follow/FollowProjectList";
import FollowToolbar from "@/components/follow/FollowToolbar";
import FollowUserList from "@/components/follow/FollowUserList";
import { fetchDiscoverFeedRange, mergeDiscoverFeedItems } from "@/lib/discover-feed-shared";
import {
  type FeedItem,
  type FilterMode,
  RECORD_BATCH_SIZE,
  filterOptions,
} from "@/lib/discover-types";
import { buildUserSections, compareArchiveDisplayOrder } from "@/lib/discover-utils";
import { loadFollowPageData } from "@/lib/follow-data";
import type {
  FollowProjectCard,
  FollowUserCard,
  ProjectStatusFilter,
  TabKey,
} from "@/lib/follow-types";

type MobileDiscoverTab = "feed" | "following";

export default function DiscoverPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [hasMore, setHasMore] = useState(true);
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileDiscoverTab>("feed");
  const [followLoading, setFollowLoading] = useState(false);
  const [followLoaded, setFollowLoaded] = useState(false);
  const [followCurrentUserId, setFollowCurrentUserId] = useState<string | null>(null);
  const [followTab, setFollowTab] = useState<TabKey>("projects");
  const [followKeyword, setFollowKeyword] = useState("");
  const [followProjectStatus, setFollowProjectStatus] =
    useState<ProjectStatusFilter>("all");
  const [followProjectCards, setFollowProjectCards] = useState<FollowProjectCard[]>([]);
  const [followUserCards, setFollowUserCards] = useState<FollowUserCard[]>([]);
  const [projectConfirmId, setProjectConfirmId] = useState<string | null>(null);
  const [userConfirmId, setUserConfirmId] = useState<string | null>(null);
  const [projectSubmitting, setProjectSubmitting] = useState(false);
  const [userSubmitting, setUserSubmitting] = useState(false);

  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const sections = useMemo(() => buildUserSections(items), [items]);
  const helpStreamItems = useMemo(
    () => [...items].sort(compareArchiveDisplayOrder),
    [items]
  );
  const filteredFollowProjectCards = useMemo(() => {
    const search = followKeyword.trim().toLowerCase();

    return followProjectCards.filter((item) => {
      const matchKeyword = !search
        ? true
        : [
            item.title,
            item.displaySystemName,
            item.ownerName,
            item.categoryLabel,
            item.subTagName,
            item.groupTagName,
            item.latestNote,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search);

      if (!matchKeyword) return false;
      if (followProjectStatus === "all") return true;
      if (followProjectStatus === "open") return item.statusKind === "help";
      if (followProjectStatus === "resolved") return item.statusKind === "resolved";
      if (followProjectStatus === "ended") return item.statusKind === "ended";
      return true;
    });
  }, [followKeyword, followProjectCards, followProjectStatus]);
  const filteredFollowUserCards = useMemo(() => {
    const search = followKeyword.trim().toLowerCase();

    return followUserCards.filter((item) => {
      if (!search) return true;
      return [item.username, ...item.recentArchiveTitles]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [followKeyword, followUserCards]);

  function changeMobileTab(nextTab: MobileDiscoverTab) {
    setMobileTab(nextTab);

    if (typeof window === "undefined") return;

    const nextUrl =
      nextTab === "following" ? "/discover?tab=following" : "/discover";
    window.history.replaceState(null, "", nextUrl);
  }

  async function loadFollowingContent() {
    if (followLoading) return;

    setFollowLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setFollowLoading(false);
      window.location.href = "/login";
      return;
    }

    try {
      const data = await loadFollowPageData(supabase, user.id);
      setFollowCurrentUserId(user.id);
      setFollowProjectCards(data.projectCards);
      setFollowUserCards(data.userCards);
      setFollowLoaded(true);
    } finally {
      setFollowLoading(false);
    }
  }

  async function handleUnfollowProject(archiveId: string) {
    if (!followCurrentUserId || projectSubmitting) return;

    setProjectSubmitting(true);

    const { error } = await supabase
      .from("archive_follows")
      .delete()
      .eq("user_id", followCurrentUserId)
      .eq("archive_id", archiveId);

    if (error) {
      setProjectSubmitting(false);
      showToast("取消关注失败");
      return;
    }

    setFollowProjectCards((prev) => prev.filter((item) => item.id !== archiveId));
    setProjectSubmitting(false);
    setProjectConfirmId(null);
    showToast("已取消关注项目");
  }

  async function handleUnfollowUser(userId: string) {
    if (!followCurrentUserId || userSubmitting) return;

    setUserSubmitting(true);

    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", followCurrentUserId)
      .eq("following_id", userId);

    if (error) {
      setUserSubmitting(false);
      showToast("取消关注失败");
      return;
    }

    setFollowUserCards((prev) => prev.filter((item) => item.id !== userId));
    setUserSubmitting(false);
    setUserConfirmId(null);
    showToast("已取消关注用户");
  }

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
    function updateViewportMode() {
      setIsMobileViewport(window.innerWidth < 760);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "following") {
      setMobileTab("following");
    }
  }, []);

  useEffect(() => {
    if (!isMobileViewport || mobileTab !== "following" || followLoaded) return;

    void loadFollowingContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileViewport, mobileTab, followLoaded]);

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
  const showMobileFollowing = isMobileViewport && mobileTab === "following";

  return (
    <main
      style={{
        padding: 14,
        maxWidth: 860,
        margin: "0 auto",
      }}
    >
      {isMobileViewport ? (
        <MobileDiscoverTabs active={mobileTab} onChange={changeMobileTab} />
      ) : null}

      <div className="mobile-app-desktop-only">
        <DiscoverHeader />
      </div>

      {showMobileFollowing ? (
        <MobileFollowingPanel
          loading={followLoading}
          tab={followTab}
          keyword={followKeyword}
          projectStatus={followProjectStatus}
          projectCards={filteredFollowProjectCards}
          userCards={filteredFollowUserCards}
          onTabChange={setFollowTab}
          onKeywordChange={setFollowKeyword}
          onProjectStatusChange={setFollowProjectStatus}
          onOpenArchive={(archiveId) => {
            window.location.href = `/archive/${archiveId}`;
          }}
          onOpenUser={(userId) => {
            window.location.href = `/user/${userId}`;
          }}
          onUnfollowProject={setProjectConfirmId}
          onUnfollowUser={setUserConfirmId}
        />
      ) : (
        <>
      <DiscoverFilterBar
        options={visibleFilterOptions}
        activeMode={filterMode}
        onChange={changeFilter}
      />

      <Link
        href="/discover/search"
        className="mobile-app-flex-only"
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
          textDecoration: "none",
        }}
      >
        <span aria-hidden="true">🔍</span>
        <span>搜索</span>
      </Link>

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
        </>
      )}

      <ConfirmDialog
        open={!!projectConfirmId}
        title="取消关注项目"
        message="确定取消关注这个项目吗？取消后，它将从“我的关注”中移除。"
        confirmText={projectSubmitting ? "处理中..." : "取消关注"}
        cancelText="返回"
        danger
        onClose={() => {
          if (projectSubmitting) return;
          setProjectConfirmId(null);
        }}
        onConfirm={() => {
          if (!projectConfirmId) return;
          return handleUnfollowProject(projectConfirmId);
        }}
      />

      <ConfirmDialog
        open={!!userConfirmId}
        title="取消关注用户"
        message="确定取消关注这个用户吗？取消后，对方将从“我的关注”中移除。"
        confirmText={userSubmitting ? "处理中..." : "取消关注"}
        cancelText="返回"
        danger
        onClose={() => {
          if (userSubmitting) return;
          setUserConfirmId(null);
        }}
        onConfirm={() => {
          if (!userConfirmId) return;
          return handleUnfollowUser(userConfirmId);
        }}
      />
    </main>
  );
}

function MobileDiscoverTabs({
  active,
  onChange,
}: {
  active: MobileDiscoverTab;
  onChange: (tab: MobileDiscoverTab) => void;
}) {
  return (
    <nav style={mobileDiscoverTabsStyle} aria-label="发现内容">
      <button
        type="button"
        onClick={() => onChange("feed")}
        style={mobileDiscoverTabButtonStyle(active === "feed")}
      >
        动态
      </button>
      <button
        type="button"
        onClick={() => onChange("following")}
        style={mobileDiscoverTabButtonStyle(active === "following")}
      >
        关注
      </button>
    </nav>
  );
}

function MobileFollowingPanel({
  loading,
  tab,
  keyword,
  projectStatus,
  projectCards,
  userCards,
  onTabChange,
  onKeywordChange,
  onProjectStatusChange,
  onOpenArchive,
  onOpenUser,
  onUnfollowProject,
  onUnfollowUser,
}: {
  loading: boolean;
  tab: TabKey;
  keyword: string;
  projectStatus: ProjectStatusFilter;
  projectCards: FollowProjectCard[];
  userCards: FollowUserCard[];
  onTabChange: (tab: TabKey) => void;
  onKeywordChange: (value: string) => void;
  onProjectStatusChange: (value: ProjectStatusFilter) => void;
  onOpenArchive: (archiveId: string) => void;
  onOpenUser: (userId: string) => void;
  onUnfollowProject: (archiveId: string) => void;
  onUnfollowUser: (userId: string) => void;
}) {
  return (
    <section style={mobileFollowingPanelStyle}>
      <FollowToolbar
        tab={tab}
        keyword={keyword}
        projectStatus={projectStatus}
        onTabChange={onTabChange}
        onKeywordChange={onKeywordChange}
        onProjectStatusChange={onProjectStatusChange}
      />

      {loading ? (
        <div style={mobileFollowingLoadingStyle}>正在加载关注内容...</div>
      ) : tab === "projects" ? (
        <FollowProjectList
          items={projectCards}
          onOpenArchive={onOpenArchive}
          onUnfollow={onUnfollowProject}
        />
      ) : (
        <FollowUserList
          items={userCards}
          onOpenUser={onOpenUser}
          onUnfollow={onUnfollowUser}
        />
      )}
    </section>
  );
}

const mobileDiscoverTabsStyle: CSSProperties = {
  margin: "0 0 12px",
  padding: 4,
  border: "1px solid #e2ecd9",
  borderRadius: 16,
  background: "#fff",
  display: "flex",
  alignItems: "center",
  gap: 4,
};

function mobileDiscoverTabButtonStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    minHeight: 36,
    border: "none",
    borderRadius: 12,
    background: active ? "#e3f1dd" : "transparent",
    color: active ? "#2f6a31" : "#61705d",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  };
}

const mobileFollowingPanelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e9efe3",
  borderRadius: 18,
  padding: 12,
  boxShadow: "0 10px 28px rgba(39, 59, 39, 0.05)",
};

const mobileFollowingLoadingStyle: CSSProperties = {
  padding: "28px 12px",
  color: "#7b8578",
  fontSize: 13,
  textAlign: "center",
};
