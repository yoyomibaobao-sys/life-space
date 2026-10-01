import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAndroidRouteCapability, parseAndroidShellPath } from "../lib/android-shell-app-routes.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Follow and Market retain their formal page shell while dropping stale live data", () => {
  const shell = read("mobile-offline-src/main.tsx");
  for (const [path, component] of [["app/follow/page.tsx", "FollowPage"], ["app/market/page.tsx", "MarketPage"]]) {
    const page = read(path);
    assert.match(shell, new RegExp(`<${component}`));
    assert.match(page, /<MobileNetworkUnavailableState/);
    assert.match(page, /useAndroidConnectivity/);
    assert.match(page, /set[A-Za-z]+\(\[\]\)/);
    assert.doesNotMatch(shell, new RegExp(`!online\s*\?\s*<MobileNetworkUnavailableState[^>]*>\s*:\s*<${component}`));
  }
});

test("Market internal detail shares loader and view, and only external links use Browser", () => {
  assert.deepEqual(parseAndroidShellPath("/market/post-1"), { kind: "market-detail", id: "post-1" });
  assert.equal(getAndroidRouteCapability("/market/post-1"), "online-controller");
  assert.equal(getAndroidRouteCapability("/market/post-1/edit"), "online-web");
  const web = read("app/market/[id]/page.tsx");
  const controller = read("components/market/MarketDetailController.tsx");
  const android = read("components/market/AndroidMarketDetailController.tsx");
  const view = read("components/market/MarketDetailView.tsx");
  assert.match(web, /<MarketDetailController/);
  assert.match(android, /<MarketDetailController/);
  assert.match(controller, /loadMarketPostDetail\(supabase, id\)/);
  assert.match(controller, /setPayload\(null\); setLoading\(false\)/);
  assert.match(controller, /<MarketDetailView/);
  assert.match(android, /onExternalLink=\{\(url\) => \{ void Browser\.open\(\{ url \}\)/);
  assert.doesNotMatch(android, /Browser\.open\(\{ url:.*market/);
  assert.match(view, /data-market-detail-view/);
  assert.match(view, /MarketCommentsSection|ReportLink|ArchiveLightbox/);
  assert.match(view, /当前未联网/);
});

test("Guide list and detail change data within the same formal presentation", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const directory = read("app/plant/page.tsx");
  const detail = read("components/plant-detail/GuideDetailView.tsx");
  const web = read("app/plant/guide/[id]/page.tsx");
  assert.match(shell, /<PlantPage offline=\{!online\} offlineDirectory=\{directory\}/);
  assert.match(directory, /rememberGuideDirectory\(rows\)/);
  assert.match(directory, /offlineDirectory/);
  assert.match(directory, /<HomeSectionTabs\s+active="guide"/);
  assert.match(web, /<GuideDetailView id=\{params\.id\}/);
  assert.match(shell, /<GuideDetailView id=\{screen\.guideId \|\| screen\.guideKey\} offline=\{!online\}/);
  assert.doesNotMatch(shell, /function OfflineGuideDetail/);
  assert.match(detail, /getOfflineGuideOverview\(offlineGuide/);
  assert.match(detail, /getOfflineGuideParameters\(offlineGuide/);
  assert.match(detail, /activeTab === "guide"/);
  assert.match(detail, /activeTab === "experience"/);
  assert.match(detail, /联网后查看完整实操/);
});

test("My Space cards share MobileArchiveActions with source-specific write capability", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const actions = read("components/archive/MobileArchiveActions.tsx");
  assert.match(shell, /actionSlot=\{renderProjectActions\(archive, "cloud"\)\}/);
  assert.match(shell, /actionSlot=\{renderProjectActions\(archive, "local"\)\}/);
  assert.match(shell, /actionSlot=\{renderProjectActions\(archive, "cache"\)\}/);
  assert.match(shell, /<MobileArchiveActions/);
  assert.match(shell, /allowTaxonomyEdit=\{source !== "cache"\}/);
  assert.match(shell, /source === "cloud" && cloudUserId && online/);
  assert.match(shell, /updateLocalArchiveFields\(archive\.id, fields, ownerContext\)/);
  assert.match(shell, /await refresh\(\)/);
  assert.match(actions, /taxonomyUnavailableLabel/);
  assert.match(actions, /disabled=\{disabled\}/);
});

test("Group settings use one editor and cached cloud taxonomy is readonly", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const settings = read("components/profile/ProjectCategorySettingsView.tsx");
  assert.match(shell, /cloudRequiresNetwork/);
  assert.match(shell, /cachedTaxonomy/);
  assert.match(settings, /<ConfirmDialog/);
  assert.match(settings, /onCreate|onRename|onDelete/);
  assert.doesNotMatch(settings, /window\.prompt|window\.confirm/);
});

test("Web and Android Profile share navigation, identity card and offline capability", () => {
  const web = read("app/profile/page.tsx");
  const android = read("components/profile/AndroidProfileController.tsx");
  const presentation = read("components/profile/MobileProfilePresentation.tsx");
  const profileView = read("components/profile/MobileProfileView.tsx");
  const snapshot = read("lib/android-offline-profile.ts");
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(web, /mobileProfileNavigation\(\{/);
  assert.match(android, /mobileProfileNavigation\(\{/);
  assert.match(web, /<MobileProfileView/);
  assert.match(android, /<MobileProfileView/);
  assert.match(android, /identityTop=\{<>/);
  assert.match(android, /getLocalizedCountryOptions|buildLocationTextFromFields/);
  assert.match(android, /uploadAvatar/);
  assert.match(android, /!online && snapshot\.userId/);
  assert.doesNotMatch(presentation, /href: "\/profile\/helpful"/);
  assert.doesNotMatch(presentation, /href: "\/experience-cards"/);
  assert.match(profileView, /href="\/profile\/helpful"/);
  assert.match(snapshot, /countryCode|accountNumber|storageUsed/);
  assert.match(shell, /onLogout=\{auth\.status === "signed-in"/);
  assert.match(shell, /profile: auth\.status === "signed-in" \? spaceProfile : null/);
  assert.match(android, /const live = snapshot\.userId \? loaded : null/);
});

test("Bundled header owns one top inset and body text uses readable sizes", () => {
  const css = read("mobile-offline-src/offline.css");
  const header = read("components/mobile/MobilePageHeaderView.tsx");
  const config = read("capacitor.config.ts");
  assert.match(css, /--app-safe-area-top: 0px/);
  assert.match(header, /var\(--app-safe-area-top, env\(safe-area-inset-top, 0px\)\)/);
  assert.match(config, /overlaysWebView: false/);
  assert.match(css, /:root \{ font-size: 16px; \}/);
  assert.match(css, /\.property-row \{[^}]*font-size: 14px/);
  assert.doesNotMatch(css, /\.offline-shell\s*\{[^}]*padding-top:\s*(20|24)px/);
});
