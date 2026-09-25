import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("cold-start Android offline shell presents the local workspace rather than a separate mode", () => {
  const buildScript = read("scripts/build-mobile-offline.mjs");
  const parityStyles = read("mobile-offline-src/local-parity.css");
  const template = read("mobile-offline-src/offline.template.html");
  const source = read("mobile-offline-src/main.tsx");
  const navbar = read("components/navbar.tsx");
  const sharedNavigation = read("components/mobile/MobileBottomNavigationView.tsx");
  const sharedSourceSwitcher = read("components/archive-ui/ArchiveSourceSwitcher.tsx");
  const sharedPageHeader = read("components/mobile/MobilePageHeaderView.tsx");
  const sharedHomeTabs = read("components/home/HomeSectionTabs.tsx");
  const sharedPrimaryNav = read("components/mobile/mobilePrimaryNavigation.ts");
  const sharedIdentity = read("components/archive-ui/PersonalSpaceMobileIdentity.tsx");
  const archivePage = read("app/archive/page.tsx");
  const sharedWorkspace = read("components/archive-ui/ArchiveWorkspaceTemplate.tsx");
  const sharedTaxonomy = read("components/archive-ui/ArchiveTaxonomyPanel.tsx");

  assert.match(buildScript, /local-parity\.css/);
  assert.match(buildScript, /bundledComponentCss/);
  assert.match(buildScript, /`\$\{css\}\\n\$\{localParityCss\}\\n\$\{bundledComponentCss\}`/);
  assert.doesNotMatch(source, /className="offline-header"|className="brand-mode"/);
  assert.doesNotMatch(parityStyles, /\.offline-status/);
  assert.doesNotMatch(parityStyles, /\.source-row > button:nth-child\(1\)/);
  assert.doesNotMatch(parityStyles, /\.source-row > button:nth-child\(2\)/);
  assert.doesNotMatch(parityStyles, /grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(source, /<MobileBottomNavigationView/);
  assert.match(source, /getMobilePrimaryNavigationDescriptors/);
  assert.match(sharedPrimaryNav, /"home"[\s\S]*"following"[\s\S]*"market"[\s\S]*"me"/);
  assert.match(source, /<MobilePageHeaderView/);
  assert.match(source, /homeSectionOwnsTopNav/);
  assert.match(source, /<PersonalSpaceMobileIdentity/);
  assert.match(source, /from "@\/lib\/local-identity-cache"/);
  assert.match(source, /clearShellIdentityCache/);
  assert.match(source, /supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(archivePage, /<PersonalSpaceMobileIdentity/);
  assert.match(sharedIdentity, /storageUsagePercent/);
  assert.match(source, /<HomeSectionTabs/);
  assert.match(source, /onSearch=\{\(\) => setScreen\(\{ kind: "discover-search" \}\)\}/);
  assert.match(sharedHomeTabs, /searchEnabled && !onSearch/);
  assert.match(read("app/discover/search/page.tsx"), /stayInCurrentShell/);
  assert.match(source, /fetchDiverseDiscoveryProjectBatch/);
  assert.match(source, /fetchDiscoverExperienceCardSearchResults/);
  assert.match(source, /kind: "experience"/);
  assert.match(source, /fetchFollowedArchiveProjects/);
  assert.match(source, /fetchMarketFeed/);
  assert.match(source, /kind: "market"/);
  assert.match(source, /onSelect: \(\) => setScreen\(\{ kind: "market" \}\)/);
  assert.match(source, /kind: "following"/);
  assert.doesNotMatch(source, /screen\.kind === "cloud"/);
  assert.match(source, /async function reconnect\(\)/);
  assert.match(source, /probeCloudReachable/);
  assert.match(source, /replaceWithOfficialSite/);
  assert.match(source, /onSelect: \(\) => setScreen\(\{ kind: "following" \}\)/);
  assert.match(source, /kind: "activity"/);
  assert.match(source, /onSelect: \(\) => setScreen\(\{ kind: "activity" \}\)/);
  assert.match(sharedHomeTabs, /onSelect\?: \(section: HomeSection\) => void/);
  assert.match(sharedPageHeader, /data-mobile-page-header="true"/);
  assert.match(source, /<ArchiveProjectCard/);
  assert.match(source, /<ArchiveRecordCardShell/);
  assert.match(sharedWorkspace, /<ConnectivityNotice/);
  assert.match(navbar, /<MobileBottomNavigationView/);
  assert.match(sharedNavigation, /data-mobile-bottom-nav="true"/);
  assert.match(source, /<ArchiveWorkspaceTemplate/);
  assert.match(source, /sourceOptions=\{\[/);
  assert.match(source, /activeSource=\{sourceFilter\}/);
  assert.match(source, /<ArchiveTaxonomyPanel/);
  assert.match(sharedTaxonomy, /archiveCategoryOptions\.map/);
  assert.match(sharedSourceSwitcher, /aria-pressed=\{activeValue === item\.value\}/);
  assert.doesNotMatch(template, /本地离线模式/);
});

test("normal app workspace keeps the same source controls while offline without changing data identity", () => {
  const workspace = read("components/archive-ui/ArchiveWorkspaceTemplate.tsx");
  const cloudTrial = read("components/CloudTrialEntry.tsx");

  assert.match(workspace, /useCloudAvailability/);
  assert.match(workspace, /<ArchiveSourceSwitcher/);
  assert.match(workspace, /options=\{sourceOptions\}/);
  assert.match(workspace, /activeValue=\{activeSource\}/);
  assert.doesNotMatch(workspace, /sourceBeforeOfflineRef|localOption|visibleSourceOptions/);
  assert.doesNotMatch(workspace, /updateLocalArchiveFields|syncLocalArchiveToCloud|createLocalArchive/);

  assert.match(cloudTrial, /navigator\.onLine/);
  assert.match(cloudTrial, /if \(!online\) return null/);
});

test("network-only sections use one quiet offline state", () => {
  const boundary = read("components/network/NetworkRequiredBoundary.tsx");
  const notice = read("components/mobile/ConnectivityNotice.tsx");
  const discoverLayout = read("app/discover/layout.tsx");
  const marketLayout = read("app/market/layout.tsx");
  const followLayout = read("app/follow/layout.tsx");

  assert.match(boundary, /return children/);
  assert.match(notice, /data-connectivity-notice/);
  assert.match(discoverLayout, /<NetworkRequiredBoundary>/);
  assert.match(marketLayout, /<NetworkRequiredBoundary>/);
  assert.match(followLayout, /<NetworkRequiredBoundary>/);
});

test("local projects reuse the cloud archive card and detail header with device-only status", () => {
  const archivePage = read("app/archive/page.tsx");
  const localDetail = read("app/local/archive/[id]/page.tsx");
  const localView = read("components/archive-ui/localArchiveProjectView.ts");
  const projectCard = read("components/archive-ui/ArchiveProjectCard.tsx");
  const cloudCard = read("components/archive/ArchiveCard.tsx");
  const summaryCard = read("components/project/ProjectSummaryCard.tsx");
  const zh = read("lib/i18n/zh.ts");
  const en = read("lib/i18n/en.ts");

  assert.match(cloudCard, /<ArchiveProjectCard/);
  assert.match(archivePage, /localArchiveToArchiveItem/);
  assert.match(archivePage, /<ArchiveCard/);
  assert.match(archivePage, /hidePublicToggle/);
  assert.match(localView, /archiveCopy\.local_project/);
  assert.match(localView, /archiveCopy\.saved_on_this_device/);
  assert.match(localView, /export function localArchiveToArchiveItem/);
  assert.match(projectCard, /project\.storageLabel/);
  assert.match(summaryCard, /props\.storageLabel/);
  assert.match(cloudCard, /storageLabel/);
  assert.match(archivePage, /t\.archive\.transfer_to_cloud/);
  assert.match(archivePage, /activeLocalArchives\.map\(\(archive\) => renderLocalArchiveCard\(archive\)\)/);
  assert.match(archivePage, /showCloudEndedList \|\| showLocalEndedList/);
  assert.match(archivePage, /endedLocalArchives\.map\(\(archive\) => renderLocalArchiveCard\(archive\)\)/);
  assert.match(localView, /help_status: null,\s*view_count: 0,\s*};/);
  assert.doesNotMatch(localView, /follower_count: 0/);
  assert.match(cloudCard, /followerCount: href \? undefined : item\.follower_count/);
  assert.match(cloudCard, /followerCount=\{href \? undefined : item\.follower_count\}/);
  assert.match(localDetail, /<ArchiveDetailHeaderView/);
  assert.match(localDetail, /eyebrow=\{archiveCopy\.project_archive\}/);
  assert.match(localDetail, /archiveCopy\.local_project/);
  assert.match(localDetail, /archiveCopy\.saved_on_this_device/);
  assert.match(localDetail, /archiveCopy\.transfer_to_cloud/);
  assert.match(localDetail, /profileAlwaysOpen/);
  assert.match(localDetail, /<MobilePageHeader/);
  assert.match(localDetail, /archiveCopy\.details/);
  assert.match(localDetail, /archiveCopy\.dossier/);
  assert.match(localDetail, /archiveCopy\.experience_cards/);
  assert.match(localDetail, /showPageChrome=\{false\}/);
  assert.match(zh, /saved_on_this_device: "仅保存于当前设备"/);
  assert.match(en, /saved_on_this_device: "Saved only on this device"/);
  assert.match(archivePage, /t\.archive\.cloud_offline_cache/);
  assert.match(archivePage, /t\.archive\.cloud_offline_cache_readonly/);
  assert.match(archivePage, /t\.archive_workspace\.cloud_space/);
  assert.match(localDetail, /archiveCopy\.cloud_offline_cache/);
  assert.match(localDetail, /mode=\{isCloudOfflineCache \? "viewer" : "owner"\}/);
  assert.match(localDetail, /isCloudOfflineCache \? null : \(/);
});

test("local projects stay fully usable when cloud is unreachable and identity is cached", () => {
  const archivePage = read("app/archive/page.tsx");
  const identity = read("lib/local-identity-cache.ts");
  const shell = read("mobile-offline-src/main.tsx");

  assert.match(archivePage, /deviceLocalArchives\.length/);
  assert.match(archivePage, /isCloudUnavailableError/);
  assert.match(archivePage, /useCloudAvailability/);
  assert.match(archivePage, /useCloudCacheSource && activeSource !== "cloud"/);
  assert.match(archivePage, /readLocalIdentityCache\(user\.id\)/);
  assert.match(archivePage, /persistLocalIdentityFromLiveProfile/);
  assert.match(archivePage, /displayAvatarUrl\(spaceProfile\)/);
  assert.doesNotMatch(archivePage, /activeSource !== "local" &&\s+Boolean\(currentOwnerContext\?\.userId\) &&\s+contentBlocked/);

  assert.match(identity, /lifespace_shell_identity_v1:/);
  assert.match(identity, /userId/);
  assert.match(identity, /username/);
  assert.match(identity, /avatar_data_url/);
  assert.match(identity, /export async function persistLocalIdentityFromLiveProfile/);
  assert.match(identity, /export function recoverStoredOwnerFromIdentityCache/);
  assert.match(shell, /from "@\/lib\/local-identity-cache"/);
  assert.match(shell, /persistLocalIdentityFromLiveProfile/);
  assert.match(shell, /recoverStoredOwnerFromIdentityCache/);
});

test("offline my-space groups local projects, live cloud, and caches without mixing them", () => {
  const archivePage = read("app/archive/page.tsx");
  const db = read("lib/local-offline-db.ts");
  const localDetail = read("app/local/archive/[id]/page.tsx");
  const quickCapture = read("components/quick-record/QuickCaptureNavAction.tsx");
  const taxonomy = read("components/archive/MobileArchiveTaxonomyInline.tsx");
  const summaryCard = read("components/project/ProjectSummaryCard.tsx");
  const headerView = read("components/archive-ui/ArchiveDetailHeaderView.tsx");
  const shell = read("mobile-offline-src/main.tsx");

  assert.match(db, /function isUserLocalArchive/);
  assert.match(db, /normalizeLocalArchiveRole\(archive\) !== "cloud-offline-cache"/);
  assert.match(db, /listVisibleLocalArchiveSummaries/);
  assert.match(db, /listVisibleCloudOfflineArchiveSummaries/);
  assert.match(db, /function ownerContextForVisibleCaches/);
  assert.match(shell, /<DiscoverFilterBar/);
  assert.match(shell, /<MobileContentTopBar/);
  assert.match(shell, /<ArchiveDetailHeaderView/);
  assert.match(archivePage, /deviceLocalArchives\.filter/);
  assert.match(archivePage, /if \(item\.local_role !== "cloud-offline-cache"\) return false;/);
  assert.match(archivePage, /cloudUnavailable \|\| cloudLiveAvailable === false/);
  assert.match(
    archivePage,
    /useCloudCacheSource \? \(\s*activeCloudCaches\.length === 0/
  );
  assert.match(archivePage, /renderLocalArchiveCard\(archive, \{ cloudCache: true \}\)/);
  assert.match(
    archivePage,
    /activeLocalArchives\.map\(\(archive\) => renderLocalArchiveCard\(archive\)\)/
  );
  assert.doesNotMatch(
    archivePage,
    /useCloudCacheSource \?[\s\S]{0,200}activeArchives\.map/
  );
  assert.match(archivePage, /t\.archive\.cloud_offline_cache_readonly/);
  assert.match(archivePage, /isCloudCache \? null : \(/);
  assert.match(localDetail, /isCloudOfflineCache \? null : \(/);
  assert.match(localDetail, /canWrite=\{archive\.local_role !== "cloud-offline-cache"\}/);
  assert.match(localDetail, /mode=\{isCloudOfflineCache \? "viewer" : "owner"\}/);
  assert.match(localDetail, /canManage=\{cycleEnabled && !isCloudOfflineCache\}/);
  assert.doesNotMatch(
    localDetail,
    /isCloudOfflineCache \?[\s\S]{0,80}archiveCopy\.transfer_to_cloud/
  );
  assert.match(archivePage, /const hideCloudCreate = useCloudCacheSource && activeSource === "cloud"/);
  assert.match(archivePage, /showCreateToolbar=\{!isMobileViewport && !hideCloudCreate\}/);
  assert.match(archivePage, /isMobileViewport && !hideCloudCreate \?/);
  assert.match(archivePage, /if \(hideCloudCreate\) return;/);
  assert.match(quickCapture, /isCloudOfflineCacheArchiveId\(localArchiveId\)/);
  assert.match(quickCapture, /return null;/);
  assert.match(taxonomy, /readOnly=\{readOnly\}/);
  assert.match(summaryCard, /readOnly=\{taxonomyAction\.allowTaxonomyEdit === false\}/);
  assert.match(localDetail, /archiveCopy\.cloud_offline_cache_readonly/);
  assert.match(headerView, /project\.storageTone !== "device"/);
  assert.match(shell, /const hideCloudCreate = useCloudCacheSource && sourceFilter === "cloud"/);
  assert.match(shell, /viewingCloudCache \? null/);
});

test("offline shell reuses online discover follow market and guide chrome without duplicate headers", () => {
  const source = read("mobile-offline-src/main.tsx");
  const directoryView = read("components/plant/OfflineGuideDirectoryView.tsx");
  const publicCard = read("components/plant/PublicGuideCard.tsx");
  const plantPage = read("app/plant/page.tsx");
  const tabBar = read("components/archive-ui/ArchiveDetailTabBar.tsx");
  const localDetail = read("app/local/archive/[id]/page.tsx");

  assert.match(source, /homeSectionOwnsTopNav = \[[\s\S]*"following"[\s\S]*"market"[\s\S]*"detail"/);
  assert.match(source, /<OfflineGuideDirectoryView/);
  assert.doesNotMatch(source, /from "@\/app\/plant\/page"/);
  assert.doesNotMatch(source, /className="guide-item"/);
  assert.match(directoryView, /<HomeSectionTabs/);
  assert.match(directoryView, /<GuideCategoryTabs/);
  assert.match(directoryView, /<MobileSearchField/);
  assert.match(directoryView, /<PublicGuideCard/);
  assert.match(directoryView, /getOfflineGuideOverview/);
  assert.match(source, /loadOfflineGuideDirectory/);
  assert.match(plantPage, /PublicGuideCardBody/);
  assert.match(publicCard, /publicGuideCardStyle/);
  assert.match(source, /onSearch=\{\(\) => setScreen\(\{ kind: "discover-search" \}\)\}/);
  assert.match(source, /<DiscoverFilterBar/);
  assert.match(source, /followChromeTab === "projects"/);
  assert.match(source, /followChromeTab === "experience"/);
  assert.match(source, /followChromeTab === "users"/);
  assert.match(source, /copy\.marketAll/);
  assert.match(source, /offlineMarketFilterToggleStyle/);
  assert.match(source, /<ArchiveDetailTabBar/);
  assert.match(source, /<ProjectMetaLine/);
  assert.match(source, /<ArchiveCycleTimeline/);
  assert.match(source, /<ArchiveDetailHeaderView/);
  assert.match(tabBar, /gridTemplateColumns: "repeat\(3, minmax\(0, 1fr\)\)"/);
  assert.match(localDetail, /<ArchiveDetailTabBar/);
  assert.match(source, /canManage=\{cycleEnabled && !isCloudCache\}/);
  assert.match(source, /isCloudCache \? <span className="photo-view"/);
});

test("offline identity opens the shared profile settings and local category depths persist on device", () => {
  const source = read("mobile-offline-src/main.tsx");
  const identity = read("components/archive-ui/PersonalSpaceMobileIdentity.tsx");
  const profile = read("app/profile/page.tsx");
  const categories = read("app/profile/project-categories/page.tsx");
  const settings = read("lib/archive-category-settings.ts");
  const homeTabs = read("components/home/HomeSectionTabs.tsx");
  const discoverSearch = read("app/discover/search/page.tsx");
  const zh = read("lib/i18n/zh.ts");

  assert.match(identity, /onProfileClick\?: \(\) => void/);
  assert.match(source, /onProfileClick=\{\(\) => setScreen\(\{ kind: "settings" \}\)\}/);
  assert.match(source, /<ProfilePage/);
  assert.match(source, /<ProjectCategorySettingsPage/);
  assert.match(source, /kind: "project-categories"/);
  assert.match(profile, /stayInCurrentShell/);
  assert.match(profile, /onOpenProjectCategories/);
  assert.match(profile, /cloud_setting_requires_network/);
  assert.match(categories, /saveLocalArchiveCategoryDepths\(next/);
  assert.match(settings, /LOCAL_SETTINGS_PREFIX/);
  assert.match(settings, /LOCAL_ARCHIVE_CATEGORY_DEPTHS_CHANGED_EVENT/);
  assert.match(source, /LOCAL_ARCHIVE_CATEGORY_DEPTHS_CHANGED_EVENT/);
  assert.match(zh, /当前未联网，此设置需要连接云端后才能修改。/);
  assert.match(homeTabs, /searchEnabled && !onSearch/);
  assert.match(discoverSearch, /stayInCurrentShell/);
  assert.doesNotMatch(source, /createExperienceCard|local experience card|experience_card_draft/i);
  assert.match(source, /if \(!explicitSignOutRef\.current && !wasLocalOwnerExplicitlySignedOut\(\)\)/);
});

test("temporary single-character startup placeholder is replaced by the product brand", () => {
  const startup = read("mobile-shell/index.html");

  assert.match(startup, /LifeSpace·自然/);
  assert.match(startup, /有时·耕作/);
  assert.doesNotMatch(startup, />芽</);
});