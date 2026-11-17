import PlantingRegionField from "@/components/archive/PlantingRegionField";
import { loadDefaultPlantingRegion, normalizePlantingRegion, type PlantingRegion } from "@/lib/planting-region";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  assertLocalOfflineAvailable,
  isPendingCloudSyncStatus,
  connectLocalSafDirectory,
  getCloudOfflineCacheByCloudSource,
  getLocalArchiveByCloudSource,
  createLocalArchive,
  createLocalRecord,
  deleteLocalArchive,
  cancelNeverUploadedCloudArchive,
  deleteLocalRecord,
  resolveLocalArchiveDetail,
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
  localArchiveHasPendingCloudWork,
  markUnownedLocalArchivesForOwner,
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
  type StoredLocalOwnerContext,
} from "@/lib/local-owner-context";
import { migrateLegacyLocalOrigin } from "@/lib/local-origin-migration";
import { getLocalSafDirectory, isAndroidSafAvailable } from "@/lib/local-saf-native";
import { isAndroidRecordGallery, pickAndroidRecordPhotos, rememberRestoredCloudPickerResult } from "@/lib/android-record-gallery";
import { retireBundledLegacyServiceWorkers } from "@/lib/android-service-worker";
import { normalizeLocalImageBlob } from "@/lib/local-image-blob";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
  archiveCategoryOptions,
  type ArchiveCategory,
} from "@/lib/archive-categories";

