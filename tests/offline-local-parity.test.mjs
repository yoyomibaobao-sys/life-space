import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("cold-start Android offline shell keeps the online app hierarchy and exposes local workspace under Me", () => {
  const buildScript = read("scripts/build-mobile-offline.mjs");
  const parityStyles = read("mobile-offline-src/local-parity.css");
  const source = read("mobile-offline-src/main.tsx");
  const styles = read("mobile-offline-src/offline.css");
  const template = read("mobile-offline-src/offline.template.html");

  assert.match(buildScript, /local-parity\.css/);
  assert.match(buildScript, /`\$\{css\}\\n\$\{localParityCss\}`/);
  assert.doesNotMatch(source, /本地离线模式|Local offline mode/);
  assert.doesNotMatch(source, /offline-status/);
  assert.match(source, /cloudUnavailable: "未联网"/);
  assert.match(source, /kind: "cloud"; section:/);
  assert.match(source, /useState<Screen>\(\{ kind: "cloud", section: "discover" \}\)/);
  assert.match(source, /discover: "记录"/);
  assert.match(source, /home-section-tabs/);
  assert.match(source, /onClick=\{\(\) => setScreen\(\{ kind: "cloud", section: "discover" \}\)\}/);
  assert.match(source, /online-project-card/);
  assert.match(source, /online-project-media/);
  assert.match(source, /online-project-footer/);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) auto/);
  assert.match(styles, /\.offline-space-identity/);
  assert.match(styles, /height: calc\(env\(safe-area-inset-bottom, 0px\) \+ 58px\)/);
  assert.match(styles, /width: 48px; height: 48px; margin-top: -16px/);
  assert.match(styles, /\.online-project-card[\s\S]*grid-template-columns: 112px minmax\(0, 1fr\)/);
  assert.match(styles, /\.online-project-media[\s\S]*width: 112px;[\s\S]*height: 112px/);
  assert.match(styles, /\.online-project-title[\s\S]*font-size: 16px;[\s\S]*font-weight: 850/);
  assert.match(parityStyles, /\.network-offline[\s\S]*min-height: 46vh/);
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
  const discoverLayout = read("app/discover/layout.tsx");
  const marketLayout = read("app/market/layout.tsx");
  const followLayout = read("app/follow/layout.tsx");

  assert.match(boundary, /navigator\.onLine/);
  assert.match(boundary, /"未联网"/);
  assert.match(boundary, /"Offline"/);
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
