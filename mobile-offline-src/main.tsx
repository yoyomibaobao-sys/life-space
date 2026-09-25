import PlantingRegionEditor from "@/components/archive/PlantingRegionEditor";
import PlantingRegionField from "@/components/archive/PlantingRegionField";
import { loadDefaultPlantingRegion, normalizePlantingRegion, type PlantingRegion } from "@/lib/planting-region";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type CSSProperties,
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
  createLocalTaxonomyItem,
  deleteLocalTaxonomyItem,
  renameLocalTaxonomyItem,
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
import { logLifespaceStorageDiagnostic } from "@/lib/local-storage-diagnostic";
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
import ArchiveDetailHeaderView, {
  type ArchiveProfileFieldSave,
} from "@/components/archive-ui/ArchiveDetailHeaderView";
import ArchiveDetailTabBar, { type ArchiveDetailTabKey } from "@/components/archive-ui/ArchiveDetailTabBar";
import ArchiveCycleTimeline from "@/components/archive-detail/ArchiveCycleTimeline";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import OfflineGuideDirectoryView from "@/components/plant/OfflineGuideDirectoryView";
import { publicGuideCopy } from "@/lib/public-guide-library";
import type { ArchiveCycle, RecordItem } from "@/lib/archive-detail-types";
import PersonalSpaceMobileIdentity from "@/components/archive-ui/PersonalSpaceMobileIdentity";
import ConnectivityNotice from "@/components/mobile/ConnectivityNotice";
import MobileContentTopBar from "@/components/mobile/MobileContentTopBar";
import { DiscoverFilterBar } from "@/components/discover/DiscoverFilterBar";
import ArchiveTaxonomyPanel, { type ArchiveTaxonomyChip } from "@/components/archive-ui/ArchiveTaxonomyPanel";
import { localArchiveToProjectView } from "@/components/archive-ui/localArchiveProjectView";
import {
  getArchiveCategoryDepth,
  getLocalArchiveCategoryDepths,
  LOCAL_ARCHIVE_CATEGORY_DEPTHS_CHANGED_EVENT,
} from "@/lib/archive-category-settings";
import ArchiveRecordCardShell from "@/components/archive-detail/ArchiveRecordCardShell";
import MobileBottomNavigationView, {
  type MobileBottomNavigationItem,
} from "@/components/mobile/MobileBottomNavigationView";
import { getMobilePrimaryNavigationDescriptors } from "@/components/mobile/mobilePrimaryNavigation";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import HomeSectionTabs, { type HomeSection } from "@/components/home/HomeSectionTabs";
import DiscoverSearchPage from "@/app/discover/search/page";
import ProfileSettingsView from "@/components/profile/ProfileSettingsView";
import ProfileSettingsErrorBoundary from "@/components/profile/ProfileSettingsErrorBoundary";
import LocalProjectCategorySettingsView from "@/components/profile/LocalProjectCategorySettingsView";
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
  recoverStoredOwnerFromIdentityCache,
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
import { getDiscoverFilterOptions, type FilterMode } from "@/lib/discover-types";
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
  | { kind: "project-categories" }
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

const offlineNetworkPageStyle: CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: "8px 10px 28px",
};

const offlineMarketHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  margin: "8px 0",
};

const offlineMarketFilterToggleStyle: CSSProperties = {
  minHeight: 34,
  border: "1px solid #d7e2d2",
  borderRadius: 999,
  background: "#fff",
  color: "#40583a",
  padding: "6px 11px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const offlineMarketFilterPanelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 14,
  padding: 8,
  display: "grid",
  gap: 8,
  marginBottom: 10,
};

function OfflineNetworkBody({ message }: { message: string }) {
  return (
    <div style={offlineNetworkPageStyle}>
      <ConnectivityNotice message={message} />
    </div>
  );
}

const projectDetailStatsStyle: CSSProperties = {
  minHeight: 34,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  minWidth: 0,
  margin: "0 0 8px",
  padding: "5px 8px",
  borderBottom: "1px solid #edf1e9",
};

