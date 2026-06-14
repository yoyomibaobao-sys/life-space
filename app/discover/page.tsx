"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { DiscoverEmptyState } from "@/components/discover/DiscoverEmptyState";
import { DiscoverFilterBar } from "@/components/discover/DiscoverFilterBar";
import { DiscoverHeader } from "@/components/discover/DiscoverHeader";
import { DiscoverHelpList } from "@/components/discover/DiscoverHelpList";
import { DiscoverUserSections } from "@/components/discover/DiscoverUserSections";
import FollowProjectList from "@/components/follow/FollowProjectList";
import UserAvatar from "@/components/social/UserAvatar";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
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
  FollowUserPublicArchiveCard,
  ProjectStatusFilter,
  TabKey,
} from "@/lib/follow-types";
import {
  getDurationDays,
  getProjectStatusKind,
  getProjectStatusLabel,
} from "@/lib/follow-utils";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";

type MobileDiscoverTab = "feed" | "following";

type FollowedUserArchiveRow = {
  id: string;
  user_id: string;
  title: string | null;
  category: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
  created_at: string | null;
  status: string | null;
  ended_at: string | null;
  help_status: string | null;
  record_count: number | null;
  last_record_time: string | null;
  view_count: number | null;
  cover_image_url?: string | null;
};

