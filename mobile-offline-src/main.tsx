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
  getCloudOfflineCacheByCloudSource,
  getLocalArchiveByCloudSource,
  createLocalArchive,
  createLocalRecord,
  deleteLocalArchive,
  deleteLocalRecord,
  resolveLocalArchiveDetail,
  inferSingleLocalArchiveOwnerContext,
  listVisibleLocalArchiveSummaries,
  listVisibleCloudOfflineArchiveSummaries,
  listPendingCloudSyncSummaries,
  listLocalArchiveCycleTrash,
  listLocalProjectTrash,
  setLocalProjectTrashed,
  restoreLocalArchiveCycle,
  listVisibleLocalTaxonomyItems,
  createLocalTaxonomyItem,
  renameLocalTaxonomyItem,
  deleteLocalTaxonomyItem,
  deferPendingCloudSyncPrompt,
  localArchiveHasPendingCloudWork,
  markUnownedLocalArchivesForOwner,
  preparePendingCloudSyncQueue,
  updateLocalArchiveFields,
  updateLocalRecordFields,
  type LocalArchive,
  type LocalArchiveDetail,
  type LocalArchiveOwnerContext,
  type LocalArchiveSummary,
  type PendingCloudSyncSummary,
  type LocalImage,
  type LocalRecordWithImages,
} from "@/lib/local-offline-db";
import {
  wasLocalOwnerExplicitlySignedOut,
  loadRememberedLocalOwnerContext,
  rememberLocalOwnerContext,
  type StoredLocalOwnerContext,
} from "@/lib/local-owner-context";
import { migrateLegacyLocalOrigin } from "@/lib/local-origin-migration";
import { retireBundledLegacyServiceWorkers } from "@/lib/android-service-worker";
import { normalizeLocalImageBlob } from "@/lib/local-image-blob";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
  archiveCategoryOptions,
  type ArchiveCategory,
} from "@/lib/archive-categories";

import AuthCaptcha, { AUTH_CAPTCHA_ENABLED } from "@/components/AuthCaptcha";
import { loginBundledWithTurnstile } from "@/lib/android-auth-session";
import {
  beginAndroidAuthLogin,
  completeAndroidAuthLogin,
  explicitAndroidLogout,
  failAndroidAuthLogin,
  resolveAuthenticatedOwnerContext,
  useAndroidAuthState,
} from "@/lib/android-auth-state";
import UiIcon from "@/components/ui/UiIcon";
import SegmentedChoice from "@/components/ui/SegmentedChoice";
import ArchiveProjectCard from "@/components/archive-ui/ArchiveProjectCard";
import MobileArchiveActions from "@/components/archive/MobileArchiveActions";
import GuideDetailView from "@/components/plant-detail/GuideDetailView";
import ArchiveWorkspaceTemplate from "@/components/archive-ui/ArchiveWorkspaceTemplate";
import DeviceOwnedProjectDetail from "@/components/archive-ui/DeviceOwnedProjectDetail";
import CloudArchiveDetailController from "@/components/archive-ui/CloudArchiveDetailController";
import PublicCloudArchiveRouteController from "@/components/archive-ui/PublicCloudArchiveRouteController";
import ArchiveProjectDetailView from "@/components/archive-ui/ArchiveProjectDetailView";
import ArchiveProjectDetailStatus, {
  ArchiveProjectDetailLoading,
} from "@/components/archive-ui/ArchiveProjectDetailStatus";
import MobileShellErrorBoundary from "@/components/mobile/MobileShellErrorBoundary";
import { InternalNavigationProvider } from "@/components/navigation/InternalLink";
import ProjectCategorySettingsView from "@/components/profile/ProjectCategorySettingsView";
import PersonalSpaceMobileIdentity from "@/components/archive-ui/PersonalSpaceMobileIdentity";
import ArchiveTaxonomyPanel from "@/components/archive-ui/ArchiveTaxonomyPanel";
import { localArchiveToProjectView } from "@/components/archive-ui/localArchiveProjectView";
import MobileBottomNavigationView, {
  type MobileBottomNavigationItem,
} from "@/components/mobile/MobileBottomNavigationView";
import { getMobilePrimaryNavigationDescriptors } from "@/components/mobile/mobilePrimaryNavigation";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import HomeSectionTabs, { type HomeSection } from "@/components/home/HomeSectionTabs";
import DiscoverSearchPage from "@/app/discover/search/page";
import PlantPage from "@/app/plant/page";
import AndroidMarketDetailController from "@/components/market/AndroidMarketDetailController";
import ReadonlyPublicProjectDetail from "@/components/archive-ui/ReadonlyPublicProjectDetail";
import RecordLocationField from "@/components/record/RecordLocationField";
import { loadDefaultRecordLocation, type RecordLocation } from "@/lib/record-location";
import { readImageCapturedAt } from "@/lib/photo-metadata";
import {
  getOfflineGuideKey,
  getOfflineGuideName,
  getOfflineGuideOverview,
  getOfflineGuideParameters,
  loadOfflineGuideDirectory,
  findOfflineGuideEntry,
  type OfflineGuideDirectoryEntry,
} from "@/lib/offline-guide-directory";
import type { SystemNameCandidate } from "@/lib/system-name-candidates";
import { setStoredLanguage } from "@/lib/i18n";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { getArchiveCycleTerminology } from "@/lib/archive-cycle-terminology";
import { localDateTimeInputToIso, toLocalDateTimeInputValue } from "@/lib/date-time";
import { supabase } from "@/lib/supabase";
import { Browser } from "@capacitor/browser";
import { isAndroidOnline, recheckAndroidConnectivity, useAndroidConnectivity } from "@/lib/android-connectivity";
import { getRecentArchiveBrowseItems, saveRecentArchiveBrowse } from "@/lib/recent-browse";
import {
  createCloudProjectTaxonomy, deleteCloudProjectTaxonomy, loadCloudProjectTaxonomy,
  mapLocalProjectTaxonomy, renameCloudProjectTaxonomy, type ProjectTaxonomyEntry,
} from "@/lib/android-project-taxonomy";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import { refreshCloudOfflineCaches, type CloudOfflineCacheArchiveSource } from "@/lib/cloud-offline-cache";
import { syncAllPendingCloudArchives, syncPendingCloudArchive } from "@/lib/pending-cloud-sync";
import { readCloudTaxonomySnapshot } from "@/lib/cloud-taxonomy-snapshot";
import { createLiveCloudArchive } from "@/lib/android-live-cloud-create";
import { projectCreationDestinations, type CreationDestination, type QuickAddDraft, type QuickAddSource } from "@/lib/android-creation-capabilities";
import { formatStorage } from "@/lib/user-profile-shared";
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
import { DiscoverFilterBar } from "@/components/discover/DiscoverFilterBar";
import { DiscoverProjectGrid } from "@/components/discover/DiscoverProjectGrid";
import {
  type FilterMode,
  getDiscoverFilterOptions,
} from "@/lib/discover-types";
import PublicExperienceGallery from "@/components/experience-card/PublicExperienceGallery";
import MobileSearchField from "@/components/search/MobileSearchField";
import CategoryLabel from "@/components/ui/CategoryLabel";
import filterStyles from "@/components/ui/CategoryFilterRow.module.css";
import FollowPage from "@/app/follow/page";
import MarketPage from "@/app/market/page";
import AndroidProfileController from "@/components/profile/AndroidProfileController";
import {
  DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  getCloudArchiveCategoryDepths,
  getLocalArchiveCategoryDepths,
  saveCloudArchiveCategoryDepths,
  saveLocalArchiveCategoryDepths,
  type ArchiveCategoryDepth,
  type ArchiveCategoryDepths,
  type ArchiveCategorySpace,
} from "@/lib/archive-category-settings";
import MobileNetworkUnavailableState from "@/components/mobile/MobileNetworkUnavailableState";
import { buildOfflineProfileSnapshot } from "@/lib/android-offline-profile";
import {
  liveCloudCardImageUrl,
  parseAndroidShellPath,
  resolveAndroidArchiveScreen,
} from "@/lib/android-shell-app-routes";

const MAX_PHOTOS = 10;

type Language = "zh" | "en";
type ShellSourceFilter = "all" | "cloud" | "local";

type ShellSpaceProfile = {
  username: string | null;
  avatar_url: string | null;
  storage_used: number | null;
  storage_limit: number | null;
  account_number?: string | null;
  location?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  region_name?: string | null;
  city_name?: string | null;
};

type ShellIdentityCache = {
  profile: ShellSpaceProfile | null;
  membership: MyMembership | null;
  experienceCardCount: number;
};

const SHELL_IDENTITY_CACHE_PREFIX = "lifespace_shell_identity_v1:";

