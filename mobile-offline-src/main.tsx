import PlantingRegionEditor from "@/components/archive/PlantingRegionEditor";
import PlantingRegionField from "@/components/archive/PlantingRegionField";
import { loadDefaultPlantingRegion, normalizePlantingRegion, type PlantingRegion } from "@/lib/planting-region";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  assertLocalOfflineAvailable,
  createLocalArchive,
  createLocalRecord,
  createLocalArchiveCycle,
  endLocalArchiveCycle,
  deleteLocalArchive,
  deleteLocalRecord,
  getLocalArchiveDetail,
  inferSingleLocalArchiveOwnerContext,
  listVisibleLocalArchiveSummaries,
  listVisibleCloudOfflineArchiveSummaries,
  listPendingCloudSyncSummaries,
  listVisibleLocalTaxonomyItems,
  deferPendingCloudSyncPrompt,
  markUnownedLocalArchivesForOwner,
  preparePendingCloudSyncQueue,
  updateLocalArchiveFields,
  updateLocalRecordFields,
  type LocalArchive,
  type LocalArchiveDetail,
  type LocalArchiveOwnerContext,
  type LocalArchiveSummary,
  type LocalTaxonomyItem,
  type PendingCloudSyncSummary,
  type LocalImage,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";
import {
  clearRememberedLocalOwnerContext,
  wasLocalOwnerExplicitlySignedOut,
  loadRememberedLocalOwnerContext,
  rememberLocalOwnerContext,
  type StoredLocalOwnerContext,
} from "@/lib/local-owner-context";
import { migrateLegacyLocalOrigin } from "@/lib/local-origin-migration";
import {
  markBundledOfflineShell,
  probeCloudReachable,
  replaceWithOfficialSite,
} from "@/lib/cloud-reachability";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";

import AuthCaptcha, { AUTH_CAPTCHA_ENABLED } from "@/components/AuthCaptcha";
import UiIcon from "@/components/ui/UiIcon";
import SegmentedChoice from "@/components/ui/SegmentedChoice";
import ArchiveProjectCard from "@/components/archive-ui/ArchiveProjectCard";
import ArchiveWorkspaceTemplate from "@/components/archive-ui/ArchiveWorkspaceTemplate";
import PersonalSpaceMobileIdentity from "@/components/archive-ui/PersonalSpaceMobileIdentity";
import ConnectivityNotice from "@/components/mobile/ConnectivityNotice";
import ArchiveTaxonomyPanel, { type ArchiveTaxonomyChip } from "@/components/archive-ui/ArchiveTaxonomyPanel";
import { localArchiveToProjectView } from "@/components/archive-ui/localArchiveProjectView";
import {
  getArchiveCategoryDepth,
  getLocalArchiveCategoryDepths,
} from "@/lib/archive-category-settings";
import ArchiveRecordCardShell from "@/components/archive-detail/ArchiveRecordCardShell";
import MobileBottomNavigationView, {
  type MobileBottomNavigationItem,
} from "@/components/mobile/MobileBottomNavigationView";
import { getMobilePrimaryNavigationDescriptors } from "@/components/mobile/mobilePrimaryNavigation";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import HomeSectionTabs, { type HomeSection } from "@/components/home/HomeSectionTabs";
import DiscoverSearchPage from "@/app/discover/search/page";
import PlantPage from "@/app/plant/page";
import { DiscoverProjectCard } from "@/components/discover/DiscoverProjectCard";
import ReadonlyPublicProjectDetail from "@/components/archive-ui/ReadonlyPublicProjectDetail";
import MobileMarketFeedCard, { mobileMarketCardStyle, mobileMarketListStyle } from "@/components/market/MobileMarketFeedCard";
import RecordLocationField from "@/components/record/RecordLocationField";
import { loadDefaultRecordLocation, type RecordLocation } from "@/lib/record-location";
import { readImageCapturedAt } from "@/lib/photo-metadata";
import {
  getOfflineGuideKey,
  getOfflineGuideName,
  getOfflineGuideOverview,
  getOfflineGuideParameters,
  loadOfflineGuideDirectory,
  type OfflineGuideDirectoryEntry,
} from "@/lib/offline-guide-directory";
import type { SystemNameCandidate } from "@/lib/system-name-candidates";
import { getArchiveCycleTerminology } from "@/lib/archive-cycle-terminology";
import { localDateTimeInputToIso, toLocalDateTimeInputValue } from "@/lib/date-time";
import { supabase } from "@/lib/supabase";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import { saveCloudArchiveToLocal } from "@/lib/cloud-to-local-save";
import { refreshCloudOfflineCaches, type CloudOfflineCacheArchiveSource } from "@/lib/cloud-offline-cache";
import {
  clearShellIdentityCache,
  displayAvatarUrl,
  persistLocalIdentityFromLiveProfile,
  readShellIdentityCache,
} from "@/lib/local-identity-cache";
import { syncPendingCloudArchive } from "@/lib/pending-cloud-sync";
import { formatStorage } from "@/lib/user-profile-shared";
import { getTranslations, type Language } from "@/lib/i18n";
import { getOfflineShellCopy, type OfflineCopy } from "@/lib/offline-shell-copy";
import {
  getUserTypeLabel,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import {
  createInitialDiscoveryDiversityState,
  fetchDiverseDiscoveryProjectBatch,
} from "@/lib/discover-diverse-project-feed";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import { fetchDiscoverExperienceCardSearchResults } from "@/lib/discover-search-data";
import { emptySearchFilters } from "@/lib/discover-search-types";
import type { ExperienceCardListItem } from "@/lib/experience-card-types";
import { fetchFollowedArchiveProjects } from "@/lib/followed-archive-projects";
import { fetchFollowedPublicProjects } from "@/lib/followed-public-project-feed";
import {
  fetchMarketFeed,
  type MarketArchiveBrief,
  type MarketPostDisplayRow,
  type MarketProfileBrief,
} from "@/lib/market-feed";
import {
  getMarketItemCategoryOptions,
  getMarketPostTypeOptions,
  type MarketItemCategory,
  type MarketPostType,
} from "@/lib/market-types";

const MAX_PHOTOS = 10;

type ShellSourceFilter = "all" | "cloud" | "local";

type ShellSpaceProfile = {
  username: string | null;
  avatar_url: string | null;
  avatar_data_url?: string | null;
  storage_used: number | null;
  storage_limit: number | null;
};

type CloudArchiveSummary = {
  id: string;
  title?: string | null;
  category?: string | null;
  system_name?: string | null;
  species_name_snapshot?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_record_time?: string | null;
  record_count?: number | null;
  view_count?: number | null;
  cover_image_url?: string | null;
  cover_image_path?: string | null;
  cover_thumb_path?: string | null;
  display_cover_image_url?: string | null;
  display_cover_thumb_url?: string | null;
  is_public?: boolean | null;
};

type Screen =
  | { kind: "list" }
  | { kind: "new-project"; guide?: SystemNameCandidate }
  | { kind: "activity" }
  | { kind: "discover-search" }
  | { kind: "public-detail" }
  | { kind: "experience" }
  | { kind: "following" }
  | { kind: "market" }
  | { kind: "guides" }
  | { kind: "guide-detail"; guideKey: string }
  | { kind: "settings" }
  | { kind: "choose-project" }
  | { kind: "detail"; archiveId: string }
  | { kind: "edit-project"; archiveId: string }
  | { kind: "new-record"; archiveId: string }
  | { kind: "edit-record"; archiveId: string; recordId: string };

function getLanguage(): Language {
  try {
    const value = window.localStorage.getItem("lang");
    if (value === "en" || value === "zh") return value;
  } catch {
    // Default to Chinese when browser storage is unavailable.
  }
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "zh";
}

function formatDate(value: string | null | undefined, language: Language) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "en" ? "en" : "zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toDateTimeLocal(value?: string | null) {
  return toLocalDateTimeInputValue(value || new Date());
}

function getOngoingDays(createdAt?: string | null, endedAt?: string | null) {
  if (!createdAt) return null;
  const startedAt = new Date(createdAt);
  if (Number.isNaN(startedAt.getTime())) return null;
  const startDate = new Date(
    startedAt.getFullYear(),
    startedAt.getMonth(),
    startedAt.getDate(),
  ).getTime();
  const ended = endedAt ? new Date(endedAt) : new Date();
  const endDate = new Date(
    ended.getFullYear(),
    ended.getMonth(),
    ended.getDate(),
  ).getTime();
  return Math.max(1, Math.floor((endDate - startDate) / 86_400_000) + 1);
}

function BlobImage({ image, className, alt }: {
  image?: LocalImage | null;
  className?: string;
  alt: string;
}) {
  const [url] = useState(() =>
    image?.blob ? URL.createObjectURL(image.blob) : "",
  );

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return url ? <img src={url} alt={alt} className={className} /> : null;
}

