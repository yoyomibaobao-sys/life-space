import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ANDROID_MOBILE_BOTTOM_NAV_IDS,
  ANDROID_MOBILE_PAGE_CONTRACT,
} from "../lib/android-mobile-page-layout.ts";
import { parseAndroidShellPath } from "../lib/android-shell-app-routes.ts";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("online and offline Android shells share the same bottom navigation contract", () => {
  const nav = read("components/mobile/mobilePrimaryNavigation.ts");
  const shell = read("mobile-offline-src/main.tsx");
  const navbar = read("components/navbar.tsx");

  assert.deepEqual([...ANDROID_MOBILE_BOTTOM_NAV_IDS], [
    "home",
    "following",
    "market",
    "me",
  ]);
  assert.match(nav, /"home"[\s\S]*"following"[\s\S]*"market"[\s\S]*"me"/);
  assert.match(shell, /getMobilePrimaryNavigationDescriptors/);
  assert.match(navbar, /getMobilePrimaryNavigationDescriptors/);
  assert.match(shell, /<MobileBottomNavigationView/);
});

test("discover mobile keeps the two-column card contract and search entry", () => {
  const feedCss = read("components/discover/DiscoverProjectFeed.module.css");
  const tabs = read("components/home/HomeSectionTabs.tsx");
  const shell = read("mobile-offline-src/main.tsx");
  const discover = read("app/discover/page.tsx");

  assert.match(feedCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(tabs, /searchHref=\{/);
  assert.match(tabs, /\/discover\/search/);
  assert.match(discover, /<DiscoverProjectGrid/);
  assert.match(discover, /compactMobile=\{isMobileViewport\}/);
  assert.match(shell, /<DiscoverProjectGrid/);
  assert.match(shell, /<DiscoverFilterBar/);
  assert.match(shell, /onSearch=\{\(\) => setScreen\(\{ kind: "discover-search" \}\)\}/);
  assert.doesNotMatch(shell, /android-discover-grid/);
  assert.equal(ANDROID_MOBILE_PAGE_CONTRACT.discoverGrid, "discover-mobile-two-column");
  assert.equal(ANDROID_MOBILE_PAGE_CONTRACT.discoverSearch, "discover-search-entry");
});

test("following and market pages keep one chrome online and offline", () => {
  const follow = read("app/follow/page.tsx");
  const market = read("app/market/page.tsx");
  const shell = read("mobile-offline-src/main.tsx");

  assert.match(follow, /<MobileContentTopBar/);
  assert.match(follow, /followT\.users_mobile/);
  assert.match(follow, /<MobileNetworkUnavailableState/);
  assert.match(market, /t\.market\.my_posts/);
  assert.match(market, /<MobileNetworkUnavailableState/);
  assert.match(shell, /<FollowPage/);
  assert.match(shell, /<MarketPage/);
  assert.doesNotMatch(shell, /experience-shell-card/);
});

test("personal space local, cloud, cache, and pending share ArchiveProjectCard", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const view = read("components/archive-ui/localArchiveProjectView.ts");
  const card = read("components/archive-ui/ArchiveProjectCard.tsx");

  assert.match(card, /export default function ArchiveProjectCard/);
  assert.match(shell, /renderCloudProjectCard/);
  assert.match(shell, /localArchiveToProjectView\(archive, ownerContext, language, (?:cloudDepths|getLocalArchiveCategoryDepths)/);
  assert.doesNotMatch(shell, /visibilityLabel: copy\.offlineCopies/);
  assert.doesNotMatch(shell, /visibilityLabel: copy\.local/);
  assert.match(view, /pending_sync_badge/);
  assert.match(view, /cloud_cache_copy/);
  assert.match(shell, /data-android-shell-page="personal-space"/);
});

test("profile page remains available offline in the Android shell", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const androidProfile = read("components/profile/AndroidProfileController.tsx") + read("components/profile/MobileProfilePresentation.tsx");
  const identity = read("components/archive-ui/PersonalSpaceMobileIdentity.tsx");

  assert.match(shell, /kind: "profile"/);
  assert.match(shell, /<AndroidProfileController/);
  assert.doesNotMatch(shell, /<ProfilePage/);
  assert.match(shell, /profileHref="\/profile"/);
  assert.match(androidProfile, /<MobileProfileView/);
  assert.match(read("components/profile/MobileProfileView.tsx"), /<MobileProfileModuleTabs/);
  assert.match(read("components/profile/MobileProfileView.tsx"), /IdentityStat/);
  assert.match(androidProfile, /开通云会员|Cloud Membership/);
  assert.match(androidProfile, /订单进度查询|Order progress/);
  assert.match(androidProfile, /备份与导出|Backup & export/);
  assert.match(identity, /profileHref/);
  assert.match(identity, /onExperienceClick/);
  assert.match(shell, /experienceHref=\{hasAuthenticatedIdentity && online \? "\/experience-cards" : null\}/);
  assert.match(shell, /需联网查看经验卡/);
  assert.match(shell, /data-android-shell-page="profile"/);
});

test("help state stays visible on project cards and editable in record properties and the more menu", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const archiveCard = read("components/archive/ArchiveCard.tsx");
  const recordCard = read("components/archive-detail/ArchiveRecordCard.tsx");
  const archiveActions = read("components/archive/MobileArchiveActions.tsx");
  const cloudDetail = read("components/archive-ui/CloudArchiveDetailController.tsx");

  assert.match(shell, /help_status\?: string \| null/);
  assert.match(shell, /helpLabel: archive\.help_status === "open"[\s\S]*"resolved"/);
  assert.match(archiveCard, /item\.help_status === "resolved"[\s\S]*help_resolved/);
  assert.match(recordCard, /aria-label=\{copy\.help_status\}[\s\S]*value=\{item\.status_tag \|\| ""\}/);
  assert.match(recordCard, /mobileRecordHelpActionRowStyle[\s\S]*onSetHelpStatus\("resolved"\)[\s\S]*copy\.resolved[\s\S]*onSetHelpStatus\(null\)[\s\S]*copy\.cancel_help/);
  assert.match(archiveActions, /helpStatus === "open"[\s\S]*t\.record\.mark_resolved[\s\S]*t\.record\.cancel_help/);
  assert.match(archiveActions, /helpStatus === "resolved"[\s\S]*重新求助/);
  assert.match(shell, /helpStatus=\{source === "cloud"[\s\S]*onSetHelpStatus=\{source === "cloud"/);
  assert.match(cloudDetail, /statusBadge=\{archive\.help_status === "open"[\s\S]*recordCopy\.help_in_progress[\s\S]*recordCopy\.resolved/);
});

test("guide online and offline keep the PlantPage presentation and swap data", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const plant = read("app/plant/page.tsx");

  assert.match(plant, /<HomeSectionTabs\s+active="guide"/);
  assert.match(shell, /<PlantPage/);
  assert.match(shell, /<PlantPage offline=\{!online\} offlineDirectory=\{directory\}/);
  assert.match(plant, /if \(offline\)[\s\S]*setPlants\(entries\.map/);
  assert.match(shell, /findOfflineGuideEntry/);
  assert.match(shell, /data-android-shell-page="guides"/);
  assert.match(shell, /kind: "guide-detail"/);
  assert.match(shell, /<PlantDetailContent id=\{screen\.id\}/);
  assert.match(shell, /kind: "plant-detail"/);
});

test("offline state replaces data, not the page frame", () => {
  const unavailable = read("components/mobile/MobileNetworkUnavailableState.tsx");
  const shell = read("mobile-offline-src/main.tsx");

  assert.match(unavailable, /data-mobile-network-unavailable="true"/);
  assert.match(unavailable, /archive_workspace.offline_notice/);
  assert.match(shell, /<MobileNetworkUnavailableState/);
  assert.match(shell, /<HomeSectionTabs/);
  assert.match(shell, /<DiscoverFilterBar/);
  assert.doesNotMatch(shell, /className="offline-header"|className="brand-mode"/);
});

test("shell routes map web paths onto the shared Android screens", () => {
  assert.deepEqual(parseAndroidShellPath("/discover"), { kind: "activity" });
  assert.deepEqual(parseAndroidShellPath("/discover/search"), {
    kind: "discover-search",
  });
  assert.deepEqual(parseAndroidShellPath("/follow"), { kind: "following" });
  assert.deepEqual(parseAndroidShellPath("/market"), { kind: "market" });
  assert.deepEqual(parseAndroidShellPath("/market/mine"), { kind: "market-mine" });
  assert.deepEqual(parseAndroidShellPath("/market/new"), { kind: "market-new" });
  assert.deepEqual(parseAndroidShellPath("/experience-cards/card-1"), { kind: "experience-detail", id: "card-1" });
  assert.deepEqual(parseAndroidShellPath("/archive"), { kind: "list" });
  assert.deepEqual(parseAndroidShellPath("/profile"), { kind: "profile" });
  assert.deepEqual(parseAndroidShellPath("/plant"), { kind: "guides" });
  assert.deepEqual(parseAndroidShellPath("/plant/species-1"), { kind: "plant-detail", id: "species-1" });
  assert.deepEqual(parseAndroidShellPath("/plant/guide/guide-1"), { kind: "guide-detail", id: "guide-1" });
  assert.equal(parseAndroidShellPath("/membership/benefits")?.kind, "membership-benefits");
  assert.equal(parseAndroidShellPath("/profile/data-security")?.kind, "data-security");
  assert.equal(parseAndroidShellPath("/legal")?.kind, "legal");
  assert.deepEqual(parseAndroidShellPath("/legal/privacy"), { kind: "legal-page", id: "privacy" });
  assert.equal(parseAndroidShellPath("/feedback")?.kind, "feedback");
  assert.equal(parseAndroidShellPath("/membership/payment")?.kind, "membership-payment");
  assert.equal(parseAndroidShellPath("/membership/refund")?.kind, "membership-refund");
});