async function loadFollowedUserPublicArchives(userCards: FollowUserCard[]) {
  const userIds = userCards.map((item) => item.id).filter(Boolean);
  const grouped = new Map<string, FollowUserPublicArchiveCard[]>();

  if (!userIds.length) return grouped;

  const { data, error } = await supabase
    .from("archives")
    .select(
      "id, user_id, title, category, system_name, species_name_snapshot, created_at, status, ended_at, help_status, record_count, last_record_time, view_count, cover_image_url"
    )
    .in("user_id", userIds)
    .eq("is_public", true)
    .order("last_record_time", { ascending: false });

  if (error) {
    console.error("load followed user public archives error:", error);
    return grouped;
  }

  const rows = (data || []) as FollowedUserArchiveRow[];
  const ownerMap = new Map(userCards.map((item) => [item.id, item]));
  const coverPairs = await resolveMediaDisplayPairs(
    supabase,
    rows.map((archive) => ({ url: archive.cover_image_url || null }))
  );

  rows
    .map((archive, index) => {
      const owner = ownerMap.get(archive.user_id);
      const systemName = archive.system_name || archive.species_name_snapshot || "未填写";
      const endBase = archive.ended_at || archive.last_record_time || new Date().toISOString();

      return {
        id: archive.id,
        ownerId: archive.user_id,
        ownerName: owner?.username || "未设置用户名",
        title: archive.title || "未命名项目",
        displaySystemName: systemName,
        categoryLabel: getArchiveCategoryLabel(archive.category),
        categoryIcon: getArchiveCategoryIcon(archive.category),
        latestRecordTime: archive.last_record_time || null,
        recordCount: Number(archive.record_count || 0),
        durationDays: getDurationDays(archive.created_at, endBase),
        viewCount: Number(archive.view_count || 0),
        statusLabel: getProjectStatusLabel(archive.help_status, archive.status),
        statusKind: getProjectStatusKind(archive.help_status, archive.status),
        coverUrl:
          coverPairs[index]?.display_thumb_url ||
          coverPairs[index]?.display_url ||
          archive.cover_image_url ||
          null,
      } satisfies FollowUserPublicArchiveCard;
    })
    .sort((a, b) => {
      const left = a.latestRecordTime ? new Date(a.latestRecordTime).getTime() : 0;
      const right = b.latestRecordTime ? new Date(b.latestRecordTime).getTime() : 0;
      return right - left;
    })
    .forEach((archive) => {
      if (!grouped.has(archive.ownerId)) {
        grouped.set(archive.ownerId, []);
      }
      grouped.get(archive.ownerId)?.push(archive);
    });

  return grouped;
}

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
  const [selectedFollowUserId, setSelectedFollowUserId] = useState<string | null>(null);
  const [followSearchOpen, setFollowSearchOpen] = useState(false);
  const [projectConfirmId, setProjectConfirmId] = useState<string | null>(null);
  const [userConfirmId, setUserConfirmId] = useState<string | null>(null);
  const [projectSubmitting, setProjectSubmitting] = useState(false);
  const [userSubmitting, setUserSubmitting] = useState(false);

  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const followSearchInputRef = useRef<HTMLInputElement | null>(null);

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
  const visibleFollowUserPublicArchives = useMemo(() => {
    const search = followKeyword.trim().toLowerCase();
    const sourceUsers = selectedFollowUserId
      ? followUserCards.filter((item) => item.id === selectedFollowUserId)
      : followUserCards;

    return sourceUsers.flatMap((userItem) => {
      const usernameMatches = search
        ? userItem.username.toLowerCase().includes(search)
        : true;

      return (userItem.publicArchives || []).filter((archive) => {
        if (!search || usernameMatches) return true;

        return [
          archive.title,
          archive.displaySystemName,
          archive.categoryLabel,
          archive.ownerName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      });
    });
  }, [followKeyword, followUserCards, selectedFollowUserId]);

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
      const publicArchiveMap = await loadFollowedUserPublicArchives(data.userCards);
      const nextUserCards = data.userCards.map((item) => ({
        ...item,
        publicArchives: publicArchiveMap.get(item.id) || [],
      }));

      setFollowCurrentUserId(user.id);
      setFollowProjectCards(data.projectCards);
      setFollowUserCards(nextUserCards);
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
    function handleFollowSearchRequest() {
      setFollowSearchOpen(true);
      window.setTimeout(() => followSearchInputRef.current?.focus(), 0);
    }

    window.addEventListener(
      "mobile-discover-follow-search-request",
      handleFollowSearchRequest
    );

    return () => {
      window.removeEventListener(
        "mobile-discover-follow-search-request",
        handleFollowSearchRequest
      );
    };
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
          projectCards={filteredFollowProjectCards}
          projectCount={followProjectCards.length}
          userCount={followUserCards.length}
          userCards={followUserCards}
          visibleUserArchives={visibleFollowUserPublicArchives}
          selectedUserId={selectedFollowUserId}
          searchOpen={followSearchOpen}
          searchInputRef={followSearchInputRef}
          onTabChange={setFollowTab}
          onKeywordChange={setFollowKeyword}
          onSelectedUserChange={setSelectedFollowUserId}
          onCloseSearch={() => {
            setFollowSearchOpen(false);
            setFollowKeyword("");
          }}
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
        compactMobile={isMobileViewport}
      />

      {filterMode === "help" ? (
        <DiscoverHelpList items={helpStreamItems} />
      ) : (
        <DiscoverUserSections
          sections={sections}
          expandedUserIds={expandedUserIds}
          onToggle={toggleUserSection}
          onGoUser={goUser}
          compactMobile={isMobileViewport}
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
        我的关注
      </button>
    </nav>
  );
}

function MobileFollowingPanel({
  loading,
  tab,
  keyword,
  projectCards,
  projectCount,
  userCount,
  userCards,
  visibleUserArchives,
  selectedUserId,
  searchOpen,
  searchInputRef,
  onTabChange,
  onKeywordChange,
  onSelectedUserChange,
  onCloseSearch,
  onOpenArchive,
  onOpenUser,
  onUnfollowProject,
  onUnfollowUser,
}: {
  loading: boolean;
  tab: TabKey;
  keyword: string;
  projectCards: FollowProjectCard[];
  projectCount: number;
  userCount: number;
  userCards: FollowUserCard[];
  visibleUserArchives: FollowUserPublicArchiveCard[];
  selectedUserId: string | null;
  searchOpen: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onTabChange: (tab: TabKey) => void;
  onKeywordChange: (value: string) => void;
  onSelectedUserChange: (userId: string | null) => void;
  onCloseSearch: () => void;
  onOpenArchive: (archiveId: string) => void;
  onOpenUser: (userId: string) => void;
  onUnfollowProject: (archiveId: string) => void;
  onUnfollowUser: (userId: string) => void;
}) {
  return (
    <section style={mobileFollowingPanelStyle}>
      <div style={mobileFollowTabRowStyle}>
        <button
          type="button"
          onClick={() => onTabChange("projects")}
          style={mobileFollowTabButtonStyle(tab === "projects")}
        >
          关注项目（{projectCount}）
        </button>
        <button
          type="button"
          onClick={() => onTabChange("users")}
          style={mobileFollowTabButtonStyle(tab === "users")}
        >
          关注用户（{userCount}）
        </button>
      </div>

      {searchOpen ? (
        <div style={mobileFollowSearchRowStyle}>
          <input
            ref={searchInputRef}
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder={
              tab === "projects"
                ? "搜索关注项目"
                : "搜索关注用户 / 公开项目"
            }
            style={mobileFollowSearchInputStyle}
          />
          <button type="button" onClick={onCloseSearch} style={mobileFollowSearchCloseStyle}>
            取消
          </button>
        </div>
      ) : null}

      {loading ? (
        <div style={mobileFollowingLoadingStyle}>正在加载关注内容...</div>
      ) : tab === "projects" ? (
        <FollowProjectList
          items={projectCards}
          onOpenArchive={onOpenArchive}
          onUnfollow={onUnfollowProject}
        />
      ) : (
        <MobileFollowUserArchives
          users={userCards}
          archives={visibleUserArchives}
          selectedUserId={selectedUserId}
          onSelectedUserChange={onSelectedUserChange}
          onOpenUser={onOpenUser}
          onUnfollowUser={onUnfollowUser}
        />
      )}
    </section>
  );
}

function MobileFollowUserArchives({
  users,
  archives,
  selectedUserId,
  onSelectedUserChange,
}: {
  users: FollowUserCard[];
  archives: FollowUserPublicArchiveCard[];
  selectedUserId: string | null;
  onSelectedUserChange: (userId: string | null) => void;
  onOpenUser: (userId: string) => void;
  onUnfollowUser: (userId: string) => void;
}) {
  const selectedUser = selectedUserId
    ? users.find((item) => item.id === selectedUserId)
    : null;

  return (
    <div>
      <div style={mobileFollowUserRailStyle} aria-label="已关注用户">
        <button
          type="button"
          onClick={() => onSelectedUserChange(null)}
          style={mobileFollowUserChipStyle(!selectedUserId)}
        >
          <span style={mobileAllUserAvatarStyle}>全</span>
          <span style={mobileFollowUserNameStyle}>全部</span>
        </button>

        {users.map((userItem) => (
          <button
            key={userItem.id}
            type="button"
            onClick={() => onSelectedUserChange(userItem.id)}
            style={mobileFollowUserChipStyle(selectedUserId === userItem.id)}
          >
            <UserAvatar avatarUrl={userItem.avatarUrl} size={34} iconSize={16} />
            <span style={mobileFollowUserNameStyle}>{userItem.username}</span>
          </button>
        ))}
      </div>

      {archives.length ? (
        <div style={mobileUserArchiveListStyle}>
          {archives.map((archive) => (
            <MobileUserPublicArchiveCard key={archive.id} archive={archive} />
          ))}
        </div>
      ) : (
        <div style={mobileFollowingEmptyStyle}>
          {selectedUser ? "该用户暂无公开项目" : "暂无关注用户的公开项目"}
        </div>
      )}
    </div>
  );
}

function MobileUserPublicArchiveCard({
  archive,
}: {
  archive: FollowUserPublicArchiveCard;
}) {
  return (
    <Link href={`/archive/${archive.id}`} style={mobileUserArchiveCardStyle}>
      <div style={mobileUserArchiveCoverStyle}>
        {archive.coverUrl ? (
          <img src={archive.coverUrl} alt="" style={mobileUserArchiveCoverImageStyle} />
        ) : (
          <span style={{ fontSize: 24 }}>{archive.categoryIcon}</span>
        )}
      </div>

      <div style={mobileUserArchiveBodyStyle}>
        <div style={mobileUserArchiveTitleRowStyle}>
          <span style={mobileUserArchiveCategoryStyle}>{archive.categoryLabel}</span>
          <span style={mobileUserArchiveTitleStyle}>{archive.title}</span>
        </div>

        <div style={mobileUserArchiveMetaStyle}>
          {archive.ownerName} · {archive.displaySystemName}
        </div>

        <div style={mobileUserArchiveStatsStyle}>
          {archive.recordCount} 条 · 持续 {archive.durationDays} 天
          {archive.statusKind !== "normal" ? ` · ${archive.statusLabel}` : ""}
        </div>
      </div>
    </Link>
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

const mobileFollowTabRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 6,
  marginBottom: 8,
};

function mobileFollowTabButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: 34,
    border: active ? "1px solid #4f8f46" : "1px solid #dfe8d8",
    borderRadius: 999,
    background: active ? "#4f8f46" : "#f7faf5",
    color: active ? "#fff" : "#495748",
    fontSize: 13,
    fontWeight: 750,
    cursor: "pointer",
  };
}

const mobileFollowSearchRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 8,
  marginBottom: 8,
};

const mobileFollowSearchInputStyle: CSSProperties = {
  minWidth: 0,
  height: 34,
  border: "1px solid #dfe7d8",
  borderRadius: 999,
  background: "#fafcf8",
  padding: "0 12px",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const mobileFollowSearchCloseStyle: CSSProperties = {
  height: 34,
  border: "1px solid #dfe7d8",
  borderRadius: 999,
  background: "#fff",
  color: "#5f6f5b",
  padding: "0 11px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const mobileFollowUserRailStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  padding: "1px 0 10px",
  marginBottom: 2,
  scrollbarWidth: "none",
};

function mobileFollowUserChipStyle(active: boolean): CSSProperties {
  return {
    flex: "0 0 auto",
    minWidth: 64,
    maxWidth: 86,
    border: active ? "1px solid #4f8f46" : "1px solid #dfe8d8",
    borderRadius: 14,
    background: active ? "#eef7e9" : "#fff",
    color: active ? "#2f6a31" : "#536050",
    padding: "7px 7px 6px",
    display: "grid",
    justifyItems: "center",
    gap: 4,
    cursor: "pointer",
  };
}

const mobileAllUserAvatarStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#eef5e8",
  color: "#4f7b45",
  fontSize: 13,
  fontWeight: 800,
};

