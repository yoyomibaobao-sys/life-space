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
  const sharedPageHeader = read("components/mobile/MobilePageHeaderView.tsx");
  const sharedWorkspace = read("components/archive-ui/ArchiveWorkspaceTemplate.tsx");
  const sharedTaxonomy = read("components/archive-ui/ArchiveTaxonomyPanel.tsx");

  assert.match(config, /hostname: cloudUrl\.hostname/);
  assert.match(config, /url: cloudUrl\.origin/);
  assert.match(config, /errorPath: "offline\.html"/);
  assert.match(read("scripts/build-mobile-offline.mjs"), /"index\.html"/);
  assert.match(read("scripts/build-mobile-offline.mjs"), /index\.template\.html/);
  assert.doesNotMatch(read("mobile-shell/index.html"), /id="root"/);
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
  assert.match(source, /getOfflineShellCopy/);
  assert.match(source, /listVisibleLocalTaxonomyItems/);
  assert.match(source, /showSubcategoryRow=\{sourceFilter === "local" && activeLocalDepth >= 2\}/);
  assert.match(source, /showGroupRow=\{sourceFilter === "local" && activeLocalDepth >= 3\}/);
  assert.doesNotMatch(source, /const text = \{/);
  assert.doesNotMatch(source, /"[?]{2,}"/);
  assert.match(source, /copy\.camera/);
  assert.match(source, /copy.album/);
  assert.match(source, /<MobileBottomNavigationView/);
  assert.match(source, /<MobilePageHeaderView/);
  assert.match(sharedPageHeader, /data-mobile-page-header="true"/);
  assert.match(source, /<ArchiveProjectCard/);
  assert.match(source, /<ArchiveRecordCardShell/);
  assert.match(sharedWorkspace, /<ConnectivityNotice/);
  assert.match(source, /navigator\.onLine/);
  assert.match(source, /logLifespaceStorageDiagnostic/);
  assert.match(source, /saveCloudArchiveToLocal/);
  assert.match(source, /syncPendingCloudArchive/);
  assert.match(source, /listPendingCloudSyncSummaries/);
  assert.match(source, /supabase\.auth\.getSession/);
  assert.match(source, /supabase[\s\S]*?\.from\("archives"\)/);
  assert.match(source, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.doesNotMatch(source, /\.order\("updated_at", \{ ascending: false \}\)/);
  assert.doesNotMatch(source, /className="offline-header"|className="brand-mode"/);
  assert.doesNotMatch(parityStyles, /\.offline-status/);
  assert.doesNotMatch(parityStyles, /\.source-row > button:nth-child\(1\)/);
  assert.doesNotMatch(parityStyles, /\.source-row > button:nth-child\(2\)/);
  assert.match(source, /label: copy\.all/);
  assert.match(source, /label: copy\.cloud/);
  assert.match(source, /<ArchiveWorkspaceTemplate/);
  assert.match(source, /sourceOptions=\{\[/);
  assert.match(source, /activeSource=\{sourceFilter\}/);
  assert.match(source, /<ArchiveTaxonomyPanel/);
  assert.match(sharedTaxonomy, /archiveCategoryOptions\.map/);
  assert.match(sharedSourceSwitcher, /aria-pressed=\{activeValue === item\.value\}/);
  assert.match(generated, /life-space-local-offline/);
  assert.match(generated, /lifespace-storage-diagnostic/);
  assert.doesNotMatch(generated, /<script[^>]+src=/i);
  assert.doesNotMatch(generated, /<link[^>]+stylesheet/i);
});

test("offline shell safely recovers one local owner when browser session state is unavailable", () => {
  const db = read("lib/local-offline-db.ts");
  const source = read("mobile-offline-src/main.tsx");

  assert.match(db, /export async function inferSingleLocalArchiveOwnerContext/);
  assert.match(db, /if \(owners\.size > 1\) return null/);
  assert.match(source, /recoverStoredOwnerFromIdentityCache/);
  assert.match(source, /if \(!nextOwner\)[\s\S]*inferSingleLocalArchiveOwnerContext/);
  assert.match(source, /rememberLocalOwnerContext/);
});

test("explicit sign-out cannot restore another account from local projects", () => {
  const owner = read("lib/local-owner-context.ts");
  const source = read("mobile-offline-src/main.tsx");
  assert.match(owner, /EXPLICIT_LOCAL_SIGN_OUT_KEY/);
  assert.match(owner, /window\.localStorage\.setItem\(EXPLICIT_LOCAL_SIGN_OUT_KEY, "1"\)/);
  assert.match(owner, /window\.localStorage\.removeItem\(EXPLICIT_LOCAL_SIGN_OUT_KEY\)/);
  assert.match(source, /wasLocalOwnerExplicitlySignedOut\(\)/);
});

test("offline guides expose only the registered-user overview boundary", () => {
  const source = read("mobile-offline-src/main.tsx");
  const guideCache = read("lib/offline-guide-directory.ts");
  const plantIndex = read("app/plant/page.tsx");
  const en = read("lib/i18n/en.ts");

  assert.match(source, /kind: "guide-detail"/);
  assert.match(source, /!owner[\s\S]*guideSignInRequired/);
  assert.match(source, /getOfflineGuideOverview\(guide, language\)/);
  assert.match(source, /getOfflineGuideParameters\(guide, language\)/);
  assert.match(read("components/plant/OfflineGuideDirectoryView.tsx"), /signedIn \? getOfflineGuideOverview/);
  assert.match(en, /full practice guidance, experience cards, and related projects/);
  assert.match(guideCache, /PUBLIC_SOURCES/);
  assert.match(guideCache, /plantCoreParameters/);
  assert.match(guideCache, /\["light", "scene", "indoor"\]/);
  assert.match(plantIndex, /if \(!isSignedIn \|\| loading \|\| !plants\.length\) return/);
  assert.match(plantIndex, /parametersZh: zh\.parameters\.slice\(0, 3\)/);
  assert.match(plantIndex, /content, content_en/);
});

test("signed RC local data migrates on-device before the old origin is retired", () => {
  const migration = read("lib/local-origin-migration.ts");
  const nextConfig = read("next.config.ts");
  const db = read("lib/local-offline-db.ts");
  const nativeClient = read(
    "android/app/src/main/java/com/youshi/cultivation/LifeSpaceWebViewClient.java",
  );
  const activity = read(
    "android/app/src/main/java/com/youshi/cultivation/MainActivity.java",
  );
  const bridge = read("mobile-shell/legacy-local-bridge.html");

  assert.match(migration, /life-space-canary\.yoyomibaobao\.workers\.dev/);
  assert.match(nextConfig, /frame-src 'self'/);
  assert.match(nextConfig, /life-space-canary\.yoyomibaobao\.workers\.dev/);
  assert.match(migration, /mergeLocalOriginBaseSnapshot/);
  assert.match(migration, /mergeLocalOriginImage/);
  assert.match(db, /export async function mergeLocalOriginBaseSnapshot/);
  assert.match(db, /export async function mergeLocalOriginImage/);
  assert.match(nativeClient, /assets\.open\("public\/legacy-local-bridge\.html"\)/);
  assert.match(nativeClient, /request is sent to workers\.dev/);
  assert.match(activity, /new LifeSpaceWebViewClient\(bridge, getAssets\(\)\)/);
  assert.match(bridge, /lifespace-local-origin-migration-v1/);
  assert.match(bridge, /getAllKeys\(db, IMAGE_STORE\)/);
  assert.match(bridge, /waitForAck\(nonce, "image-ack", seq\)/);
});

test("new local projects inherit the signed-in account only on this device", () => {
  const newLocalProject = read("app/local/archive/new/page.tsx");
  const ownerSync = read("components/LocalOwnerContextSync.tsx");
  const zh = read("lib/i18n/zh.ts");

  assert.match(newLocalProject, /supabase\.auth\.getSession\(\)/);
  assert.match(newLocalProject, /local_owner_user_id: currentUser\?\.id \|\| null/);
  assert.match(ownerSync, /rememberLocalOwnerContext/);
  assert.match(ownerSync, /preparePendingCloudSyncQueue/);
  assert.match(zh, /这不会上传云端/);
});

test("explicit Android sign-out hides account-bound offline cache state", () => {
  const source = read("mobile-offline-src/main.tsx");

  assert.match(source, /event === "SIGNED_OUT"/);
  assert.match(source, /explicitSignOutRef/);
  assert.match(source, /wasLocalOwnerExplicitlySignedOut\(\)/);
  assert.match(source, /clearRememberedLocalOwnerContext\(\)/);
  assert.match(source, /setCloudArchives\(\[\]\)/);
  assert.match(source, /listVisibleCloudOfflineArchiveSummaries\(null\)/);
  assert.match(source, /setCloudCaches\(cachedCloud\)/);
});

test("Android bundled offline shell matches accepted local-first cache rules", () => {
  const source = read("mobile-offline-src/main.tsx");
  const zh = read("lib/i18n/zh.ts");

  assert.match(source, /const useCloudCacheSource = true/);
  assert.match(source, /const hideCloudCreate = useCloudCacheSource && sourceFilter === "cloud"/);
  assert.match(source, /hideCloudCreate \? null/);
  assert.match(source, /viewingCloudCache \? null/);
  assert.match(source, /canManage=\{cycleEnabled && !isCloudCache\}/);
  assert.match(source, /detail\.archive\.local_role !== "cloud-offline-cache"/);
  assert.match(source, /archives\.filter\(\(archive\) => archive\.status === "active"\)/);
  assert.match(source, /readShellIdentityCache\(nextOwner\.userId\)/);
  assert.match(source, /probeCloudReachable/);
  assert.match(source, /replaceWithOfficialSite/);
  assert.match(source, /displayAvatarUrl\(spaceProfile\)/);
  assert.match(zh, /cloud_offline_cache: "云项目·离线缓存"/);
  assert.match(zh, /cloud_offline_cache_readonly: "只读查看"/);
});

test("Android cloud project covers resolve through the shared signed media layer", () => {
  const source = read("mobile-offline-src/main.tsx");
  const web = read("app/archive/page.tsx");
  assert.match(source, /resolveMediaDisplayPairs\(supabase/);
  assert.match(source, /thumb_path: archive\.cover_thumb_path/);
  assert.match(source, /archive\.display_cover_thumb_url \|\| archive\.display_cover_image_url/);
  assert.match(web, /resolveMediaDisplayPairs\(supabase/);
});

test("Android cloud login uses the shared Turnstile challenge", () => {
  const source = read("mobile-offline-src/main.tsx");
  const buildScript = read("scripts/build-mobile-offline.mjs");
  const workflow = read(".github/workflows/android-apk.yml");
  const authCaptcha = read("components/AuthCaptcha.tsx");
  const turnstileView = read("components/auth/TurnstileChallengeView.tsx");

  assert.match(source, /<AuthCaptcha/);
  assert.match(source, /AUTH_CAPTCHA_ENABLED/);
  assert.match(source, /options: \{ captchaToken: captchaToken \|\| undefined \}/);
  assert.match(buildScript, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.match(workflow, /vars\.NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.match(authCaptcha, /TurnstileChallengeView/);
  assert.match(turnstileView, /challenges\.cloudflare\.com\/turnstile/);
});