function readShellIdentityCache(userId?: string | null): ShellIdentityCache | null {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(`${SHELL_IDENTITY_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ShellIdentityCache>;
    return {
      profile: (parsed.profile || null) as ShellSpaceProfile | null,
      membership: (parsed.membership || null) as MyMembership | null,
      experienceCardCount: Math.max(0, Number(parsed.experienceCardCount || 0)),
    };
  } catch {
    return null;
  }
}

function writeShellIdentityCache(userId: string, value: ShellIdentityCache) {
  try {
    window.localStorage.setItem(
      `${SHELL_IDENTITY_CACHE_PREFIX}${userId}`,
      JSON.stringify(value),
    );
  } catch {
    // Identity cache is optional; local projects and cloud caches stay usable.
  }
}

function clearShellIdentityCache(userId?: string | null) {
  if (!userId) return;
  try {
    window.localStorage.removeItem(`${SHELL_IDENTITY_CACHE_PREFIX}${userId}`);
  } catch {
    // Explicit sign-out still clears in-memory identity even if storage is unavailable.
  }
}

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
  sub_tag_id?: string | null;
  group_tag_id?: string | null;
};

type Screen =
  | { kind: "list" }
  | { kind: "new-project"; guide?: SystemNameCandidate; destination?: CreationDestination }
  | { kind: "project-destination" }
  | { kind: "quick-add" }
  | { kind: "creation-login"; returnTo: "choose-project" | "project-destination" }
  | { kind: "activity" }
  | { kind: "discover-search" }
  | { kind: "public-detail" }
  | { kind: "experience" }
  | { kind: "following" }
  | { kind: "market" }
  | { kind: "market-detail"; id: string }
  | { kind: "guides" }
  | { kind: "guide-detail"; guideKey: string; guideId?: string }
  | { kind: "profile" }
  | { kind: "project-categories" }
  | { kind: "recent" }
  | { kind: "trash" }
  | { kind: "settings" }
  | { kind: "choose-project" }
  | { kind: "detail"; archiveId: string }
  | { kind: "cloud-detail"; archiveId: string }
  | { kind: "public-cloud-detail"; archiveId: string; back: "list" | "activity" | "discover-search" | "experience" | "following" | "market" }
  | { kind: "edit-project"; archiveId: string }
  | { kind: "new-record"; archiveId: string }
  | { kind: "edit-record"; archiveId: string; recordId: string };

const text = {
  zh: {
    mySpace: "我的空间", settings: "设置", language: "语言", all: "全部", cloud: "云空间", local: "本地", project: "项目",
    home: "首页", follow: "关注", market: "集市", me: "我", guides: "指引", discover: "发现", experience: "经验",
    cloudUnavailable: "当前未联网，云端内容暂不可用", needNetwork: "需要联网", webOnly: "此功能暂需在网页中使用", cloudProjects: "云端项目", cloudLoading: "正在读取云端项目…",
    cloudLoadFailed: "云端项目读取失败，请稍后重试。", cloudSignIn: "登录后可查看云端项目",
    saveLocalCopy: "保存到本机", refreshLocalCopy: "更新本机副本", openLocalCopy: "打开本机副本",
    offlineCopies: "云端缓存副本",     cacheNotReady: "这个项目尚未缓存，请联网登录后等待后台准备。", cloudCacheReadOnly: "云端已有记录离线只读；新增记录先保存本机，恢复网络后自动同步。", noCachedProjects: "还没有云项目缓存。请先联网登录，后台会准备轻量副本。", 
    savingCloudCopy: "正在保存到本机…", cloudCopySaved: "云端项目已保存到本机",
    pendingUpload: "本机有修改等待上传到原云端项目", uploadNow: "现在上传", later: "稍后",
    uploading: "正在上传…", uploadSuccess: "本机修改已上传", uploadFailed: "还有内容未上传，请稍后重试",
    login: "登录", logout: "退出登录", email: "邮箱", password: "密码", loginFailed: "登录失败", captchaRequired: "请先完成人机验证",
    camera: "拍照", album: "从相册添加", chooseProject: "选择项目",
    guideSearch: "搜索指引名称", guideHint: "选择指引，也可以填写自定义名称", details: "详情", properties: "属性",
    guideOverview: "基础概要", basicReferences: "基础参考", createFromGuide: "按此指引新建项目",
    guideOfflineNotice: "离线可查看基础概要；完整实操、经验卡和关联项目请联网后查看。",
    guideSignInRequired: "联网登录／注册后可查看基础概要。", guideUnavailable: "这条离线指引暂时不可用。",
    ongoing: "进行中", ended: "已结束", period: "项目分期", enablePeriod: "开启分期", periodDate: "期次开始日期", status: "项目状态", visibility: "可见范围", private: "仅自己可见",
    photoLimit: "每次最多选择10张，可分多次添加", removePhoto: "移除照片",
    brand: "有时·耕作",
    offlineMode: "本地离线模式",
    offlineTitle: "当前离线，本地记录可用",
    offlineBody: "项目、记录和照片先保存在本机。恢复网络后会自动同步待上传的云端内容；明确选择本地免费使用的项目不会自动上传。",
    migrationWarning: "旧版本地资料暂未完成迁移。现有资料不会被删除，请稍后重新打开 App 再试。",
    reconnect: "重新连接云端",
    newProject: "新建项目",
    localProjects: "本地项目",
    noProjects: "还没有本地项目",
    noProjectsHint: "断网时也可以先创建，内容会保存在这台设备。",
    records: "条记录",
    photos: "张照片",
    unownedTitle: "发现登录前创建的本地项目",
    unownedBody: "可以归入当前账号在本机的项目列表；这不会上传云端。",
    claim: "归入我的本地项目",
    back: "返回",
    edit: "编辑",
    remove: "删除",
    addRecord: "新建记录",
    noRecords: "暂无记录",
    projectInfo: "项目信息",
    title: "项目名称",
    category: "项目类型",
    systemName: "关联指引",
    source: "来源（选填）",
    note: "备注（选填）",
    recordNote: "记录内容",
    recordTime: "记录时间",
    selectPhotos: "照片（最多 10 张）",
    photoHint: "点击后可选择相机或相册；照片会压缩后保存在本机。",
    save: "保存",
    cancel: "取消",
    saving: "保存中…",
    loading: "正在读取本地资料…",
    requiredProject: "请填写项目名称和对象名称。",
    requiredRecord: "请填写记录内容，或至少选择一张照片。",
    createSuccess: "项目已创建",
    createPendingCloudSuccess: "待同步云端项目已保存在本机",
    destinationPendingCloud: "待同步云端项目",
    destinationLocalOnly: "本地免费使用",
    destinationHint: "待同步项目恢复网络后会自动创建云端项目；本地免费项目不会自动上传。",
    updateSuccess: "已保存",
    recordSuccess: "记录已保存到本机",
    deleteProjectConfirm: "确定删除这个本地项目及其全部记录和照片吗？此操作无法撤销。",
    deleteRecordConfirm: "确定删除这条本地记录及其照片吗？此操作无法撤销。",
    deleted: "已删除",
    migrated: "升级前的本地资料已保留",
    readFailed: "无法读取本地资料。",
    plant: "种植",
    system: "农设",
    insect_fish: "虫鱼",
    other: "其他",
  },
  en: {
    mySpace: "My space", settings: "Settings", language: "Language", all: "All", cloud: "Cloud", local: "Local", project: "Project",
    home: "Home", follow: "Following", market: "Market", me: "Me", guides: "Guides", discover: "Discover", experience: "Experience",
    cloudUnavailable: "Cloud content is unavailable while offline", needNetwork: "A network connection is required", webOnly: "This feature is currently available on the website", cloudProjects: "Cloud projects", cloudLoading: "Loading cloud projects…",
    cloudLoadFailed: "Could not load cloud projects. Try again later.", cloudSignIn: "Sign in to view cloud projects",
    saveLocalCopy: "Save on device", refreshLocalCopy: "Refresh device copy", openLocalCopy: "Open device copy",
    offlineCopies: "Cached cloud copy", cacheNotReady: "This project has not been cached yet. Sign in online and let it prepare in the background.", cloudCacheReadOnly: "Existing cloud records are read-only offline. New records stay on this device and sync automatically when you reconnect.", noCachedProjects: "No cached cloud projects yet. Sign in online to prepare lightweight copies.",
    savingCloudCopy: "Saving on device…", cloudCopySaved: "Cloud project saved on this device",
    pendingUpload: "This device has changes waiting to upload to the original cloud project", uploadNow: "Upload now", later: "Later",
    uploading: "Uploading…", uploadSuccess: "Device changes uploaded", uploadFailed: "Some changes are still pending",
    login: "Sign in", logout: "Sign out", email: "Email", password: "Password", loginFailed: "Sign-in failed", captchaRequired: "Complete the verification first",
    camera: "Camera", album: "Gallery", chooseProject: "Choose project",
    guideSearch: "Search guides", guideHint: "Choose a guide or enter your own name", details: "Details", properties: "Properties",
    guideOverview: "Basic overview", basicReferences: "Basic references", createFromGuide: "Start a project from this guide",
    guideOfflineNotice: "The basic overview is available offline. Reconnect for full practice guidance, experience cards, and related projects.",
    guideSignInRequired: "Reconnect and log in or register to view the basic overview.", guideUnavailable: "This offline guide is temporarily unavailable.",
    ongoing: "Ongoing", ended: "Ended", period: "Project periods", enablePeriod: "Enable periods", periodDate: "Period start date", status: "Project status", visibility: "Visibility", private: "Only me",
    photoLimit: "Select up to 10 at a time; add more later", removePhoto: "Remove photo",
    brand: "LifeSpace",
    offlineMode: "Local offline mode",
    offlineTitle: "Cloud is temporarily unavailable. Local records still work.",
    offlineBody: "Projects, records and photos are saved on this device first. Pending cloud changes sync automatically when you reconnect. Projects you mark as local-only stay local.",
    migrationWarning: "Previous local data has not finished migrating. Nothing was deleted; reopen the app later to retry.",
    reconnect: "Reconnect to cloud",
    newProject: "New local project",
    localProjects: "Local projects",
    noProjects: "No local projects yet",
    noProjectsHint: "You can create one offline and keep it on this device.",
    records: "records",
    photos: "photos",
    unownedTitle: "Projects created before sign-in found",
    unownedBody: "Add them to this account's local list. Nothing will be uploaded.",
    claim: "Add to my local projects",
    back: "Back",
    edit: "Edit",
    remove: "Delete",
    addRecord: "New record",
    noRecords: "No records yet",
    projectInfo: "Project details",
    title: "Project name",
    category: "Project type",
    systemName: "Variety / subject / method",
    source: "Source (optional)",
    note: "Notes (optional)",
    recordNote: "Record notes",
    recordTime: "Record time",
    selectPhotos: "Photos (up to 10)",
    photoHint: "Choose Camera or Gallery. Photos are compressed and stored on this device.",
    save: "Save",
    cancel: "Cancel",
    saving: "Saving…",
    loading: "Reading local data…",
    requiredProject: "Enter a project name and subject name.",
    requiredRecord: "Enter notes or select at least one photo.",
    createSuccess: "Project created",
    createPendingCloudSuccess: "Pending cloud project saved on this device",
    destinationPendingCloud: "Pending cloud project",
    destinationLocalOnly: "Local free use",
    destinationHint: "Pending cloud projects create a cloud archive after reconnect. Local-only projects are never uploaded automatically.",
    updateSuccess: "Saved",
    recordSuccess: "Record saved on this device",
    deleteProjectConfirm: "Delete this local project and all of its records and photos? This cannot be undone.",
    deleteRecordConfirm: "Delete this local record and its photos? This cannot be undone.",
    deleted: "Deleted",
    migrated: "Local data from the previous version was preserved",
    readFailed: "Could not read local data.",
    plant: "Plants",
    system: "Methods",
    insect_fish: "Ecology",
    other: "Other",
  },
} as const;

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
  const [url, setUrl] = useState("");
  const validBlob = normalizeLocalImageBlob(image?.blob, image?.mime_type);

  useEffect(() => {
    const blob = normalizeLocalImageBlob(image?.blob, image?.mime_type);
    if (!blob) return;
    let nextUrl: string;
    try {
      nextUrl = URL.createObjectURL(blob);
    } catch {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setUrl(nextUrl); });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(nextUrl);
    };
  }, [image]);

  return validBlob && url ? <img src={url} alt={alt} className={className} /> : null;
}

function OfflineProjectCategorySettings({
  ownerUserId,
  online,
  cloudUserId,
  cachedEntries,
  onBack,
}: {
  ownerUserId: string;
  online: boolean;
  cloudUserId: string | null;
  cachedEntries: ProjectTaxonomyEntry[];
  onBack: () => void;
}) {
  const [activeSpace, setActiveSpace] = useState<ArchiveCategorySpace>("local");
  const [localDepths, setLocalDepths] = useState<ArchiveCategoryDepths>(() =>
    getLocalArchiveCategoryDepths(ownerUserId),
  );
  const [saving, setSaving] = useState(false);
  const [cloudDepths, setCloudDepths] = useState<ArchiveCategoryDepths>({ ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS });
  const [cloudLoading, setCloudLoading] = useState(false);
  const [error, setError] = useState("");
  const cloudAvailable = online && cloudUserId === ownerUserId;
  const [localEntries, setLocalEntries] = useState<ProjectTaxonomyEntry[]>([]);
  const [cloudEntries, setCloudEntries] = useState<ProjectTaxonomyEntry[]>([]);
  const localContext = useMemo(() => ownerUserId ? { userId: ownerUserId } : null, [ownerUserId]);
  const reloadLocal = useCallback(async () => {
    setLocalEntries(mapLocalProjectTaxonomy(await listVisibleLocalTaxonomyItems(localContext)));
  }, [localContext]);
  const reloadCloud = useCallback(async () => {
    if (cloudAvailable) setCloudEntries(await loadCloudProjectTaxonomy(ownerUserId));
  }, [cloudAvailable, ownerUserId]);

  useEffect(() => { void reloadLocal().catch((cause) => setError(String(cause))); }, [reloadLocal]);

  useEffect(() => {
    if (!cloudAvailable || activeSpace !== "cloud") return;
    let active = true;
    setCloudLoading(true);
    setError("");
    void Promise.all([getCloudArchiveCategoryDepths(ownerUserId), loadCloudProjectTaxonomy(ownerUserId)]).then(([depths, entries]) => {
      if (active) { setCloudDepths(depths); setCloudEntries(entries); }
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (active) setCloudLoading(false); });
    return () => { active = false; };
  }, [activeSpace, cloudAvailable, ownerUserId]);

  function updateDepth(category: ArchiveCategory, depth: ArchiveCategoryDepth) {
    if (activeSpace === "cloud") setCloudDepths((current) => ({ ...current, [category]: depth }));
    else setLocalDepths((current) => ({ ...current, [category]: depth }));
  }

  async function save() {
    if (activeSpace === "cloud" && (!cloudAvailable || cloudLoading || error)) return;
    setSaving(true);
    setError("");
    try {
      if (activeSpace === "cloud") await saveCloudArchiveCategoryDepths(ownerUserId, cloudDepths);
      else saveLocalArchiveCategoryDepths(localDepths, ownerUserId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function mutateTaxonomy(action: "create" | "rename" | "delete", category: ArchiveCategory,
    labelOrEntry: string | ProjectTaxonomyEntry, parentId?: string | null, nextLabel?: string) {
    setError("");
    try {
      const entry = typeof labelOrEntry === "string" ? null : labelOrEntry;
      if (activeSpace === "cloud") {
        if (!cloudAvailable) throw new Error("需要联网");
        if (action === "create") await createCloudProjectTaxonomy({ userId: ownerUserId, category, label: labelOrEntry as string, parentId });
        else if (entry && action === "rename") await renameCloudProjectTaxonomy({ userId: ownerUserId, entry, label: nextLabel || "" });
        else if (entry) await deleteCloudProjectTaxonomy({ userId: ownerUserId, entry });
        await reloadCloud();
      } else {
        const parent = localEntries.find((item) => item.id === parentId);
        const fields = { category, subcategory: entry?.kind === "group"
          ? localEntries.find((item) => item.id === entry.parentId)?.label || null
          : parent?.label || null };
        if (action === "create") await createLocalTaxonomyItem({ ...fields, kind: parentId ? "group" : "subcategory", label: labelOrEntry as string }, localContext);
        else if (entry && action === "rename") await renameLocalTaxonomyItem({ ...fields, kind: entry.kind, oldLabel: entry.label, newLabel: nextLabel || "" }, localContext);
        else if (entry) await deleteLocalTaxonomyItem({ ...fields, kind: entry.kind, label: entry.label }, localContext);
        await reloadLocal();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <ProjectCategorySettingsView
      activeSpace={activeSpace}
      onSpaceChange={setActiveSpace}
      depths={activeSpace === "local" ? localDepths : cloudDepths}
      saving={saving}
      loading={activeSpace === "cloud" && cloudLoading}
      error={error}
      cloudRequiresNetwork={!cloudAvailable}
      onToggleDepth={updateDepth}
      entries={activeSpace === "cloud" ? (cloudAvailable ? cloudEntries : cachedEntries) : localEntries}
      onCreate={(category, label, parentId) => mutateTaxonomy("create", category, label, parentId)}
      onRename={(entry, label) => mutateTaxonomy("rename", entry.category, entry, entry.parentId, label)}
      onDelete={(entry) => mutateTaxonomy("delete", entry.category, entry, entry.parentId)}
      onSave={() => void save()}
      onBack={onBack}
    />
  );
}

function App() {
  const [language, setLanguage] = useState<Language>(getLanguage);
  const copy = text[language];
  const [screen, setScreenState] = useState<Screen>({ kind: "list" });
  const [quickAddDraft, setQuickAddDraft] = useState<QuickAddDraft | null>(null);
  const [taxonomySyncWarning, setTaxonomySyncWarning] = useState<string | null>(null);
  const quickCamera = useRef<HTMLInputElement>(null);
  const quickGallery = useRef<HTMLInputElement>(null);
  async function acceptQuickAddFiles(list: FileList | null, source: QuickAddSource) {
    const images = Array.from(list || []).filter((file) => file.type.startsWith("image/"));
    if (images.length > MAX_PHOTOS) showToast(copy.photoLimit);
    const files = images.slice(0, MAX_PHOTOS);
    if (!files.length) return;
    const capturedAt = await Promise.all(files.map((file) => readImageCapturedAt(file).catch(() => null)));
    setQuickAddDraft({ files, capturedAt, source, note: "" });
    setScreen({ kind: "choose-project" });
  }
  const [categoryFilter, setCategoryFilter] = useState<ArchiveCategory | "all">("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [directory, setDirectory] = useState(loadOfflineGuideDirectory);
  useEffect(() => {
    const update = () => setDirectory(loadOfflineGuideDirectory());
    window.addEventListener("lifespace-guide-directory-updated", update);
    return () => window.removeEventListener("lifespace-guide-directory-updated", update);
  }, []);
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
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "ready" | "not-found" | "forbidden" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const [migrationWarning, setMigrationWarning] = useState(false);
  const [toast, setToast] = useState("");
  const online = useAndroidConnectivity();
  const auth = useAndroidAuthState();
  const cloudUserId = auth.status === "signed-in" ? auth.sessionUserId : null;
  const [cloudArchives, setCloudArchives] = useState<CloudArchiveSummary[]>([]);
  const [cloudTaxonomy, setCloudTaxonomy] = useState<ProjectTaxonomyEntry[]>([]);
  const [localTaxonomy, setLocalTaxonomy] = useState<ProjectTaxonomyEntry[]>([]);
  const [cloudDepths, setCloudDepths] = useState<ArchiveCategoryDepths>({ ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS });
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState("");
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
  const [activityFilterMode, setActivityFilterMode] = useState<FilterMode>("all");
  const [activityHelpOnly, setActivityHelpOnly] = useState(false);
  const activityLoaderRef = useRef<HTMLDivElement | null>(null);
  const [experienceSearchOpen, setExperienceSearchOpen] = useState(false);
  const [experienceQuery, setExperienceQuery] = useState("");
  const [experienceCategoryFilter, setExperienceCategoryFilter] = useState<
    "all" | ArchiveCategory
  >("all");
  const connectivityEpoch = useRef(0);
  const lastRecoveryKey = useRef("");

  const ownerContext: LocalArchiveOwnerContext | null = useMemo(
    () => owner
      ? { userId: owner.userId, email: owner.email || null }
      : null,
    [owner],
  );
  const authenticatedOwnerContext = useMemo(
    () => resolveAuthenticatedOwnerContext(auth, ownerContext),
    [auth, ownerContext],
  );
  useEffect(() => {
    if (!online && quickAddDraft && screen.kind === "cloud-detail") {
      setScreen({ kind: "choose-project" });
    }
  }, [online, quickAddDraft, screen.kind]);

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

    if (!isAndroidOnline()) return;

    try {
      const [profileResult, membershipResult, experienceResult, accountResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, avatar_url, storage_used, storage_limit, location, country_code, country_name, region_name, city_name")
          .eq("id", userId)
          .maybeSingle(),
        supabase.rpc("get_my_membership"),
        supabase
          .from("experience_cards")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase.from("users").select("account_number").eq("id", userId).maybeSingle(),
      ]);

      const nextProfile = profileResult.error
        ? cached?.profile || null
        : profileResult.data ? {
            ...profileResult.data,
            account_number: accountResult.error ? cached?.profile?.account_number || null : accountResult.data?.account_number || null,
          } as ShellSpaceProfile : null;
      const nextMembership = membershipResult.error
        ? cached?.membership || null
        : normalizeMembershipRpcResult(membershipResult.data);
      const nextExperienceCardCount = experienceResult.error
        ? cached?.experienceCardCount || 0
        : Math.max(0, Number(experienceResult.count || 0));

      setSpaceProfile(nextProfile);
      setMembership(nextMembership);
      setExperienceCardCount(nextExperienceCardCount);
      writeShellIdentityCache(userId, {
        profile: nextProfile,
        membership: nextMembership,
        experienceCardCount: nextExperienceCardCount,
      });
    } catch (error) {
      console.warn("local shell identity", error);
    }
  }, []);

  const loadList = useCallback(async (context?: LocalArchiveOwnerContext | null) => {
    const resolvedContext = context === undefined ? ownerContext : context;
    const privateContext =
      authenticatedOwnerContext?.userId === resolvedContext?.userId
        ? authenticatedOwnerContext
        : null;
    const [result, cachedCloud, pending] = await Promise.all([
      listVisibleLocalArchiveSummaries(resolvedContext, {
        includePendingCloud: Boolean(privateContext),
      }),
      privateContext
        ? listVisibleCloudOfflineArchiveSummaries(privateContext)
        : Promise.resolve([]),
      privateContext
        ? listPendingCloudSyncSummaries(privateContext)
        : Promise.resolve([]),
    ]);
    setArchives(result.archives);
    setCloudCaches(cachedCloud);
    setUnownedCount(result.unownedCount);
    setPendingSync(pending);
    void listVisibleLocalTaxonomyItems(resolvedContext)
      .then((rows) => setLocalTaxonomy(mapLocalProjectTaxonomy(rows)))
      .catch((error) => console.warn("local taxonomy", error));
  }, [authenticatedOwnerContext, ownerContext]);

  const loadCloudList = useCallback(async (userId?: string | null) => {
    const resolvedUserId = userId || authenticatedOwnerContext?.userId;
    if (
      !isAndroidOnline() ||
      !resolvedUserId ||
      authenticatedOwnerContext?.userId !== resolvedUserId
    ) {
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
      if (!isAndroidOnline()) return;
      setCloudArchives(displayRows);
      setCloudError("");
      void Promise.all([loadCloudProjectTaxonomy(resolvedUserId), getCloudArchiveCategoryDepths(resolvedUserId)])
        .then(([entries, depths]) => { if (isAndroidOnline()) { setCloudTaxonomy(entries); setCloudDepths(depths); } })
        .catch((error) => console.warn("cloud taxonomy", error));
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
  }, [authenticatedOwnerContext, copy.cloudLoadFailed, loadList]);

  const loadDetail = useCallback(async (
    archiveId: string,
    context?: LocalArchiveOwnerContext | null,
  ) => {
    const result = await resolveLocalArchiveDetail(
      archiveId,
      context === undefined ? ownerContext : context,
    );
    setDetailStatus(result.status);
    setDetail(result.detail);
    return result.detail;
  }, [ownerContext]);

  const loadActivity = useCallback(async () => {
    if (!isAndroidOnline()) {
      setActivityItems([]);
      setActivityError(false);
      return;
    }
    setActivityLoading(true);
    setActivityError(false);
    try {
      const result = await fetchDiverseDiscoveryProjectBatch({
        state: createInitialDiscoveryDiversityState(),
        category: activityFilterMode === "all" || activityFilterMode === "help" ? null : activityFilterMode,
        helpOnly: activityHelpOnly,
        limit: 24,
      });
      if (result.error) throw result.error;
      if (isAndroidOnline()) setActivityItems(result.items);
    } catch (error) {
      console.warn("local shell discovery feed", error);
      setActivityError(true);
    } finally {
      setActivityLoading(false);
    }
  }, [activityFilterMode, activityHelpOnly]);

  const loadExperience = useCallback(async () => {
    if (!isAndroidOnline()) {
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
      if (isAndroidOnline()) setExperienceItems(items);
    } catch (error) {
      console.warn("local shell experience feed", error);
      setExperienceError(true);
    } finally {
      setExperienceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (online) return;
    connectivityEpoch.current += 1;
    lastRecoveryKey.current = "";
    setCloudArchives([]);
    setCloudTaxonomy([]);
    setActivityItems([]);
    setPublicDetailItem(null);
    setExperienceItems([]);
  }, [online]);

  useEffect(() => {
    if (auth.status === "checking") return;
    if (auth.status === "signed-in" && auth.sessionUserId) {
      if (owner?.userId !== auth.sessionUserId) {
        clearShellIdentityCache(owner?.userId);
        setCloudArchives([]);
        setCloudTaxonomy([]);
        setCloudCaches([]);
        setPendingSync([]);
        setSpaceProfile(null);
        setMembership(null);
        setExperienceCardCount(0);
      }
      const nextOwner = auth.rememberedOwner || {
        userId: auth.sessionUserId,
        email: auth.email,
      };
      setOwner(nextOwner);
      void loadList(nextOwner);
      if (online) void loadShellIdentity(auth.sessionUserId);
      return;
    }

    clearShellIdentityCache(owner?.userId);
    setCloudArchives([]);
    setCloudTaxonomy([]);
    setCloudCaches([]);
    setPendingSync([]);
    setSpaceProfile(null);
    setMembership(null);
    setExperienceCardCount(0);
    void loadList(ownerContext);
  }, [
    auth.email,
    auth.rememberedOwner,
    auth.sessionUserId,
    auth.status,
    loadList,
    loadShellIdentity,
    online,
    owner?.userId,
    ownerContext,
  ]);

  useEffect(() => {
    if (
      !online ||
      !cloudUserId ||
      !authenticatedOwnerContext ||
      authenticatedOwnerContext.userId !== cloudUserId
    ) return;
    const recoveryKey = `${connectivityEpoch.current}:${cloudUserId}`;
    if (lastRecoveryKey.current === recoveryKey) return;
    lastRecoveryKey.current = recoveryKey;

    void loadCloudList(cloudUserId);
    void loadShellIdentity(cloudUserId);
    void preparePendingCloudSyncQueue(authenticatedOwnerContext)
      .then(() => loadList(authenticatedOwnerContext))
      .then(() =>
        syncAllPendingCloudArchives({ ownerContext: authenticatedOwnerContext }).then(async (results) => {
          await loadList(authenticatedOwnerContext);
          if (results.some((result) => result.archiveUpdated)) await loadCloudList(cloudUserId);
          window.dispatchEvent(new Event("lifespace-cloud-sync-complete"));
          const warning = results.find((result) => result.taxonomyWarning)?.taxonomyWarning;
          if (warning) { setTaxonomySyncWarning(warning); showToast(warning); }
        }),
      )
      .catch(() => undefined);
  }, [online, cloudUserId, authenticatedOwnerContext, loadCloudList, loadList, loadShellIdentity, showToast]);

  useEffect(() => {
    if (screen.kind !== "activity" || !online) return;
    void loadActivity();
  }, [screen.kind, online, loadActivity]);

  useEffect(() => {
    if (screen.kind !== "experience" || !online) return;
    void loadExperience();
  }, [screen.kind, online, loadExperience]);

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
        void retireBundledLegacyServiceWorkers().catch((error) =>
          console.warn("bundled service worker retirement", error));
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
    if (loading) return;
    let canceled = false;
    setDetailStatus("loading");
    setDetail(null);
    void resolveLocalArchiveDetail(screen.archiveId, ownerContext).then((result) => {
      if (canceled) return;
      const requiresAuthenticatedOwner = Boolean(
        result.detail && (
          result.detail.archive.local_role === "cloud-offline-cache" ||
          localArchiveHasPendingCloudWork(
            result.detail.archive,
            result.detail.records,
            result.detail.records.flatMap((record) => record.images),
          )
        ),
      );
      if (requiresAuthenticatedOwner && !authenticatedOwnerContext) {
        setDetailStatus("forbidden");
        setDetail(null);
        return;
      }
      setDetailStatus(result.status);
      setDetail(result.detail);
    }).catch(() => {
      if (canceled) return;
      setDetailStatus("error");
      setDetail(null);
      showToast(copy.readFailed);
    });
    return () => { canceled = true; };
  }, [screen, ownerContext, authenticatedOwnerContext, showToast, copy.readFailed, loading]);

  function goList() {
    setScreen({ kind: "list" });
    setDetail(null);
    void loadList();
  }

  async function reconnect() {
    const nextOnline = await recheckAndroidConnectivity();
    if (!nextOnline) showToast(copy.offlineTitle);
  }

  function openDetail(archiveId: string) {
    const item = [
      ...archives,
      ...(authenticatedOwnerContext ? cloudCaches : []),
    ].find((row) => row.id === archiveId);
    if (item) saveRecentArchiveBrowse({ id: item.id, title: item.title,
      systemName: item.system_name || item.species_name, category: item.category, userId: item.local_owner_user_id });
    setScreen({ kind: "detail", archiveId }, ["edit-project", "new-project", "new-record", "edit-record"].includes(screen.kind));
  }

  function openOnlineWeb(pathname: string, search = "") {
    if (!online) { showToast(copy.needNetwork); return; }
    // The native custom tab resolves the remote host outside WebViewLocalServer.
    // Closing it returns to the same bundled React document.
    const url = new URL(pathname + search, "https://life-space.uk");
    if (url.origin !== "https://life-space.uk") return;
    void Browser.open({ url: url.href }).catch(() => showToast(copy.webOnly));
  }

  function applyShellPath(pathname: string, search = "") {
    const routed = parseAndroidShellPath(pathname, search);
    if (!routed) return false;
    if (routed.kind === "network-required") {
      openOnlineWeb(pathname, search);
      return true;
    }
    if (routed.kind === "recent" || routed.kind === "trash") {
      setScreen({ kind: routed.kind });
      return true;
    }
    if (routed.kind === "list") {
      setScreen({ kind: "list" });
      return true;
    }
    if (routed.kind === "profile") {
      setScreen({ kind: "profile" });
      return true;
    }
    if (routed.kind === "project-categories") {
      setScreen({ kind: "project-categories" });
      return true;
    }
    if (routed.kind === "activity") {
      setScreen({ kind: "activity" });
      return true;
    }
    if (routed.kind === "discover-search") {
      setScreen({ kind: "discover-search" });
      return true;
    }
    if (routed.kind === "experience") {
      setScreen({ kind: "experience" });
      return true;
    }
    if (routed.kind === "following") {
      setScreen({ kind: "following" });
      return true;
    }
    if (routed.kind === "market") {
      setScreen({ kind: "market" });
      return true;
    }
    if (routed.kind === "market-detail" && routed.id) {
      setScreen({ kind: "market-detail", id: routed.id });
      return true;
    }
    if (routed.kind === "guides") {
      setScreen({ kind: "guides" });
      return true;
    }
    if (routed.kind === "guide-detail" && routed.id) {
      const match = findOfflineGuideEntry(directory, routed.id);
      setScreen({
        kind: "guide-detail",
        guideKey: match ? getOfflineGuideKey(match) : routed.id,
        guideId: routed.id,
      });
      return true;
    }
    if (routed.kind === "local-archive" && routed.id) {
      openDetail(routed.id);
      return true;
    }
    if (routed.kind === "archive" && routed.id) {
      const publicItem = activityItems.find((row) => row.archive_id === routed.id);
      const target = resolveAndroidArchiveScreen({
        online,
        archiveId: routed.id,
        cloudUserId: authenticatedOwnerContext?.userId || null,
        cloudArchives,
        activityOwnerUserId: publicItem?.owner_user_id || null,
        hasPublicFeedItem: Boolean(publicItem),
        ownedLocalArchives: [
          ...archives,
          ...(authenticatedOwnerContext ? cloudCaches : []),
        ],
      });
      if (target.kind === "cloud-detail") {
        setScreen({ kind: "cloud-detail", archiveId: target.archiveId });
        return true;
      }
      if (target.kind === "local-detail") {
        openDetail(target.archiveId);
        return true;
      }
      if (target.kind === "public-detail" && publicItem) {
        setPublicDetailItem(publicItem);
        setPublicDetailBack("activity");
        setScreen({ kind: "public-detail" });
        return true;
      }
      if (target.kind === "public-cloud-detail") {
        const back = screen.kind === "activity" || screen.kind === "discover-search" ||
          screen.kind === "experience" || screen.kind === "following" || screen.kind === "market"
          ? screen.kind : "list";
        setScreen({ kind: "public-cloud-detail", archiveId: target.archiveId, back });
        return true;
      }
      if (!authenticatedOwnerContext) {
        showToast(copy.cloudSignIn);
        return true;
      }
      void Promise.all([
        getCloudOfflineCacheByCloudSource(routed.id, authenticatedOwnerContext),
        getLocalArchiveByCloudSource(routed.id, authenticatedOwnerContext),
      ]).then(([cache, localCopy]) => {
        const mapped = cache || localCopy;
        if (mapped) {
          openDetail(mapped.id);
          return;
        }
        showToast(copy.needNetwork);
      }).catch(() => showToast(copy.needNetwork));
      return true;
    }
    return false;
  }

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      if (anchor.dataset.shellHandled === "true") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (applyShellPath(url.pathname, url.search)) {
        event.preventDefault();
        // Let the shared card's onClick run (for example, Follow's unread
        // marker). Next Link sees defaultPrevented and cannot navigate away.
        return;
      }
      // A same-origin website document would replace the bundled React tree.
      // Unsupported routes remain in this document until their controller exists.
      event.preventDefault();
      event.stopPropagation();
      showToast(online ? copy.webOnly : copy.needNetwork);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [
    activityItems,
    archives,
    cloudArchives,
    cloudUserId,
    cloudCaches,
    copy.cloudSignIn,
    copy.needNetwork,
    directory,
    authenticatedOwnerContext,
    ownerContext,
    online,
    showToast,
  ]);

  async function logoutFromProfile() {
    await explicitAndroidLogout();
    setScreen({ kind: "list" });
  }

  async function uploadPending(localArchiveId: string) {
    if (!authenticatedOwnerContext || !cloudUserId) {
      showToast(copy.cloudSignIn);
      return;
    }

    setSyncingArchiveId(localArchiveId);
    try {
      const result = await syncPendingCloudArchive({
        localArchiveId,
        ownerContext: authenticatedOwnerContext,
      });
      await loadList(authenticatedOwnerContext);
      if (result.archiveUpdated) await loadCloudList(cloudUserId);
      if (result.taxonomyWarning) setTaxonomySyncWarning(result.taxonomyWarning);
      window.dispatchEvent(new Event("lifespace-cloud-sync-complete"));
      showToast(
        result.taxonomyWarning || (result.success ? copy.uploadSuccess : result.error || copy.uploadFailed),
      );
    } finally {
      setSyncingArchiveId(null);
    }
  }

  async function deferPending(localArchiveId: string) {
    if (!authenticatedOwnerContext) return;
    await deferPendingCloudSyncPrompt(localArchiveId, authenticatedOwnerContext);
    await loadList(authenticatedOwnerContext);
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

  function toggleLanguage(next?: Language) {
    const resolved = next === "zh" || next === "en" ? next : (language === "zh" ? "en" : "zh");
    setLanguage(resolved);
    setStoredLanguage(resolved);
    window.dispatchEvent(new CustomEvent("lifespace-language-change", { detail: resolved }));
  }

  const activeGuide = screen.kind === "guide-detail"
    ? findOfflineGuideEntry(directory, screen.guideKey)
    : undefined;
  const cachedTaxonomy: ProjectTaxonomyEntry[] = authenticatedOwnerContext
    ? readCloudTaxonomySnapshot(authenticatedOwnerContext.userId || null) : [];
  const currentCloudTaxonomy = online && authenticatedOwnerContext
    ? cloudTaxonomy
    : authenticatedOwnerContext
      ? cachedTaxonomy
      : [];
  const selectedTaxonomy = sourceFilter === "local" ? localTaxonomy
    : sourceFilter === "cloud" ? currentCloudTaxonomy : [...currentCloudTaxonomy, ...localTaxonomy];
  const visibleSubcategories = selectedTaxonomy.filter((item) => item.kind === "subcategory" && item.category === categoryFilter);
  const visibleGroups = selectedTaxonomy.filter((item) => item.kind === "group" && item.parentId === subcategoryFilter);
  const subcategoryLabel = selectedTaxonomy.find((item) => item.id === subcategoryFilter)?.label;
  const groupLabel = selectedTaxonomy.find((item) => item.id === groupFilter)?.label;
  const filterCategory = (archive: { category?: string | null }) => categoryFilter === "all" || archive.category === categoryFilter;
  const filteredLocalArchives = archives.filter((archive) => filterCategory(archive) &&
    (!subcategoryFilter || archive.subcategory === subcategoryLabel) &&
    (!groupFilter || archive.group_name === groupLabel));
  const filteredCloudCaches = cloudCaches.filter((archive) => filterCategory(archive) &&
    (!subcategoryFilter || archive.subcategory === subcategoryLabel) &&
    (!groupFilter || archive.group_name === groupLabel));
  const liveCloudWorkspace =
    online &&
    Boolean(authenticatedOwnerContext) &&
    !cloudError;
  const filteredCloudArchives = cloudArchives.filter((archive) => filterCategory(archive) &&
    (!subcategoryFilter || archive.sub_tag_id === subcategoryFilter) &&
    (!groupFilter || archive.group_tag_id === groupFilter));
  const activeDepths = sourceFilter === "local" ? getLocalArchiveCategoryDepths(ownerContext?.userId) : cloudDepths;
  const cloudSourceCount = liveCloudWorkspace ? cloudArchives.length : cloudCaches.length;
  const visibleExperienceItems = experienceItems.filter((item) => {
    if (experienceCategoryFilter !== "all" && item.archiveCategory !== experienceCategoryFilter) {
      return false;
    }
    const query = experienceQuery.trim().toLowerCase();
    if (!query) return true;
    return [item.title, item.authorName, item.systemName, item.archiveTitle]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  function changeActivityFilter(mode: FilterMode) {
    if (mode === "help") {
      setActivityHelpOnly((current) => !current);
      return;
    }
    setActivityFilterMode(mode);
    setActivityHelpOnly(false);
  }
  function cloudProjectView(archive: CloudArchiveSummary) {
    const ended = archive.status === "ended";
    const category = archive.category as ArchiveCategory;
    return {
      id: archive.id,
      mode: "cloud" as const,
      title: archive.title || copy.project,
      category,
      categoryLabel: getArchiveCategoryLabel(archive.category as ArchiveCategory, language),
      categoryIcon: getArchiveCategoryIcon(archive.category as ArchiveCategory),
      subcategoryLabel: cloudDepths[category] >= 2
        ? cloudTaxonomy.find((item) => item.id === archive.sub_tag_id)?.label || null : null,
      groupLabel: cloudDepths[category] >= 3
        ? cloudTaxonomy.find((item) => item.id === archive.group_tag_id)?.label || null : null,
      systemName:
        archive.category === "plant"
          ? archive.species_name_snapshot || ""
          : archive.system_name || "",
      cover: liveCloudCardImageUrl(archive)
        ? {
            kind: "url" as const,
            url: liveCloudCardImageUrl(archive) || "",
            alt: archive.title || copy.project,
          }
        : null,
      latestText: "",
      latestTime: archive.last_record_time || archive.created_at || null,
      recordCount: Number(archive.record_count || 0),
      durationDays: getOngoingDays(archive.created_at),
      viewCount: Number(archive.view_count || 0),
      visibilityLabel: archive.is_public
        ? language === "zh" ? "公开" : "Public"
        : copy.private,
      visibilityTone: archive.is_public ? "public" as const : "private" as const,
      statusLabel: ended ? copy.ended : null,
      ended,
      showClassificationRow: cloudDepths[category] >= 2,
    };
  }

  function renderCloudProjectCard(archive: CloudArchiveSummary) {
    return (
      <ArchiveProjectCard
        key={archive.id}
        project={cloudProjectView(archive)}
        mobileMode
        mobileShowCategoryBadge={false}
        actionSlot={renderProjectActions(archive, "cloud")}
        onClick={() => {
          saveRecentArchiveBrowse({ id: archive.id, title: archive.title,
            systemName: archive.system_name || archive.species_name_snapshot,
            category: archive.category, userId: cloudUserId });
          setScreen({ kind: "cloud-detail", archiveId: archive.id });
        }}
      />
    );
  }
  function renderProjectActions(archive: CloudArchiveSummary | LocalArchiveSummary, source: "cloud" | "local" | "cache") {
    const category = archive.category as ArchiveCategory;
    const taxonomy = source === "local" ? localTaxonomy : cloudTaxonomy;
    const subTags = taxonomy.filter((item) => item.kind === "subcategory")
      .map((item) => ({ id: item.id, name: item.label, category: item.category }));
    const groupTags = taxonomy.filter((item) => item.kind === "group" && item.parentId)
      .map((item) => ({ id: item.id, name: item.label, sub_tag_id: item.parentId! }));
    const local = source === "cloud" ? null : archive as LocalArchiveSummary;
    const subId = source === "cloud" ? (archive as CloudArchiveSummary).sub_tag_id
      : subTags.find((item) => item.category === category && item.name === local?.subcategory)?.id;
    const groupId = source === "cloud" ? (archive as CloudArchiveSummary).group_tag_id
      : groupTags.find((item) => item.sub_tag_id === subId && item.name === local?.group_name)?.id;
    const refresh = async () => {
      if (source === "cloud") await loadCloudList(cloudUserId);
      else await loadList();
      if (screen.kind === "detail" && screen.archiveId === archive.id) await loadDetail(archive.id);
    };
    const mutate = async (fields: Record<string, string | null | boolean>) => {
      try {
        if (source === "cloud" && cloudUserId && online) {
          const result = await supabase.from("archives").update(fields)
            .eq("id", archive.id).eq("user_id", cloudUserId);
          if (result.error) throw result.error;
        } else if (source === "local") {
          await updateLocalArchiveFields(archive.id, fields, ownerContext);
        } else return;
        await refresh();
      } catch (error) { showToast(error instanceof Error ? error.message : String(error)); }
    };
    return <MobileArchiveActions
      category={category} subTagId={subId} groupTagId={groupId}
      subTags={subTags} groupTags={groupTags}
      categoryDepths={source === "local" ? getLocalArchiveCategoryDepths(ownerContext?.userId) : cloudDepths}
      ended={archive.status === "ended"}
      isPublic={source === "cloud" && Boolean((archive as CloudArchiveSummary).is_public)}
      allowTaxonomyEdit={source !== "cache"}
      taxonomyUnavailableLabel={source === "cache" ? (language === "zh" ? "联网后修改分类/分组" : "Connect to edit categories") : undefined}
      onChangeCategory={(value) => {
        const sub = subTags.find((item) => item.id === value);
        const next = sub ? sub.category : value as ArchiveCategory;
        void mutate(source === "cloud"
          ? { category: next, sub_tag_id: sub?.id || null, group_tag_id: null }
          : { category: next, subcategory: sub?.name || null, group_name: null });
      }}
      onChangeGroup={(value) => void mutate(source === "cloud"
        ? { group_tag_id: value || null }
        : { group_name: groupTags.find((item) => item.id === value)?.name || null })}
      onToggleEnded={source === "cache" ? undefined : () => void mutate({ status: archive.status === "ended" ? "active" : "ended", ended_at: archive.status === "ended" ? null : new Date().toISOString() })}
      onTogglePublic={source === "cloud" ? () => void mutate({ is_public: !(archive as CloudArchiveSummary).is_public }) : undefined}
      onMoveToTrash={source === "local" ? () => {
        if (!window.confirm(language === "zh" ? "将本机项目移入回收站？" : "Move this device project to trash?")) return;
        void setLocalProjectTrashed(archive.id, true, ownerContext)
          .then(() => loadList()).catch((cause) => showToast(cause instanceof Error ? cause.message : String(cause)));
      } : source === "cloud" ? () => {
        if (window.confirm(language === "zh" ? "将云项目移入回收站？" : "Move this cloud project to trash?"))
          void mutate({ trashed_at: new Date().toISOString() });
      } : undefined}
    />;
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
        active: screen.kind === "market" || screen.kind === "market-detail",
        onSelect: () => setScreen({ kind: "market" }),
      };
    }
    return {
      ...item,
      active: !["activity", "experience", "following", "market", "market-detail", "guides", "guide-detail", "discover-search", "public-detail"].includes(screen.kind),
      onSelect: goList,
    };
  }) as [
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
  ];

  const homeSectionOwnsTopNav = ["list", "activity", "discover-search", "experience", "guides", "following", "market", "market-detail", "profile", "project-categories", "guide-detail", "public-detail"].includes(screen.kind);
  const detailOwnsTopNav = ["detail", "cloud-detail", "public-cloud-detail", "edit-project", "new-record", "edit-record", "new-project"].includes(screen.kind);
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
    : "—";
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
    <InternalNavigationProvider
      onNavigate={(href) => {
        try {
          const url = new URL(href, window.location.origin);
          if (url.origin !== window.location.origin) return false;
          if (applyShellPath(url.pathname, url.search)) return true;
          showToast(online ? copy.webOnly : copy.needNetwork);
          return true;
        } catch {
          return false;
        }
      }}
    >
    <main className="offline-shell">
      {!homeSectionOwnsTopNav && !detailOwnsTopNav ? (
        <MobilePageHeaderView
          className="android-shell-header"
          title={shellHeaderTitle}
          titleText={shellHeaderTitle}
          showBack={false}
          ariaLabel={shellHeaderTitle}
          right={(
            <div className="header-actions">
              {!owner ? (
                <button className="icon-button" type="button" onClick={() => toggleLanguage()}>
                  {language === "zh" ? "EN" : "中文"}
                </button>
              ) : null}
              <button
                className="icon-button"
                type="button"
                aria-label={copy.settings}
                onClick={() => setScreen({ kind: "profile" })}
              >
                <UiIcon name="menu" size={22} />
              </button>
            </div>
          )}
        />
      ) : null}

      {screen.kind === "list" ? (
        <PersonalSpaceMobileIdentity
          avatarUrl={spaceProfile?.avatar_url}
          username={
            spaceProfile?.username ||
            owner?.email ||
            (language === "zh" ? "我的空间" : "My space")
          }
          membershipLabel={membershipLabel}
          storageUsagePercent={storageUsagePercent}
          storageTotalLabel={storageTotalLabel}
          experienceLabel={language === "zh" ? "经验卡" : "Experience"}
          experienceCardCount={experienceCardCount}
          language={language}
          profileHref="/profile"
        />
      ) : null}

      {online && authenticatedOwnerContext && pendingSync.find((item) => item.should_prompt) ? (() => {
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
      {taxonomySyncWarning ? <section className="notice warning" role="status"><p>{taxonomySyncWarning}</p><button type="button" onClick={() => setTaxonomySyncWarning(null)}>{language === "zh" ? "知道了" : "Dismiss"}</button></section> : null}

      {screen.kind === "list" ? (
        <div data-android-shell-page="personal-space">
        <ArchiveWorkspaceTemplate<ShellSourceFilter>
          online={online}
          sourceOptions={[
            { value: "all", label: copy.all, count: archives.length + cloudSourceCount },
            { value: "cloud", label: copy.cloud, count: cloudSourceCount },
            { value: "local", label: copy.local, count: archives.length },
          ]}
          activeSource={sourceFilter}
          onSelectSource={(source) => {
            setSourceFilter(source);
            setSubcategoryFilter(null);
            setGroupFilter(null);
            setScreen({ kind: "list" });
          }}
          onCreateArchive={() => setScreen({ kind: "project-destination" })}
          showCreateToolbar={false}
          sourceTrailingSlot={(
            <button type="button" onClick={() => setScreen({ kind: "project-destination" })}>
              +{copy.project}
            </button>
          )}
          filtersSlot={(
            <ArchiveTaxonomyPanel
              activeCategory={categoryFilter === "all" ? null : categoryFilter}
              activeSubcategoryId={subcategoryFilter}
              activeGroupId={groupFilter}
              subcategories={visibleSubcategories}
              groups={visibleGroups}
              mobileMode
              showSubcategoryRow={categoryFilter !== "all" && activeDepths[categoryFilter] >= 2}
              showGroupRow={categoryFilter !== "all" && activeDepths[categoryFilter] >= 3}
              onReset={() => { setCategoryFilter("all"); setSubcategoryFilter(null); setGroupFilter(null); }}
              onSelectCategory={(category) => { setCategoryFilter(category); setSubcategoryFilter(null); setGroupFilter(null); }}
              onResetSubcategory={() => { setSubcategoryFilter(null); setGroupFilter(null); }}
              onSelectSubcategory={(chip) => { setSubcategoryFilter(chip.id); setGroupFilter(null); }}
              onResetGroup={() => setGroupFilter(null)}
              onSelectGroup={(chip) => setGroupFilter(chip.id)}
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
            liveCloudWorkspace ? (
              <>
                {cloudLoading ? <section className="panel empty">{copy.cloudLoading}</section> : null}
                {!cloudLoading && filteredCloudArchives.length ? (
                  <div className="project-list" data-android-live-cloud-list="true">
                    {filteredCloudArchives.map(renderCloudProjectCard)}
                  </div>
                ) : null}
                {!cloudLoading && sourceFilter === "cloud" && filteredCloudArchives.length === 0 ? (
                  <section className="panel empty"><strong>{copy.cloudProjects}</strong>{copy.noProjects}</section>
                ) : null}
              </>
            ) : (
              <>
                {online && auth.status === "signed-out" && sourceFilter === "cloud" ? (
                  <CloudLogin copy={copy} onSuccess={() => undefined} />
                ) : null}
                {cloudError && cloudUserId ? <section className="notice warning"><p>{cloudError}</p></section> : null}
                {auth.status === "signed-in" &&
                (!online || Boolean(cloudError)) &&
                filteredCloudCaches.length ? (
                  <div className="project-list" data-android-cloud-cache-list="true">
                    {filteredCloudCaches.map((archive) => (
                      <ArchiveProjectCard
                        key={archive.id}
                        project={{
                          ...localArchiveToProjectView(archive, ownerContext, language, cloudDepths[archive.category]),
                          href: undefined,
                        }}
                        onClick={() => openDetail(archive.id)}
                        mobileMode
                        mobileShowCategoryBadge={false}
                        actionSlot={renderProjectActions(archive, "cache")}
                      />
                    ))}
                  </div>
                ) : sourceFilter === "cloud" && (!online || Boolean(cloudError)) ? (
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
                      ...localArchiveToProjectView(archive, ownerContext, language, getLocalArchiveCategoryDepths(ownerContext?.userId)[archive.category]),
                      href: undefined,
                    }}
                    onClick={() => openDetail(archive.id)}
                    mobileMode
                    mobileShowCategoryBadge={false}
                    actionSlot={renderProjectActions(archive, "local")}
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
          (liveCloudWorkspace
            ? !cloudLoading && filteredCloudArchives.length === 0
            : filteredCloudCaches.length === 0) ? (
            <section className="panel empty">
              <strong>{copy.noProjects}</strong>
              {copy.noProjectsHint}
            </section>
          ) : null}
        </ArchiveWorkspaceTemplate>
        </div>
      ) : null}

      {screen.kind === "new-project" ? (
        <ProjectForm
          language={language}
          copy={copy}
          owner={screen.destination === "local-only" ? owner : authenticatedOwnerContext as StoredLocalOwnerContext | null}
          destination={screen.destination || "local-only"}
          cloudTaxonomy={online ? cloudTaxonomy : cachedTaxonomy}
          cloudDepths={cloudDepths}
          guide={screen.guide}
          onCancel={() => quickAddDraft ? setScreen({ kind: "choose-project" }) : goList()}
          onSaved={async (archive) => {
            await loadList();
            showToast(
              archive.sync?.operation_kind === "create-archive"
                ? copy.createPendingCloudSuccess
                : copy.createSuccess,
            );
            if (quickAddDraft) setScreen({ kind: "new-record", archiveId: archive.id });
            else openDetail(archive.id);
          }}
          onLiveSaved={async (id) => {
            await loadCloudList(authenticatedOwnerContext?.userId);
            setScreen({ kind: "cloud-detail", archiveId: id });
            showToast(copy.createSuccess);
          }}
        />
      ) : null}

      {screen.kind === "detail" ? (
        <MobileShellErrorBoundary
          routeKind="detail"
          archiveId={"archiveId" in screen ? screen.archiveId : null}
          title={language === "zh" ? "无法打开项目" : "Could not open project"}
          message={language === "zh" ? "页面加载出错。" : "This page failed to render."}
          backLabel={language === "zh" ? "返回我的空间" : "Back to My Space"}
          retryLabel={language === "zh" ? "重试" : "Retry"}
          onBack={goList}
          onRetry={() => {
            if ("archiveId" in screen) openDetail(screen.archiveId);
          }}
        >
          {detailStatus === "loading" || detailStatus === "idle" ? (
            <ArchiveProjectDetailLoading>{copy.loading}</ArchiveProjectDetailLoading>
          ) : detailStatus === "ready" && detail ? (
            <>
              <DeviceOwnedProjectDetail
                view={ArchiveProjectDetailView}
                detail={detail}
                ownerContext={ownerContext}
                onChanged={async () => { await loadDetail(detail.archive.id); await loadList(); }}
                onBack={goList}
                onAddRecord={() => setScreen({ kind: "new-record", archiveId: detail.archive.id })}
                onDeleteArchive={() => void handleDeleteArchive(detail.archive.id)}
                onDeleteRecord={(recordId) => void handleDeleteRecord(recordId, detail.archive.id)}
              />
              {online && authenticatedOwnerContext && pendingSync.some((item) => item.local_archive_id === detail.archive.id) ? (
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
          ) : (
            <ArchiveProjectDetailStatus
              status={detailStatus === "forbidden" || detailStatus === "not-found" || detailStatus === "error" ? detailStatus : "error"}
              title={detailStatus === "forbidden"
                ? (language === "zh" ? "无法访问该项目" : "This project is not available")
                : detailStatus === "not-found"
                  ? (language === "zh" ? "找不到项目" : "Project not found")
                  : (language === "zh" ? "加载失败" : "Could not load project")}
              message={detailStatus === "forbidden"
                ? (language === "zh" ? "当前账号不能打开这个项目。" : "The current account cannot open this project.")
                : detailStatus === "not-found"
                  ? (language === "zh" ? "这个项目不存在或无法找到。" : "This project does not exist or could not be found.")
                  : (language === "zh" ? "项目加载失败，请重试。" : "The project failed to load. Please retry.")}
              backLabel={language === "zh" ? "返回我的空间" : "Back to My Space"}
              retryLabel={language === "zh" ? "重试" : "Retry"}
              onBack={goList}
              onRetry={detailStatus === "error" ? () => {
                if ("archiveId" in screen) openDetail(screen.archiveId);
              } : undefined}
            />
          )}
        </MobileShellErrorBoundary>
      ) : null}

      {screen.kind === "cloud-detail" ? (
        <MobileShellErrorBoundary routeKind="cloud-detail" archiveId={screen.archiveId}
          title={language === "zh" ? "无法打开云项目" : "Could not open cloud project"}
          message={language === "zh" ? "项目详情加载失败。" : "The project failed to render."}
          backLabel={copy.mySpace} onBack={goList}>
          <CloudProjectRuntime
            key={`${screen.archiveId}:${online}:${authenticatedOwnerContext?.userId || "signed-out"}`}
            archiveId={screen.archiveId}
            online={online}
            authenticatedOwnerContext={authenticatedOwnerContext}
            onBack={goList}
            onCacheChanged={() => loadList(authenticatedOwnerContext)}
            onAddRecord={(id) => setScreen({ kind: "new-record", archiveId: id })}
            onDeleteArchive={(id) => void handleDeleteArchive(id)}
            onDeleteRecord={(recordId, id) => void handleDeleteRecord(recordId, id)}
            quickAddDraft={quickAddDraft}
            onQuickAddSaved={() => setQuickAddDraft(null)}
          />
        </MobileShellErrorBoundary>
      ) : null}

      {screen.kind === "public-cloud-detail" ? (
        !online ? (
          <MobileNetworkUnavailableState onReconnect={reconnect} />
        ) : (
        <MobileShellErrorBoundary routeKind="public-cloud-detail" archiveId={screen.archiveId}
          title={language === "zh" ? "无法打开公开项目" : "Could not open public project"}
          message={language === "zh" ? "项目详情加载失败。" : "The project failed to render."}
          backLabel={copy.mySpace} onBack={() => setScreen({ kind: screen.back })}>
          <PublicCloudArchiveRouteController key={screen.archiveId}
            archiveId={screen.archiveId} userId={cloudUserId} online={online} language={language}
            onBack={() => setScreen({ kind: screen.back })}
            onOwned={() => setScreen({ kind: "cloud-detail", archiveId: screen.archiveId }, true)} />
        </MobileShellErrorBoundary>
        )
      ) : null}

      {screen.kind === "edit-project" && detail ? (
        <ProjectForm
          language={language}
          copy={copy}
          owner={owner}
          destination={detail.archive.sync.operation_kind === "create-archive" ? "pending-cloud" : "local-only"}
          cloudTaxonomy={online ? cloudTaxonomy : cachedTaxonomy}
          cloudDepths={cloudDepths}
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

      {screen.kind === "new-record" && detail?.archive.id === screen.archiveId ? (
        <RecordForm
          copy={copy}
          archive={detail.archive}
          language={language}
          initialFiles={quickAddDraft?.files}
          initialCapturedAt={quickAddDraft?.capturedAt}
          initialNote={quickAddDraft?.note}
          onCancel={() => { setQuickAddDraft(null); openDetail(detail.archive.id); }}
          onSaved={async () => {
            setQuickAddDraft(null);
            await loadDetail(detail.archive.id);
            await loadList();
            showToast(copy.recordSuccess);
            openDetail(detail.archive.id);
          }}
        />
      ) : null}

      {screen.kind === "edit-record" && detail ? (
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
        <div data-android-shell-page="discover">
          <DiscoverFilterBar
            options={getDiscoverFilterOptions(language)}
            activeMode={activityFilterMode}
            helpOnly={activityHelpOnly}
            onChange={changeActivityFilter}
            compactMobile
          />
          {!online ? (
            <MobileNetworkUnavailableState onReconnect={reconnect} />
          ) : (
            <DiscoverProjectGrid
              items={activityItems}
              helpOnly={activityHelpOnly}
              showCategoryBadge={activityFilterMode === "all"}
              initialLoading={activityLoading}
              loadingMore={false}
              initialError={activityError}
              loadMoreError={false}
              hasMore={false}
              loaderRef={activityLoaderRef}
              onRetryInitial={() => void loadActivity()}
              onRetryMore={() => undefined}
              onOpenProject={(item) => {
                setPublicDetailItem(item);
                setPublicDetailBack("activity");
                setScreen({ kind: "public-detail" });
              }}
            />
          )}
        </div>
      </> : null}

      {screen.kind === "public-detail" ? (
        !online ? (
          <MobileNetworkUnavailableState onReconnect={reconnect} />
        ) : publicDetailItem ? (
          <ReadonlyPublicProjectDetail item={publicDetailItem} language={language} onBack={() => setScreen({ kind: publicDetailBack })} />
        ) : null
      ) : null}

      {screen.kind === "discover-search" ? (
        !online ? (
          <MobileNetworkUnavailableState onReconnect={reconnect} />
        ) : (
          <DiscoverSearchPage onBack={() => setScreen({ kind: "activity" })} onOpenProject={(item) => { setPublicDetailItem(item); setPublicDetailBack("discover-search"); setScreen({ kind: "public-detail" }); }} />
        )
      ) : null}

      {screen.kind === "experience" ? <>
        <HomeSectionTabs
          active="experience"
          showGuestLanguageSwitcher={false}
          onSearch={() => setExperienceSearchOpen((open) => !open)}
          onSelect={(section: HomeSection) => {
            if (section === "experience") return;
            if (section === "guide") {
              setScreen({ kind: "guides" });
              return;
            }
            setScreen({ kind: "activity" });
          }}
        />
        <section className={`${filterStyles.row} ${filterStyles.experience}`} lang={language} aria-label={language === "en" ? "Category" : "分类"}>
          <button
            type="button"
            onClick={() => setExperienceCategoryFilter("all")}
            className={filterStyles.button}
            aria-pressed={experienceCategoryFilter === "all"}
          >
            {language === "en" ? "All" : "全部"}
          </button>
          {archiveCategoryOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setExperienceCategoryFilter(option.value)}
              className={filterStyles.button}
              aria-pressed={experienceCategoryFilter === option.value}
            >
              <CategoryLabel label={getArchiveCategoryLabel(option.value, language)} />
            </button>
          ))}
        </section>
        {experienceSearchOpen ? (
          <MobileSearchField
            autoFocus
            value={experienceQuery}
            onChange={setExperienceQuery}
            placeholder={language === "zh" ? "搜索经验" : "Search experience"}
            ariaLabel={language === "zh" ? "搜索经验" : "Search experience"}
            clearAriaLabel={language === "zh" ? "清除" : "Clear"}
            onClear={() => setExperienceQuery("")}
          />
        ) : null}
        {!online ? (
          <MobileNetworkUnavailableState onReconnect={reconnect} />
        ) : experienceLoading ? (
          <section className="panel empty">
            {language === "zh" ? "正在读取经验…" : "Loading experience…"}
          </section>
        ) : experienceError ? (
          <section className="notice warning">
            <p>{language === "zh" ? "经验读取失败，请稍后重试。" : "Could not load experience."}</p>
            <div className="action-row">
              <button type="button" className="secondary-button" onClick={() => void loadExperience()}>
                {language === "zh" ? "重新加载" : "Retry"}
              </button>
            </div>
          </section>
        ) : visibleExperienceItems.length ? (
          <PublicExperienceGallery
            items={visibleExperienceItems}
            showCategoryBadge={experienceCategoryFilter === "all"}
          />
        ) : (
          <section className="panel empty">
            {language === "zh" ? "暂时没有公开经验。" : "No public experience yet."}
          </section>
        )}
      </> : null}

      {screen.kind === "following" ? (
        <div data-android-shell-page="following">
          {online && auth.status === "signed-out" ? (
            <CloudLogin copy={copy} onSuccess={() => setScreen({ kind: "following" })} />
          ) : auth.status === "checking" ? (
            <section className="panel empty">{copy.cloudLoading}</section>
          ) : (
            <FollowPage />
          )}
        </div>
      ) : null}

      {screen.kind === "market" ? (
        <div data-android-shell-page="market">
          <MarketPage />
        </div>
      ) : null}

      {screen.kind === "market-detail" ? <AndroidMarketDetailController id={screen.id}
        online={online} onBack={() => setScreen({ kind: "market" })} /> : null}

      {screen.kind === "guides" ? (
        <div data-android-shell-page="guides">
          <PlantPage offline={!online} offlineDirectory={directory} offlineSignedIn={auth.status === "signed-in"} />
        </div>
      ) : null}
      {screen.kind === "profile" ? (
        <div data-android-shell-page="profile">
          <MobileShellErrorBoundary
            routeKind="profile"
            title={language === "zh" ? "无法打开资料" : "Could not open profile"}
            message={language === "zh" ? "页面加载出错。" : "This page failed to render."}
            backLabel={language === "zh" ? "返回我的空间" : "Back to My Space"}
            onBack={goList}
          >
            <AndroidProfileController
              snapshot={buildOfflineProfileSnapshot({
                owner: auth.status === "signed-in" ? owner : null,
                profile: auth.status === "signed-in" ? spaceProfile : null,
                membership: auth.status === "signed-in" ? membership : null,
                experienceCardCount: auth.status === "signed-in" ? experienceCardCount : null,
              })}
              online={online && cloudUserId === owner?.userId}
              onBack={() => setScreen({ kind: "list" })}
              onLogout={auth.status === "signed-in" ? () => void logoutFromProfile() : undefined}
              onProfileSaved={() => cloudUserId ? void loadShellIdentity(cloudUserId) : undefined}
            />
          </MobileShellErrorBoundary>
        </div>
      ) : null}

      {screen.kind === "project-categories" ? (
        <div data-android-shell-page="project-categories">
          <MobileShellErrorBoundary
            routeKind="project-categories"
            title={language === "zh" ? "无法打开分组设置" : "Could not open group settings"}
            message={language === "zh" ? "页面加载出错。" : "This page failed to render."}
            backLabel={language === "zh" ? "返回资料" : "Back to profile"}
            onBack={() => setScreen({ kind: "profile" })}
          >
            <OfflineProjectCategorySettings
              ownerUserId={ownerContext?.userId || owner?.userId || ""}
              online={online}
              cloudUserId={cloudUserId}
              cachedEntries={cachedTaxonomy}
              onBack={() => setScreen({ kind: "profile" })}
            />
          </MobileShellErrorBoundary>
        </div>
      ) : null}
      {screen.kind === "recent" ? <AndroidRecentBrowse
        online={online}
        onBack={() => setScreen({ kind: "profile" })}
        onOpen={(id) => { applyShellPath(`${[...archives, ...(authenticatedOwnerContext ? cloudCaches : [])].some((row) => row.id === id) ? "/local" : ""}/archive/${encodeURIComponent(id)}`); }}
      /> : null}
      {screen.kind === "trash" ? <AndroidLocalTrash ownerContext={ownerContext}
        online={online} onBack={() => setScreen({ kind: "profile" })} /> : null}
      {screen.kind === "guide-detail" ? <GuideDetailView id={screen.guideId || screen.guideKey} offline={!online} offlineGuide={activeGuide} offlineSignedIn={auth.status === "signed-in"} onBack={() => window.history.back()} onCreate={(guide) => setScreen({ kind: "new-project", guide })} /> : null}
      {screen.kind === "quick-add" ? <section className="panel quick-add-sheet" role="dialog" aria-label={copy.addRecord}><h1>{copy.addRecord}</h1><div className="action-row"><button type="button" onClick={() => quickCamera.current?.click()}>{copy.camera}</button><button type="button" onClick={() => quickGallery.current?.click()}>{copy.album}</button><button type="button" onClick={goList}>{copy.cancel}</button></div></section> : null}
      {screen.kind === "creation-login" ? <CloudLogin copy={copy} onSuccess={() => setScreen({ kind: screen.returnTo })} /> : null}
      {screen.kind === "project-destination" ? <section className="panel"><h1>{copy.newProject}</h1><div className="project-list">{projectCreationDestinations(online, Boolean(authenticatedOwnerContext)).map((destination) => <button type="button" className="secondary-button" key={destination} onClick={() => destination === "login" ? setScreen({ kind: "creation-login", returnTo: "project-destination" }) : setScreen({ kind: "new-project", destination })}>{destination === "local-only" ? (language === "zh" ? "新建本地项目" : "New local project") : destination === "login" ? copy.cloudSignIn : (language === "zh" ? "新建云端项目" : "New cloud project")}{destination === "pending-cloud" ? <small> 当前离线，将先保存在本机，联网后自动同步</small> : null}</button>)}</div></section> : null}
      {screen.kind === "choose-project" ? <section className="panel"><h1>{copy.chooseProject}</h1><div className="project-list">
        {archives.filter((archive) => archive.status === "active" && (authenticatedOwnerContext || archive.sync?.operation_kind !== "create-archive")).map((archive) => <button type="button" className="secondary-button" key={archive.id} onClick={() => setScreen({ kind: "new-record", archiveId: archive.id })}>{archive.title}{archive.sync?.operation_kind === "create-archive" ? <small> · 待联网同步</small> : null}</button>)}
        {authenticatedOwnerContext && online ? cloudArchives.filter((archive) => archive.status === "active").map((archive) => <button type="button" className="secondary-button" key={archive.id} onClick={() => setScreen({ kind: "cloud-detail", archiveId: archive.id })}>{archive.title} · {copy.cloud}</button>) : null}
        {authenticatedOwnerContext && !online ? cloudCaches.filter((archive) => archive.status === "active").map((archive) => <button type="button" className="secondary-button" key={archive.id} onClick={() => setScreen({ kind: "new-record", archiveId: archive.id })}>{archive.title} · {copy.cloud}</button>) : null}
      </div><div className="action-row">{projectCreationDestinations(online, Boolean(authenticatedOwnerContext)).map((destination) => <button key={destination} type="button" className="primary-button" onClick={() => destination === "login" ? setScreen({ kind: "creation-login", returnTo: "choose-project" }) : setScreen({ kind: "new-project", destination })}>{destination === "local-only" ? (language === "zh" ? "新建本地项目" : "New local project") : destination === "login" ? copy.cloudSignIn : (language === "zh" ? "新建云端项目" : "New cloud project")}</button>)}<button type="button" onClick={() => { setQuickAddDraft(null); goList(); }}>{copy.cancel}</button></div></section> : null}
      <input ref={quickCamera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { void acceptQuickAddFiles(event.target.files, "camera"); event.target.value = ""; }} />
      <input ref={quickGallery} type="file" accept="image/*" multiple hidden onChange={(event) => { void acceptQuickAddFiles(event.target.files, "gallery"); event.target.value = ""; }} />
      {screen.kind === "settings" ? <section className="panel"><h1>{copy.settings}</h1><div className="property-row"><span>{copy.language}</span><SegmentedChoice label={copy.language} value={language} options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }]} onChange={toggleLanguage} /></div><p className="project-meta">{copy.offlineBody}</p><div className="action-row"><button type="button" className="secondary-button" onClick={reconnect}>{copy.reconnect}</button>{auth.status === "signed-in" ? <button type="button" className="danger-button" onClick={() => void explicitAndroidLogout()}>{copy.logout}</button> : null}</div></section> : null}
      <MobileBottomNavigationView
        ariaLabel={language === "zh" ? "主导航" : "Main navigation"}
        items={bottomNavigationItems}
        centerAction={(
          <button
            type="button"
            className="quick-add"
            aria-label={copy.addRecord}
            onClick={() => setScreen({ kind: "quick-add" })}
          >
            <UiIcon name="plus" size={25} strokeWidth={2.2} />
          </button>
        )}
      />
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
    </InternalNavigationProvider>
  );
}

type OfflineCopy = typeof text.zh | typeof text.en;

function AndroidRecentBrowse({ online, onBack, onOpen }: { online: boolean; onBack: () => void; onOpen: (id: string) => void }) {
  const { language } = useLanguage();
  const [items] = useState(getRecentArchiveBrowseItems);
  const [live, setLive] = useState<Map<string, CloudArchiveSummary>>(new Map());
  useEffect(() => {
    if (!online || !items.length) { queueMicrotask(() => setLive(new Map())); return; }
    let active = true;
    void (async () => {
      const result = await supabase.from("archives")
        .select("id, title, category, system_name, species_name_snapshot, cover_image_url, cover_image_path, cover_thumb_path")
        .in("id", items.map((item) => item.id));
      if (result.error) throw result.error;
      const rows = (result.data || []) as CloudArchiveSummary[];
      const covers = await resolveMediaDisplayPairs(supabase, rows.map((archive) => ({
        url: archive.cover_image_url, path: archive.cover_image_path, thumb_path: archive.cover_thumb_path,
      })));
      if (active && isAndroidOnline()) setLive(new Map(rows.map((row, index) => [row.id, {
        ...row, display_cover_thumb_url: covers[index]?.display_thumb_url || covers[index]?.display_url || null,
      }])));
    })().catch((error) => console.warn("recent browse enrichment", error));
    return () => { active = false; };
  }, [online, items]);
  return <section data-android-shell-page="recent">
    <MobilePageHeaderView title={language === "zh" ? "最近浏览" : "Recent"} showBack onBack={onBack} />
    <div className="project-list">{items.map((item) => <button className="secondary-button" key={item.id}
      type="button" onClick={() => onOpen(item.id)} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
      {live.get(item.id)?.display_cover_thumb_url ? <img src={live.get(item.id)?.display_cover_thumb_url || ""}
        alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} /> : null}
      <span>{live.get(item.id)?.title || item.title} · {live.get(item.id)?.system_name || item.systemName || ""}</span>
    </button>)}</div>
    {!items.length ? <p className="panel empty">{language === "zh" ? "暂无本机浏览记录" : "No local history"}</p> : null}
  </section>;
}

function AndroidLocalTrash({ ownerContext, online, onBack }: {
  ownerContext: LocalArchiveOwnerContext | null; online: boolean; onBack: () => void;
}) {
  const { language } = useLanguage();
  const [items, setItems] = useState<Awaited<ReturnType<typeof listLocalArchiveCycleTrash>>>([]);
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof listLocalProjectTrash>>>([]);
  const [error, setError] = useState("");
  useEffect(() => { let active = true;
    void Promise.all([listLocalArchiveCycleTrash(ownerContext), listLocalProjectTrash(ownerContext)])
      .then(([cycles, archives]) => { if (active) { setItems(cycles); setProjects(archives); } });
    return () => { active = false; };
  }, [ownerContext]);
  return <section data-android-shell-page="trash">
    <MobilePageHeaderView title={language === "zh" ? "回收站" : "Trash"} showBack onBack={onBack} />
    <h2>{language === "zh" ? "本机项目" : "Device projects"}</h2>
    {projects.map((project) => <article className="panel" key={project.id} style={{ padding: 14, marginBottom: 10 }}>
      <strong>{project.title}</strong>
      <button type="button" className="secondary-button" onClick={() => void setLocalProjectTrashed(project.id, false, ownerContext)
        .then(() => listLocalProjectTrash(ownerContext)).then(setProjects)
        .catch((cause) => setError(String(cause)))}>{language === "zh" ? "恢复项目" : "Restore project"}</button>
    </article>)}
    <h2>{language === "zh" ? "本机已删除周期" : "Local deleted cycles"}</h2>
    {items.map((item) => <article className="panel" key={item.trash.id} style={{ padding: 14, marginBottom: 10 }}>
      <strong>{item.archive_title} · {item.trash.cycle.display_name || item.trash.cycle.cycle_no}</strong>
      <p className="project-meta">{language === "zh" ? "记录" : "Records"} {item.trash.record_ids.length}</p>
      <button type="button" className="secondary-button" onClick={() => void restoreLocalArchiveCycle(item.archive_id, item.trash.id, ownerContext)
        .then(() => listLocalArchiveCycleTrash(ownerContext)).then(setItems)
        .catch((cause) => setError(String(cause)))}>{language === "zh" ? "恢复周期" : "Restore cycle"}</button>
    </article>)}
    {error ? <p role="alert">{error}</p> : null}
    {!items.length && !projects.length ? <p className="panel empty">{language === "zh" ? "本机回收站为空" : "Local trash is empty"}</p> : null}
    {online ? <button type="button" className="secondary-button" onClick={() => void Browser.open({ url: "https://life-space.uk/profile/trash" })}>
      {language === "zh" ? "查看云端回收站" : "Open cloud trash"}</button>
      : <p className="notice warning">{language === "zh" ? "云端回收站需要联网" : "Cloud trash requires a connection"}</p>}
  </section>;
}

function CloudProjectRuntime({ archiveId, online, authenticatedOwnerContext, onBack, onCacheChanged, onAddRecord, onDeleteArchive, onDeleteRecord, quickAddDraft, onQuickAddSaved }: {
  archiveId: string;
  online: boolean;
  authenticatedOwnerContext: LocalArchiveOwnerContext | null;
  onBack: () => void;
  onCacheChanged: () => Promise<void>;
  onAddRecord: (localId: string) => void;
  onDeleteArchive: (localId: string) => void;
  onDeleteRecord: (recordId: string, localId: string) => void;
  quickAddDraft?: QuickAddDraft | null;
  onQuickAddSaved?: () => void;
}) {
  const { language } = useLanguage();
  const [cached, setCached] = useState<LocalArchiveDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  useEffect(() => {
    if (online || !authenticatedOwnerContext) {
      if (!authenticatedOwnerContext) {
        setCached(null);
        setStatus("missing");
      }
      return;
    }
    let active = true;
    void getCloudOfflineCacheByCloudSource(archiveId, authenticatedOwnerContext)
      .then((archive) => archive
        ? resolveLocalArchiveDetail(archive.id, authenticatedOwnerContext)
        : null)
      .then((result) => {
        if (!active) return;
        setCached(result?.detail || null);
        setStatus(result?.status === "ready" ? "ready" : "missing");
      }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [archiveId, online, authenticatedOwnerContext]);

  if (!authenticatedOwnerContext?.userId) return <ArchiveProjectDetailStatus
    status="forbidden"
    title={language === "zh" ? "请登录后查看云端项目" : "Sign in to view this cloud project"}
    message={language === "zh" ? "当前未登录，不能读取此前账号的云端缓存或待同步内容。" : "You are signed out, so private cache and pending cloud data are unavailable."}
    backLabel={language === "zh" ? "返回我的空间" : "Back to My Space"}
    onBack={onBack} />;
  if (online) return <CloudArchiveDetailController
    archiveId={archiveId} userId={authenticatedOwnerContext.userId} onBack={onBack} onCacheChanged={onCacheChanged}
    initialFiles={quickAddDraft?.files} initialCapturedAt={quickAddDraft?.capturedAt}
    initialNote={quickAddDraft?.note} onRecordCreated={onQuickAddSaved} onRecordCancelled={onQuickAddSaved} />;
  if (status === "loading") return <ArchiveProjectDetailLoading>正在读取本机缓存…</ArchiveProjectDetailLoading>;
  if (status === "ready" && cached) return <DeviceOwnedProjectDetail
    detail={cached} ownerContext={authenticatedOwnerContext} onBack={onBack}
    onChanged={async () => {
      const result = await resolveLocalArchiveDetail(cached.archive.id, authenticatedOwnerContext);
      setCached(result.detail);
      await onCacheChanged();
    }}
    onAddRecord={() => onAddRecord(cached.archive.id)}
    onDeleteArchive={() => onDeleteArchive(cached.archive.id)}
    onDeleteRecord={(recordId) => onDeleteRecord(recordId, cached.archive.id)} />;
  return <ArchiveProjectDetailStatus status={status === "error" ? "error" : "not-found"}
    title="本机尚无这个云项目的缓存" message="请联网打开项目并准备缓存。"
    backLabel="返回我的空间" onBack={onBack} />;
}

function CloudLogin({
  copy,
  onSuccess,
}: {
  copy: OfflineCopy;
  onSuccess: (userId: string) => void;
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
    if (!AUTH_CAPTCHA_ENABLED || !captchaToken) {
      setMessage(!AUTH_CAPTCHA_ENABLED
        ? "人机验证配置不可用，请稍后重试。"
        : copy.captchaRequired);
      return;
    }

    setSubmitting(true);
    setMessage("");
    beginAndroidAuthLogin();
    try {
      const user = await loginBundledWithTurnstile({ email: normalizedEmail, password,
        captchaToken, siteKeyConfigured: AUTH_CAPTCHA_ENABLED });
      completeAndroidAuthLogin(user);
      onSuccess(user.id);
    } catch (error) {
      failAndroidAuthLogin();
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

function ProjectForm({
  language,
  copy,
  owner,
  destination = "local-only",
  cloudTaxonomy = [],
  cloudDepths = DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  archive,
  guide,
  onCancel,
  onSaved,
  onLiveSaved,
}: {
  language: Language;
  copy: OfflineCopy;
  owner: StoredLocalOwnerContext | null;
  destination?: CreationDestination;
  cloudTaxonomy?: ProjectTaxonomyEntry[];
  cloudDepths?: ArchiveCategoryDepths;
  archive?: LocalArchive;
  guide?: SystemNameCandidate;
  onCancel: () => void;
  onSaved: (archive: LocalArchive) => void | Promise<void>;
  onLiveSaved?: (archiveId: string) => void | Promise<void>;
}) {
  const cloudOperationId = useRef(crypto.randomUUID());
  const [title, setTitle] = useState(archive?.title || guide?.label || "");
  const [category, setCategory] = useState<ArchiveCategory>(archive?.category || guide?.category || "plant");
  const [subcategory, setSubcategory] = useState(archive?.subcategory || "");
  const [groupName, setGroupName] = useState(archive?.group_name || "");
  const [subTagId, setSubTagId] = useState(archive?.intended_cloud_sub_tag_id || "");
  const [groupTagId, setGroupTagId] = useState(archive?.intended_cloud_group_tag_id || "");
  const [localTaxonomy, setLocalTaxonomy] = useState<ProjectTaxonomyEntry[]>([]);
  const [liveTaxonomy, setLiveTaxonomy] = useState<ProjectTaxonomyEntry[]>(cloudTaxonomy);
  const [liveDepths, setLiveDepths] = useState<ArchiveCategoryDepths>(cloudDepths);
  const [liveTaxonomyReady, setLiveTaxonomyReady] = useState(destination !== "live-cloud");
  useEffect(() => {
    let active = true;
    void listVisibleLocalTaxonomyItems(owner ? { userId: owner.userId, email: owner.email } : null)
      .then((rows) => { if (active) setLocalTaxonomy(mapLocalProjectTaxonomy(rows)); });
    return () => { active = false; };
  }, [owner]);
  useEffect(() => {
    if (destination !== "live-cloud" || !owner?.userId) return;
    let active = true;
    void Promise.all([loadCloudProjectTaxonomy(owner.userId), getCloudArchiveCategoryDepths(owner.userId)]).then(([entries, depths]) => {
      if (active) { setLiveTaxonomy(entries); setLiveDepths(depths); setLiveTaxonomyReady(true); }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : copy.cloudLoadFailed); });
    return () => { active = false; };
  }, [destination, owner?.userId, copy.cloudLoadFailed]);
  const taxonomy = destination === "local-only" ? localTaxonomy : destination === "live-cloud" ? liveTaxonomy : cloudTaxonomy;
  const depths = destination === "local-only" ? getLocalArchiveCategoryDepths(owner?.userId)
    : destination === "live-cloud" ? liveDepths : cloudDepths;
  useEffect(() => {
    if (!archive || destination !== "local-only" || subTagId || !archive.subcategory) return;
    const parent = localTaxonomy.find((entry) => entry.kind === "subcategory" && entry.category === category && entry.label === archive.subcategory);
    if (parent) {
      setSubTagId(parent.id);
      setGroupTagId(localTaxonomy.find((entry) => entry.kind === "group" && entry.parentId === parent.id && entry.label === archive.group_name)?.id || "");
    }
  }, [archive, category, destination, localTaxonomy, subTagId]);
  const subTag = taxonomy.find((entry) => entry.kind === "subcategory" && entry.category === category && entry.id === subTagId);
  const groupTag = taxonomy.find((entry) => entry.kind === "group" && entry.category === category && entry.parentId === subTag?.id && entry.id === groupTagId);
  const [systemName, setSystemName] = useState(archive?.system_name || archive?.species_name || guide?.label || "");
  const [directory] = useState(loadOfflineGuideDirectory);
  const [selectedGuide, setSelectedGuide] = useState<SystemNameCandidate | undefined>(guide);
  const [source, setSource] = useState(archive?.source || "");
  const [plantingRegion, setPlantingRegion] = useState<PlantingRegion | null>(archive ? archive.planting_region || null : loadDefaultPlantingRegion(owner?.userId));
  const [note, setNote] = useState(archive?.note || "");
  const [archiveSummary, setArchiveSummary] = useState(archive?.archive_summary || "");
  const [cycleEnabled, setCycleEnabled] = useState(Boolean(archive?.cycle_enabled));
  const [nextCycleName, setNextCycleName] = useState(archive?.next_cycle_name || "");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !systemName.trim()) {
      setError(copy.requiredProject);
      return;
    }
    if (destination === "live-cloud" && !liveTaxonomyReady) {
      setError(copy.cloudLoading); return;
    }
    const normalizedRegion = normalizePlantingRegion(plantingRegion);
    const hasRegionDraft = plantingRegion && Object.values(plantingRegion).some((value) => value.trim());
    if (category === "plant" && (!archive || archive.planting_region || hasRegionDraft) && !normalizedRegion) {
      setError(language === "en" ? "Enter the planting country and city / district." : "请填写项目实际种植的国家及城市／区县。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!archive && destination === "live-cloud") {
        if (!owner?.userId || !onLiveSaved) throw new Error(copy.cloudSignIn);
        const id = await createLiveCloudArchive({ id: cloudOperationId.current, userId: owner.userId,
          title, category, subTagId: subTag?.id, groupTagId: groupTag?.id,
          systemName, speciesId: selectedGuide?.plantId, source,
          plantingRegion: normalizedRegion, note, visibility,
          archiveSummary, cycleEnabled, nextCycleName });
        await onLiveSaved(id);
      } else if (archive) {
        const updated = await updateLocalArchiveFields(
          archive.id,
          {
            title,
            category,
            subcategory: subcategory || null,
            group_name: groupName || null,
            intended_cloud_sub_tag_id: destination === "pending-cloud" ? subTagId || null : undefined,
            intended_cloud_group_tag_id: destination === "pending-cloud" ? groupTagId || null : undefined,
            system_name: systemName,
            species_name: category === "plant" ? systemName : null,
            plant_id: selectedGuide?.plantId || (systemName === (archive.system_name || archive.species_name) ? archive.plant_id : null),
            plant_slug: selectedGuide?.plantSlug || (systemName === (archive.system_name || archive.species_name) ? archive.plant_slug : null),
            source,
            planting_region: normalizedRegion,
            note,
            archive_summary: archiveSummary,
            cycle_enabled: cycleEnabled,
            next_cycle_name: nextCycleName,
          },
          owner ? { userId: owner.userId, email: owner.email } : null,
        );
        await onSaved(updated);
      } else {
        const created = await createLocalArchive({
          title,
          category,
          subcategory: subcategory || null,
          group_name: groupName || null,
          intended_cloud_sub_tag_id: destination === "pending-cloud" ? subTag?.id : null,
          intended_cloud_group_tag_id: destination === "pending-cloud" ? groupTag?.id : null,
          system_name: systemName,
          species_name: category === "plant" ? systemName : null,
          plant_id: selectedGuide?.plantId || null,
          plant_slug: selectedGuide?.plantSlug || null,
          source,
          planting_region: normalizedRegion,
          note,
          archive_summary: archiveSummary,
          cycle_enabled: cycleEnabled,
          next_cycle_name: nextCycleName,
          local_owner_user_id: owner?.userId || null,
          local_owner_email: owner?.email || null,
          local_owner_marked_at: owner ? new Date().toISOString() : null,
          sync_destination: owner?.userId && destination === "pending-cloud" ? "pending-cloud" : "local-only",
          migration_visibility: destination === "pending-cloud" ? visibility : null,
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
      <MobilePageHeaderView
        title={archive ? copy.edit : copy.newProject}
        titleText={archive ? copy.edit : copy.newProject}
        showBack
        ariaLabel={copy.back}
        onBack={onCancel}
      />
      <section className="panel">
        <div className="section-title"><h1>{archive ? copy.edit : copy.newProject}</h1></div>
        <form className="form" onSubmit={submit}>
          <div className="field"><label>{copy.title}</label><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></div>
          <div className="field">
            <label>{copy.category}</label>
            <select value={category} onChange={(event) => { setCategory(event.target.value as ArchiveCategory); setSubcategory(""); setGroupName(""); setSubTagId(""); setGroupTagId(""); }}>
              <option value="plant">{copy.plant}</option>
              <option value="system">{copy.system}</option>
              <option value="insect_fish">{copy.insect_fish}</option>
              <option value="other">{copy.other}</option>
            </select>
          </div>
          {depths[category] >= 2 ? <div className="field"><label>{language === "zh" ? "一级分组" : "Level 1 group"}</label>
            <select value={subTagId} onChange={(event) => { const next = taxonomy.find((entry) => entry.id === event.target.value && entry.kind === "subcategory"); setSubTagId(next?.id || ""); setSubcategory(next?.label || ""); setGroupName(""); setGroupTagId(""); }}>
              <option value="">{language === "zh" ? "未分组" : "None"}</option>
              {taxonomy.filter((entry) => entry.kind === "subcategory" && entry.category === category).map((entry) =>
                <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select></div> : null}
          {subTagId && depths[category] >= 3 ? <div className="field"><label>{language === "zh" ? "二级分组" : "Level 2 group"}</label>
            <select value={groupTagId} onChange={(event) => { const next = taxonomy.find((entry) => entry.id === event.target.value && entry.kind === "group" && entry.parentId === subTagId); setGroupTagId(next?.id || ""); setGroupName(next?.label || ""); }}>
              <option value="">{language === "zh" ? "未分组" : "None"}</option>
              {taxonomy.filter((entry) => entry.kind === "group" && entry.category === category &&
                entry.parentId === subTagId).map((entry) =>
                <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select></div> : null}
          <div className="field"><label>{copy.systemName}</label><input value={systemName} onChange={(event) => { setSystemName(event.target.value); setSelectedGuide(undefined); }} maxLength={160} placeholder={copy.guideSearch} /><small>{copy.guideHint}</small>
            <div className="guide-suggestions">{directory.filter((candidate) => candidate.category === category && candidate.label.toLowerCase().includes(systemName.toLowerCase())).slice(0, 10).map((candidate) => <button type="button" key={`${candidate.category}:${candidate.label}`} onClick={() => { setSystemName(candidate.label); setSelectedGuide(candidate); if (!title) setTitle(candidate.label); }}>{candidate.label}</button>)}</div>
          </div>
          {category === "plant" ? <PlantingRegionField value={plantingRegion} onChange={setPlantingRegion} language={language} required={!archive} /> : null}
          {!archive && destination === "pending-cloud" && !cloudTaxonomy.length ? <small>联网后可设置云端分组；项目仍可保存为未分组。</small> : null}
          <div className="field"><label>{copy.source}</label><input value={source} onChange={(event) => setSource(event.target.value)} maxLength={240} /></div>
          {!archive && destination !== "local-only" ? <label className="field">{copy.visibility}<select value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "private")}><option value="public">{language === "zh" ? "公开" : "Public"}</option><option value="private">{copy.private}</option></select></label> : null}
          <div className="field"><label>{copy.note}</label><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} /></div>
          <div className="field"><label>{language === "zh" ? "项目概要" : "Project summary"}</label><textarea value={archiveSummary} onChange={(event) => setArchiveSummary(event.target.value)} maxLength={2000} /></div>
          <label className="field"><span>{language === "zh" ? "启用项目分期" : "Enable project cycles"}</span><input type="checkbox" checked={cycleEnabled} onChange={(event) => setCycleEnabled(event.target.checked)} /></label>
          {cycleEnabled ? <div className="field"><label>{language === "zh" ? "下一期名称" : "Next cycle name"}</label><input value={nextCycleName} onChange={(event) => setNextCycleName(event.target.value)} maxLength={80} /></div> : null}
          {error ? <section className="notice warning"><p>{error}</p></section> : null}
          <div className="submit-row">
            <button className="secondary-button" type="button" onClick={onCancel}>{copy.cancel}</button>
            <button className="primary-button" type="submit" disabled={busy || !liveTaxonomyReady}>{busy ? copy.saving : copy.save}</button>
          </div>
        </form>
      </section>
    </>
  );
}

function FilePreview({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="" />;
}

function RecordForm({ copy, archive, language, record, initialFiles = [], initialCapturedAt = [], initialNote = "", onCancel, onSaved }: {
  copy: OfflineCopy; archive: LocalArchive; language: Language; record?: LocalRecordWithImages;
  initialFiles?: File[]; initialCapturedAt?: (string | null)[]; initialNote?: string;
  onCancel: () => void; onSaved: () => void | Promise<void>;
}) {
  const [note, setNote] = useState(record?.note || initialNote);
  const [recordTime, setRecordTime] = useState(toDateTimeLocal(record?.record_time || initialCapturedAt[0] || undefined));
  const [location, setLocation] = useState<RecordLocation | null>(() => record ? record.location || null : loadDefaultRecordLocation());
  const [cycleId, setCycleId] = useState(record?.cycle_id || (archive.cycle_enabled ? archive.cycles?.find((cycle) => cycle.status === "active")?.id : null) || "");
  const [files, setFiles] = useState<File[]>(initialFiles);
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
      if (!isoTime) throw new Error(language === "en" ? "Enter a valid local date and time." : "请输入有效的本地日期和时间。");
      const imageCapturedAt = await Promise.all(files.map(async (file) => initialFiles.includes(file)
        ? initialCapturedAt[initialFiles.indexOf(file)] || await readImageCapturedAt(file)
        : readImageCapturedAt(file)));
      if (record) await updateLocalRecordFields(record.id, { note, record_time: isoTime, location, cycle_id: cycleId || null, image_files: files, image_captured_at: imageCapturedAt });
      else await createLocalRecord({ archive_id: archive.id, note, record_time: isoTime, location, cycle_id: cycleId || null, image_files: files, image_captured_at: imageCapturedAt });
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : copy.readFailed); } finally { setBusy(false); }
  }
  return <>
    <MobilePageHeaderView
      title={record ? copy.edit : copy.addRecord}
      titleText={record ? copy.edit : copy.addRecord}
      showBack
      ariaLabel={copy.back}
      onBack={onCancel}
    />
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

createRoot(document.getElementById("root")!).render(<App />);