const mobileFollowUserNameStyle: CSSProperties = {
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 11,
  fontWeight: 700,
};

const mobileUserArchiveListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const mobileUserArchiveCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "78px minmax(0, 1fr)",
  gap: 9,
  textDecoration: "none",
  color: "inherit",
  background: "#fff",
  border: "1px solid #ebf0e7",
  borderRadius: 14,
  padding: 8,
  alignItems: "center",
};

const mobileUserArchiveCoverStyle: CSSProperties = {
  width: 78,
  height: 78,
  borderRadius: 12,
  overflow: "hidden",
  background: "#f4f8f1",
  color: "#8a9a86",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const mobileUserArchiveCoverImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const mobileUserArchiveBodyStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 5,
};

const mobileUserArchiveTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  minWidth: 0,
};

const mobileUserArchiveCategoryStyle: CSSProperties = {
  flexShrink: 0,
  color: "#6c7869",
  fontSize: 11,
};

const mobileUserArchiveTitleStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#223022",
  fontSize: 14,
  fontWeight: 800,
};

const mobileUserArchiveMetaStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#7a8578",
  fontSize: 12,
};

const mobileUserArchiveStatsStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#8a9287",
  fontSize: 11,
};

const mobileFollowingEmptyStyle: CSSProperties = {
  border: "1px dashed #dce7d7",
  borderRadius: 14,
  padding: "26px 12px",
  textAlign: "center",
  color: "#7b8578",
  fontSize: 13,
  background: "#fbfdf9",
};