function App() {
  const [language, setLanguage] = useState<Language>(getLanguage);
  const copy = getOfflineShellCopy(language);
  const [screen, setScreenState] = useState<Screen>({ kind: "list" });
  const [categoryFilter, setCategoryFilter] = useState<ArchiveCategory | "all">("all");
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [activeGroupTag, setActiveGroupTag] = useState<string | null>(null);
  const [localTaxonomyItems, setLocalTaxonomyItems] = useState<LocalTaxonomyItem[]>([]);
  const [guideQuery, setGuideQuery] = useState("");
  const [directory] = useState(loadOfflineGuideDirectory);
  function setScreen(next: Screen, replace = false) {
    window.history[replace ? "replaceState" : "pushState"]({ offlineScreen: next }, "", `#${next.kind}`);
    setScreenState(next);
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    window.history.replaceState({ offlineScreen: { kind: "list" } }, "", "#list");
    const back = (event: PopStateEvent) => setScreenState(event.state?.offlineScreen || { kind: "list" });
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const [owner, setOwner] = useState<StoredLocalOwnerContext | null>(() =>
    loadRememberedLocalOwnerContext(),
  );
  const initialIdentityCache = readShellIdentityCache(owner?.userId);
  const [spaceProfile, setSpaceProfile] = useState<ShellSpaceProfile | null>(
    initialIdentityCache?.profile || null,
  );
  const [membership, setMembership] = useState<MyMembership | null>(
    initialIdentityCache?.membership || null,
  );
  const [experienceCardCount, setExperienceCardCount] = useState(
    initialIdentityCache?.experienceCardCount || 0,
  );
  const [archives, setArchives] = useState<LocalArchiveSummary[]>([]);
  const [cloudCaches, setCloudCaches] = useState<LocalArchiveSummary[]>([]);
  const [sourceFilter, setSourceFilter] = useState<ShellSourceFilter>("all");
  const [unownedCount, setUnownedCount] = useState(0);
  const [detail, setDetail] = useState<LocalArchiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrationWarning, setMigrationWarning] = useState(false);
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(false);
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [cloudArchives, setCloudArchives] = useState<CloudArchiveSummary[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [cloudBusyArchiveId, setCloudBusyArchiveId] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState<PendingCloudSyncSummary[]>([]);
  const [syncingArchiveId, setSyncingArchiveId] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<DiscoveryProjectFeedItem[]>([]);
  const [publicDetailItem, setPublicDetailItem] = useState<DiscoveryProjectFeedItem | null>(null);
  const [publicDetailBack, setPublicDetailBack] = useState<"activity" | "discover-search">("activity");
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const [experienceItems, setExperienceItems] = useState<ExperienceCardListItem[]>([]);
  const [experienceLoading, setExperienceLoading] = useState(false);
  const [experienceError, setExperienceError] = useState(false);
  const [followedItems, setFollowedItems] = useState<DiscoveryProjectFeedItem[]>([]);
  const [followedLoading, setFollowedLoading] = useState(false);
  const [followedError, setFollowedError] = useState(false);
  const [marketItems, setMarketItems] = useState<MarketPostDisplayRow[]>([]);
  const [marketProfiles, setMarketProfiles] = useState<Map<string, MarketProfileBrief>>(new Map());
  const [marketArchives, setMarketArchives] = useState<Map<string, MarketArchiveBrief>>(new Map());
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState(false);
  const [marketTypeFilter, setMarketTypeFilter] = useState<"all" | MarketPostType>("all");
  const [marketCategoryFilter, setMarketCategoryFilter] = useState<"all" | MarketItemCategory>("all");
  const [marketLocationFilter, setMarketLocationFilter] = useState("");
  const [marketContentFilter, setMarketContentFilter] = useState("");
  const [marketFiltersOpen, setMarketFiltersOpen] = useState(false);
  const visibleMarketItems = useMemo(() => marketItems.filter((item) => {
    if (marketTypeFilter !== "all" && item.post_type !== marketTypeFilter) return false;
    if (marketCategoryFilter !== "all" && item.item_category !== marketCategoryFilter) return false;
    const profile = marketProfiles.get(item.user_id);
    const archive = item.archive_id ? marketArchives.get(item.archive_id) : null;
    const location = [item.location_text, profile?.country_name, profile?.region_name, profile?.city_name].filter(Boolean).join(" ").toLowerCase();
    const content = [item.title, item.description, profile?.username, archive?.title, archive?.system_name, archive?.species_name_snapshot].filter(Boolean).join(" ").toLowerCase();
    return location.includes(marketLocationFilter.trim().toLowerCase()) && content.includes(marketContentFilter.trim().toLowerCase());
  }), [marketItems, marketProfiles, marketArchives, marketTypeFilter, marketCategoryFilter, marketLocationFilter, marketContentFilter]);

  const ownerContext: LocalArchiveOwnerContext | null = useMemo(
    () => owner
      ? { userId: owner.userId, email: owner.email || null }
      : null,
    [owner],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadShellIdentity = useCallback(async (userId: string) => {
    const cached = readShellIdentityCache(userId);
    if (cached) {
      setSpaceProfile(cached.profile);
      setMembership(cached.membership);
      setExperienceCardCount(cached.experienceCardCount);
    }

    if (!navigator.onLine) return;

    try {
      const [profileResult, membershipResult, experienceResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, avatar_url, storage_used, storage_limit")
          .eq("id", userId)
          .maybeSingle(),
        supabase.rpc("get_my_membership"),
        supabase
          .from("experience_cards")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);

      const nextProfile = profileResult.error
        ? cached?.profile || null
        : (profileResult.data as ShellSpaceProfile | null);
      const nextMembership = membershipResult.error
        ? cached?.membership || null
        : normalizeMembershipRpcResult(membershipResult.data);
      const nextExperienceCardCount = experienceResult.error
        ? cached?.experienceCardCount || 0
        : Math.max(0, Number(experienceResult.count || 0));

      setSpaceProfile(nextProfile);
      setMembership(nextMembership);
      setExperienceCardCount(nextExperienceCardCount);
      const persistedProfile = await persistLocalIdentityFromLiveProfile(userId, {
        profile: nextProfile,
        membership: nextMembership,
        experienceCardCount: nextExperienceCardCount,
      });
      setSpaceProfile(persistedProfile || nextProfile);
    } catch (error) {
      console.warn("local shell identity", error);
    }
  }, []);

  const loadList = useCallback(async (context?: LocalArchiveOwnerContext | null) => {
    const resolvedContext = context === undefined ? ownerContext : context;
    const [result, cachedCloud, pending, taxonomy] = await Promise.all([
      listVisibleLocalArchiveSummaries(resolvedContext),
      listVisibleCloudOfflineArchiveSummaries(resolvedContext),
      listPendingCloudSyncSummaries(resolvedContext),
      listVisibleLocalTaxonomyItems(resolvedContext),
    ]);
    setArchives(result.archives);
    setCloudCaches(cachedCloud);
    setUnownedCount(result.unownedCount);
    setPendingSync(pending);
    setLocalTaxonomyItems(taxonomy);
  }, [ownerContext]);

  const loadCloudList = useCallback(async (userId?: string | null) => {
    const resolvedUserId = userId || cloudUserId;
    if (!navigator.onLine || !resolvedUserId) {
      setCloudArchives([]);
      setCloudError("");
      return;
    }

    setCloudLoading(true);
    try {
      const { data, error } = await supabase
        .from("archives")
        .select("*")
        .eq("user_id", resolvedUserId)
        .is("trashed_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const cloudRows = (data || []) as CloudArchiveSummary[];
      let displayRows = cloudRows;
      try {
        const covers = await resolveMediaDisplayPairs(supabase, cloudRows.map((archive) => ({
          url: archive.cover_image_url,
          path: archive.cover_image_path,
          thumb_path: archive.cover_thumb_path,
        })));
        displayRows = cloudRows.map((archive, index) => ({
          ...archive,
          display_cover_image_url: covers[index]?.display_url || null,
          display_cover_thumb_url: covers[index]?.display_thumb_url || null,
        }));
      } catch (mediaError) {
        console.warn("cloud cover resolution", mediaError);
      }
      setCloudArchives(displayRows);
      setCloudError("");
      void refreshCloudOfflineCaches(
        (data || []) as CloudOfflineCacheArchiveSource[],
        { userId: resolvedUserId },
      ).then(() => loadList({ userId: resolvedUserId }))
        .catch((cacheError) => console.warn("cloud cache refresh", cacheError));
    } catch (error) {
      console.warn("local shell cloud list", error);
      setCloudError(copy.cloudLoadFailed);
    } finally {
      setCloudLoading(false);
    }
  }, [cloudUserId, copy.cloudLoadFailed, loadList]);

  const loadDetail = useCallback(async (
    archiveId: string,
    context?: LocalArchiveOwnerContext | null,
  ) => {
    const next = await getLocalArchiveDetail(
      archiveId,
      context === undefined ? ownerContext : context,
    );
    setDetail(next);
    return next;
  }, [ownerContext]);

  const loadActivity = useCallback(async () => {
    if (!navigator.onLine) {
      setActivityItems([]);
      setActivityError(false);
      return;
    }
    setActivityLoading(true);
    setActivityError(false);
    try {
      const result = await fetchDiverseDiscoveryProjectBatch({
        state: createInitialDiscoveryDiversityState(),
        category: null,
        helpOnly: false,
        limit: 24,
      });
      if (result.error) throw result.error;
      setActivityItems(result.items);
    } catch (error) {
      console.warn("local shell discovery feed", error);
      setActivityError(true);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const loadExperience = useCallback(async () => {
    if (!navigator.onLine) {
      setExperienceItems([]);
      setExperienceError(false);
      return;
    }
    setExperienceLoading(true);
    setExperienceError(false);
    try {
      const items = await fetchDiscoverExperienceCardSearchResults(
        emptySearchFilters,
      );
      setExperienceItems(items);
    } catch (error) {
      console.warn("local shell experience feed", error);
      setExperienceError(true);
    } finally {
      setExperienceLoading(false);
    }
  }, []);

  const loadFollowing = useCallback(async (userId?: string | null) => {
    const resolvedUserId = userId || cloudUserId;
    if (!navigator.onLine || !resolvedUserId) {
      setFollowedItems([]);
      setFollowedError(false);
      return;
    }
    setFollowedLoading(true);
    setFollowedError(false);
    try {
      const [archiveResult, usersResult] = await Promise.all([
        fetchFollowedArchiveProjects(resolvedUserId),
        fetchFollowedPublicProjects({ limit: 49 }),
      ]);
      if (archiveResult.error && usersResult.error) throw archiveResult.error;
      if (archiveResult.error || usersResult.error) {
        console.warn("local shell partial followed projects", archiveResult.error || usersResult.error);
      }
      const uniqueProjects = new Map(
        [...archiveResult.items, ...usersResult.items].map((item) => [item.archive_id, item]),
      );
      setFollowedItems(Array.from(uniqueProjects.values()));
    } catch (error) {
      console.warn("local shell followed projects", error);
      setFollowedError(true);
    } finally {
      setFollowedLoading(false);
    }
  }, [cloudUserId]);

  const loadMarket = useCallback(async () => {
    if (!navigator.onLine) {
      setMarketItems([]);
      setMarketProfiles(new Map());
      setMarketArchives(new Map());
      setMarketError(false);
      return;
    }
    setMarketLoading(true);
    setMarketError(false);
    const result = await fetchMarketFeed();
    if (result.error) {
      console.warn("local shell market feed", result.error);
      setMarketError(true);
    }
    setMarketItems(result.items);
    setMarketProfiles(result.profiles);
    setMarketArchives(result.archives);
    setMarketLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function attemptReturnToOfficialSite() {
      const reachable = await probeCloudReachable();
      if (cancelled || !reachable) return;
      replaceWithOfficialSite();
    }

    void attemptReturnToOfficialSite();
    const timer = window.setInterval(() => {
      void attemptReturnToOfficialSite();
    }, 20_000);

    function handleOnline() {
      void attemptReturnToOfficialSite();
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void attemptReturnToOfficialSite();
      }
    }

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let activeSessionUserId: string | null = null;

    function applySession(user?: { id?: string; email?: string | null } | null) {
      if (cancelled) return;
      if (!user?.id) {
        setCloudUserId(null);
        return;
      }

      const nextOwner = { userId: user.id, email: user.email || null };
      activeSessionUserId = user.id;
      rememberLocalOwnerContext(nextOwner);
      setOwner(nextOwner);
      setCloudUserId(user.id);
      void loadShellIdentity(user.id);
    }

    void supabase.auth.getSession()
      .then(({ data }) => applySession(data.session?.user))
      .catch(() => undefined);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearRememberedLocalOwnerContext();
        clearShellIdentityCache(activeSessionUserId);
        activeSessionUserId = null;
        setOwner(null);
        setCloudUserId(null);
        setCloudArchives([]);
        setSpaceProfile(null);
        setMembership(null);
        setExperienceCardCount(0);
        void Promise.all([
          listVisibleLocalArchiveSummaries(null),
          listVisibleCloudOfflineArchiveSummaries(null),
          listPendingCloudSyncSummaries(null),
        ]).then(([result, cachedCloud, pending]) => {
          if (cancelled) return;
          setArchives(result.archives);
          setCloudCaches(cachedCloud);
          setUnownedCount(result.unownedCount);
          setPendingSync(pending);
        }).catch(() => undefined);
        return;
      }

      applySession(session?.user);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadShellIdentity]);

  useEffect(() => {
    if (!online || !cloudUserId || !ownerContext) return;

    void loadCloudList(cloudUserId);
    void preparePendingCloudSyncQueue(ownerContext)
      .then(() => loadList(ownerContext))
      .catch(() => undefined);
  }, [online, cloudUserId, ownerContext, loadCloudList, loadList]);

  useEffect(() => {
    if (screen.kind !== "activity" || !online) return;
    void loadActivity();
  }, [screen.kind, online, loadActivity]);

  useEffect(() => {
    if (screen.kind !== "experience" || !online) return;
    void loadExperience();
  }, [screen.kind, online, loadExperience]);

  useEffect(() => {
    if (screen.kind !== "following" || !online || !cloudUserId) return;
    void loadFollowing(cloudUserId);
  }, [screen.kind, online, cloudUserId, loadFollowing]);

  useEffect(() => {
    if (screen.kind !== "market" || !online) return;
    void loadMarket();
  }, [screen.kind, online, loadMarket]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        assertLocalOfflineAvailable();
        const migration = await migrateLegacyLocalOrigin();
        if (cancelled) return;
        let nextOwner = loadRememberedLocalOwnerContext();
        if (!nextOwner && !wasLocalOwnerExplicitlySignedOut()) {
          const inferredOwner = await inferSingleLocalArchiveOwnerContext();
          if (inferredOwner?.userId) {
            nextOwner = { userId: inferredOwner.userId, email: inferredOwner.email };
            rememberLocalOwnerContext(nextOwner);
          }
        }
        setOwner(nextOwner);
        if (nextOwner?.userId) {
          const cachedIdentity = readShellIdentityCache(nextOwner.userId);
          setSpaceProfile(cachedIdentity?.profile || null);
          setMembership(cachedIdentity?.membership || null);
          setExperienceCardCount(cachedIdentity?.experienceCardCount || 0);
        }
        await preparePendingCloudSyncQueue(
          nextOwner ? { userId: nextOwner.userId, email: nextOwner.email } : null,
        ).catch((error) => console.warn("pending sync queue preparation", error));
        await loadList(
          nextOwner ? { userId: nextOwner.userId, email: nextOwner.email } : null,
        );
        if (
          migration.status === "migrated" &&
          migration.archiveCount + migration.recordCount + migration.imageCount > 0
        ) {
          showToast(copy.migrated);
        }
      } catch (error) {
        console.warn("offline initialization", error);
        if (cancelled) return;
        setMigrationWarning(true);
        try {
          await loadList();
        } catch {
          showToast(copy.readFailed);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
    // Initialization must run once for this offline document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen.kind !== "detail" && screen.kind !== "edit-project" &&
        screen.kind !== "new-record" && screen.kind !== "edit-record") return;
    let canceled = false;
    setDetail(null);
    void getLocalArchiveDetail(screen.archiveId, ownerContext).then((next) => {
      if (canceled) return;
      setDetail(next);
      if (
        next?.archive.local_role === "cloud-offline-cache" &&
        (screen.kind === "new-record" ||
          screen.kind === "edit-record" ||
          screen.kind === "edit-project")
      ) {
        setScreen({ kind: "detail", archiveId: next.archive.id }, true);
      }
    }).catch(() => showToast(copy.readFailed));
    return () => { canceled = true; };
  }, [screen, ownerContext, showToast, copy.readFailed]);

  function goList() {
    setScreen({ kind: "list" });
    setDetail(null);
    void loadList();
  }

  async function reconnect() {
    const reachable = await probeCloudReachable();
    if (!reachable) {
      showToast(copy.offlineTitle);
      return;
    }
    replaceWithOfficialSite();
  }

  function openDetail(archiveId: string) {
    setScreen({ kind: "detail", archiveId }, ["edit-project", "new-project", "new-record", "edit-record"].includes(screen.kind));
  }

  async function saveCloudCopy(cloudArchiveId: string) {
    if (!ownerContext || !cloudUserId || ownerContext.userId !== cloudUserId) {
      showToast(copy.cloudSignIn);
      return;
    }

    setCloudBusyArchiveId(cloudArchiveId);
    try {
      const result = await saveCloudArchiveToLocal({
        cloudArchiveId,
        ownerContext,
        mode: "copy",
      });
      await loadList(ownerContext);
      showToast(copy.cloudCopySaved);
      openDetail(result.localArchiveId);
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.cloudLoadFailed);
    } finally {
      setCloudBusyArchiveId(null);
    }
  }

  async function uploadPending(localArchiveId: string) {
    if (!ownerContext || !cloudUserId || ownerContext.userId !== cloudUserId) {
      showToast(copy.cloudSignIn);
      return;
    }

    setSyncingArchiveId(localArchiveId);
    try {
      const result = await syncPendingCloudArchive({
        localArchiveId,
        ownerContext,
      });
      await loadList(ownerContext);
      showToast(
        result.success ? copy.uploadSuccess : result.error || copy.uploadFailed,
      );
    } finally {
      setSyncingArchiveId(null);
    }
  }

  async function deferPending(localArchiveId: string) {
    if (!ownerContext) return;
    await deferPendingCloudSyncPrompt(localArchiveId, ownerContext);
    await loadList(ownerContext);
  }

  async function claimUnowned() {
    if (!ownerContext) return;
    await markUnownedLocalArchivesForOwner({
      userId: ownerContext.userId!,
      email: ownerContext.email || null,
    });
    await loadList();
    showToast(copy.updateSuccess);
  }

  async function handleDeleteArchive(archiveId: string) {
    if (!window.confirm(copy.deleteProjectConfirm)) return;
    await deleteLocalArchive(archiveId);
    showToast(copy.deleted);
    goList();
  }

  async function handleDeleteRecord(recordId: string, archiveId: string) {
    if (!window.confirm(copy.deleteRecordConfirm)) return;
    await deleteLocalRecord(recordId);
    await loadDetail(archiveId);
    await loadList();
    showToast(copy.deleted);
  }

  function toggleLanguage() {
    const next = language === "zh" ? "en" : "zh";
    setLanguage(next);
    try { window.localStorage.setItem("lang", next); } catch { /* no-op */ }
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  }

  const activeGuide = screen.kind === "guide-detail"
    ? directory.find((guide) => getOfflineGuideKey(guide) === screen.guideKey)
    : undefined;
  const activeLocalCategory = categoryFilter === "all" ? null : categoryFilter;
  const localCategoryDepths = getLocalArchiveCategoryDepths(ownerContext?.userId);
  const activeLocalDepth = getArchiveCategoryDepth(localCategoryDepths, activeLocalCategory);
  const localSubTags = useMemo<ArchiveTaxonomyChip[]>(() => {
    if (sourceFilter !== "local" || !activeLocalCategory || activeLocalDepth < 2) return [];
    return localTaxonomyItems
      .filter(
        (item) =>
          item.kind === "subcategory" &&
          item.category === activeLocalCategory &&
          item.label,
      )
      .map((item) => ({ id: item.label, label: item.label }))
      .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
      .sort((a, b) => a.label.localeCompare(b.label, language === "en" ? "en" : "zh-CN"));
  }, [activeLocalCategory, activeLocalDepth, language, localTaxonomyItems, sourceFilter]);
  const localGroupTags = useMemo<ArchiveTaxonomyChip[]>(() => {
    if (sourceFilter !== "local" || !activeLocalCategory || !activeSubTag || activeLocalDepth < 3) return [];
    return localTaxonomyItems
      .filter(
        (item) =>
          item.kind === "group" &&
          item.category === activeLocalCategory &&
          item.subcategory === activeSubTag &&
          item.label,
      )
      .map((item) => ({ id: item.label, label: item.label }))
      .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
      .sort((a, b) => a.label.localeCompare(b.label, language === "en" ? "en" : "zh-CN"));
  }, [activeLocalCategory, activeLocalDepth, activeSubTag, language, localTaxonomyItems, sourceFilter]);
  const filteredLocalArchives = archives.filter((archive) => {
    if (categoryFilter !== "all" && archive.category !== categoryFilter) return false;
    if (sourceFilter === "local") {
      if (activeSubTag && archive.subcategory !== activeSubTag) return false;
      if (activeGroupTag && archive.group_name !== activeGroupTag) return false;
    }
    return true;
  });
  const filteredCloudCaches = cloudCaches.filter(
    (archive) => categoryFilter === "all" || archive.category === categoryFilter,
  );
  const filteredCloudArchives = cloudArchives.filter(
    (archive) => categoryFilter === "all" || archive.category === categoryFilter,
  );
  const useCloudCacheSource = true;
  const hideCloudCreate = useCloudCacheSource && sourceFilter === "cloud";
  const viewingCloudCache =
    (screen.kind === "detail" ||
      screen.kind === "new-record" ||
      screen.kind === "edit-record" ||
      screen.kind === "edit-project") &&
    detail?.archive.local_role === "cloud-offline-cache";
  const cloudSourceCount = useCloudCacheSource
    ? cloudCaches.length
    : online && cloudUserId && !cloudError
      ? cloudArchives.length
      : cloudCaches.length;
  function cloudProjectView(archive: CloudArchiveSummary) {
    const ended = archive.status === "ended";
    return {
      id: archive.id,
      mode: "cloud" as const,
      title: archive.title || copy.project,
      category: archive.category as ArchiveCategory,
      categoryLabel: getArchiveCategoryLabel(archive.category as ArchiveCategory, language),
      categoryIcon: getArchiveCategoryIcon(archive.category as ArchiveCategory),
      systemName:
        archive.category === "plant"
          ? archive.species_name_snapshot || ""
          : archive.system_name || "",
      cover: archive.display_cover_thumb_url || archive.display_cover_image_url || archive.cover_image_url
        ? {
            kind: "url" as const,
            url: archive.display_cover_thumb_url || archive.display_cover_image_url || archive.cover_image_url || "",
            alt: archive.title || copy.project,
          }
        : null,
      latestText: "",
      latestTime: archive.last_record_time || archive.created_at || null,
      recordCount: Number(archive.record_count || 0),
      durationDays: getOngoingDays(archive.created_at),
      viewCount: Number(archive.view_count || 0),
      visibilityLabel: archive.is_public
        ? copy.publicLabel
        : copy.private,
      visibilityTone: archive.is_public ? "public" as const : "private" as const,
      statusLabel: ended ? copy.ended : null,
      ended,
      showClassificationRow: false,
    };
  }
  function activityProjectView(item: DiscoveryProjectFeedItem) {
    const category = (item.category || "other") as ArchiveCategory;
    const title = item.archive_title || copy.project;
    return {
      id: item.archive_id,
      mode: "cloud" as const,
      title,
      category,
      categoryLabel: getArchiveCategoryLabel(category, language),
      categoryIcon: getArchiveCategoryIcon(category),
      systemName:
        category === "plant"
          ? item.species_name_snapshot || ""
          : item.system_name || "",
      cover: item.display_image_url
        ? {
            kind: "url" as const,
            url: item.display_image_url,
            alt: title,
          }
        : null,
      latestText: item.card_summary || item.latest_public_record_note || "",
      latestTime: item.public_activity_at || item.latest_public_record_time || null,
      recordCount: item.public_record_count,
      durationDays: getOngoingDays(
        item.archive_created_at,
        item.archive_ended_at,
      ),
      viewCount: item.view_count,
      followerCount: item.follower_count,
      commentCount: item.public_comment_count,
      visibilityLabel: copy.publicLabel,
      visibilityTone: "public" as const,
      statusLabel: item.archive_ended_at ? copy.ended : null,
      ended: Boolean(item.archive_ended_at),
      showClassificationRow: false,
    };
  }

  function renderCloudProjectCard(archive: CloudArchiveSummary) {
    const localCopy = archives.find(
      (item) => item.source_cloud_archive_id === archive.id,
    );
    const busy = cloudBusyArchiveId === archive.id;
    return (
      <ArchiveProjectCard
        key={archive.id}
        project={cloudProjectView(archive)}
        mobileMode
        mobileShowCategoryBadge={false}
        onClick={localCopy ? () => openDetail(localCopy.id) : undefined}
        actionSlot={(
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              void saveCloudCopy(archive.id);
            }}
          >
            {busy
              ? copy.savingCloudCopy
              : localCopy
                ? copy.refreshLocalCopy
                : copy.saveLocalCopy}
          </button>
        )}
      />
    );
  }
  const baseNavigationItems = getMobilePrimaryNavigationDescriptors({
    home: copy.home,
    following: copy.follow,
    market: copy.market,
    me: copy.me,
  });
  const bottomNavigationItems: [
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
  ] = baseNavigationItems.map((item) => {
    if (item.id === "home") {
      return {
        ...item,
        active:
          screen.kind === "activity" ||
          screen.kind === "discover-search" ||
          screen.kind === "public-detail" ||
          screen.kind === "experience" ||
          screen.kind === "guides" ||
          screen.kind === "guide-detail",
        onSelect: () => setScreen({ kind: "activity" }),
      };
    }
    if (item.id === "following") {
      return {
        ...item,
        active: screen.kind === "following",
        onSelect: () => setScreen({ kind: "following" }),
      };
    }
    if (item.id === "market") {
      return {
        ...item,
        active: screen.kind === "market",
        onSelect: () => setScreen({ kind: "market" }),
      };
    }
    return {
      ...item,
      active: !["activity", "experience", "following", "market", "guides", "guide-detail"].includes(screen.kind),
      onSelect: goList,
    };
  }) as [
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
  ];

  const homeSectionOwnsTopNav = ["list", "activity", "discover-search", "experience", "guides"].includes(screen.kind);
  const storageUsedBytes = Math.max(0, Number(spaceProfile?.storage_used || 0));
  const storageLimitBytes = Math.max(
    0,
    Number(membership?.storage_limit_bytes || spaceProfile?.storage_limit || 0),
  );
  const storageUsagePercent = storageLimitBytes > 0
    ? Math.min(100, (storageUsedBytes / storageLimitBytes) * 100)
    : 0;
  const storageTotalLabel = storageLimitBytes > 0
    ? formatStorage(storageLimitBytes)
    : "?";
  const membershipLabel = getUserTypeLabel(
    { signedIn: Boolean(owner), membership },
    language,
  );
  const shellHeaderTitle =
    screen.kind === "following"
      ? copy.follow
      : screen.kind === "market"
        ? copy.market
        : copy.mySpace;

  if (loading) {
    return <main className="offline-shell loading">{copy.loading}</main>;
  }

  return (
    <main className="offline-shell">
      {!homeSectionOwnsTopNav ? (
        <MobilePageHeaderView
          className="android-shell-header"
          title={shellHeaderTitle}
          titleText={shellHeaderTitle}
          showBack={false}
          ariaLabel={shellHeaderTitle}
          right={(
            <div className="header-actions">
              {!owner ? (
                <button className="icon-button" type="button" onClick={toggleLanguage}>
                  {language === "zh" ? "EN" : copy.languageChinese}
                </button>
              ) : null}
              <button
                className="icon-button"
                type="button"
                aria-label={copy.settings}
                onClick={() => setScreen({ kind: "settings" })}
              >
                <UiIcon name="menu" size={22} />
              </button>
            </div>
          )}
        />
      ) : null}

      {screen.kind === "list" ? (
        <PersonalSpaceMobileIdentity
          avatarUrl={displayAvatarUrl(spaceProfile)}
          username={
            spaceProfile?.username ||
            getTranslations(language).nav.username_unset
          }
          membershipLabel={membershipLabel}
          storageUsagePercent={storageUsagePercent}
          storageTotalLabel={storageTotalLabel}
          experienceLabel={copy.experience}
          experienceCardCount={experienceCardCount}
          language={language}
        />
      ) : null}

      {online && pendingSync.find((item) => item.should_prompt) ? (() => {
        const pending = pendingSync.find((item) => item.should_prompt)!;
        return (
          <section className="notice warning">
            <strong>{copy.pendingUpload}</strong>
            <p>{pending.title}</p>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                disabled={syncingArchiveId === pending.local_archive_id}
                onClick={() => void uploadPending(pending.local_archive_id)}
              >
                {syncingArchiveId === pending.local_archive_id ? copy.uploading : copy.uploadNow}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void deferPending(pending.local_archive_id)}
              >
                {copy.later}
              </button>
            </div>
          </section>
        );
      })() : null}

      {migrationWarning ? (
        <section className="notice warning"><p>{copy.migrationWarning}</p></section>
      ) : null}

      {screen.kind === "list" ? (
        <ArchiveWorkspaceTemplate<ShellSourceFilter>
          sourceOptions={[
            { value: "all", label: copy.all, count: archives.length + cloudSourceCount },
            { value: "cloud", label: copy.cloud, count: cloudSourceCount },
            { value: "local", label: copy.local, count: archives.length },
          ]}
          activeSource={sourceFilter}
          onSelectSource={(source) => {
            setSourceFilter(source);
            setActiveSubTag(null);
            setActiveGroupTag(null);
            setScreen({ kind: "list" });
          }}
          onCreateArchive={() => {
            if (hideCloudCreate) return;
            setScreen({ kind: "new-project" });
          }}
          showCreateToolbar={false}
          sourceTrailingSlot={
            hideCloudCreate ? null : (
            <button type="button" onClick={() => setScreen({ kind: "new-project" })}>
              +{copy.project}
            </button>
          )
          }
          filtersSlot={(
            <ArchiveTaxonomyPanel
              activeCategory={activeLocalCategory}
              activeSubcategoryId={sourceFilter === "local" ? activeSubTag : null}
              activeGroupId={sourceFilter === "local" ? activeGroupTag : null}
              subcategories={sourceFilter === "local" ? localSubTags : []}
              groups={sourceFilter === "local" ? localGroupTags : []}
              mobileMode
              showSubcategoryRow={sourceFilter === "local" && activeLocalDepth >= 2}
              showGroupRow={sourceFilter === "local" && activeLocalDepth >= 3}
              onReset={() => {
                setCategoryFilter("all");
                setActiveSubTag(null);
                setActiveGroupTag(null);
              }}
              onSelectCategory={(category) => {
                setCategoryFilter(category);
                setActiveSubTag(null);
                setActiveGroupTag(null);
              }}
              onResetSubcategory={() => {
                setActiveSubTag(null);
                setActiveGroupTag(null);
              }}
              onSelectSubcategory={(chip) => {
                setActiveSubTag(chip.id);
                setActiveGroupTag(null);
              }}
              onResetGroup={() => setActiveGroupTag(null)}
              onSelectGroup={(chip) => {
                setActiveGroupTag(activeGroupTag === chip.id ? null : chip.id);
              }}
            />
          )}
          noticeSlot={ownerContext && unownedCount > 0 ? (
            <section className="notice warning">
              <strong>{copy.unownedTitle}</strong>
              <p>{copy.unownedBody}</p>
              <div className="action-row">
                <button className="secondary-button" type="button" onClick={() => void claimUnowned()}>
                  {copy.claim}
                </button>
              </div>
            </section>
          ) : null}
        >
          {sourceFilter !== "local" ? (
            !useCloudCacheSource && online && cloudUserId && !cloudError ? (
              <>
                {cloudLoading ? <section className="panel empty">{copy.cloudLoading}</section> : null}
                {cloudError ? <section className="notice warning"><p>{cloudError}</p></section> : null}
                {!cloudLoading && !cloudError && filteredCloudArchives.length ? (
                  <div className="project-list">
                    {filteredCloudArchives.map(renderCloudProjectCard)}
                  </div>
                ) : null}
                {!cloudLoading && !cloudError && sourceFilter === "cloud" && filteredCloudArchives.length === 0 ? (
                  <section className="panel empty"><strong>{copy.cloudProjects}</strong>{copy.noProjects}</section>
                ) : null}
              </>
            ) : (
              <>
                {online && !cloudUserId ? (
                  <CloudLogin copy={copy} onSuccess={() => void loadCloudList()} />
                ) : null}
                {cloudError ? <section className="notice warning"><p>{cloudError}</p></section> : null}
                {filteredCloudCaches.length ? (
                  <div className="project-list">
                    {filteredCloudCaches.map((archive) => (
                      <ArchiveProjectCard
                        key={archive.id}
                        project={{
                          ...localArchiveToProjectView(archive, ownerContext, language),
                          href: undefined,
                        }}
                        onClick={() => openDetail(archive.id)}
                        mobileMode
                      />
                    ))}
                  </div>
                ) : sourceFilter === "cloud" && (useCloudCacheSource || !online || Boolean(cloudError)) ? (
                  <section className="panel empty">{copy.noCachedProjects}</section>
                ) : null}
              </>
            )
          ) : null}

          {sourceFilter !== "cloud" ? (
            filteredLocalArchives.length ? (
              <div className="project-list">
                {filteredLocalArchives.map((archive) => (
                  <ArchiveProjectCard
                    key={archive.id}
                    project={{
                      ...localArchiveToProjectView(archive, ownerContext, language),
                      href: undefined,
                    }}
                    onClick={() => openDetail(archive.id)}
                    mobileMode
                  />
                ))}
              </div>
            ) : sourceFilter === "local" ? (
              <section className="panel empty">
                <strong>{copy.noProjects}</strong>
                {copy.noProjectsHint}
              </section>
            ) : null
          ) : null}

          {sourceFilter === "all" &&
          filteredLocalArchives.length === 0 &&
          (!useCloudCacheSource && online && cloudUserId && !cloudError
            ? !cloudLoading && filteredCloudArchives.length === 0
            : filteredCloudCaches.length === 0) ? (
            <section className="panel empty">
              <strong>{copy.noProjects}</strong>
              {copy.noProjectsHint}
            </section>
          ) : null}
        </ArchiveWorkspaceTemplate>
      ) : null}

      {screen.kind === "new-project" ? (
        <ProjectForm
          language={language}
          copy={copy}
          owner={owner}
          guide={screen.guide}
          onCancel={goList}
          onSaved={async (archive) => {
            await loadList();
            showToast(copy.createSuccess);
            openDetail(archive.id);
          }}
        />
      ) : null}

      {screen.kind === "detail" && detail ? (
        <>
          <ProjectDetail
            detail={detail}
            ownerContext={ownerContext}
            onChanged={async () => { await loadDetail(detail.archive.id); await loadList(); }}
            language={language}
            copy={copy}
            onBack={goList}
            onEdit={() => setScreen({ kind: "edit-project", archiveId: detail.archive.id })}
            onAddRecord={() => setScreen({ kind: "new-record", archiveId: detail.archive.id })}
            onEditRecord={(recordId) => setScreen({ kind: "edit-record", archiveId: detail.archive.id, recordId })}
            onDelete={() => void handleDeleteArchive(detail.archive.id)}
            onDeleteRecord={(recordId) => void handleDeleteRecord(recordId, detail.archive.id)}
          />
          {online && pendingSync.some((item) => item.local_archive_id === detail.archive.id) ? (
            <section className="notice warning">
              <strong>{copy.pendingUpload}</strong>
              <div className="action-row">
                <button
                  type="button"
                  className="primary-button"
                  disabled={syncingArchiveId === detail.archive.id}
                  onClick={() => void uploadPending(detail.archive.id)}
                >
                  {syncingArchiveId === detail.archive.id ? copy.uploading : copy.uploadNow}
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {screen.kind === "edit-project" && detail && detail.archive.local_role !== "cloud-offline-cache" ? (
        <ProjectForm
          language={language}
          copy={copy}
          owner={owner}
          archive={detail.archive}
          onCancel={() => openDetail(detail.archive.id)}
          onSaved={async () => {
            await loadDetail(detail.archive.id);
            await loadList();
            showToast(copy.updateSuccess);
            openDetail(detail.archive.id);
          }}
        />
      ) : null}

      {screen.kind === "new-record" && detail && detail.archive.local_role !== "cloud-offline-cache" ? (
        <RecordForm
          copy={copy}
          archive={detail.archive}
          language={language}
          onCancel={() => openDetail(detail.archive.id)}
          onSaved={async () => {
            await loadDetail(detail.archive.id);
            await loadList();
            showToast(copy.recordSuccess);
            openDetail(detail.archive.id);
          }}
        />
      ) : null}

      {screen.kind === "edit-record" && detail && detail.archive.local_role !== "cloud-offline-cache" ? (
        <RecordForm
          copy={copy}
          archive={detail.archive}
          language={language}
          record={detail.records.find((item) => item.id === screen.recordId)}
          onCancel={() => openDetail(detail.archive.id)}
          onSaved={async () => {
            await loadDetail(detail.archive.id);
            await loadList();
            showToast(copy.updateSuccess);
            openDetail(detail.archive.id);
          }}
        />
      ) : null}

      {screen.kind === "activity" ? <>
        <HomeSectionTabs
          active="activity"
          showGuestLanguageSwitcher={false}
          onSearch={() => setScreen({ kind: "discover-search" })}
          onSelect={(section: HomeSection) => {
            if (section === "activity") return;
            if (section === "guide") {
              setScreen({ kind: "guides" });
              return;
            }
            setScreen({ kind: "experience" });
          }}
        />
        <ConnectivityNotice message={copy.offlineNotice} />
      </> : null}

      {screen.kind === "public-detail" && publicDetailItem ? <ReadonlyPublicProjectDetail item={publicDetailItem} language={language} onBack={() => setScreen({ kind: publicDetailBack })} /> : null}

      {screen.kind === "discover-search" ? <DiscoverSearchPage onBack={() => setScreen({ kind: "activity" })} onOpenProject={(item) => { setPublicDetailItem(item); setPublicDetailBack("discover-search"); setScreen({ kind: "public-detail" }); }} /> : null}

      {screen.kind === "experience" ? <>
        <HomeSectionTabs
          active="experience"
          showGuestLanguageSwitcher={false}
          onSearch={() => undefined}
          onSelect={(section: HomeSection) => {
            if (section === "experience") return;
            if (section === "guide") {
              setScreen({ kind: "guides" });
              return;
            }
            setScreen({ kind: "activity" });
          }}
        />
        <ConnectivityNotice message={copy.offlineNotice} />
      </> : null}

      {screen.kind === "following" ? (
        <>
          <div className="section-title">
            <h1>{copy.follow}</h1>
          </div>
          <ConnectivityNotice message={copy.offlineNotice} />
        </>
      ) : null}

      {screen.kind === "market" ? (
        <>
          <div className="category-row" role="group" aria-label={copy.marketType}>
            {[{ value: "all", label: copy.marketAll }, ...getMarketPostTypeOptions(language)].map((option) => (
              <button type="button" key={option.value} aria-pressed={marketTypeFilter === option.value} onClick={() => setMarketTypeFilter(option.value as "all" | MarketPostType)}>{option.label}</button>
            ))}
          </div>
          <button type="button" className="secondary-button" aria-expanded={marketFiltersOpen} onClick={() => setMarketFiltersOpen((open) => !open)}>
            {copy.marketFilters}
          </button>
          {marketFiltersOpen ? <div className="field">
            <label>{copy.marketCategory}
              <select value={marketCategoryFilter} onChange={(event) => setMarketCategoryFilter(event.target.value as "all" | MarketItemCategory)}>
                <option value="all">{copy.allCategories}</option>
                {getMarketItemCategoryOptions(language).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>{copy.marketArea}<input value={marketLocationFilter} onChange={(event) => setMarketLocationFilter(event.target.value)} /></label>
            <label>{copy.marketContent}<input value={marketContentFilter} onChange={(event) => setMarketContentFilter(event.target.value)} /></label>
          </div> : null}
          <ConnectivityNotice message={copy.offlineNotice} />
        </>
      ) : null}

      {screen.kind === "guides" ? (online ? <PlantPage /> : <>
        <HomeSectionTabs
          active="guide"
          showGuestLanguageSwitcher={false}
          onSearch={() => undefined}
          onSelect={(section: HomeSection) => {
            if (section === "guide") return;
            if (section === "activity") {
              setScreen({ kind: "activity" });
              return;
            }
            setScreen({ kind: "experience" });
          }}
        />
        <div className="field"><input type="search" value={guideQuery} onChange={(e) => setGuideQuery(e.target.value)} placeholder={copy.guideSearch} aria-label={copy.guideSearch} /></div>
        <div className="category-row">{(["all", "plant", "system", "insect_fish", "other"] as const).map((category) => <button type="button" key={category} aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)}>{copy[category]}</button>)}</div>
        <div className="guide-grid">{directory.filter((row) => (categoryFilter === "all" || row.category === categoryFilter) && `${row.label} ${row.nameEn || ""} ${(row.aliases || []).join(" ")} ${row.searchText || ""}`.toLowerCase().includes(guideQuery.toLowerCase())).map((guide) => <button type="button" className="guide-item" key={getOfflineGuideKey(guide)} onClick={() => setScreen({ kind: "guide-detail", guideKey: getOfflineGuideKey(guide) })}><strong>{getOfflineGuideName(guide, language)}</strong><small>{guide.category ? copy[guide.category] : ""}</small>{owner && guide.description ? <p>{guide.description}</p> : null}</button>)}</div>
      </>) : null}
      {screen.kind === "guide-detail" ? <OfflineGuideDetail guide={activeGuide} owner={owner} language={language} copy={copy} onBack={() => window.history.back()} onReconnect={reconnect} onCreate={(guide) => setScreen({ kind: "new-project", guide })} /> : null}
      {screen.kind === "choose-project" ? <section className="panel"><h1>{copy.chooseProject}</h1><div className="project-list">{archives.filter((archive) => archive.status === "active").map((archive) => <button type="button" className="secondary-button" key={archive.id} onClick={() => setScreen({ kind: "new-record", archiveId: archive.id })}>{archive.title}</button>)}</div><div className="action-row"><button type="button" className="primary-button" onClick={() => setScreen({ kind: "new-project" })}>{copy.newProject}</button></div></section> : null}
      {screen.kind === "settings" ? <section className="panel"><h1>{copy.settings}</h1><div className="property-row"><span>{copy.language}</span><SegmentedChoice label={copy.language} value={language} options={[{ value: "zh", label: copy.languageChinese }, { value: "en", label: copy.languageEnglish }]} onChange={toggleLanguage} /></div><p className="project-meta">{copy.offlineBody}</p><div className="action-row"><button type="button" className="secondary-button" onClick={reconnect}>{copy.reconnect}</button>{cloudUserId ? <button type="button" className="danger-button" onClick={() => void supabase.auth.signOut({ scope: "local" })}>{copy.logout}</button> : null}</div></section> : null}
      <MobileBottomNavigationView
        ariaLabel={copy.mainNavigation}
        items={bottomNavigationItems}
        centerAction={
          viewingCloudCache ? null : (
          <button
            type="button"
            className="quick-add"
            aria-label={copy.addRecord}
            onClick={() => setScreen(
              screen.kind === "detail" && detail && detail.archive.local_role !== "cloud-offline-cache"
                ? { kind: "new-record", archiveId: detail.archive.id }
                : { kind: "choose-project" },
            )}
          >
            <UiIcon name="plus" size={25} strokeWidth={2.2} />
          </button>
        )
        }
      />
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}

function CloudLogin({
  copy,
  onSuccess,
}: {
  copy: OfflineCopy;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) return;
    if (AUTH_CAPTCHA_ENABLED && !captchaToken) {
      setMessage(copy.captchaRequired);
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
        options: { captchaToken: captchaToken || undefined },
      });
      if (error) {
        setMessage(`${copy.loginFailed}: ${error.message}`);
        return;
      }
      onSuccess();
    } catch (error) {
      setMessage(
        `${copy.loginFailed}: ${error instanceof Error ? error.message : ""}`,
      );
    } finally {
      setCaptchaResetKey((value) => value + 1);
      setSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <h1>{copy.cloudSignIn}</h1>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label>{copy.email}</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>{copy.password}</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <AuthCaptcha
          action="auth"
          onTokenChange={setCaptchaToken}
          resetKey={captchaResetKey}
        />
        {message ? <p className="project-meta">{message}</p> : null}
        <div className="submit-row">
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? copy.loading : copy.login}
          </button>
        </div>
      </form>
    </section>
  );
}

