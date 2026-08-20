"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { DiscoverFilterBar } from "@/components/discover/DiscoverFilterBar";
import { DiscoverHeader } from "@/components/discover/DiscoverHeader";
import { FollowedProjectList } from "@/components/discover/FollowedProjectList";
import { FollowedUserRail } from "@/components/discover/FollowedUserRail";
import { DiscoverProjectGrid } from "@/components/discover/DiscoverProjectGrid";
import {
  createInitialDiscoveryDiversityState,
  fetchDiverseDiscoveryProjectBatch,
  type DiscoveryDiverseProjectFeedState,
} from "@/lib/discover-diverse-project-feed";
import type {
  DiscoveryProjectCursor,
  DiscoveryProjectFeedItem,
} from "@/lib/discover-project-types";
import { type FilterMode, getDiscoverFilterOptions } from "@/lib/discover-types";
import {
  fetchFollowedPublicProjects,
} from "@/lib/followed-public-project-feed";
import { fetchFollowedArchiveProjects } from "@/lib/followed-archive-projects";
import {
  fetchFollowedUsers,
  type FollowedUserSummary,
} from "@/lib/followed-users";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { buildLoginHref } from "@/lib/auth-return";
import HomeSectionTabs from "@/components/home/HomeSectionTabs";

type MobileDiscoverTab = "feed" | "following";
type FollowingContentTab = "projects" | "users";

const DISCOVERY_PROJECT_PAGE_SIZE = 40;
const FOLLOWED_PROJECT_PAGE_SIZE = 20;

function dedupeDiscoveryProjects(items: DiscoveryProjectFeedItem[]) {
  const seenArchiveIds = new Set<string>();
  return items.filter((item) => {
    if (seenArchiveIds.has(item.archive_id)) return false;
    seenArchiveIds.add(item.archive_id);
    return true;
  });
}

