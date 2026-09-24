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
  assert.match(source, /<HomeSectionTabs/);
  assert.match(source, /fetchDiverseDiscoveryProjectBatch/);
  assert.match(source, /fetchDiscoverExperienceCardSearchResults/);
  assert.match(source, /kind: "experience"/);
  assert.match(source, /fetchFollowedArchiveProjects/);
  assert.match(source, /fetchMarketFeed/);
  assert.match(source, /kind: "market"/);
  assert.match(source, /onSelect: \(\) => setScreen\(\{ kind: "market" \}\)/);
  assert.match(source, /kind: "following"/);
  assert.doesNotMatch(source, /screen\.kind === "cloud"/);
  assert.match(source, /function reconnect\(\)/);
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

  assert.match(workspace, /navigator\.onLine/);
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

  assert.match(boundary, /navigator\.onLine/);
  assert.match(boundary, /"未联网"/);
  assert.match(boundary, /"Offline"/);
  assert.match(boundary, /<ConnectivityNotice/);
  assert.match(notice, /data-connectivity-notice/);
  assert.match(discoverLayout, /<NetworkRequiredBoundary>/);
  assert.match(marketLayout, /<NetworkRequiredBoundary>/);
  assert.match(followLayout, /<NetworkRequiredBoundary>/);
});

test("temporary single-character startup placeholder is replaced by the product brand", () => {
  const startup = read("mobile-shell/index.html");

  assert.match(startup, /LifeSpace·自然/);
  assert.match(startup, /有时·耕作/);
  assert.doesNotMatch(startup, />芽</);
});