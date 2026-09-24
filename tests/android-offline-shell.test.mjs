import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("Android packages a same-origin standalone local project surface", () => {
  const config = read("capacitor.config.ts");
  const packageJson = read("package.json");
  const buildScript = read("scripts/build-mobile-offline.mjs");
  const source = read("mobile-offline-src/main.tsx");
  const parityStyles = read("mobile-offline-src/local-parity.css");
  const generated = read("mobile-shell/offline.html");
  const sharedSourceSwitcher = read("components/archive-ui/ArchiveSourceSwitcher.tsx");

  assert.match(config, /hostname: cloudUrl\.hostname/);
  assert.doesNotMatch(config, /url: cloudUrl\.origin/);
  assert.match(read("scripts/build-mobile-offline.mjs"), /"index\.html"/);
  assert.match(packageJson, /"android:sync": "npm run android:offline && cap sync android"/);
  assert.match(buildScript, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(buildScript, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(source, /listVisibleLocalArchiveSummaries/);
  assert.match(source, /inferSingleLocalArchiveOwnerContext/);
  assert.match(source, /rememberLocalOwnerContext/);
  assert.match(source, /createLocalArchive/);
  assert.match(source, /createLocalRecord/);
  assert.match(source, /updateLocalArchiveFields/);
  assert.match(source, /updateLocalRecordFields/);
  assert.match(source, /deleteLocalArchive/);
  assert.match(source, /deleteLocalRecord/);
  assert.match(source, /accept="image\/\*"/);
  assert.match(source, /capture="environment"/);
  assert.match(source, /copy.camera/);
  assert.match(source, /copy.album/);
  assert.match(source, /<MobileBottomNavigationView/);
  assert.match(source, /<ArchiveProjectCard/);
  assert.match(source, /<ArchiveRecordCardShell/);
  assert.match(source, /<ConnectivityNotice/);
  assert.match(source, /navigator\.onLine/);
  assert.match(source, /saveCloudArchiveToLocal/);
  assert.match(source, /syncPendingCloudArchive/);
  assert.match(source, /listPendingCloudSyncSummaries/);
  assert.match(source, /supabase\.auth\.getSession/);
  assert.match(source, /supabase[\s\S]*?\.from\("archives"\)/);
  assert.match(source, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.doesNotMatch(source, /\.order\("updated_at", \{ ascending: false \}\)/);
  assert.match(parityStyles, /\.brand-mode[\s\S]*display: none/);
  assert.doesNotMatch(parityStyles, /\.offline-status/);
  assert.doesNotMatch(parityStyles, /\.source-row > button:nth-child\(1\)/);
  assert.doesNotMatch(parityStyles, /\.source-row > button:nth-child\(2\)/);
  assert.match(source, /label: copy\.all/);
  assert.match(source, /label: copy\.cloud/);
  assert.match(source, /<ArchiveSourceSwitcher/);
  assert.match(source, /renderSourceSwitcher\("cloud"\)/);
  assert.match(sharedSourceSwitcher, /aria-pressed=\{activeValue === item\.value\}/);
  assert.match(generated, /life-space-local-offline/);
  assert.doesNotMatch(generated, /<script[^>]+src=/i);
  assert.doesNotMatch(generated, /<link[^>]+stylesheet/i);
});

test("offline shell safely recovers one local owner when browser session state is unavailable", () => {
  const db = read("lib/local-offline-db.ts");
  const source = read("mobile-offline-src/main.tsx");

  assert.match(db, /export async function inferSingleLocalArchiveOwnerContext/);
  assert.match(db, /if \(owners\.size > 1\) return null/);
  assert.match(source, /if \(!nextOwner\)[\s\S]*inferSingleLocalArchiveOwnerContext/);
  assert.match(source, /rememberLocalOwnerContext/);
});

test("offline guides expose only the registered-user overview boundary", () => {
  const source = read("mobile-offline-src/main.tsx");
  const guideCache = read("lib/offline-guide-directory.ts");
  const plantIndex = read("app/plant/page.tsx");

  assert.match(source, /kind: "guide-detail"/);
  assert.match(source, /!owner[\s\S]*guideSignInRequired/);
  assert.match(source, /getOfflineGuideOverview\(guide, language\)/);
  assert.match(source, /getOfflineGuideParameters\(guide, language\)/);
  assert.match(source, /owner && guide\.description/);
  assert.match(source, /full practice guidance, experience cards, and related projects/);
  assert.match(guideCache, /PUBLIC_SOURCES/);
  assert.match(guideCache, /plantCoreParameters/);
  assert.match(guideCache, /\["light", "scene", "indoor"\]/);
  assert.match(plantIndex, /if \(!isSignedIn \|\| loading \|\| !plants\.length\) return/);
  assert.match(plantIndex, /parametersZh: zh\.parameters\.slice\(0, 3\)/);
  assert.match(plantIndex, /content, content_en/);