const projectDetailGuideTextStyle: CSSProperties = {
  minWidth: 0,
  maxWidth: "38%",
  flex: "0 1 auto",
  overflow: "hidden",
  color: "#52694f",
  fontSize: 14,
  fontWeight: 750,
  lineHeight: 1.35,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const localStorageHintStyle: CSSProperties = {
  margin: "0 0 10px",
  padding: "0 8px",
  color: "#617258",
  fontSize: 13,
  lineHeight: 1.45,
};

const localExperienceEmptyStyle: CSSProperties = {
  border: "1px solid #ebefea",
  borderRadius: 18,
  background: "#fff",
  padding: 18,
  color: "#7d897a",
  fontSize: 14,
};

const localExperienceEmptyHintStyle: CSSProperties = {
  marginTop: 8,
  lineHeight: 1.5,
};

const detailDebug = {
  mount: 0,
  load: 0,
  setDetail: 0,
  depthEvent: 0,
};

function logDetailDebug(event: string, extra?: Record<string, unknown>) {
  console.info("[lifespace-detail]", event, extra || {});
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
  const [localDepthsTick, setLocalDepthsTick] = useState(0);
  const [directory] = useState(loadOfflineGuideDirectory);
  function setScreen(next: Screen, replace = false) {
    window.history[replace ? "replaceState" : "pushState"]({ offlineScreen: next }, "", `#${next.kind}`);
    setScreenState(next);
    if (!replace) window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    window.history.replaceState({ offlineScreen: { kind: "list" } }, "", "#list");
    const back = (event: PopStateEvent) => setScreenState(event.state?.offlineScreen || { kind: "list" });
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    const refresh = () => {
      detailDebug.depthEvent += 1;
      logDetailDebug("category-depth-event", { count: detailDebug.depthEvent });
      setLocalDepthsTick((current) => current + 1);
    };
    window.addEventListener(LOCAL_ARCHIVE_CATEGORY_DEPTHS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_ARCHIVE_CATEGORY_DEPTHS_CHANGED_EVENT, refresh);
  }, []);
  useEffect(() => {
    const syncLanguage = () => setLanguage(getLanguage());
    window.addEventListener("lifespace-language-change", syncLanguage);
    return () => window.removeEventListener("lifespace-language-change", syncLanguage);
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
  const [discoverFilterMode, setDiscoverFilterMode] = useState<FilterMode>("all");
  const [followChromeTab, setFollowChromeTab] = useState<"projects" | "experience" | "users">("projects");
  const explicitSignOutRef = useRef(false);
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
    const requested = context === undefined ? ownerContext : context;
    const remembered = !requested?.userId && !wasLocalOwnerExplicitlySignedOut()
      ? loadRememberedLocalOwnerContext()
      : null;
    const resolvedContext = requested?.userId
      ? requested
      : remembered?.userId
        ? { userId: remembered.userId, email: remembered.email || null }
        : requested;
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
    void logLifespaceStorageDiagnostic(resolvedContext).catch((error) =>
      console.warn("storage diagnostic", error),
    );
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
    detailDebug.load += 1;
    logDetailDebug("loadDetail", { archiveId, count: detailDebug.load });
    const next = await getLocalArchiveDetail(
      archiveId,
      context === undefined ? ownerContext : context,
    );
    detailDebug.setDetail += 1;
    logDetailDebug("setDetail", { archiveId: next?.archive.id, count: detailDebug.setDetail });
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
      setOwner((current) => {
        if (current?.userId === nextOwner.userId && (current.email || null) === nextOwner.email) {
          return current;
        }
        return nextOwner;
      });
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
        setCloudUserId(null);
        setCloudArchives([]);
        if (!explicitSignOutRef.current && !wasLocalOwnerExplicitlySignedOut()) {
          const remembered = loadRememberedLocalOwnerContext();
          if (remembered?.userId) {
            setOwner(remembered);
            void loadList({ userId: remembered.userId, email: remembered.email || null });
          }
          return;
        }
        explicitSignOutRef.current = false;
        clearRememberedLocalOwnerContext();
        clearShellIdentityCache(activeSessionUserId);
        activeSessionUserId = null;
        setOwner(null);
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
  }, [loadList, loadShellIdentity]);

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
        if (!nextOwner) {
          const identityOwner = recoverStoredOwnerFromIdentityCache();
          if (identityOwner?.userId) nextOwner = identityOwner;
        }
        if (!nextOwner) {
          const inferredOwner = await inferSingleLocalArchiveOwnerContext();
          if (inferredOwner?.userId) {
            nextOwner = { userId: inferredOwner.userId, email: inferredOwner.email };
          }
        }
        if (nextOwner?.userId) {
          rememberLocalOwnerContext(nextOwner);
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

  const detailScreenId =
    screen.kind === "detail" ||
    screen.kind === "edit-project" ||
    screen.kind === "new-record" ||
    screen.kind === "edit-record"
      ? screen.archiveId
      : null;
  const detailScreenKind = screen.kind;
  const loadedDetailKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!detailScreenId) {
      loadedDetailKeyRef.current = null;
      return;
    }
    const loadKey = `${detailScreenId}:${ownerContext?.userId || ""}`;
    if (loadedDetailKeyRef.current === loadKey) {
      logDetailDebug("skip-reload-same-archive", { loadKey, count: detailDebug.load });
      return;
    }
    loadedDetailKeyRef.current = loadKey;
    let canceled = false;
    logDetailDebug("effect-load", { loadKey, screenKind: detailScreenKind });
    detailDebug.load += 1;
    void getLocalArchiveDetail(detailScreenId, ownerContext).then((next) => {
      if (canceled) return;
      detailDebug.setDetail += 1;
      logDetailDebug("effect-setDetail", { archiveId: next?.archive.id, count: detailDebug.setDetail });
      setDetail(next);
      if (
        next?.archive.local_role === "cloud-offline-cache" &&
        (detailScreenKind === "new-record" ||
          detailScreenKind === "edit-record" ||
          detailScreenKind === "edit-project")
      ) {
        setScreen({ kind: "detail", archiveId: next.archive.id }, true);
      }
    }).catch(() => showToast(copy.readFailed));
    return () => { canceled = true; };
    // Intentionally omit copy/showToast so identical archiveId does not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailScreenKind, detailScreenId, ownerContext?.userId]);

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
    loadedDetailKeyRef.current = null;
    await loadDetail(archiveId);
    await loadList();
    showToast(copy.deleted);
  }

  async function createLocalSubcategory(category: ArchiveCategory, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createLocalTaxonomyItem({ kind: "subcategory", category, label: trimmed }, ownerContext);
      await loadList();
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.readFailed);
    }
  }

  async function renameLocalSubcategory(chip: ArchiveTaxonomyChip, suppliedName?: string) {
    if (!activeLocalCategory) return;
    const name = suppliedName ?? window.prompt(getTranslations(language).archive_workspace.local_subcategory_rename_prompt, chip.label);
    const cleanName = name?.trim();
    if (!cleanName || cleanName === chip.label) return;
    try {
      await renameLocalTaxonomyItem(
        { kind: "subcategory", category: activeLocalCategory, oldLabel: chip.label, newLabel: cleanName },
        ownerContext,
      );
      if (activeSubTag === chip.id) {
        setActiveSubTag(cleanName);
        setActiveGroupTag(null);
      }
      await loadList();
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.readFailed);
    }
  }

  async function deleteLocalSubcategory(chip: ArchiveTaxonomyChip) {
    if (!activeLocalCategory) return;
    if (!window.confirm(getTranslations(language).archive_workspace.local_subcategory_delete_confirm)) return;
    try {
      await deleteLocalTaxonomyItem(
        { kind: "subcategory", category: activeLocalCategory, label: chip.label },
        ownerContext,
      );
      if (activeSubTag === chip.id) {
        setActiveSubTag(null);
        setActiveGroupTag(null);
      }
      await loadList();
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.readFailed);
    }
  }

  async function createLocalGroup(name: string) {
    if (!activeLocalCategory || !activeSubTag) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createLocalTaxonomyItem(
        { kind: "group", category: activeLocalCategory, subcategory: activeSubTag, label: trimmed },
        ownerContext,
      );
      await loadList();
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.readFailed);
    }
  }

  async function renameLocalGroup(chip: ArchiveTaxonomyChip, suppliedName?: string) {
    if (!activeLocalCategory || !activeSubTag) return;
    const name = suppliedName ?? window.prompt(getTranslations(language).archive_workspace.local_group_rename_prompt, chip.label);
    const cleanName = name?.trim();
    if (!cleanName || cleanName === chip.label) return;
    try {
      await renameLocalTaxonomyItem(
        {
          kind: "group",
          category: activeLocalCategory,
          subcategory: activeSubTag,
          oldLabel: chip.label,
          newLabel: cleanName,
        },
        ownerContext,
      );
      if (activeGroupTag === chip.id) setActiveGroupTag(cleanName);
      await loadList();
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.readFailed);
    }
  }

  async function deleteLocalGroup(chip: ArchiveTaxonomyChip) {
    if (!activeLocalCategory || !activeSubTag) return;
    if (!window.confirm(getTranslations(language).archive_workspace.local_group_delete_confirm)) return;
    try {
      await deleteLocalTaxonomyItem(
        { kind: "group", category: activeLocalCategory, subcategory: activeSubTag, label: chip.label },
        ownerContext,
      );
      if (activeGroupTag === chip.id) setActiveGroupTag(null);
      await loadList();
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.readFailed);
    }
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
  const localCategoryDepths = useMemo(
    () => getLocalArchiveCategoryDepths(ownerContext?.userId),
    [ownerContext?.userId, localDepthsTick],
  );
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
      active: !["activity", "discover-search", "public-detail", "experience", "following", "market", "guides", "guide-detail"].includes(screen.kind),
      onSelect: goList,
    };
  }) as [
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
  ];

  const homeSectionOwnsTopNav = [
    "list",
    "activity",
    "discover-search",
    "experience",
    "guides",
    "guide-detail",
    "following",
    "market",
    "detail",
    "public-detail",
    "settings",
    "project-categories",
  ].includes(screen.kind);
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
          onProfileClick={() => setScreen({ kind: "settings" })}
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
              onCreateSubcategory={createLocalSubcategory}
              onRenameSubcategory={renameLocalSubcategory}
              onDeleteSubcategory={deleteLocalSubcategory}
              onCreateGroup={createLocalGroup}
              onRenameGroup={renameLocalGroup}
              onDeleteGroup={deleteLocalGroup}
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
                          ...localArchiveToProjectView(
                            archive,
                            ownerContext,
                            language,
                            getArchiveCategoryDepth(localCategoryDepths, archive.category),
                          ),
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
                      ...localArchiveToProjectView(
                        archive,
                        ownerContext,
                        language,
                        getArchiveCategoryDepth(localCategoryDepths, archive.category),
                      ),
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
            onChanged={async () => {
              loadedDetailKeyRef.current = null;
              await loadDetail(detail.archive.id);
              await loadList();
            }}
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
        <DiscoverFilterBar
          options={getDiscoverFilterOptions(language)}
          activeMode={discoverFilterMode}
          helpOnly={discoverFilterMode === "help"}
          onChange={setDiscoverFilterMode}
          compactMobile
        />
        <OfflineNetworkBody message={copy.offlineNotice} />
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
        <OfflineNetworkBody message={copy.offlineNotice} />
      </> : null}

      {screen.kind === "following" ? (
        <>
          <MobileContentTopBar
            ariaLabel={getTranslations(language).follow.title}
            items={[
              {
                key: "projects",
                label: getTranslations(language).follow.records,
                active: followChromeTab === "projects",
                onClick: () => setFollowChromeTab("projects"),
              },
              {
                key: "experience",
                label: getTranslations(language).follow.experience_cards,
                active: followChromeTab === "experience",
                onClick: () => setFollowChromeTab("experience"),
              },
              {
                key: "users",
                label: getTranslations(language).follow.users_mobile,
                active: followChromeTab === "users",
                onClick: () => setFollowChromeTab("users"),
              },
            ]}
          />
          <div style={offlineNetworkPageStyle}>
            <ConnectivityNotice message={copy.offlineNotice} />
          </div>
        </>
      ) : null}

      {screen.kind === "market" ? (
        <div style={offlineNetworkPageStyle}>
          <MobileContentTopBar
            ariaLabel={copy.marketType}
            items={[
              { key: "all", label: copy.marketAll, active: marketTypeFilter === "all", onClick: () => setMarketTypeFilter("all") },
              ...getMarketPostTypeOptions(language).map((item) => ({
                key: item.value,
                label: item.label,
                active: marketTypeFilter === item.value,
                onClick: () => setMarketTypeFilter(item.value as "all" | MarketPostType),
              })),
            ]}
          />
          <header style={offlineMarketHeaderStyle}>
            <button
              type="button"
              aria-expanded={marketFiltersOpen}
              onClick={() => setMarketFiltersOpen((open) => !open)}
              style={offlineMarketFilterToggleStyle}
            >
              {marketFiltersOpen ? getTranslations(language).market.hide_filters : copy.marketFilters}
            </button>
          </header>
          {marketFiltersOpen ? (
            <div style={offlineMarketFilterPanelStyle}>
              <label>{copy.marketCategory}
                <select value={marketCategoryFilter} onChange={(event) => setMarketCategoryFilter(event.target.value as "all" | MarketItemCategory)}>
                  <option value="all">{copy.allCategories}</option>
                  {getMarketItemCategoryOptions(language).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>{copy.marketArea}<input value={marketLocationFilter} onChange={(event) => setMarketLocationFilter(event.target.value)} /></label>
              <label>{copy.marketContent}<input value={marketContentFilter} onChange={(event) => setMarketContentFilter(event.target.value)} /></label>
            </div>
          ) : null}
          <ConnectivityNotice message={copy.offlineNotice} />
        </div>
      ) : null}

      {screen.kind === "guides" ? (
        <OfflineGuideDirectoryView
          directory={directory}
          signedIn={Boolean(owner)}
          onSelectGuide={(guide) => setScreen({ kind: "guide-detail", guideKey: getOfflineGuideKey(guide) })}
          onSelectHomeSection={(section) => {
            if (section === "activity") {
              setScreen({ kind: "activity" });
              return;
            }
            setScreen({ kind: "experience" });
          }}
        />
      ) : null}
      {screen.kind === "guide-detail" ? <OfflineGuideDetail guide={activeGuide} owner={owner} language={language} copy={copy} onBack={() => window.history.back()} onReconnect={reconnect} onCreate={(guide) => setScreen({ kind: "new-project", guide })} /> : null}
      {screen.kind === "choose-project" ? <section className="panel"><h1>{copy.chooseProject}</h1><div className="project-list">{archives.filter((archive) => archive.status === "active").map((archive) => <button type="button" className="secondary-button" key={archive.id} onClick={() => setScreen({ kind: "new-record", archiveId: archive.id })}>{archive.title}</button>)}</div><div className="action-row"><button type="button" className="primary-button" onClick={() => setScreen({ kind: "new-project" })}>{copy.newProject}</button></div></section> : null}
      {screen.kind === "settings" ? (
        <ProfileSettingsErrorBoundary onBack={() => setScreen({ kind: "list" })}>
          <ProfileSettingsView
            identity={{
              username: spaceProfile?.username || getTranslations(language).nav.username_unset,
              membershipLabel,
              storageLabel: `${formatStorage(storageUsedBytes)} / ${storageTotalLabel}`,
              avatarUrl: displayAvatarUrl(spaceProfile),
            }}
            cloudLocked
            onBack={() => setScreen({ kind: "list" })}
            onOpenProjectCategories={() => setScreen({ kind: "project-categories" })}
            onLogout={() => {
              explicitSignOutRef.current = true;
              clearRememberedLocalOwnerContext();
              void supabase.auth.signOut({ scope: "local" });
              setScreen({ kind: "list" });
            }}
          />
        </ProfileSettingsErrorBoundary>
      ) : null}
      {screen.kind === "project-categories" ? (
        <LocalProjectCategorySettingsView
          onBack={() => setScreen({ kind: "settings" })}
          localOwnerId={ownerContext?.userId || owner?.userId || null}
        />
      ) : null}
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
  const [tab, setTab] = useState<"guide" | "experience" | "projects">("guide");
  const guideCopy = publicGuideCopy[language];
  const name = guide ? getOfflineGuideName(guide, language) : copy.guideUnavailable;
  const parameters = guide && owner ? getOfflineGuideParameters(guide, language) : [];
  const overview = guide && owner
    ? getOfflineGuideOverview(guide, language)
    : guideCopy.registerForOverview;

  return (
    <>
      <MobilePageHeaderView
        title={name}
        onBack={onBack}
        ariaLabel={copy.back}
        right={guide ? (
          <button type="button" style={offlineGuideNewProjectStyle} onClick={() => onCreate(guide)}>
            {guideCopy.newProject}
          </button>
        ) : null}
      />
      {!guide ? (
        <main style={offlineGuidePageStyle}>
          <div style={offlineGuideStateCardStyle}>{copy.guideUnavailable}</div>
        </main>
      ) : (
        <main style={offlineGuidePageStyle}>
          <article style={offlineGuideHeroStyle}>
            <div style={offlineGuideBreadcrumbStyle}>
              <span style={offlineGuideCategoryBadgeStyle}>
                <UiIcon name={getArchiveCategoryIcon(guide.category)} size={15} />
                {getArchiveCategoryLabel(guide.category, language)}
              </span>
            </div>
            <div style={offlineGuideTitleRowStyle}>
              <h1 style={offlineGuideTitleStyle}>{name}</h1>
            </div>
            <p style={offlineGuideSummaryStyle}>{overview || guideCopy.contentPending}</p>
          </article>
          <nav style={offlineGuideDetailTabWrapStyle} aria-label={guideCopy.publicLibrary}>
            {([
              { key: "guide" as const, label: guideCopy.overviewPractice },
              { key: "experience" as const, label: guideCopy.experienceCards },
              { key: "projects" as const, label: guideCopy.relatedProjects },
            ]).map((item) => (
              <button
                key={item.key}
                type="button"
                aria-current={tab === item.key ? "page" : undefined}
                onClick={() => setTab(item.key)}
                style={offlineGuideDetailTabButtonStyle(tab === item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          {tab === "guide" ? (
            <>
              {!owner ? (
                <section style={offlineGuideAccessStyle}>
                  <strong>{copy.guideSignInRequired}</strong>
                  <button type="button" className="secondary-button" onClick={onReconnect}>{copy.reconnect}</button>
                </section>
              ) : parameters.length ? (
                <section style={offlineGuideSectionCardStyle}>
                  <h2 style={offlineGuideSectionTitleStyle}>{guideCopy.keyParameters}</h2>
                  <div style={offlineGuideParameterGridStyle}>
                    {parameters.map((parameter) => (
                      <div key={`${parameter.label}:${parameter.value}`} style={offlineGuideParameterCardStyle}>
                        <span>{parameter.label}</span>
                        <strong>{parameter.value}</strong>
                        {parameter.note ? <small>{parameter.note}</small> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <ConnectivityNotice message={copy.guideOfflineNotice} />
            </>
          ) : (
            <ConnectivityNotice message={copy.offlineNotice} />
          )}
        </main>
      )}
    </>
  );
}

const offlineGuidePageStyle: CSSProperties = {
  width: "min(100%, 960px)",
  margin: "0 auto",
  padding: "18px 16px 42px",
  boxSizing: "border-box",
};

const offlineGuideHeroStyle: CSSProperties = {
  padding: 24,
  border: "1px solid #dfe8dc",
  borderRadius: 20,
  background: "#fff",
  boxShadow: "0 8px 24px rgba(40, 66, 37, 0.04)",
};

const offlineGuideStateCardStyle: CSSProperties = {
  ...offlineGuideHeroStyle,
  color: "#687565",
};

const offlineGuideBreadcrumbStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "#748270",
  fontSize: 13,
  flexWrap: "wrap",
};

const offlineGuideCategoryBadgeStyle: CSSProperties = {
  minHeight: 30,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 10px",
  borderRadius: 999,
  background: "#edf6e9",
  color: "#477143",
  fontWeight: 800,
};

const offlineGuideTitleRowStyle: CSSProperties = {
  marginTop: 18,
};

const offlineGuideTitleStyle: CSSProperties = {
  margin: 0,
  color: "#223521",
  fontSize: "clamp(28px, 4.4vw, 42px)",
  lineHeight: 1.15,
};

const offlineGuideSummaryStyle: CSSProperties = {
  margin: "18px 0 0",
  color: "#465b43",
  fontSize: 16,
  lineHeight: 1.85,
};

const offlineGuideNewProjectStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 34,
  padding: "0 11px",
  border: "1px solid #bfd6b9",
  borderRadius: 999,
  background: "#f2f8ef",
  color: "#396a37",
  fontWeight: 800,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const offlineGuideDetailTabWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 6,
  marginTop: 14,
  padding: 5,
  border: "1px solid #dfe8dc",
  borderRadius: 16,
  background: "#fff",
};

function offlineGuideDetailTabButtonStyle(active: boolean): CSSProperties {
  return {
    minWidth: 0,
    minHeight: 42,
    padding: "7px 8px",
    border: 0,
    borderRadius: 12,
    background: active ? "#eaf5e6" : "transparent",
    color: active ? "#315f30" : "#667361",
    fontSize: 13,
    fontWeight: active ? 850 : 750,
    lineHeight: 1.25,
    cursor: "pointer",
  };
}

const offlineGuideSectionCardStyle: CSSProperties = {
  marginTop: 14,
  padding: 18,
  border: "1px solid #dfe8dc",
  borderRadius: 20,
  background: "#fff",
};

const offlineGuideSectionTitleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 16,
  color: "#223521",
};

const offlineGuideParameterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
};

const offlineGuideParameterCardStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 12,
  border: "1px solid #e5eee0",
  borderRadius: 14,
  background: "#f7fbf5",
};

const offlineGuideAccessStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  marginTop: 14,
  padding: 16,
  border: "1px solid #e0e8dc",
  borderRadius: 16,
  background: "#fff",
  color: "#687565",
  fontSize: 13,
  lineHeight: 1.65,
};

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
  useEffect(() => {
    detailDebug.mount += 1;
    logDetailDebug("ProjectDetail-mount", {
      archiveId: detail.archive.id,
      count: detailDebug.mount,
    });
  }, [detail.archive.id]);
  const [tab, setTab] = useState<ArchiveDetailTabKey>("records");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<LocalImage | null>(null);
  const archive = detail.archive;
  const isCloudCache = archive.local_role === "cloud-offline-cache";
  const hasPendingCloudRecords = detail.records.some((record) => record.sync?.status === "pending-cloud-sync");
  const archiveCopy = getTranslations(language).archive;
  const experienceCopy = getTranslations(language).experience;
  const cycles = (archive.cycles || []) as ArchiveCycle[];
  const cycleEnabled = typeof archive.cycle_enabled === "boolean"
    ? archive.cycle_enabled
    : cycles.length > 0;
  const recordsById = new Map(detail.records.map((record) => [record.id, record]));
  const recordItems: RecordItem[] = detail.records.map((record) => ({
    id: record.id,
    location: record.location || null,
    cycle_id: record.cycle_id || null,
    note: record.note,
    record_time: record.record_time,
    visibility: "private",
    status_tag: null,
    comment_count: 0,
    media: [],
  }));
  const latestUpdate = detail.records[0]?.record_time || archive.updated_at;
  const ongoingDays = getOngoingDays(archive.created_at, archive.ended_at);
  const durationText = ongoingDays
    ? `${archiveCopy.ongoing_days_prefix} ${ongoingDays} ${archiveCopy.days_suffix}`
    : archiveCopy.none;
  const projectView = localArchiveToProjectView(
    archive,
    ownerContext,
    language,
    getArchiveCategoryDepth(getLocalArchiveCategoryDepths(ownerContext?.userId), archive.category),
  );
  const archiveDisplayName = archive.system_name || archive.species_name || "";
  async function change(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await work(); await onChanged(); } catch (e) { setError(e instanceof Error ? e.message : copy.readFailed); } finally { setBusy(false); }
  }
  async function saveProfileField(changeValue: ArchiveProfileFieldSave) {
    const updates: Parameters<typeof updateLocalArchiveFields>[1] = {};
    if (changeValue.field === "title") {
      const cleanTitle = changeValue.value.trim();
      if (!cleanTitle) throw new Error(archiveCopy.project_name_empty);
      if (cleanTitle !== (archive.title || "")) updates.title = cleanTitle;
    }
    if (changeValue.field === "category" && changeValue.value !== archive.category) {
      updates.category = changeValue.value;
      updates.subcategory = null;
      updates.group_name = null;
    }
    if (changeValue.field === "systemName") {
      const cleanName = changeValue.value.name.trim();
      if (!cleanName) throw new Error(archiveCopy.system_name_empty);
      updates.system_name = cleanName;
      updates.species_name = archive.category === "plant" ? cleanName : null;
    }
    if (changeValue.field === "source") updates.source = changeValue.value.trim() || null;
    if (changeValue.field === "note") updates.note = changeValue.value.trim() || null;
    if (changeValue.field === "archiveSummary") updates.archive_summary = changeValue.value.trim() || null;
    if (Object.keys(updates).length) {
      await updateLocalArchiveFields(archive.id, updates, ownerContext);
      await onChanged();
    }
  }
  return <>
    <MobilePageHeaderView
      title={archive.title}
      onBack={onBack}
      ariaLabel={copy.back}
    />
    <div style={{ padding: "10px 10px 46px" }}>
      <div style={projectDetailStatsStyle}>
        {archiveDisplayName ? (
          <span style={projectDetailGuideTextStyle}>{archiveDisplayName}</span>
        ) : null}
        <ProjectMetaLine
          recordCount={detail.records.length}
          durationDays={ongoingDays}
          ended={archive.status === "ended"}
          order={["record", "duration"]}
          style={{ minWidth: 0, flex: "1 1 auto", gap: "5px 10px", fontSize: 13 }}
        />
      </div>
      <div style={localStorageHintStyle}>
        {isCloudCache
          ? `${archiveCopy.cloud_offline_cache_hint} ${archiveCopy.cloud_offline_cache_media_hint}`
          : archiveCopy.saved_on_this_device}
      </div>
      <ArchiveDetailTabBar
        active={tab}
        labels={{
          records: archiveCopy.details,
          profile: archiveCopy.dossier,
          experience: archiveCopy.experience_cards,
        }}
        experienceCount={0}
        language={language}
        ariaLabel={archiveCopy.detail_navigation}
        onChange={setTab}
      />
    {hasPendingCloudRecords ? <section className="notice warning"><p>{copy.pendingUpload}</p></section> : null}
    {error ? <section className="notice warning" role="alert"><p>{error}</p></section> : null}
    {tab === "profile" ? (
      <ArchiveDetailHeaderView
        project={projectView}
        eyebrow={archiveCopy.project_archive}
        latestUpdateText={`${archiveCopy.latest_update} ${formatDate(latestUpdate, language) || archiveCopy.none}`}
        recordCountText={`${archiveCopy.records} ${detail.records.length}`}
        durationText={ongoingDays ? durationText : undefined}
        hint={isCloudCache ? `${archiveCopy.cloud_offline_cache_hint} ${archiveCopy.cloud_offline_cache_media_hint}` : archiveCopy.saved_on_this_device}
        profileAlwaysOpen
        showPageChrome={false}
        showSystemNameInTitle={false}
        profileRows={[
          { label: archiveCopy.project_name_required, value: archive.title || archiveCopy.unnamed_project, field: "title" as const },
          { label: archiveCopy.system_name_required, value: archive.system_name || archive.species_name || archiveCopy.not_filled, field: "systemName" as const },
          { label: archiveCopy.category_required, value: getArchiveCategoryLabel(archive.category, language), field: "category" as const },
          ...(archive.category === "plant" ? [{
            label: archiveCopy.planting_region_required,
            content: (
              <PlantingRegionEditor
                layout="attribute"
                language={language}
                value={archive.planting_region}
                canEdit={!isCloudCache && !busy}
                onSave={async (region) => {
                  await updateLocalArchiveFields(archive.id, { planting_region: region }, ownerContext);
                  await onChanged();
                }}
              />
            ),
          }] : []),
          { label: archiveCopy.source, value: archive.source || archiveCopy.not_filled, field: "source" as const },
          { label: archiveCopy.note, value: archive.note || archiveCopy.not_filled, field: "note" as const },
          { label: archiveCopy.summary, value: archive.archive_summary || archiveCopy.not_filled, field: "archiveSummary" as const },
        ]}
        profileEditor={isCloudCache ? undefined : {
          values: {
            title: archive.title || "",
            category: archive.category,
            systemName: archive.system_name || archive.species_name || "",
            source: archive.source || "",
            note: archive.note || "",
            archiveSummary: archive.archive_summary || "",
          },
          onSaveField: saveProfileField,
          systemNameMode: "text",
        }}
        profileActions={isCloudCache ? undefined : (
          <div className="action-row">
            <button type="button" className="secondary-button" onClick={onEdit}>{copy.edit}</button>
            <button type="button" className="danger-button" disabled={busy} onClick={onDelete}>{copy.remove}</button>
          </div>
        )}
        profileExtra={isCloudCache ? undefined : (
          <>
          <div className="property-row">
            <span>{copy.status}</span>
            <SegmentedChoice
              label={copy.status}
              value={archive.status}
              disabled={busy}
              options={[{ value: "active", label: copy.ongoing }, { value: "ended", label: copy.ended }]}
              onChange={(status) => void change(() => updateLocalArchiveFields(archive.id, { status, ended_at: status === "ended" ? new Date().toISOString() : null }, ownerContext))}
            />
          </div>
          <label className="property-row"><span>{copy.enablePeriod}</span><input type="checkbox" role="switch" checked={Boolean(archive.cycle_enabled)} disabled={busy} onChange={(e) => void change(() => updateLocalArchiveFields(archive.id, { cycle_enabled: e.target.checked }, ownerContext))} /></label>
          </>
        )}
      />
    ) : tab === "experience" ? (
      <div style={localExperienceEmptyStyle}>
        <div>{experienceCopy.no_cards}</div>
        <div style={localExperienceEmptyHintStyle}>
          {isCloudCache ? archiveCopy.cloud_offline_cache_readonly : archiveCopy.local_experience_cards_hint}
        </div>
      </div>
    ) : (
      <ArchiveCycleTimeline
        cycles={cycleEnabled ? cycles : []}
        records={recordItems}
        category={archive.category}
        mobileMode
        canManage={cycleEnabled && !isCloudCache}
        busy={busy}
        onStartCycle={cycleEnabled && !isCloudCache ? (startedAt) => void change(() => createLocalArchiveCycle(archive.id, startedAt, ownerContext)) : undefined}
        onEndCycle={cycleEnabled && !isCloudCache ? (cycle, endedAt) => void change(() => endLocalArchiveCycle(archive.id, cycle.id, endedAt, ownerContext)) : undefined}
        emptyState={<div className="panel empty">{copy.noRecords}</div>}
        renderRecord={(record) => {
          const source = recordsById.get(record.id);
          if (!source) return null;
          return (
            <ArchiveRecordCardShell key={record.id} metaText={formatDate(source.record_time, language)} mobileMode>
              {source.images.length ? <div className={`photo-grid ${source.images.length === 1 ? "single-photo" : ""}`}>{source.images.map((image) => isCloudCache ? <span className="photo-view" key={image.id}><BlobImage image={image} alt="" /></span> : <button type="button" className="photo-view" key={image.id} aria-label={copy.viewPhoto} onClick={() => setLightbox(image)}><BlobImage image={image} alt="" /></button>)}</div> : null}
              {source.sync?.status === "pending-cloud-sync" ? <p className="project-meta">{copy.pendingUpload}</p> : null}
              {source.note ? <p className="record-note">{source.note}</p> : null}
              {source.location ? <p className="project-meta">{source.location.label || `${source.location.latitude?.toFixed(4)}, ${source.location.longitude?.toFixed(4)}`}</p> : null}
              {!isCloudCache ? <div className="record-actions"><button className="link-button" type="button" onClick={() => onEditRecord(source.id)}>{copy.edit}</button><button className="link-button danger" type="button" onClick={() => onDeleteRecord(source.id)}>{copy.remove}</button></div> : null}
            </ArchiveRecordCardShell>
          );
        }}
      />
    )}
    </div>
    {lightbox && !isCloudCache ? <dialog className="photo-lightbox" open aria-label={copy.photo} onCancel={() => setLightbox(null)}><button type="button" className="icon-button" autoFocus onClick={() => setLightbox(null)}>{copy.back}</button><BlobImage image={lightbox} alt="" /></dialog> : null}
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
void logLifespaceStorageDiagnostic();
createRoot(document.getElementById("root")!).render(<App />);