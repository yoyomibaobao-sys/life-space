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

  assert.match(buildScript, /local-parity\.css/);
  assert.match(buildScript, /bundledComponentCss/);
  assert.match(buildScript, /`\$\{css\}\\n\$\{localParityCss\}\\n\$\{bundledComponentCss\}`/);
  assert.match(parityStyles, /\.brand-mode[\s\S]*display: none/);
  assert.doesNotMatch(parityStyles, /\.offline-status/);
  assert.match(parityStyles, /\.source-row > button:nth-child\(1\)/);
  assert.match(parityStyles, /\.source-row > button:nth-child\(2\)/);
  assert.match(parityStyles, /grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(source, /<MobileBottomNavigationView/);
  assert.match(source, /<ArchiveProjectCard/);
  assert.match(source, /<ArchiveRecordCardShell/);
  assert.match(source, /<ConnectivityNotice/);
  assert.match(navbar, /<MobileBottomNavigationView/);
  assert.match(sharedNavigation, /data-mobile-bottom-nav="true"/);
  assert.doesNotMatch(template, /本地离线模式/);
});

test("normal app workspace automatically exposes local projects while offline without changing data identity", () => {
  const workspace = read("components/archive-ui/ArchiveWorkspaceTemplate.tsx");
  const cloudTrial = read("components/CloudTrialEntry.tsx");

  assert.match(workspace, /navigator\.onLine/);
  assert.match(workspace, /sourceBeforeOfflineRef/);
  assert.match(workspace, /item\.value === "local"/);
  assert.match(workspace, /onSelectSource\(localOption\.value\)/);
  assert.match(workspace, /onSelectSource\(previousSource\)/);
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