import AuthCaptcha, { AUTH_CAPTCHA_ENABLED } from "@/components/AuthCaptcha";
import { AndroidRegistration, AndroidRegistrationEmail } from "@/components/auth/AndroidRegistration";
import AndroidBrandIntroduction from "@/components/brand/AndroidBrandIntroduction";
import { markAndroidWelcomeCompleted, shouldShowAndroidWelcome } from "@/lib/android-first-use";
import { formatBundledLoginError, loginBundledWithTurnstile } from "@/lib/android-auth-session";
import {
  beginAndroidAuthLogin,
  completeAndroidAuthLogin,
  explicitAndroidLogout,
  failAndroidAuthLogin,
  getAndroidAuthSnapshot,
  revalidateAndroidAuthSession,
  resolveAuthenticatedOwnerContext,
  resolveAndroidReadOwner,
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
import KeyboardLayoutGuard from "@/components/KeyboardLayoutGuard";
import { InternalNavigationProvider } from "@/components/navigation/InternalLink";
import ProjectCategorySettingsView from "@/components/profile/ProjectCategorySettingsView";
import PersonalSpaceMobileIdentity from "@/components/archive-ui/PersonalSpaceMobileIdentity";
import ArchiveTaxonomyPanel, { type ArchiveTaxonomyChip } from "@/components/archive-ui/ArchiveTaxonomyPanel";
import { localArchiveToProjectView } from "@/components/archive-ui/localArchiveProjectView";
import MobileBottomNavigationView, {
  type MobileBottomNavigationItem,
} from "@/components/mobile/MobileBottomNavigationView";
import AndroidQuickCamera from "@/components/mobile/AndroidQuickCamera";
import AppConfirmDialog from "@/components/mobile/AppConfirmDialog";
import { getMobilePrimaryNavigationDescriptors } from "@/components/mobile/mobilePrimaryNavigation";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import HomeSectionTabs, { type HomeSection } from "@/components/home/HomeSectionTabs";
import DiscoverSearchPage from "@/app/discover/search/page";
import PlantPage from "@/app/plant/page";
import { PlantDetailContent } from "@/app/plant/[id]/page";
import { PlantInterestsContent } from "@/app/archive/interests/page";
import { emptyCloudTrash, fetchCloudTrash, requestCloudTrash, restoreCloudTrashItem, type CloudTrashItem } from "@/lib/cloud-trash";
import AndroidMarketDetailController from "@/components/market/AndroidMarketDetailController";
import ReadonlyPublicProjectDetail from "@/components/archive-ui/ReadonlyPublicProjectDetail";
import { readImageCapturedAt } from "@/lib/photo-metadata";
import { buildRecordPhotoGroups } from "@/lib/record-photo-batches";
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
import { buildAuthEmailRedirect } from "@/lib/auth-return";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { qaShareOrigin } from "@/lib/android-native-share";
import { Capacitor } from "@capacitor/core";
import { getAndroidConnectivitySnapshot, isAndroidOnline, recheckAndroidConnectivity,
  useAndroidConnectivityStatus } from "@/lib/android-connectivity";
import { getRecentArchiveBrowseItems, saveRecentArchiveBrowse } from "@/lib/recent-browse";
import {
  createCloudProjectTaxonomy, deleteCloudProjectTaxonomy, loadCloudProjectTaxonomy,
  mapLocalProjectTaxonomy, renameCloudProjectTaxonomy, type ProjectTaxonomyEntry,
} from "@/lib/android-project-taxonomy";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import { refreshCloudOfflineCaches, type CloudOfflineCacheArchiveSource } from "@/lib/cloud-offline-cache";
import {
  syncAndroidAllPendingCloudArchives,
  syncAndroidPendingCloudArchive,
} from "@/lib/android-verified-pending-sync";
import {
  getPendingR2MirrorCountForOwner, retryPendingR2MediaMirrorsForOwner,
} from "@/lib/r2-business-media-mirror";
import { buildAndroidCloudWorkspace, canOfferLocalCloudTransfer, type PendingCloudProject } from "@/lib/android-cloud-workspace";
import { syncLocalArchiveToCloud, type LocalToCloudVisibility } from "@/lib/local-to-cloud-sync";
import { canAddLocalArchiveRecord } from "@/lib/local-archive-detail-adapters";
import { readCloudTaxonomySnapshot } from "@/lib/cloud-taxonomy-snapshot";
import { createLiveCloudArchive } from "@/lib/android-live-cloud-create";
import { canReadAndroidCloudWorkspace, chooseProjectSources, projectCreationDestinations, type CreationDestination, type QuickAddDraft, type QuickAddSource } from "@/lib/android-creation-capabilities";
import { formatStorage } from "@/lib/user-profile-shared";
import {
  canCreateMembershipContent,
  getUserTypeLabel,
  normalizeCloudTrialOfferRpcResult,
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
import { MyMarketPostsContent } from "@/app/market/mine/page";
import { NewMarketPostContent } from "@/app/market/new/page";
import AndroidExperienceCardDetail from "@/components/experience-card/AndroidExperienceCardDetail";
import { MyExperienceCardsContent } from "@/app/experience-cards/page";
import { ExperienceCardContent } from "@/app/experience-cards/[id]/page";
import ExperienceCardEditor from "@/components/experience-card/ExperienceCardEditor";
import AndroidProfileController from "@/components/profile/AndroidProfileController";
import AndroidProfileInfoPage, { type AndroidProfileInfoKind } from "@/components/profile/AndroidProfileInfoPage";
import MembershipPaymentPage from "@/app/membership/payment/page";
import MembershipRefundPage from "@/app/membership/refund/page";
import AndroidAppUpdatePage from "@/app/app-update/page";
import AdminMembershipsPage from "@/app/admin/memberships/page";
import AdminGuideReviewPage from "@/app/admin/guides/page";
import AdminSupportPage from "@/app/admin/support/page";
import SupportCenter from "@/components/support/SupportCenter";
import { getReportTarget } from "@/lib/support-links";
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
import {
  COMPLETED_LOGIN_FLOW_KINDS,
  COMPLETED_PROJECT_FLOW_KINDS,
  describeShellHistoryPush,
  marketDetailBackPopsToList,
  planCompletedShellFlow,
} from "@/lib/android-shell-history";

const MAX_PHOTOS = 10;

type Language = "zh" | "en";
type ShellSourceFilter = "all" | "cloud" | "pending" | "local";

// W5 keeps the online Android workspace focused on cloud projects and the
// existing pending-upload queue. Hiding the legacy source tabs does not delete
// local SAF data, cloud caches, or pending records.
function w5WorkspaceSources(auth: "checking" | "signed-out" | "signed-in" | "offline-owner-read"): ShellSourceFilter[] {
  // W5 online Android never exposes the S6 independent local-space source, even to guests.
  return auth === "checking" ? [] : auth === "signed-in" || auth === "offline-owner-read"
    ? ["cloud", "pending"] : ["cloud"];
}

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

const LOCAL_SPACE_VISIBILITY_KEY = "lifespace_android_show_local_space_v1";

function readLocalSpaceVisibilityPreference(): boolean | null {
  try {
    const value = window.localStorage.getItem(LOCAL_SPACE_VISIBILITY_KEY);
    if (value === "shown") return true;
    if (value === "hidden") return false;
  } catch {
    // Display preference is optional; project data remains untouched.
  }
  return null;
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
  help_status?: string | null;
  sub_tag_id?: string | null;
  group_tag_id?: string | null;
};

type Screen =
  | { kind: "list" }
  | { kind: "welcome" }
  | { kind: "about" }
  | { kind: "register" }
  | { kind: "check-email"; email: string }
  | { kind: "new-project"; guide?: SystemNameCandidate; destination?: CreationDestination }
  | { kind: "project-destination" }
  | { kind: "quick-add" }
  | { kind: "cloud-login"; returnTo: "choose-project" | "project-destination" | "list-cloud" | "profile" | "following" | "market-mine" | "market-new" | "interests" | "trash" | "local-transfer" | "membership-payment" | "membership-refund"; archiveId?: string; returnPath?: string }
  | { kind: "local-transfer"; archiveId: string }
  | { kind: "activity" }
  | { kind: "discover-search" }
  | { kind: "public-detail" }
  | { kind: "experience" }
  | { kind: "my-experience" }
  | { kind: "experience-new"; search?: string }
  | { kind: "experience-detail"; id: string; returnTo?: "my-experience" }
  | { kind: "following" }
  | { kind: "market" }
  | { kind: "market-mine" }
  | { kind: "market-new"; search?: string }
  | { kind: "market-detail"; id: string }
  | { kind: "guides" }
  | { kind: "interests"; section: string }
  | { kind: "plant-detail"; id: string }
  | { kind: "guide-detail"; guideKey: string; guideId?: string }
  | { kind: "profile"; module?: "backup" }
  | { kind: "project-categories" }
  | { kind: "recent" }
  | { kind: "trash" }
  | { kind: "membership-payment" }
  | { kind: "membership-refund" }
  | { kind: "membership-benefits" }
  | { kind: "data-security" }
  | { kind: "legal" }
  | { kind: "legal-page"; id: string }
  | { kind: "feedback" }
  | { kind: "report"; target: string }
  | { kind: "app-update" }
  | { kind: "admin-memberships" }
  | { kind: "admin-guides" }
  | { kind: "admin-support" }
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
    localSpaceOff: "本地空间已关闭，请在用户信息中启用本地空间。",
    saveLocalCopy: "保存到本机", refreshLocalCopy: "更新本机副本", openLocalCopy: "打开本机副本",
    offlineCopies: "云端缓存副本",     cacheNotReady: "这个项目尚未缓存，请联网登录后等待后台准备。", cloudCacheReadOnly: "云端已有记录离线只读；新增记录先保存本机，联网后手动上传。", noCachedProjects: "还没有云项目缓存。请先联网登录，后台会准备轻量副本。",
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
    offlineBody: "项目、记录和照片先保存在本机。联网后可手动上传待上传的云端内容；明确选择本地免费使用的项目不会自动上传。",
    migrationWarning: "旧版本地资料暂未完成迁移。现有资料不会被删除，请稍后重新打开 App 再试。",
    safConnectWarning: "本地资料文件夹尚未连接。如已有 LifeSpace 资料，请选择原来的 Documents/LifeSpace 文件夹。",
    safConnectAction: "授权访问",
    safRegrantWarning: "本地资料文件夹的授权已失效。请重新授权原文件夹，资料不会被重建或覆盖。",
    safRegrantAction: "重新授权原文件夹", safRegranting: "正在验证原文件夹…",
    safRegrantCanceled: "已取消授权，原资料未改变；可以再次尝试。",
    safRegrantWrong: "请选择原来的 LifeSpace 资料文件夹；原资料未改变。",
    safRegrantFailed: "无法验证原文件夹及本地空间身份，原资料未改变；请检查目录后重试。",
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
    localSpaceOff: "Local space is off. Enable local space in your profile.",
    saveLocalCopy: "Save on device", refreshLocalCopy: "Refresh device copy", openLocalCopy: "Open device copy",
    offlineCopies: "Cached cloud copy", cacheNotReady: "This project has not been cached yet. Sign in online and let it prepare in the background.", cloudCacheReadOnly: "Existing cloud records are read-only offline. New records stay on this device and you can upload them after reconnecting.", noCachedProjects: "No cached cloud projects yet. Sign in online to prepare lightweight copies.",
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
    offlineBody: "Projects, records and photos are saved on this device first. Upload pending cloud changes manually after reconnecting. Projects you mark as local-only stay local.",
    migrationWarning: "Previous local data has not finished migrating. Nothing was deleted; reopen the app later to retry.",
    safConnectWarning: "Your local data folder is not connected. If you have LifeSpace data, select the original Documents/LifeSpace folder.",
    safConnectAction: "Grant access",
    safRegrantWarning: "Access to your local data folder was lost. Reauthorize the original folder; existing data will not be replaced.",
    safRegrantAction: "Reauthorize original folder", safRegranting: "Checking original folder…",
    safRegrantCanceled: "Authorization canceled. Your data is unchanged; try again when ready.",
    safRegrantWrong: "Select the original LifeSpace data folder. Your data is unchanged.",
    safRegrantFailed: "The original folder and local space could not be verified. Your data is unchanged; check the folder and retry.",
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
  onBack,
}: {
  ownerUserId: string;
  online: boolean;
  cloudUserId: string | null;
  onBack: () => void;
}) {
  const [activeSpace, setActiveSpace] = useState<ArchiveCategorySpace>(
    () => "cloud",
  );
  const [localDepths, setLocalDepths] = useState<ArchiveCategoryDepths>(() =>
    getLocalArchiveCategoryDepths(ownerUserId),
  );
  const [saving, setSaving] = useState(false);
  const [cloudDepths, setCloudDepths] = useState<ArchiveCategoryDepths>({ ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS });
  const [cloudLoading, setCloudLoading] = useState(false);
  const [error, setError] = useState("");
  const cloudAvailable = online && cloudUserId === ownerUserId;
  useEffect(() => {
    if (!cloudAvailable || activeSpace !== "cloud") return;
    let active = true;
    setCloudLoading(true);
    setError("");
    void getCloudArchiveCategoryDepths(ownerUserId).then((depths) => {
      if (active) setCloudDepths(depths);
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
      else await saveLocalArchiveCategoryDepths(localDepths, ownerUserId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
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
      onSave={() => void save()}
      onBack={onBack}
    />
  );
}

function App() {
  const [language, setLanguage] = useState<Language>(getLanguage);
  const copy = text[language];
  const [screen, setScreenState] = useState<Screen>({ kind: "list" });
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const shellStackRef = useRef<Screen[]>([{ kind: "list" }]);
  const replaceCompletedFlowRef = useRef(false);
  const pendingFlowRef = useRef<null | { landedCount: number; apply: () => void }>(null);
  const marketDetailSourceKindRef = useRef<string | null>(null);
  const [quickAddDraft, setQuickAddDraft] = useState<QuickAddDraft | null>(null);
  const [detailAddRecordRequest, setDetailAddRecordRequest] = useState<{ archiveId: string; nonce: number } | null>(null);
  const [chooseProjectExpanded, setChooseProjectExpanded] = useState<{ cloud: boolean; local: boolean }>({ cloud: false, local: false });
  const [trashMoveConfirm, setTrashMoveConfirm] = useState<null | { message: string; action: () => void }>(null);
  const [taxonomySyncWarning, setTaxonomySyncWarning] = useState<string | null>(null);
  const quickGallery = useRef<HTMLInputElement>(null);
  async function acceptQuickAddImageFiles(images: File[], source: QuickAddSource) {
    const validImages = images.filter((file) => file.type.startsWith("image/"));
    if (validImages.length > MAX_PHOTOS) showToast(copy.photoLimit);
    const files = validImages.slice(0, MAX_PHOTOS);
    if (!files.length) return;
    const capturedAt = await Promise.all(files.map(async (file) => {
      const metadataTime = await readImageCapturedAt(file).catch(() => null);
      return metadataTime || (source === "camera" ? new Date(file.lastModified || Date.now()).toISOString() : null);
    }));
    setQuickAddDraft({ files, capturedAt, source, note: "" });
    setScreen({ kind: "choose-project" });
  }
  async function acceptQuickAddFiles(list: FileList | null, source: QuickAddSource) {
    await acceptQuickAddImageFiles(Array.from(list || []), source);
  }
  async function openQuickAddAlbum() {
    if (!isAndroidRecordGallery()) { quickGallery.current?.click(); return; }
    try {
      const { files, truncated } = await pickAndroidRecordPhotos();
      if (truncated) showToast(copy.photoLimit);
      await acceptQuickAddImageFiles(files, "gallery");
    } catch {
      showToast(language === "zh" ? "无法读取图库照片。" : "Unable to read gallery photos.");
    }
  }
  function skipQuickAddPhotos() {
    setQuickAddDraft({ files: [], capturedAt: [], source: "camera", note: "" });
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
  function restoreShellScroll(value: unknown) {
    const parsed = Number(value);
    const top = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top, behavior: "auto" }));
    });
  }

  function setScreen(next: Screen, replace = false) {
    const leaving = screenRef.current;
    const replacing = replace || replaceCompletedFlowRef.current;
    if (replacing) {
      if (shellStackRef.current.length === 0) shellStackRef.current.push(next);
      else shellStackRef.current[shellStackRef.current.length - 1] = next;
    } else {
      shellStackRef.current.push(next);
    }
    if (next.kind === "market-detail") marketDetailSourceKindRef.current = leaving.kind;
    const step = describeShellHistoryPush({
      replace: replacing,
      current: window.history.state,
      liveScreen: leaving,
      next,
      scrollY: window.scrollY,
    });
    if (step.mode === "replace") {
      window.history.replaceState(step.state, "", `#${next.kind}`);
    } else {
      window.history.replaceState(step.replaceCurrent, "", window.location.href);
      window.history.pushState(step.pushed, "", `#${next.kind}`);
    }
    screenRef.current = next;
    setScreenState(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function backFromMarketDetail() {
    if (marketDetailBackPopsToList(marketDetailSourceKindRef.current)) {
      marketDetailSourceKindRef.current = null;
      goBackInShell({ kind: "market" });
      return;
    }
    setScreen({ kind: "market" });
  }

  function goBackInShell(fallback: Screen = { kind: "profile" }) {
    if (window.history.state?.offlineScreen && window.history.length > 1) {
      window.history.back();
      return;
    }
    setScreen(fallback, true);
  }
  function openCloudLogin(returnTo: Extract<Screen, { kind: "cloud-login" }>["returnTo"], archiveId?: string, returnPath?: string) {
    if (!online) { showToast(copy.needNetwork); return; }
    setScreen({ kind: "cloud-login", returnTo, archiveId, returnPath });
  }

  function returnToProfile() {
    const profileChild = [
      "project-categories", "recent", "trash", "membership-payment", "membership-refund",
      "membership-benefits", "data-security", "legal", "feedback", "app-update",
      "settings", "about", "admin-memberships", "admin-guides", "admin-support",
    ].includes(screen.kind);
    if (profileChild) {
      goBackInShell({ kind: "profile" });
      return;
    }
    setScreen({ kind: "profile" });
  }
  function finishCompletedFlow(flowKinds: ReadonlySet<string>, destinationKind: string, run: () => void) {
    const plan = planCompletedShellFlow(shellStackRef.current, destinationKind, flowKinds);
    const apply = () => {
      replaceCompletedFlowRef.current = plan.replace;
      try { run(); }
      finally { replaceCompletedFlowRef.current = false; }
    };
    if (plan.go === 0) {
      apply();
      return;
    }
    pendingFlowRef.current = { landedCount: plan.landedCount, apply };
    window.history.go(plan.go);
  }
  useEffect(() => {
    window.history.replaceState({ offlineScreen: { kind: "list" }, scrollY: 0 }, "", "#list");
    const back = (event: PopStateEvent) => {
      if (pendingFlowRef.current) {
        const job = pendingFlowRef.current;
        pendingFlowRef.current = null;
        const landed = shellStackRef.current.slice(0, job.landedCount);
        shellStackRef.current = landed.length ? landed : [{ kind: "list" }];
        screenRef.current = shellStackRef.current[shellStackRef.current.length - 1];
        job.apply();
        return;
      }
      if (document.visibilityState === "hidden") {
        const nextKind = event.state?.offlineScreen?.kind;
        if (!nextKind || nextKind === screenRef.current.kind) return;
      }
      const next = event.state?.offlineScreen || { kind: "list" };
      const top = shellStackRef.current[shellStackRef.current.length - 1];
      if (!top || top.kind !== next.kind) {
        if (shellStackRef.current.length > 1) shellStackRef.current.pop();
        if (shellStackRef.current.length === 0) shellStackRef.current.push(next);
        else shellStackRef.current[shellStackRef.current.length - 1] = next;
      }
      screenRef.current = next;
      setScreenState(next);
      restoreShellScroll(event.state?.scrollY);
    };
    window.addEventListener("popstate", back);
    // The activity back callback consumes the key. Without a listener it only
    // calls WebView.goBack when canGoBack() is true, which misses this
    // document's pushState history, so the system key does nothing. ADB
    // KEYCODE_BACK and the nav-bar key both arrive here while this activity
    // is resumed; a key injected into a system save sheet does not.
    let disposed = false;
    let nativeBack: { remove: () => Promise<void> } | undefined;
    let nativeRestored: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      // Capacitor retains an Activity result delivered while the WebView was
      // dead. Only store its request-bound metadata: no route or cloud write.
      void CapacitorApp.addListener("appRestoredResult", (event) => {
        rememberRestoredCloudPickerResult(event);
      }).then((handle) => {
        if (disposed) void handle.remove();
        else nativeRestored = handle;
      }).catch(() => undefined);
      void CapacitorApp.addListener("backButton", () => {
        const overlayOpen = document.documentElement.dataset.mobileOverlayOpen === "true";
        const canPopShell = Boolean(window.history.state?.offlineScreen) && window.history.length > 1;
        if (window.history.length > 1 && (overlayOpen || canPopShell)) window.history.back();
      }).then((handle) => {
        if (disposed) void handle.remove();
        else nativeBack = handle;
      });
    }
    return () => {
      disposed = true;
      window.removeEventListener("popstate", back);
      if (nativeBack) void nativeBack.remove();
      if (nativeRestored) void nativeRestored.remove();
    };
  }, []);
  const [owner, setOwner] = useState<StoredLocalOwnerContext | null>(() =>
    loadRememberedLocalOwnerContext(),
  );
  const [spaceProfile, setSpaceProfile] = useState<ShellSpaceProfile | null>(null);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [experienceCardCount, setExperienceCardCount] = useState(0);
  const [archives, setArchives] = useState<LocalArchiveSummary[]>([]);
  const [cloudCaches, setCloudCaches] = useState<LocalArchiveSummary[]>([]);
  const [sourceFilter, setSourceFilter] = useState<ShellSourceFilter>("all");
  const [unownedCount, setUnownedCount] = useState(0);
  const [detail, setDetail] = useState<LocalArchiveDetail | null>(null);
  const [cloudPendingDetail, setCloudPendingDetail] = useState<LocalArchiveDetail | null>(null);
  const detailLoadRequestRef = useRef(0);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "ready" | "not-found" | "forbidden" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const [localStartupFailure, setLocalStartupFailure] = useState<"error" | "timeout" | null>(null);
  const [firstUseChecked, setFirstUseChecked] = useState(false);
  const firstUseCheckStarted = useRef(false);
  const [migrationWarning, setMigrationWarning] = useState(false);
  const [safRegrantNeeded, setSafRegrantNeeded] = useState(false);
  const [safConnectionMissing, setSafConnectionMissing] = useState(false);
  const safConnectAttempted = useRef(false);
  const safConnectRunning = useRef(false);
  const [safRegrantRunning, setSafRegrantRunning] = useState(false);
  const [safRegrantError, setSafRegrantError] = useState("");
  const [toast, setToast] = useState("");
  const serviceConnectivity = useAndroidConnectivityStatus();
  const online = serviceConnectivity.status === "online";
  const auth = useAndroidAuthState();
  const cloudUserId = auth.status === "signed-in" ? auth.sessionUserId : null;
  const [cloudTrialAccess, setCloudTrialAccess] = useState<{
    userId: string;
    lifecycle: string;
  } | null>(null);
  const [cloudArchives, setCloudArchives] = useState<CloudArchiveSummary[]>([]);
  const [cloudTaxonomy, setCloudTaxonomy] = useState<ProjectTaxonomyEntry[]>([]);
  const [localTaxonomy, setLocalTaxonomy] = useState<ProjectTaxonomyEntry[]>([]);
  const [cloudDepths, setCloudDepths] = useState<ArchiveCategoryDepths>({ ...DEFAULT_ARCHIVE_CATEGORY_DEPTHS });
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [pendingSync, setPendingSync] = useState<PendingCloudSyncSummary[]>([]);
  const [syncingArchiveId, setSyncingArchiveId] = useState<string | null>(null);
  const [transferVisibility, setTransferVisibility] = useState<LocalToCloudVisibility>("private");
  const [transferRunning, setTransferRunning] = useState(false);
  const [transferError, setTransferError] = useState("");
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

  useEffect(() => {
    if (loading || localStartupFailure) return;
    // Local readiness unlocks the public shell independently from Supabase
    // checking. Private cloud caches still require verified auth + Owner.
    setFirstUseChecked(true);
    if (auth.status === "checking" || firstUseCheckStarted.current) return;
    firstUseCheckStarted.current = true;
    void shouldShowAndroidWelcome({
      signedIn: auth.status === "signed-in",
      hasLocalContent: migrationWarning || (safRegrantNeeded && !safConnectionMissing) || archives.length > 0 || cloudCaches.length > 0 || pendingSync.length > 0 || unownedCount > 0,
      hasRememberedOwner: Boolean(loadRememberedLocalOwnerContext()) || readLocalSpaceVisibilityPreference() !== null,
      explicitlySignedOut: wasLocalOwnerExplicitlySignedOut(),
    }).then((show) => {
      if (show && getAndroidAuthSnapshot().status === "signed-out" &&
          screenRef.current.kind === "list") setScreen({ kind: "welcome" }, true);
    }).catch((error) => console.warn("android welcome check", error));
    // Welcome can wait for authentication; the local shell never does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, localStartupFailure, auth.status]);

  const ownerContext: LocalArchiveOwnerContext | null = useMemo(
    () => owner
      ? { userId: owner.userId, email: owner.email || null, snapshotOnly: true }
      : null,
    [owner],
  );
  const authenticatedOwnerContext = useMemo(
    () => resolveAuthenticatedOwnerContext(auth, ownerContext),
    [auth, ownerContext],
  );
  const readOwnerContext: LocalArchiveOwnerContext | null = useMemo(() => {
    const trusted = resolveAndroidReadOwner(auth);
    return trusted ? { ...trusted, snapshotOnly: true } : null;
  }, [auth]);
  const offlineOwnerRead = auth.status === "offline-owner-read";
  // A checking transition may keep an already mounted editor in quarantine.
  // This memory-only marker grants NO Owner, DB access or online permission.
  const recordEditorOwnerRef = useRef<{ ownerId: string; archiveId: string } | null>(null);
  const recordEditorAuthorized = screen.kind === "new-record" &&
    detail?.archive.id === screen.archiveId &&
    Boolean(readOwnerContext?.userId) &&
    detail.archive.local_owner_user_id === readOwnerContext?.userId &&
    (detailStatus === "ready" || detailStatus === "loading");
  if (recordEditorAuthorized && detail) {
    recordEditorOwnerRef.current = {
      ownerId: detail.archive.local_owner_user_id!, archiveId: detail.archive.id,
    };
  } else if (auth.status !== "checking" || auth.explicitSignedOut) {
    recordEditorOwnerRef.current = null;
  }
  const retainCheckingEditor = auth.status === "checking" && !auth.explicitSignedOut &&
    screen.kind === "new-record" && detail?.archive.id === screen.archiveId &&
    recordEditorOwnerRef.current?.archiveId === detail.archive.id &&
    recordEditorOwnerRef.current?.ownerId === detail.archive.local_owner_user_id;
  const offlineCreatedProjects = useRef(new Set<string>());

  useEffect(() => {
    if (serviceConnectivity.status === "offline" && quickAddDraft && screen.kind === "cloud-detail") {
      setScreen({ kind: "choose-project" });
    }
  }, [serviceConnectivity.status, quickAddDraft, screen.kind]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadShellIdentity = useCallback(async (userId: string) => {
    const authority = getAndroidAuthSnapshot();
    if (authority.status !== "signed-in" || authority.explicitSignedOut ||
        authority.sessionUserId !== userId) return;
    const cached = readShellIdentityCache(userId);
    if (cached) {
      setSpaceProfile(cached.profile);
      setMembership(cached.membership);
      setExperienceCardCount(cached.experienceCardCount);
    }

    if (!isAndroidOnline()) return;

    try {
      const [profileResult, membershipResult, experienceResult, accountResult, trialOfferResult] = await Promise.all([
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
        supabase.rpc("get_my_cloud_trial_offer"),
      ]);

      if (getAndroidAuthSnapshot() !== authority) return;
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
      const trialOffer = trialOfferResult.error ? null :
        normalizeCloudTrialOfferRpcResult(trialOfferResult.data);
      setCloudTrialAccess(trialOffer?.lifecycle_status
        ? { userId, lifecycle: trialOffer.lifecycle_status }
        : null);
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

  const readOwnerRef = useRef(readOwnerContext);
  const listRequestRef = useRef(0);
  const listReadWarningRef = useRef(false);
  const cloudListRequestRef = useRef(0);
  readOwnerRef.current = readOwnerContext;

  const loadList = useCallback(async (context?: LocalArchiveOwnerContext | null) => {
    const requestId = ++listRequestRef.current;
    const resolvedContext = context === undefined ? readOwnerRef.current : context;
    const authenticated = readOwnerRef.current;
    const privateContext =
      authenticated?.userId && authenticated.userId === resolvedContext?.userId
        ? authenticated
        : null;
    if (!privateContext) {
      setArchives([]); setCloudCaches([]); setPendingSync([]); setUnownedCount(0);
      return;
    }
    const [result, cachedCloud, pending] = await Promise.all([
      listVisibleLocalArchiveSummaries(privateContext, {
        includePendingCloud: Boolean(privateContext),
      }),
      privateContext
        ? listVisibleCloudOfflineArchiveSummaries(privateContext)
        : Promise.resolve([]),
      privateContext
        ? listPendingCloudSyncSummaries(privateContext)
        : Promise.resolve([]),
    ]);
    if (requestId !== listRequestRef.current) return;
    const currentAuthenticated = readOwnerRef.current;
    const currentContext = context === undefined ? readOwnerRef.current : resolvedContext;
    const currentPrivateId = currentAuthenticated?.userId &&
      currentAuthenticated.userId === currentContext?.userId
      ? currentAuthenticated.userId
      : null;
    if ((privateContext?.userId || null) !== currentPrivateId) return;
    setArchives(result.archives);
    setCloudCaches(cachedCloud);
    setUnownedCount(result.unownedCount);
    setPendingSync(pending);
    listReadWarningRef.current = false;
    void listVisibleLocalTaxonomyItems(privateContext)
      .then((rows) => {
        if (requestId !== listRequestRef.current) return;
        setLocalTaxonomy(mapLocalProjectTaxonomy(rows));
      })
      .catch((error) => console.warn("local taxonomy", error));
  }, []);

  // A blocked SAF mirror is a real read error, not an empty project list.
  // Catch only unawaited refreshes; awaited reads retain their error contract.
  const refreshListSafely = useCallback((context?: LocalArchiveOwnerContext | null) => {
    void loadList(context).catch((error) => {
      if (listReadWarningRef.current) return;
      listReadWarningRef.current = true;
      console.warn("W5 protected local list read unavailable", error);
      showToast(copy.readFailed);
    });
  }, [loadList, showToast, copy.readFailed]);

  const connectSaf = useCallback(async () => {
    if (safConnectRunning.current) return;
    safConnectRunning.current = true;
    safConnectAttempted.current = true;
    setSafRegrantRunning(true);
    setSafRegrantError("");
    try {
      try {
        await connectLocalSafDirectory();
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        setSafRegrantError(message.includes("No LifeSpace data directory was selected")
          ? copy.safRegrantCanceled
          : message.includes("Select the original LifeSpace data folder")
            ? copy.safRegrantWrong : copy.safRegrantFailed);
        return;
      }
      setSafRegrantNeeded(false);
      setSafConnectionMissing(false);

      try {
        await migrateLegacyLocalOrigin();
        setMigrationWarning(false);
      } catch {
        console.warn("Legacy local origin migration failed after SAF connection.");
        setMigrationWarning(true);
      }

      try {
        await loadList();
      } catch {
        console.warn("Local list refresh failed after SAF connection.");
        showToast(copy.readFailed);
      }
    } finally {
      safConnectRunning.current = false;
      setSafRegrantRunning(false);
    }
  }, [loadList, showToast, copy.safRegrantCanceled, copy.safRegrantWrong, copy.safRegrantFailed, copy.readFailed]);

  const loadCloudList = useCallback(async (
    userId?: string | null, options: { readOnly?: boolean } = {},
  ): Promise<boolean> => {
    const authority = getAndroidAuthSnapshot();
    const resolvedUserId = userId || authority.sessionUserId;
    if (!isAndroidOnline() || authority.status !== "signed-in" ||
        authority.explicitSignedOut || !resolvedUserId ||
        authority.sessionUserId !== resolvedUserId) return false;
    // Invalid/stale callers cannot supersede or clear a newer Owner's list.
    const requestId = ++cloudListRequestRef.current;
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
      if (requestId !== cloudListRequestRef.current || !isAndroidOnline() ||
          getAndroidAuthSnapshot().status !== "signed-in" ||
          getAndroidAuthSnapshot().explicitSignedOut ||
          getAndroidAuthSnapshot().sessionUserId !== resolvedUserId) return false;
      setCloudArchives(displayRows);
      setCloudError("");
      void Promise.all([loadCloudProjectTaxonomy(resolvedUserId), getCloudArchiveCategoryDepths(resolvedUserId)])
        .then(([entries, depths]) => {
          if (requestId !== cloudListRequestRef.current || !isAndroidOnline() ||
              getAndroidAuthSnapshot().status !== "signed-in" ||
              getAndroidAuthSnapshot().explicitSignedOut ||
              getAndroidAuthSnapshot().sessionUserId !== resolvedUserId) return;
          setCloudTaxonomy(entries);
          setCloudDepths(depths);
        })
        .catch((error) => console.warn("cloud taxonomy", error));
      if (!options.readOnly) {
        void refreshCloudOfflineCaches(
          (data || []) as CloudOfflineCacheArchiveSource[],
          { userId: resolvedUserId },
        ).then(() => {
          if (requestId !== cloudListRequestRef.current) return;
          return loadList({ userId: resolvedUserId });
        })
          .catch((cacheError) => console.warn("cloud cache refresh", cacheError));
      }
      return true;
    } catch (error) {
      console.warn("local shell cloud list", error);
      if (requestId !== cloudListRequestRef.current ||
          getAndroidAuthSnapshot().status !== "signed-in" ||
          getAndroidAuthSnapshot().sessionUserId !== resolvedUserId) return false;
      setCloudError(copy.cloudLoadFailed);
      return false;
    } finally {
      if (requestId === cloudListRequestRef.current) setCloudLoading(false);
    }
  }, [copy.cloudLoadFailed, loadList]);

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
    cloudListRequestRef.current += 1;
    setCloudLoading(false);
    setCloudArchives([]);
    setCloudTaxonomy([]);
    setActivityItems([]);
    setPublicDetailItem(null);
    setExperienceItems([]);
  }, [online]);

  useEffect(() => {
    if (auth.status === "checking") {
      listRequestRef.current += 1;
      cloudListRequestRef.current += 1;
      setCloudLoading(false);
      setCloudCaches([]); setPendingSync([]);
      if (!retainCheckingEditor) setDetail(null);
      return;
    }
    if (auth.status === "offline-owner-read" && auth.offlineReadOwner) {
      const identity = readShellIdentityCache(auth.offlineReadOwner.userId);
      setSpaceProfile(identity?.profile || null);
      setMembership(identity?.membership || null);
      setExperienceCardCount(identity?.experienceCardCount || 0);
      setOwner(auth.offlineReadOwner);
      refreshListSafely({ ...auth.offlineReadOwner, snapshotOnly: true });
      return;
    }
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
      refreshListSafely(nextOwner);
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
    refreshListSafely(ownerContext);
  }, [
    auth.email,
    auth.offlineReadOwner,
    auth.rememberedOwner,
    auth.sessionUserId,
    auth.status,
    refreshListSafely,
    retainCheckingEditor,
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

    // Network recovery refreshes lists only. Pending upload operations,
    // attempt counters and original blobs remain completely unchanged.
    void loadCloudList(cloudUserId, { readOnly: true });
    refreshListSafely(authenticatedOwnerContext);
  }, [online, cloudUserId, authenticatedOwnerContext, loadCloudList, refreshListSafely, loadShellIdentity]);

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
    let timedOut = false;
    // If local IndexedDB/queue initialization is genuinely blocked, do not
    // pretend the local data is ready or run a second init concurrently.
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      timedOut = true;
      setLocalStartupFailure("timeout");
    }, 20000);
    async function initialize() {
      try {
        assertLocalOfflineAvailable();
        // Online Android uses internal cloud caches/pending only. Do not inspect,
        // regrant or migrate an independent historical SAF tree on startup.
        // The protected SAF plugin and legacy data remain untouched for S6.
        setSafRegrantNeeded(false);
        setSafConnectionMissing(false);
        if (cancelled || timedOut) return;
        // Remembered metadata is only a label. No inference, queue preparation,
        // SAF hydration, operation-ID generation, or identity-cache unlock here.
        const nextOwner = loadRememberedLocalOwnerContext();
        setOwner(nextOwner);
        if (cancelled || timedOut) return;
        await listVisibleLocalArchiveSummaries({ snapshotOnly: true }, { includePendingCloud: false });
        if (cancelled || timedOut) return;
        void retireBundledLegacyServiceWorkers().catch((error) =>
          console.warn("bundled service worker retirement", error));
      } catch (error) {
        console.warn("offline initialization", error);
        if (cancelled || timedOut) return;
        // An unreadable IndexedDB/list is not a successful local startup.
        // Never clear, rebuild, or overwrite protected private data on error.
        setLocalStartupFailure("error");
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; window.clearTimeout(timeout); };
    // Initialization must run once for this offline document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen.kind !== "detail" && screen.kind !== "edit-project" &&
        screen.kind !== "new-record" && screen.kind !== "edit-record") return;
    if (loading) return;
    if (!readOwnerContext?.userId) {
      // Keep only the quarantined React instance, with no private reads.
      if (retainCheckingEditor) return;
      setDetailStatus("forbidden"); setDetail(null); return;
    }
    let canceled = false;
    const requestId = ++detailLoadRequestRef.current;
    const expectedOwnerId = readOwnerContext.userId;
    const expectedArchiveId = screen.archiveId;
    const expectedScreenKind = screen.kind;
    // This already validated editor must survive a same-Owner, same-project
    // background read. Resetting detail here unmounts RecordForm and discards
    // its real React note and File[] even though the process remains alive.
    const preserveEditor = screen.kind === "new-record" &&
      detail?.archive.id === expectedArchiveId &&
      detail.archive.local_owner_user_id === expectedOwnerId &&
      (detailStatus === "ready" || detailStatus === "loading");
    setDetailStatus("loading");
    if (!preserveEditor) setDetail(null);
    const stillCurrent = () => !canceled &&
      requestId === detailLoadRequestRef.current &&
      readOwnerRef.current?.userId === expectedOwnerId &&
      screenRef.current.kind === expectedScreenKind &&
      "archiveId" in screenRef.current &&
      screenRef.current.archiveId === expectedArchiveId;
    void resolveLocalArchiveDetail(expectedArchiveId, readOwnerContext).then((result) => {
      if (!stillCurrent()) return;
      const next = result.detail;
      // A revoked, missing, wrong-Owner or wrong-project result is never
      // allowed to preserve private form content for the prior identity.
      if (result.status !== "ready" || !next ||
          next.archive.id !== expectedArchiveId ||
          next.archive.local_owner_user_id !== expectedOwnerId) {
        setDetailStatus(result.status === "ready" ? "forbidden" : result.status);
        setDetail(null);
        return;
      }
      setDetailStatus("ready");
      setDetail(next);
    }).catch(() => {
      if (!stillCurrent()) return;
      // A transient read failure must not erase a still-authorized editor.
      // The Owner/screen guard above always supersedes this availability rule.
      setDetailStatus(preserveEditor ? "ready" : "error");
      if (!preserveEditor) setDetail(null);
      showToast(copy.readFailed);
    });
    return () => { canceled = true; };
  }, [screen, readOwnerContext, showToast, copy.readFailed, loading, retainCheckingEditor]);

  function goList() {
    setScreen({ kind: "list" });
    setDetail(null);
    refreshListSafely();
  }

  async function reconnect() {
    const nextOnline = await recheckAndroidConnectivity();
    if (!nextOnline) showToast(
      getAndroidConnectivitySnapshot().transportStatus === "disconnected"
        ? copy.offlineTitle
        : (language === "zh" ? "网络已连接，云端服务暂不可用。" : "Connected, but the cloud service is unavailable."),
    );
  }

  function openDetail(archiveId: string) {
    const item = [
      ...archives,
      ...(readOwnerContext ? cloudCaches : []),
    ].find((row) => row.id === archiveId);
    // Historical independent local archives remain stored but are not edited
    // by the online App; edits could request a new SAF directory permission.
    const pendingCreateOwned = Boolean(item &&
      item.sync?.operation_kind === "create-archive" &&
      isPendingCloudSyncStatus(item.sync.status) &&
      readOwnerContext?.userId &&
      item.local_owner_user_id === readOwnerContext.userId);
    if (item && !pendingCreateOwned &&
        (item.local_role === "local-project" ||
        (item.local_only && !item.source_cloud_archive_id &&
          item.sync?.operation_kind !== "create-archive"))) {
      showToast(language === "zh" ? "该历史本地项目不属于在线云空间，原资料已保留。" :
        "This legacy local project is outside the online cloud workspace; its data is preserved.");
      return;
    }
    if (item?.sync.operation_kind === "create-archive" && !pendingCreateOwned) {
      showToast(language === "zh" ? "登录项目所属账号后查看待上传资料。" : "Sign in as this pending project's owner.");
      return;
    }
    if (item) saveRecentArchiveBrowse({ id: item.id, title: item.title,
      systemName: item.system_name || item.species_name, category: item.category, userId: item.local_owner_user_id });
    setScreen({ kind: "detail", archiveId }, ["edit-project", "new-project", "new-record", "edit-record", "cloud-login"].includes(screen.kind));
  }

  function openDiscoveryProject(item: DiscoveryProjectFeedItem, back: "activity" | "discover-search") {
    const target = resolveAndroidArchiveScreen({
      online,
      archiveId: item.archive_id,
      cloudUserId: authenticatedOwnerContext?.userId || null,
      cloudArchives,
      activityOwnerUserId: item.owner_user_id || null,
      hasPublicFeedItem: true,
      ownedLocalArchives: [
        ...archives,
        ...(readOwnerContext ? cloudCaches : []),
      ],
    });
    if (target.kind === "cloud-detail") {
      setScreen({ kind: "cloud-detail", archiveId: target.archiveId });
      return;
    }
    if (target.kind === "local-detail") {
      openDetail(target.archiveId);
      return;
    }
    setPublicDetailItem(item);
    setPublicDetailBack(back);
    setScreen({ kind: "public-detail" });
  }

  function openOnlineWeb(pathname: string, search = "") {
    if (!online) { showToast(copy.needNetwork); return; }
    // Market editing is web-only; QA must use its matching HTTPS service, never production.
    let origin = "https://life-space.uk";
    if (/^\/market\/[^/]+\/edit(?:\/|$)/.test(pathname)) {
      try {
        origin = qaShareOrigin() || origin;
      } catch {
        showToast(copy.webOnly);
        return;
      }
    }
    // The native custom tab resolves the remote host outside WebViewLocalServer.
    // Closing it returns to the same bundled React document.
    const url = new URL(pathname + search, origin);
    if (url.origin !== origin) return;
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
      returnToProfile();
      return true;
    }
    if (routed.kind === "project-categories") {
      setScreen({ kind: "project-categories" });
      return true;
    }
    if (routed.kind === "membership-payment" || routed.kind === "membership-refund") {
      if (online && auth.status === "signed-out") {
        openCloudLogin(routed.kind);
      } else {
        setScreen({ kind: routed.kind });
      }
      return true;
    }
    if (routed.kind === "interests") {
      setScreen({ kind: "interests", section: routed.id || "plant" });
      return true;
    }
    if (routed.kind === "membership-benefits") {
      setScreen({ kind: "membership-benefits" });
      return true;
    }
    if (routed.kind === "data-security") {
      setScreen({ kind: "data-security" });
      return true;
    }
    if (routed.kind === "legal") {
      setScreen({ kind: "legal" });
      return true;
    }
    if (routed.kind === "legal-page" && routed.id) {
      setScreen({ kind: "legal-page", id: routed.id });
      return true;
    }
    if (routed.kind === "feedback") {
      setScreen({ kind: "feedback" });
      return true;
    }
    if (routed.kind === "report") {
      if (!online) { showToast(copy.needNetwork); return true; }
      const target = getReportTarget(routed.id);
      if (!target) { showToast(language === "zh" ? "只能举报公开记录。" : "Only public records can be reported."); return true; }
      setScreen({ kind: "report", target: target.url });
      return true;
    }
    if (routed.kind === "app-update") {
      setScreen({ kind: "app-update" });
      return true;
    }
    if (routed.kind === "about") {
      setScreen({ kind: "about" });
      return true;
    }
    if (routed.kind === "register") {
      setScreen({ kind: "register" });
      return true;
    }
    if (routed.kind === "login") {
      const returnPath = routed.id && !/^\/(?:login|register)(?:\/|$)/.test(routed.id)
        ? routed.id
        : "/profile";
      if (auth.status === "signed-in") {
        const url = new URL(returnPath, "https://life-space.uk");
        applyShellPath(url.pathname, url.search);
      } else {
        openCloudLogin("profile", undefined, returnPath);
      }
      return true;
    }
    if (routed.kind === "admin-memberships" || routed.kind === "admin-guides" || routed.kind === "admin-support") {
      const returnPath = routed.kind === "admin-memberships"
        ? "/admin/memberships"
        : routed.kind === "admin-guides"
          ? "/admin/guides"
          : "/admin/support";
      if (auth.status === "signed-out") openCloudLogin("profile", undefined, returnPath);
      else setScreen({ kind: routed.kind });
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
    if (routed.kind === "my-experience") {
      if (auth.status !== "signed-in") { openCloudLogin("profile", undefined, "/experience-cards"); return true; }
      setScreen({ kind: "my-experience" });
      return true;
    }
    if (routed.kind === "experience-new") {
      const createPath = `/experience-cards/new${search ? (search.startsWith("?") ? search : `?${search}`) : ""}`;
      if (auth.status !== "signed-in") { openCloudLogin("profile", undefined, createPath); return true; }
      setScreen({ kind: "experience-new", search });
      return true;
    }
    if (routed.kind === "experience-detail" && routed.id) {
      setScreen({ kind: "experience-detail", id: routed.id,
        returnTo: screenRef.current.kind === "my-experience" ? "my-experience" : undefined });
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
    if (routed.kind === "market-mine") {
      setScreen({ kind: "market-mine" });
      return true;
    }
    if (routed.kind === "market-new") {
      setScreen({ kind: "market-new", search });
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
    if (routed.kind === "plant-detail" && routed.id) {
      setScreen({ kind: "plant-detail", id: routed.id });
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
          ...(readOwnerContext ? cloudCaches : []),
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
    if (!online) { showToast(language === "zh" ? "联网后可上传待同步内容" : "Connect to upload pending changes"); return; }
    if (!authenticatedOwnerContext || !cloudUserId) {
      openCloudLogin("list-cloud");
      return;
    }

    setSyncingArchiveId(localArchiveId);
    try {
      const result = await syncAndroidPendingCloudArchive({
        localArchiveId,
        ownerContext: authenticatedOwnerContext,
      });
      await loadList(authenticatedOwnerContext);
      await loadCloudList(cloudUserId);
      if (result.taxonomyWarning) setTaxonomySyncWarning(result.taxonomyWarning);
      window.dispatchEvent(new Event("lifespace-cloud-sync-complete"));
      showToast(
        result.taxonomyWarning || (result.success ? copy.uploadSuccess : result.error || copy.uploadFailed),
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.uploadFailed);
    } finally {
      setSyncingArchiveId(null);
    }
  }

  async function uploadPendingRecord(recordId: string, localArchiveId: string) {
    if (!online) { showToast(language === "zh" ? "联网后才能上传" : "Connect to upload"); return; }
    if (!authenticatedOwnerContext?.userId || authenticatedOwnerContext.userId !== cloudUserId) {
      openCloudLogin("list-cloud"); return;
    }
    if (syncingArchiveId) return;
    setSyncingArchiveId(localArchiveId);
    try {
      const result = await syncAndroidPendingCloudArchive({
        localArchiveId, targetRecordId: recordId,
        ownerContext: authenticatedOwnerContext,
      });
      await loadList(authenticatedOwnerContext);
      await loadCloudList(cloudUserId);
      showToast(result.success ? (language === "zh" ? "上传成功" : "Uploaded") :
        result.error || copy.uploadFailed);
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.uploadFailed);
    } finally { setSyncingArchiveId(null); }
  }

  async function uploadAllPending() {
    if (!online) { showToast(language === "zh" ? "联网后可上传待同步内容" : "Connect to upload pending changes"); return; }
    if (!authenticatedOwnerContext || !cloudUserId) { openCloudLogin("list-cloud"); return; }
    setSyncingArchiveId("all");
    try {
      const results = await syncAndroidAllPendingCloudArchives({ ownerContext: authenticatedOwnerContext });
      await loadList(authenticatedOwnerContext);
      await loadCloudList(cloudUserId);
      window.dispatchEvent(new Event("lifespace-cloud-sync-complete"));
      const warning = results.find((result) => result.taxonomyWarning)?.taxonomyWarning;
      if (warning) setTaxonomySyncWarning(warning);
      showToast(warning || (results.every((result) => result.success) ? copy.uploadSuccess : copy.uploadFailed));
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.uploadFailed);
    } finally {
      setSyncingArchiveId(null);
    }
  }


  async function retryPendingR2Mirrors() {
    if (!online || !authenticatedOwnerContext || !cloudUserId ||
        authenticatedOwnerContext.userId !== cloudUserId || syncingArchiveId) return;
    setSyncingArchiveId("r2");
    try {
      const result = await retryPendingR2MediaMirrorsForOwner(cloudUserId);
      showToast(result.blocked
        ? (language === "zh" ? "镜像状态无法核实，原云端照片已保留" : "Mirror status unavailable; source photos are safe")
        : result.pending > 0
          ? (language === "zh" ? "仍有备用镜像待补传，原云端照片已保留" : "Some mirrors remain pending; source photos are safe")
          : (language === "zh" ? "备用镜像已核实" : "Backup mirrors verified"));
    } catch {
      showToast(language === "zh" ? "补镜像暂不可用，原云端照片已保留" : "Mirror retry unavailable; source photos are safe");
    } finally {
      setSyncingArchiveId(null);
    }
  }

  async function uploadPendingProject(item: PendingCloudProject<LocalArchiveSummary, CloudArchiveSummary>) {
    if (!online) { showToast(language === "zh" ? "联网后可上传待同步内容" : "Connect to upload pending changes"); return; }
    if (!authenticatedOwnerContext || !cloudUserId) { openCloudLogin("list-cloud"); return; }
    if (item.summaries.length === 1) { await uploadPending(item.summaries[0].local_archive_id); return; }
    setSyncingArchiveId(item.key);
    try {
      const results = [];
      for (const summary of item.summaries) {
        results.push(await syncAndroidPendingCloudArchive({ localArchiveId: summary.local_archive_id, ownerContext: authenticatedOwnerContext }));
      }
      await loadList(authenticatedOwnerContext);
      await loadCloudList(cloudUserId);
      window.dispatchEvent(new Event("lifespace-cloud-sync-complete"));
      showToast(results.every((result) => result.success) ? copy.uploadSuccess : copy.uploadFailed);
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.uploadFailed);
    } finally {
      setSyncingArchiveId(null);
    }
  }

  function beginLocalTransfer(archiveId: string) {
    const archive = archives.find((row) => row.id === archiveId);
    if (!archive || !canOfferLocalCloudTransfer(archive)) return;
    if (!online) { showToast(language === "zh" ? "联网后可上传到云端" : "Connect to upload to cloud"); return; }
    if (!authenticatedOwnerContext) { openCloudLogin("local-transfer", archiveId); return; }
    setTransferVisibility(archive.migration_visibility || "private");
    setTransferError("");
    setScreen({ kind: "local-transfer", archiveId });
  }

  async function confirmLocalTransfer(archiveId: string) {
    if (transferRunning || !online) { showToast(copy.needNetwork); return; }
    if (!authenticatedOwnerContext || !cloudUserId) { openCloudLogin("local-transfer", archiveId); return; }
    setTransferRunning(true);
    setTransferError("");
    try {
      const result = await syncLocalArchiveToCloud({
        localArchiveId: archiveId, ownerContext: authenticatedOwnerContext, visibility: transferVisibility,