export default function DiscoverPage() {
  const { language, t } = useLanguage();
  const [items, setItems] = useState<DiscoveryProjectFeedItem[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [diversityState, setDiversityState] =
    useState<DiscoveryDiverseProjectFeedState>(
      createInitialDiscoveryDiversityState
    );
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileDiscoverTab>("feed");
  const [discoverTabReady, setDiscoverTabReady] = useState(false);
  const [followingContentTab, setFollowingContentTab] =
    useState<FollowingContentTab>("projects");
  const [followCurrentUserId, setFollowCurrentUserId] = useState<string | null>(
    null
  );
  const [followedArchiveProjects, setFollowedArchiveProjects] = useState<
    DiscoveryProjectFeedItem[]
  >([]);
  const [followedArchiveProjectsLoading, setFollowedArchiveProjectsLoading] =
    useState(false);
  const [followedArchiveProjectsError, setFollowedArchiveProjectsError] =
    useState(false);
  const [projectConfirmId, setProjectConfirmId] = useState<string | null>(null);
  const [projectUnfollowSubmitting, setProjectUnfollowSubmitting] =
    useState(false);
  const [followedUsers, setFollowedUsers] = useState<FollowedUserSummary[]>([]);
  const [followedUsersLoading, setFollowedUsersLoading] = useState(false);
  const [followedUsersLoaded, setFollowedUsersLoaded] = useState(false);
  const [followedUsersError, setFollowedUsersError] = useState(false);
  const [selectedFollowedUserId, setSelectedFollowedUserId] = useState<
    string | null
  >(null);
  const [followedProjects, setFollowedProjects] = useState<
    DiscoveryProjectFeedItem[]
  >([]);
  const [followedCursor, setFollowedCursor] =
    useState<DiscoveryProjectCursor | null>(null);
  const [followedHasMore, setFollowedHasMore] = useState(true);
  const [followedInitialLoading, setFollowedInitialLoading] = useState(false);
  const [followedLoadingMore, setFollowedLoadingMore] = useState(false);
  const [followedInitialError, setFollowedInitialError] = useState(false);
  const [followedLoadMoreError, setFollowedLoadMoreError] = useState(false);

  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const followedProjectLoaderRef = useRef<HTMLDivElement | null>(null);
  const followedProjectListRef = useRef<HTMLDivElement | null>(null);
  const followedLoadingMoreRef = useRef(false);
  const followedRequestSequenceRef = useRef(0);
  const followedUsersRequestSequenceRef = useRef(0);
  const followedArchiveProjectsRequestSequenceRef = useRef(0);
  const followingInitializedRef = useRef(false);
  const followedUserProjectsInitializedRef = useRef(false);
  const publicFeedInitializedRef = useRef(false);
  const selectedFollowedUserIdRef = useRef<string | null>(null);

  function changeMobileTab(nextTab: MobileDiscoverTab) {
    setMobileTab(nextTab);

    if (typeof window === "undefined") return;

    const nextUrl =
      nextTab === "following" ? "/discover?tab=following" : "/discover";
    window.history.replaceState(null, "", nextUrl);
    window.dispatchEvent(
      new CustomEvent("discover-tab-change", { detail: nextTab })
    );
  }

  const loadFollowedProjectPage = useCallback(
    async ({
      ownerUserId,
      cursor,
      replace,
    }: {
      ownerUserId: string | null;
      cursor: DiscoveryProjectCursor | null;
      replace: boolean;
    }) => {
      if (!replace && followedLoadingMoreRef.current) return;

      const requestSequence = ++followedRequestSequenceRef.current;
      if (replace) {
        followedLoadingMoreRef.current = false;
        setFollowedInitialLoading(true);
        setFollowedLoadingMore(false);
        setFollowedInitialError(false);
        setFollowedLoadMoreError(false);
        setFollowedProjects([]);
        setFollowedCursor(null);
        setFollowedHasMore(true);
      } else {
        followedLoadingMoreRef.current = true;
        setFollowedLoadingMore(true);
        setFollowedLoadMoreError(false);
      }

      try {
        const result = await fetchFollowedPublicProjects({
          ownerUserId,
          cursor,
          limit: FOLLOWED_PROJECT_PAGE_SIZE,
        });

        if (requestSequence !== followedRequestSequenceRef.current) return;

        if (result.error) {
          console.error("followed public project feed load failed", {
            code: result.error.code,
            message: result.error.message,
            phase: replace ? "initial" : "more",
          });
          if (replace) setFollowedInitialError(true);
          else setFollowedLoadMoreError(true);
          return;
        }

        if (replace) {
          setFollowedProjects(dedupeDiscoveryProjects(result.items));
        } else {
          setFollowedProjects((currentItems) =>
            dedupeDiscoveryProjects([...currentItems, ...result.items])
          );
        }
        setFollowedCursor(result.nextCursor);
        setFollowedHasMore(result.hasMore);
      } catch (error) {
        if (requestSequence !== followedRequestSequenceRef.current) return;
        console.error("followed public project feed request failed", {
          message: error instanceof Error ? error.message : "Unknown error",
          phase: replace ? "initial" : "more",
        });
        if (replace) setFollowedInitialError(true);
        else setFollowedLoadMoreError(true);
      } finally {
        if (requestSequence === followedRequestSequenceRef.current) {
          setFollowedInitialLoading(false);
          setFollowedLoadingMore(false);
          followedLoadingMoreRef.current = false;
        }
      }
    },
    []
  );

  const loadFollowedArchiveProjectList = useCallback(
    async (currentUserId: string) => {
      const requestSequence =
        ++followedArchiveProjectsRequestSequenceRef.current;
      setFollowedArchiveProjectsLoading(true);
      setFollowedArchiveProjectsError(false);

      const result = await fetchFollowedArchiveProjects(currentUserId);
      if (
        requestSequence !== followedArchiveProjectsRequestSequenceRef.current
      ) {
        return;
      }

      if (result.error) {
        console.error(
          `followed archive projects load failed: [${result.error.code}] ${result.error.message}`
        );
        setFollowedArchiveProjectsError(true);
        setFollowedArchiveProjectsLoading(false);
        return;
      }

      setFollowedArchiveProjects(dedupeDiscoveryProjects(result.items));
      setFollowedArchiveProjectsLoading(false);
    },
    []
  );

  const loadFollowedUserRail = useCallback(
    async (currentUserId: string) => {
      const requestSequence = ++followedUsersRequestSequenceRef.current;
      setFollowedUsersLoading(true);
      setFollowedUsersError(false);

      const result = await fetchFollowedUsers(currentUserId);
      if (requestSequence !== followedUsersRequestSequenceRef.current) return;

      if (result.error) {
        console.error("followed users load failed", {
          code: result.error.code,
          message: result.error.message,
        });
        setFollowedUsersError(true);
        setFollowedUsersLoading(false);
        return;
      }

      setFollowedUsers(result.users);
      setFollowedUsersLoaded(true);
      setFollowedUsersLoading(false);

      const selectedUserId = selectedFollowedUserIdRef.current;
      if (
        selectedUserId &&
        !result.users.some((user) => user.id === selectedUserId)
      ) {
        selectedFollowedUserIdRef.current = null;
        setSelectedFollowedUserId(null);
        void loadFollowedProjectPage({
          ownerUserId: null,
          cursor: null,
          replace: true,
        });
      }
    },
    [loadFollowedProjectPage]
  );

  const loadProjectPage = useCallback(
    async ({
      mode,
      nextDiversityState,
      replace,
    }: {
      mode: FilterMode;
      nextDiversityState: DiscoveryDiverseProjectFeedState;
      replace: boolean;
    }) => {
      if (!replace && loadingMoreRef.current) return;

      const requestSequence = ++requestSequenceRef.current;
      if (replace) {
        loadingMoreRef.current = false;
        setInitialLoading(true);
        setLoadingMore(false);
        setInitialError(false);
        setLoadMoreError(false);
        setDiversityState(nextDiversityState);
      } else {
        loadingMoreRef.current = true;
        setLoadingMore(true);
        setLoadMoreError(false);
      }

      try {
        const result = await fetchDiverseDiscoveryProjectBatch({
          category:
            mode === "all" || mode === "help" ? null : mode,
          helpOnly: mode === "help",
          state: nextDiversityState,
          limit: DISCOVERY_PROJECT_PAGE_SIZE,
        });

        if (requestSequence !== requestSequenceRef.current) return;

        if (result.error) {
          console.error("discover project feed load failed", {
            code: result.error.code,
            message: result.error.message,
            phase: replace ? "initial" : "more",
          });
          if (replace) setInitialError(true);
          else setLoadMoreError(true);
          return;
        }

        if (replace) {
          setItems(dedupeDiscoveryProjects(result.items));
        } else {
          setItems((currentItems) =>
            dedupeDiscoveryProjects([...currentItems, ...result.items])
          );
        }

        setDiversityState(result.state);
        setHasMore(result.hasMore);
      } catch (error) {
        if (requestSequence !== requestSequenceRef.current) return;
        console.error("discover project feed request failed", {
          message: error instanceof Error ? error.message : "Unknown error",
          phase: replace ? "initial" : "more",
        });
        if (replace) setInitialError(true);
        else setLoadMoreError(true);
      } finally {
        if (requestSequence === requestSequenceRef.current) {
          setInitialLoading(false);
          setLoadingMore(false);
          loadingMoreRef.current = false;
        }
      }
    },
    []
  );

  function changeFilter(mode: FilterMode) {
    if (mode === filterMode) return;

    setFilterMode(mode);
    setItems([]);
    const initialDiversityState = createInitialDiscoveryDiversityState();
    setDiversityState(initialDiversityState);
    setHasMore(true);
    void loadProjectPage({
      mode,
      nextDiversityState: initialDiversityState,
      replace: true,
    });
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

    function syncDiscoverTab() {
      const tab = new URLSearchParams(window.location.search).get("tab");
      setMobileTab(tab === "following" ? "following" : "feed");
      setDiscoverTabReady(true);
    }

    function handleDiscoverTabChange(event: Event) {
      const tab = (event as CustomEvent<MobileDiscoverTab>).detail;
      setMobileTab(tab === "following" ? "following" : "feed");
      setDiscoverTabReady(true);
    }

    syncDiscoverTab();
    window.addEventListener("popstate", syncDiscoverTab);
    window.addEventListener("discover-tab-change", handleDiscoverTabChange);

    return () => {
      window.removeEventListener("popstate", syncDiscoverTab);
      window.removeEventListener(
        "discover-tab-change",
        handleDiscoverTabChange
      );
    };
  }, []);

  useEffect(() => {
    if (
      !discoverTabReady ||
      mobileTab !== "following" ||
      followingInitializedRef.current
    ) {
      return;
    }

    followingInitializedRef.current = true;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = buildLoginHref("/discover?tab=following");
        return;
      }

      setFollowCurrentUserId(user.id);
      await Promise.all([
        loadFollowedArchiveProjectList(user.id),
        loadFollowedUserRail(user.id),
      ]);
    })();
  }, [
    discoverTabReady,
    mobileTab,
    loadFollowedArchiveProjectList,
    loadFollowedProjectPage,
    loadFollowedUserRail,
  ]);

  useEffect(() => {
    if (
      mobileTab !== "following" ||
      followingContentTab !== "users" ||
      !followCurrentUserId ||
      followedUserProjectsInitializedRef.current
    ) {
      return;
    }

    followedUserProjectsInitializedRef.current = true;
    void loadFollowedProjectPage({
      ownerUserId: selectedFollowedUserIdRef.current,
      cursor: null,
      replace: true,
    });
  }, [
    followCurrentUserId,
    followingContentTab,
    loadFollowedProjectPage,
    mobileTab,
  ]);

  useEffect(() => {
    function handleFollowSearchRequest() {
      window.location.href = "/discover/search";
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
    if (
      !discoverTabReady ||
      mobileTab === "following" ||
      publicFeedInitializedRef.current
    ) {
      return;
    }

    publicFeedInitializedRef.current = true;
    void loadProjectPage({
      mode: "all",
      nextDiversityState: createInitialDiscoveryDiversityState(),
      replace: true,
    });
  }, [discoverTabReady, loadProjectPage, mobileTab]);

  useEffect(() => {
    if (mobileTab === "following" || !loaderRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !loadingMoreRef.current &&
          hasMore &&
          items.length > 0
        ) {
          void loadProjectPage({
            mode: filterMode,
            nextDiversityState: diversityState,
            replace: false,
          });
        }
      },
      { rootMargin: "240px 0px", threshold: 0.01 }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [
    diversityState,
    filterMode,
    hasMore,
    items.length,
    loadProjectPage,
    mobileTab,
  ]);

  useEffect(() => {
    if (
      mobileTab !== "following" ||
      !followedProjectLoaderRef.current
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !followedLoadingMoreRef.current &&
          followedHasMore &&
          followedCursor &&
          followedProjects.length > 0
        ) {
          void loadFollowedProjectPage({
            ownerUserId: selectedFollowedUserIdRef.current,
            cursor: followedCursor,
            replace: false,
          });
        }
      },
      { rootMargin: "240px 0px", threshold: 0.01 }
    );

    observer.observe(followedProjectLoaderRef.current);
    return () => observer.disconnect();
  }, [
    followedCursor,
    followedHasMore,
    followedProjects.length,
    loadFollowedProjectPage,
    mobileTab,
  ]);

  function changeFollowedUser(userId: string | null) {
    if (userId === selectedFollowedUserIdRef.current) return;

    selectedFollowedUserIdRef.current = userId;
    setSelectedFollowedUserId(userId);
    void loadFollowedProjectPage({
      ownerUserId: userId,
      cursor: null,
      replace: true,
    });

    window.requestAnimationFrame(() => {
      followedProjectListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function handleUnfollowProject(archiveId: string) {
    if (!followCurrentUserId || projectUnfollowSubmitting) return;

    setProjectUnfollowSubmitting(true);
    const { error } = await supabase
      .from("archive_follows")
      .delete()
      .eq("user_id", followCurrentUserId)
      .eq("archive_id", archiveId);

    if (error) {
      console.error("unfollow project failed", {
        code: error.code,
        message: error.message,
      });
      setProjectUnfollowSubmitting(false);
      showToast(t.discover.unfollow_failed);
      return;
    }

    setFollowedArchiveProjects((currentItems) =>
      currentItems.filter((item) => item.archive_id !== archiveId)
    );
    setProjectUnfollowSubmitting(false);
    setProjectConfirmId(null);
    showToast(t.discover.unfollowed_project);
  }

  const showFollowing = mobileTab === "following";

  return (
    <>
      <HomeSectionTabs active="activity" />
      <main
        style={{
          padding: isMobileViewport ? 8 : 14,
          maxWidth: 860,
          margin: "0 auto",
        }}
      >
      <div className="mobile-app-desktop-only">
        {showFollowing ? (
          <header style={followedDesktopHeaderStyle}>{t.discover.following}</header>
        ) : (
          <DiscoverHeader />
        )}
      </div>

      {!discoverTabReady ? null : showFollowing ? (
        <>
          <FollowingContentTabs
            active={followingContentTab}
            onChange={setFollowingContentTab}
          />

          {followingContentTab === "projects" ? (
            <FollowedProjectList
              items={followedArchiveProjects}
              mode="followed-project"
              initialLoading={followedArchiveProjectsLoading}
              loadingMore={false}
              initialError={followedArchiveProjectsError}
              loadMoreError={false}
              hasMore={false}
              emptyMessage={t.discover.empty_followed_projects}
              emptyActionLabel={t.discover.browse_discover}
              unfollowingArchiveId={
                projectUnfollowSubmitting ? projectConfirmId : null
              }
              onEmptyAction={() => changeMobileTab("feed")}
              onRequestUnfollow={setProjectConfirmId}
              onRetryInitial={() => {
                if (followCurrentUserId) {
                  void loadFollowedArchiveProjectList(followCurrentUserId);
                }
              }}
              onRetryMore={() => undefined}
            />
          ) : (
            <>
              {followedUsersLoading && !followedUsersLoaded ? (
                <div style={followedUsersStatusStyle}>
                  {t.discover.loading_followed_users}
                </div>
              ) : null}

              {followedUsersError ? (
                <div style={followedUsersErrorStyle}>
                  <span>{t.discover.followed_users_load_failed}</span>
                  <button
                    type="button"
                    style={followedUsersRetryStyle}
                    onClick={() => {
                      if (followCurrentUserId) {
                        void loadFollowedUserRail(followCurrentUserId);
                      }
                    }}
                  >
                    {t.discover.reload}
                  </button>
                </div>
              ) : null}

              {!followedUsersError && followedUsers.length > 0 ? (
                <FollowedUserRail
                  users={followedUsers}
                  selectedUserId={selectedFollowedUserId}
                  onChange={changeFollowedUser}
                />
              ) : null}

              <FollowedProjectList
                items={followedProjects}
                mode="followed-user-project"
                initialLoading={followedInitialLoading}
                loadingMore={followedLoadingMore}
                initialError={followedInitialError}
                loadMoreError={followedLoadMoreError}
                hasMore={followedHasMore}
                emptyMessage={
                  followedUsersLoaded && followedUsers.length === 0
                    ? t.discover.empty_followed_users
                    : selectedFollowedUserId
                      ? t.discover.empty_selected_user_projects
                      : t.discover.empty_followed_user_projects
                }
                emptyActionLabel={
                  followedUsersLoaded && followedUsers.length === 0
                    ? t.discover.browse_discover
                    : undefined
                }
                listAnchorRef={followedProjectListRef}
                loaderRef={followedProjectLoaderRef}
                onEmptyAction={() => changeMobileTab("feed")}
                onRetryInitial={() => {
                  void loadFollowedProjectPage({
                    ownerUserId: selectedFollowedUserIdRef.current,
                    cursor: null,
                    replace: true,
                  });
                }}
                onRetryMore={() => {
                  if (!followedCursor) return;
                  void loadFollowedProjectPage({
                    ownerUserId: selectedFollowedUserIdRef.current,
                    cursor: followedCursor,
                    replace: false,
                  });
                }}
              />
            </>
          )}
        </>
      ) : (
        <>
          <DiscoverFilterBar
            options={getDiscoverFilterOptions(language)}
            activeMode={filterMode}
            onChange={changeFilter}
            compactMobile={isMobileViewport}
          />

          <DiscoverProjectGrid
            items={items}
            helpOnly={filterMode === "help"}
            initialLoading={initialLoading}
            loadingMore={loadingMore}
            initialError={initialError}
            loadMoreError={loadMoreError}
            hasMore={hasMore}
            loaderRef={loaderRef}
            onRetryInitial={() => {
              void loadProjectPage({
                mode: filterMode,
                nextDiversityState: createInitialDiscoveryDiversityState(),
                replace: true,
              });
            }}
            onRetryMore={() => {
              void loadProjectPage({
                mode: filterMode,
                nextDiversityState: diversityState,
                replace: false,
              });
            }}
          />
        </>
      )}

      <ConfirmDialog
        open={Boolean(projectConfirmId)}
        title={t.discover.unfollow_project_title}
        message={t.discover.unfollow_project_message}
        confirmText={projectUnfollowSubmitting ? t.discover.processing : t.discover.unfollow}
        cancelText={t.discover.back}
        danger
        onClose={() => {
          if (!projectUnfollowSubmitting) setProjectConfirmId(null);
        }}
        onConfirm={() => {
          if (!projectConfirmId) return;
          return handleUnfollowProject(projectConfirmId);
        }}
      />

      </main>
    </>
  );
}

function FollowingContentTabs({
  active,
  onChange,
}: {
  active: FollowingContentTab;
  onChange: (tab: FollowingContentTab) => void;
}) {
  const { t } = useLanguage();
  return (
    <div style={followingContentTabsStyle} role="tablist" aria-label={t.discover.following_content}>
      <button
        type="button"
        role="tab"
        aria-selected={active === "projects"}
        onClick={() => onChange("projects")}
        style={followingContentTabStyle(active === "projects")}
      >
        {t.discover.followed_projects}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "users"}
        onClick={() => onChange("users")}
        style={followingContentTabStyle(active === "users")}
      >
        {t.discover.followed_users}
      </button>
    </div>
  );
}

const followingContentTabsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 18,
  margin: "0 0 12px",
  borderBottom: "1px solid #e3eae0",
};

