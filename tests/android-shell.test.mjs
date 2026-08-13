import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("Android shell keeps its identity, HTTPS host, and offline fallback explicit", () => {
  const config = read("capacitor.config.ts");
  const offline = read("mobile-shell/offline.html");

  assert.match(config, /appId: "com\.youshi\.cultivation"/);
  assert.match(config, /appName: "有时·耕作"/);
  assert.match(config, /CAPACITOR_SERVER_URL/);
  assert.match(config, /url\.protocol !== "https:"/);
  assert.match(config, /cleartext: false/);
  assert.match(config, /errorPath: "offline\.html"/);
  assert.match(offline, /暂时无法连接/);
  assert.match(offline, /已保存在 App 内的数据不会因此被删除/);
});

test("Android system bars use modern edge-to-edge insets and page-aware contrast", () => {
  const config = read("capacitor.config.ts");
  const statusBar = read("components/StatusBarTheme.tsx");
  const globals = read("app/globals.css");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const baseStyles = read("android/app/src/main/res/values/styles.xml");
  const api27Styles = read("android/app/src/main/res/values-v27/styles.xml");
  const activity = read(
    "android/app/src/main/java/com/youshi/cultivation/MainActivity.java",
  );
  const nativeSystemUi = read(
    "android/app/src/main/java/com/youshi/cultivation/NativeSystemUiPlugin.java",
  );

  assert.match(config, /SystemBars:[\s\S]*insetsHandling: "css"/);
  assert.match(config, /SystemBars:[\s\S]*style: "LIGHT"/);
  assert.match(statusBar, /SystemBars\.setStyle/);
  assert.match(statusBar, /SystemBarType\.StatusBar/);
  assert.match(statusBar, /NativeSystemUi\.setStatusBarAppearance/);
  assert.match(statusBar, /--app-status-bar-background/);
  assert.match(statusBar, /nativeWindowAlreadyInsetsWebView/);
  assert.match(statusBar, /nativeWindowInsets = "true"/);
  assert.match(statusBar, /APP_STATUS_BAR_DARK[\s\S]*SystemBarsStyle\.Dark/);
  assert.match(statusBar, /SystemBarsStyle\.Light/);
  assert.match(globals, /\.app-status-bar-surface/);
  assert.match(globals, /--app-safe-area-top/);
  assert.match(globals, /--safe-area-inset-top/);
  assert.match(globals, /data-native-window-insets="true"/);
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
  assert.match(baseStyles, /android:statusBarColor">@color\/app_background/);
  assert.doesNotMatch(baseStyles, /windowLightNavigationBar/);
  assert.match(api27Styles, /windowLightNavigationBar/);
  assert.match(activity, /registerPlugin\(NativeSystemUiPlugin\.class\)/);
  assert.match(nativeSystemUi, /@CapacitorPlugin\(name = "NativeSystemUi"\)/);
  assert.match(nativeSystemUi, /decorView\.setBackgroundColor\(color\)/);
  assert.match(nativeSystemUi, /webViewParent\.setBackgroundColor\(color\)/);
  assert.match(nativeSystemUi, /setAppearanceLightStatusBars\(darkIcons\)/);
});

test("Android login relies on native resize without adding a second keyboard viewport", () => {
  const config = read("capacitor.config.ts");
  const login = read("app/login/page.tsx");
  const navbar = read("components/navbar.tsx");
  const globals = read("app/globals.css");
  const nativePlatformHook = read("lib/capacitor/useIsNativeApp.ts");

  assert.match(config, /Keyboard:[\s\S]*resizeOnFullScreen: false/);
  assert.doesNotMatch(login, /@capacitor\/keyboard/);
  assert.doesNotMatch(login, /Keyboard\.addListener/);
  assert.doesNotMatch(login, /visualViewport/);
  assert.doesNotMatch(login, /--auth-visible-viewport-height/);
  assert.doesNotMatch(login, /scrollFieldIntoVisibleArea|scrollIntoView\(/);
  assert.match(login, /authKeyboardOpen/);
  assert.match(login, /onBlurCapture=\{handleLoginPageBlur\}/);
  assert.match(navbar, /data-mobile-bottom-nav="true"/);
  assert.match(
    globals,
    /data-auth-keyboard-open="true"[\s\S]*data-mobile-bottom-nav="true"[\s\S]*display: none !important/,
  );
  assert.match(globals, /data-auth-keyboard-open="true"[\s\S]*\.auth-login-page/);
  assert.match(globals, /\.auth-login-page \{[\s\S]*?min-height: 0 !important;[\s\S]*?overflow: visible !important/);
  assert.doesNotMatch(globals, /\.auth-login-page \{[\s\S]*?height: calc\(100dvh/);
  assert.doesNotMatch(login, /minHeight: "calc\(100dvh|overflowY: "auto"/);
  assert.doesNotMatch(globals, /--auth-visible-viewport-height|max\(\s*260px/);
  assert.doesNotMatch(
    globals,
    /data-auth-keyboard-open="true"[^}]*body[^}]*overflow: hidden/,
  );
  assert.match(login, /useIsNativeApp\(\)/);
  assert.match(nativePlatformHook, /Capacitor\.isNativePlatform\(\)/);
  assert.match(nativePlatformHook, /useSyncExternalStore/);
  assert.match(login, /isNativeApp === false[\s\S]*?href="\/api\/download\/android"/);
});

test("mobile Market lightbox requests the dark native status bar", () => {
  const marketDetail = read("app/market/[id]/page.tsx");

  assert.match(marketDetail, /setIsMobileViewport\(window\.innerWidth < 760\)/);
  assert.match(marketDetail, /isMobileViewport=\{isMobileViewport\}/);
});

test("native Android back closes overlays before route navigation and exits only at home", () => {
  const navigation = read("components/MobileBackNavigation.tsx");

  const overlayCheck = navigation.indexOf("hasActiveMobileOverlay()");
  const routeCheck = navigation.indexOf("!isAppHome(pathname)", overlayCheck);
  const exitCall = navigation.indexOf("App.exitApp()", routeCheck);

  assert.ok(overlayCheck >= 0);
  assert.ok(routeCheck > overlayCheck);
  assert.ok(exitCall > routeCheck);
  assert.match(navigation, /App\.addListener\("backButton"/);
  assert.match(navigation, /window\.history\.back\(\)/);
});

test("release signing is environment-only and local records are excluded from Android backup", () => {
  const gradle = read("android/app/build.gradle");
  const workflow = read(".github/workflows/android-apk.yml");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const ignore = read("android/.gitignore");

  assert.match(gradle, /System\.getenv\('ANDROID_KEYSTORE_PATH'\)/);
  assert.match(gradle, /System\.getenv\('ANDROID_KEYSTORE_PASSWORD'\)/);
  assert.doesNotMatch(gradle, /storePassword\s+["'][^"']+["']/);
  assert.match(ignore, /\*\.jks/);
  assert.match(ignore, /\*\.keystore/);
  assert.match(gradle, /ANDROID_VERSION_CODE'\) \?: '2'/);
  assert.match(gradle, /ANDROID_VERSION_NAME'\) \?: '1\.0\.1'/);
  assert.match(workflow, /ANDROID_VERSION_CODE: \$\{\{ inputs\.version_code \|\| '2' \}\}/);
  assert.match(workflow, /ANDROID_VERSION_NAME: \$\{\{ inputs\.version_name \|\| '1\.0\.1' \}\}/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:enableOnBackInvokedCallback="true"/);
});