function OfflineGuideDetail({
  guide,
  owner,
  language,
  copy,
  onBack,
  onReconnect,
  onCreate,
}: {
  guide?: OfflineGuideDirectoryEntry;
  owner: StoredLocalOwnerContext | null;
  language: Language;
  copy: OfflineCopy;
  onBack: () => void;
  onReconnect: () => void;
  onCreate: (guide: OfflineGuideDirectoryEntry) => void;
}) {
  if (!guide) {
    return (
      <>
        <div className="back-row"><button className="back-button" type="button" onClick={onBack} aria-label={copy.back}><UiIcon name="arrow-left" size={22} /></button></div>
        <section className="panel empty"><strong>{copy.guideUnavailable}</strong></section>
      </>
    );
  }

  const name = getOfflineGuideName(guide, language);
  const parameters = owner ? getOfflineGuideParameters(guide, language) : [];

  return (
    <>
      <div className="detail-heading">
        <button className="back-button" type="button" onClick={onBack} aria-label={copy.back}><UiIcon name="arrow-left" size={22} /></button>
        <h1>{name}</h1>
        <span />
      </div>
      <section className="panel guide-hero">
        <span className="guide-category">{guide.category ? copy[guide.category] : copy.other}</span>
        <h1>{name}</h1>
        <button type="button" className="primary-button" onClick={() => onCreate(guide)}>{copy.createFromGuide}</button>
      </section>
      {!owner ? (
        <section className="notice guide-access-notice">
          <strong>{copy.guideSignInRequired}</strong>
          <div className="action-row"><button type="button" className="secondary-button" onClick={onReconnect}>{copy.reconnect}</button></div>
        </section>
      ) : (
        <>
          <section className="panel guide-overview">
            <h2>{copy.guideOverview}</h2>
            <p>{getOfflineGuideOverview(guide, language)}</p>
          </section>
          {parameters.length ? (
            <section className="panel">
              <h2>{copy.basicReferences}</h2>
              <div className="guide-parameter-grid">
                {parameters.map((parameter) => (
                  <article className="guide-parameter" key={`${parameter.label}:${parameter.value}`}>
                    <small>{parameter.label}</small>
                    <strong>{parameter.value}</strong>
                    {parameter.note ? <p>{parameter.note}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <section className="notice guide-access-notice"><p>{copy.guideOfflineNotice}</p></section>
        </>
      )}
    </>
  );
}

function ProjectForm({
  language,
  copy,
  owner,
  archive,
  guide,
  onCancel,
  onSaved,
}: {
  language: Language;
  copy: OfflineCopy;
  owner: StoredLocalOwnerContext | null;
  archive?: LocalArchive;
  guide?: SystemNameCandidate;
  onCancel: () => void;
  onSaved: (archive: LocalArchive) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(archive?.title || guide?.label || "");
  const [category, setCategory] = useState<ArchiveCategory>(archive?.category || guide?.category || "plant");
  const [systemName, setSystemName] = useState(archive?.system_name || archive?.species_name || guide?.label || "");
  const [directory] = useState(loadOfflineGuideDirectory);
  const [selectedGuide, setSelectedGuide] = useState<SystemNameCandidate | undefined>(guide);
  const [source, setSource] = useState(archive?.source || "");
  const [plantingRegion, setPlantingRegion] = useState<PlantingRegion | null>(archive ? archive.planting_region || null : loadDefaultPlantingRegion(owner?.userId));
  const [note, setNote] = useState(archive?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !systemName.trim()) {
      setError(copy.requiredProject);
      return;
    }
    const normalizedRegion = normalizePlantingRegion(plantingRegion);
    const hasRegionDraft = plantingRegion && Object.values(plantingRegion).some((value) => value.trim());
    if (category === "plant" && (!archive || archive.planting_region || hasRegionDraft) && !normalizedRegion) {
      setError(copy.plantingCountryCity);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (archive) {
        const updated = await updateLocalArchiveFields(
          archive.id,
          {
            title,
            category,
            system_name: systemName,
            species_name: category === "plant" ? systemName : null,
            plant_id: selectedGuide?.plantId || (systemName === (archive.system_name || archive.species_name) ? archive.plant_id : null),
            plant_slug: selectedGuide?.plantSlug || (systemName === (archive.system_name || archive.species_name) ? archive.plant_slug : null),
            source,
            planting_region: normalizedRegion,
            note,
          },
          owner ? { userId: owner.userId, email: owner.email } : null,
        );
        await onSaved(updated);
      } else {
        const created = await createLocalArchive({
          title,
          category,
          system_name: systemName,
          species_name: category === "plant" ? systemName : null,
          plant_id: selectedGuide?.plantId || null,
          plant_slug: selectedGuide?.plantSlug || null,
          source,
          planting_region: normalizedRegion,
          note,
          local_owner_user_id: owner?.userId || null,
          local_owner_email: owner?.email || null,
          local_owner_marked_at: owner ? new Date().toISOString() : null,
        });
        await onSaved(created);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : copy.readFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="back-row"><button className="back-button" type="button" onClick={onCancel} aria-label={copy.back}><UiIcon name="arrow-left" size={22} /></button></div>
      <section className="panel">
        <div className="section-title"><h1>{archive ? copy.edit : copy.newProject}</h1></div>
        <form className="form" onSubmit={submit}>
          <div className="field"><label>{copy.title}</label><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></div>
          <div className="field">
            <label>{copy.category}</label>
            <select value={category} onChange={(event) => setCategory(event.target.value as ArchiveCategory)}>
              <option value="plant">{copy.plant}</option>
              <option value="system">{copy.system}</option>
              <option value="insect_fish">{copy.insect_fish}</option>
              <option value="other">{copy.other}</option>
            </select>
          </div>
          <div className="field"><label>{copy.systemName}</label><input value={systemName} onChange={(event) => { setSystemName(event.target.value); setSelectedGuide(undefined); }} maxLength={160} placeholder={copy.guideSearch} /><small>{copy.guideHint}</small>
            <div className="guide-suggestions">{directory.filter((candidate) => candidate.category === category && candidate.label.toLowerCase().includes(systemName.toLowerCase())).slice(0, 10).map((candidate) => <button type="button" key={`${candidate.category}:${candidate.label}`} onClick={() => { setSystemName(candidate.label); setSelectedGuide(candidate); if (!title) setTitle(candidate.label); }}>{candidate.label}</button>)}</div>
          </div>
          {category === "plant" ? <PlantingRegionField value={plantingRegion} onChange={setPlantingRegion} language={language} required={!archive} /> : null}
          <div className="field"><label>{copy.source}</label><input value={source} onChange={(event) => setSource(event.target.value)} maxLength={240} /></div>
          <div className="field"><label>{copy.note}</label><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} /></div>
          {error ? <section className="notice warning"><p>{error}</p></section> : null}
          <div className="submit-row">
            <button className="secondary-button" type="button" onClick={onCancel}>{copy.cancel}</button>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? copy.saving : copy.save}</button>
          </div>
        </form>
      </section>
    </>
  );
}

function ProjectDetail({ detail, language, copy, ownerContext, onChanged, onBack, onEdit, onAddRecord, onEditRecord, onDelete, onDeleteRecord }: {
  detail: LocalArchiveDetail; language: Language; copy: OfflineCopy; ownerContext: LocalArchiveOwnerContext | null;
  onChanged: () => Promise<void>; onBack: () => void; onEdit: () => void; onAddRecord: () => void;
  onEditRecord: (recordId: string) => void; onDelete: () => void; onDeleteRecord: (recordId: string) => void;
}) {
  const [tab, setTab] = useState("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [periodDate, setPeriodDate] = useState(toDateTimeLocal().slice(0, 10));
  const [filter, setFilter] = useState("all");
  const [lightbox, setLightbox] = useState<LocalImage | null>(null);
  const archive = detail.archive;
  const isCloudCache = archive.local_role === "cloud-offline-cache";
  const archiveCopy = getTranslations(language).archive;
  const periods = getArchiveCycleTerminology(archive.category, language);
  async function change(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await work(); await onChanged(); } catch (e) { setError(e instanceof Error ? e.message : copy.readFailed); } finally { setBusy(false); }
  }
  return <>
    <MobilePageHeaderView
      title={archive.title}
      onBack={onBack}
      ariaLabel={copy.back}
    />
    {isCloudCache ? (
      <p className="project-meta">
        {archiveCopy.cloud_offline_cache} / {archiveCopy.cloud_offline_cache_readonly} / {archiveCopy.cloud_offline_cache_media_hint}
      </p>
    ) : null}
    <div className="top-tabs">
      <button type="button" aria-pressed={tab === "details"} onClick={() => setTab("details")}>{copy.details}</button>
      <button type="button" aria-pressed={tab === "properties"} onClick={() => setTab("properties")}>{copy.properties}</button>
    </div>
    {error ? <section className="notice warning" role="alert"><p>{error}</p></section> : null}
    {isCloudCache ? <section className="notice"><p>{archiveCopy.cloud_offline_cache_hint}</p></section> : null}
    {tab === "properties" ? <>
      {archive.category === "plant" && !isCloudCache ? <PlantingRegionEditor key={archive.id} language={language} value={archive.planting_region} canEdit={!busy} onSave={async (region) => {
        await updateLocalArchiveFields(archive.id, { planting_region: region }, ownerContext);
        await onChanged();
      }} /> : null}
      <section className="panel property-list">
        <div className="property-row"><span>{copy.title}</span><strong>{archive.title}</strong></div>
        <div className="property-row"><span>{copy.systemName}</span><strong>{archive.system_name || archive.species_name || "?"}</strong></div>
        <div className="property-row"><span>{copy.category}</span><span>{copy[archive.category]}</span></div>
        <div className="property-row"><span>{copy.source}</span><span>{archive.source || "?"}</span></div>
        <div className="property-row"><span>{copy.note}</span><span>{archive.note || "?"}</span></div>
        <div className="property-row"><span>{copy.status}</span>{isCloudCache ? <span>{archive.status === "ended" ? copy.ended : copy.ongoing}</span> : <SegmentedChoice label={copy.status} value={archive.status} disabled={busy} options={[{ value: "active", label: copy.ongoing }, { value: "ended", label: copy.ended }]} onChange={(status) => void change(() => updateLocalArchiveFields(archive.id, { status, ended_at: status === "ended" ? new Date().toISOString() : null }, ownerContext))} />}</div>
        <div className="property-row"><span>{copy.visibility}</span><span>{isCloudCache ? archiveCopy.cloud_offline_cache_readonly : copy.private}</span></div>
        {!isCloudCache ? <button type="button" className="secondary-button" onClick={onEdit}>{copy.edit}</button> : null}
      </section>
      {!isCloudCache ? <section className="panel"><h2>{copy.period}</h2><label className="property-row"><span>{copy.enablePeriod}</span><input type="checkbox" role="switch" checked={Boolean(archive.cycle_enabled)} disabled={busy} onChange={(e) => void change(() => updateLocalArchiveFields(archive.id, { cycle_enabled: e.target.checked }, ownerContext))} /></label>
        {archive.cycle_enabled ? <div className="form">
          {(archive.cycles || []).map((cycle) => <div className="property-row" key={cycle.id}><div><strong>{cycle.display_name || periods.cycleLabel(cycle.cycle_no)}</strong><small className="project-meta">{formatDate(cycle.started_at, language)}</small></div>{cycle.status === "active" ? <button type="button" className="secondary-button" disabled={busy} onClick={() => { if (window.confirm(periods.endDialogMessage)) void change(() => endLocalArchiveCycle(archive.id, cycle.id, new Date().toISOString(), ownerContext)); }}>{periods.endAction}</button> : <span>{copy.ended}</span>}</div>)}
          <label className="field">{copy.periodDate}<input type="date" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} /></label>
          <button type="button" className="primary-button" disabled={busy || !periodDate || archive.status === "ended"} onClick={() => void change(() => createLocalArchiveCycle(archive.id, new Date(`${periodDate}T00:00:00`).toISOString(), ownerContext))}>{periods.newAction}</button>
        </div> : null}
      </section> : null}
      {!isCloudCache ? <button className="danger-button" type="button" disabled={busy} onClick={onDelete}>{copy.remove}</button> : null}
    </> : <>
      <div className="record-toolbar"><span className="project-meta">{copy[archive.category]} / {isCloudCache ? `${archiveCopy.cloud_offline_cache} / ${archiveCopy.cloud_offline_cache_readonly}` : copy.local}</span>{archive.status === "active" && !isCloudCache ? <button type="button" className="primary-button" onClick={onAddRecord}>{copy.addRecord}</button> : null}</div>
      {archive.cycle_enabled ? <label className="field period-filter"><select aria-label={periods.assignLabel} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">{copy.all}</option><option value="none">{periods.unassignedOption}</option>{(archive.cycles || []).map((cycle) => <option value={cycle.id} key={cycle.id}>{cycle.display_name || periods.cycleLabel(cycle.cycle_no)}</option>)}</select></label> : null}
      <div className="record-list">{detail.records.filter((record) => !archive.cycle_enabled || filter === "all" || (filter === "none" ? !record.cycle_id : record.cycle_id === filter)).map((record) => <ArchiveRecordCardShell key={record.id} metaText={formatDate(record.record_time, language)} mobileMode>
        {record.images.length ? <div className={`photo-grid ${record.images.length === 1 ? "single-photo" : ""}`}>{record.images.map((image) => isCloudCache ? <span className="photo-view" key={image.id}><BlobImage image={image} alt="" /></span> : <button type="button" className="photo-view" key={image.id} aria-label={copy.viewPhoto} onClick={() => setLightbox(image)}><BlobImage image={image} alt="" /></button>)}</div> : null}
        {record.note ? <p className="record-note">{record.note}</p> : null}
        {record.location ? <p className="project-meta">{record.location.label || `${record.location.latitude?.toFixed(4)}, ${record.location.longitude?.toFixed(4)}`}</p> : null}
        {record.sync?.status === "pending-cloud-sync" ? <div className="record-actions"><span className="project-meta">{copy.pendingUpload}</span><button className="link-button" type="button" onClick={() => onEditRecord(record.id)}>{copy.edit}</button><button className="link-button danger" type="button" onClick={() => onDeleteRecord(record.id)}>{copy.remove}</button></div> : !isCloudCache ? <div className="record-actions"><button className="link-button" type="button" onClick={() => onEditRecord(record.id)}>{copy.edit}</button><button className="link-button danger" type="button" onClick={() => onDeleteRecord(record.id)}>{copy.remove}</button></div> : null}
      </ArchiveRecordCardShell>)}</div>
      {!detail.records.length ? <section className="panel empty">{copy.noRecords}</section> : null}
    </>}
    {lightbox ? <dialog className="photo-lightbox" open aria-label={copy.photo} onCancel={() => setLightbox(null)}><button type="button" className="icon-button" autoFocus onClick={() => setLightbox(null)}>{copy.back}</button><BlobImage image={lightbox} alt="" /></dialog> : null}
  </>;
}

function FilePreview({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="" />;
}

function RecordForm({ copy, archive, language, record, onCancel, onSaved }: {
  copy: OfflineCopy; archive: LocalArchive; language: Language; record?: LocalRecordWithImages;
  onCancel: () => void; onSaved: () => void | Promise<void>;
}) {
  const [note, setNote] = useState(record?.note || "");
  const [recordTime, setRecordTime] = useState(toDateTimeLocal(record?.record_time));
  const [location, setLocation] = useState<RecordLocation | null>(() => record ? record.location || null : loadDefaultRecordLocation());
  const [cycleId, setCycleId] = useState(record?.cycle_id || (archive.cycle_enabled ? archive.cycles?.find((cycle) => cycle.status === "active")?.id : null) || "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const periods = getArchiveCycleTerminology(archive.category, language);
  function addFiles(incoming: FileList | null) {
    const images = Array.from(incoming || []).filter((file) => file.type.startsWith("image/"));
    if (files.length + images.length > MAX_PHOTOS) { setError(copy.photoLimit); return; }
    setError(""); setFiles((previous) => [...previous, ...images]);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim() && !files.length && !record?.images.length) { setError(copy.requiredRecord); return; }
    if (busy) return;
    setBusy(true); setError("");
    try {
      const isoTime = localDateTimeInputToIso(recordTime, record?.record_time);
      if (!isoTime) throw new Error(copy.validDatetime);
      const imageCapturedAt = await Promise.all(files.map(readImageCapturedAt));
      if (record) await updateLocalRecordFields(record.id, { note, record_time: isoTime, location, cycle_id: cycleId || null, image_files: files, image_captured_at: imageCapturedAt });
      else await createLocalRecord({ archive_id: archive.id, note, record_time: isoTime, location, cycle_id: cycleId || null, image_files: files, image_captured_at: imageCapturedAt });
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : copy.readFailed); } finally { setBusy(false); }
  }
  return <>
    <div className="detail-heading"><button type="button" className="back-button" onClick={onCancel} aria-label={copy.back}><UiIcon name="arrow-left" size={22} /></button><h1>{record ? copy.edit : copy.addRecord}</h1><span /></div>
    <section className="panel"><form className="form" onSubmit={submit}>
      <div className="project-meta">{archive.title} · {copy.local}</div>
      <label className="field">{copy.recordTime}<input type="datetime-local" value={recordTime} onChange={(e) => setRecordTime(e.target.value)} required disabled={busy} /></label>
      {archive.cycle_enabled ? <label className="field">{periods.assignLabel}<select value={cycleId} disabled={busy} onChange={(e) => setCycleId(e.target.value)}><option value="">{periods.unassignedOption}</option>{(archive.cycles || []).filter((cycle) => record || cycle.status === "active").map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.display_name || periods.cycleLabel(cycle.cycle_no)}</option>)}</select></label> : null}
      <label className="field">{copy.recordNote}<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={8000} disabled={busy} /></label>
      <div className="field"><label>{copy.selectPhotos}</label><small>{(record?.images.length || 0) + files.length} {copy.photos}</small>
        {record?.images.length ? <div className="photo-grid">{record.images.map((image) => <BlobImage key={image.id} image={image} alt="" />)}</div> : null}
        {files.length ? <div className="photo-grid">{files.map((file, index) => <div className="photo-preview" key={`${file.name}-${file.lastModified}-${index}`}><FilePreview file={file} /><button type="button" disabled={busy} aria-label={copy.removePhoto} onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}>×</button></div>)}</div> : null}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={album} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <div className="submit-row"><button className="secondary-button" type="button" disabled={busy} onClick={() => camera.current?.click()}>{copy.camera}</button><button className="secondary-button" type="button" disabled={busy} onClick={() => album.current?.click()}>{copy.album}</button></div>
      </div>
      <RecordLocationField value={location} onChange={setLocation} files={files} language={language} disabled={busy} />
      {error ? <section className="notice warning" role="alert"><p>{error}</p></section> : null}
      <div className="submit-row"><button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>{copy.cancel}</button><button className="primary-button" type="submit" disabled={busy}>{busy ? copy.saving : copy.save}</button></div>
    </form></section>
  </>;
}

markBundledOfflineShell();
createRoot(document.getElementById("root")!).render(<App />);