function followingContentTabStyle(active: boolean): CSSProperties {
  return {
    border: 0,
    borderBottom: active ? "2px solid #668c60" : "2px solid transparent",
    background: "transparent",
    color: active ? "#355d35" : "#748071",
    padding: "8px 2px 7px",
    fontSize: 13,
    fontWeight: active ? 750 : 600,
    cursor: "pointer",
  };
}


const followedUsersStatusStyle: CSSProperties = {
  marginBottom: 12,
  padding: "14px 12px",
  border: "1px solid #e3e9df",
  borderRadius: 12,
  background: "#fff",
  color: "#778275",
  fontSize: 13,
  textAlign: "center",
};

const followedDesktopHeaderStyle: CSSProperties = {
  margin: "0 0 14px",
  color: "#1f2d1f",
  fontSize: 22,
  fontWeight: 700,
};

const followedUsersErrorStyle: CSSProperties = {
  ...followedUsersStatusStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  textAlign: "left",
};

const followedUsersRetryStyle: CSSProperties = {
  flexShrink: 0,
  border: "1px solid #b9cdb3",
  borderRadius: 999,
  background: "#f6faf4",
  color: "#3f693d",
  padding: "6px 11px",
  fontSize: 12,
  fontWeight: 650,
  cursor: "pointer",
};
