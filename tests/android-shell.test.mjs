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

  assert.match(config, /SystemBars:[\s\S]*insetsHandling: "css"/);
  assert.match(config, /SystemBars:[\s\S]*style: "LIGHT"/);
  assert.match(statusBar, /SystemBars\.setStyle/);
  assert.match(statusBar, /StatusBar\.setBackgroundColor/);
  assert.match(statusBar, /--app-status-bar-background/);
  assert.match(statusBar, /APP_STATUS_BAR_DARK[\s\S]*SystemBarsStyle\.Dark/);
  assert.match(statusBar, /SystemBarsStyle\.Light/);
  assert.match(globals, /\.app-status-bar-surface/);
  assert.match(globals, /--app-safe-area-top/);
  assert.match(globals, /--safe-area-inset-top/);
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
  assert.match(baseStyles, /android:statusBarColor">@color\/app_background/);
  assert.doesNotMatch(baseStyles, /windowLightNavigationBar/);
  assert.match(api27Styles, /windowLightNavigationBar/);
});

test("Android login keeps focused fields above the software keyboard", () => {
  const config = read("capacitor.config.ts");
  const login = read("app/login/page.tsx");
  const navbar = read("components/navbar.tsx");
  const globals = read("app/globals.css");

  assert.match(config, /Keyboard:[\s\S]*resizeOnFullScreen: true/);
  assert.match(login, /Keyboard\.addListener\("keyboardWillShow"/);
  assert.match(login, /scrollIntoView/);
  assert.match(login, /authKeyboardOpen/);
  assert.match(navbar, /data-mobile-bottom-nav="true"/);
  assert.match(globals, /data-auth-keyboard-open="true"[\s\S]*data-mobile-bottom-nav/);
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
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const ignore = read("android/.gitignore");

  assert.match(gradle, /System\.getenv\('ANDROID_KEYSTORE_PATH'\)/);
  assert.match(gradle, /System\.getenv\('ANDROID_KEYSTORE_PASSWORD'\)/);
  assert.doesNotMatch(gradle, /storePassword\s+["'][^"']+["']/);
  assert.match(ignore, /\*\.jks/);
  assert.match(ignore, /\*\.keystore/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:enableOnBackInvokedCallback="true"/);
});
