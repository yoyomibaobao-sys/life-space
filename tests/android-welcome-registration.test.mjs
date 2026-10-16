import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { parseAndroidShellPath } from "../lib/android-shell-app-routes.ts";

const require = createRequire(import.meta.url);

async function loadBundled(entry, mocks) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "registration-test-dependencies", setup(builder) {
      for (const [path, source] of Object.entries(mocks)) {
        builder.onResolve({ filter: new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }, () => ({ path, namespace: "mock" }));
      }
      builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({ contents: mocks[args.path], loader: "js" }));
    } }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

test("Android /register has its own in-app route and About stays local", () => {
  assert.deepEqual(parseAndroidShellPath("/register"), { kind: "register" });
  assert.deepEqual(parseAndroidShellPath("/login"), { kind: "login", id: "" });
  assert.deepEqual(parseAndroidShellPath("/about"), { kind: "about" });
  assert.equal(parseAndroidShellPath("/discover").kind, "activity");
});

function visit(node, found = []) {
  if (node == null || typeof node === "boolean") return found;
  if (Array.isArray(node)) {
    node.forEach((child) => visit(child, found));
  } else if (typeof node === "object" && "props" in node) {
    found.push(node);
    visit(node.props.children, found);
  }
  return found;
}

function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf(node.props.children);
  return typeof node === "string" ? node : "";
}

test("welcome and About share new bilingual copy and preserve their distinct actions", async () => {
  const { default: Brand } = await loadBundled("components/brand/AndroidBrandIntroduction.tsx", {});
  const calls = [];
  const actions = {
    onRegister: () => calls.push("register"),
    onLogin: () => calls.push("login"),
    onLocalUse: () => calls.push("local"),
    onBrowseHome: () => calls.push("home"),
    onBack: () => calls.push("back"),
    onLanguageChange: (language) => calls.push(language),
  };
  const welcome = Brand({ language: "zh", ...actions, onBrowseHome: undefined, onBack: undefined });
  assert.equal(welcome.props["data-android-shell-page"], "welcome");
  assert.match(textOf(welcome), /记录四时变化，留下发现与成长。/);
  assert.match(textOf(welcome), /让生命被看见，让生活有迹可循。/);
  const welcomeButtons = visit(welcome).filter((node) => node.type === "button");
  assert.deepEqual(welcomeButtons.map(textOf).filter((label) => /注册账号|已有账号|暂不注册/.test(label)), [
    "注册账号", "已有账号，登录", "暂不注册，免费使用本地空间",
  ]);
  welcomeButtons.find((button) => textOf(button) === "暂不注册，免费使用本地空间").props.onClick();
  assert.deepEqual(calls, ["local"]);
  const motto = visit(welcome).find((node) => node.type === "p" && textOf(node).includes("留其间"));
  assert.ok(motto.props.style.fontWeight >= 600);
  assert.match(motto.props.style.color, /^#/);

  const guestAbout = Brand({ language: "zh", ...actions });
  assert.equal(guestAbout.props["data-android-shell-page"], "about");
  const guestButtons = visit(guestAbout).filter((node) => node.type === "button");
  for (const [label, expected] of [["注册账号", "register"], ["登录", "login"], ["浏览首页", "home"]]) {
    guestButtons.find((button) => textOf(button) === label).props.onClick();
    assert.equal(calls.at(-1), expected);
  }
  const memberAbout = Brand({ language: "en", ...actions, onRegister: undefined, onLogin: undefined });
  assert.match(textOf(memberAbout), /Record the changing seasons, and preserve moments of discovery and growth\./);
  assert.match(textOf(memberAbout), /Let life be seen, and let everyday living leave its trace\./);
  assert.match(textOf(memberAbout), /Stay with it\./);
  const memberButtons = visit(memberAbout).filter((node) => node.type === "button").map(textOf);
  assert.ok(memberButtons.includes("Browse home"));
  assert.ok(!memberButtons.includes("Create account"));
  assert.ok(!memberButtons.includes("Sign in"));
  visit(memberAbout).find((node) => node.type === "button" && textOf(node) === "中文").props.onClick();
  assert.equal(calls.at(-1), "zh");
});

test("native profile keeps existing navigation without adding sign-up, login, or browse shortcuts", async () => {
  const { mobileProfileNavigation } = await loadBundled("components/profile/MobileProfilePresentation.tsx", {
    "@/components/ui/UiIcon": "export default function UiIcon() { return null; }",
    "@/components/navigation/InternalLink": "export default function InternalLink() { return null; }",
    "@/lib/i18n/useLanguage": "export const useLanguage = () => ({ language: 'zh', t: {} });",
  });
  const input = { language: "zh", native: true, admin: false, refundLabel: "退款",
    legalLabel: "法律", feedbackLabel: "反馈", trashLabel: "回收站", adminSupportLabel: "支持" };
  const guest = mobileProfileNavigation({ ...input, signedIn: false });
  assert.deepEqual(guest.filter(({ href }) => ["/register", "/login", "/discover"].includes(href)), []);
  const member = mobileProfileNavigation({ ...input, signedIn: true });
  assert.ok(!member.some(({ href }) => ["/register", "/login", "/discover"].includes(href)));
  const web = mobileProfileNavigation({ ...input, signedIn: false, native: false });
  assert.ok(!web.some(({ href }) => href === "/register" || href === "/login"));
  assert.ok(guest.some(({ href }) => href === "/about"));
  assert.deepEqual(guest.find(({ href }) => href === "/profile/data-security") && {
    label: guest.find(({ href }) => href === "/profile/data-security").label,
    section: guest.find(({ href }) => href === "/profile/data-security").section,
  }, { label: "数据与安全", section: "data" });
  assert.deepEqual(web.find(({ href }) => href === "/profile/data-security") && {
    label: web.find(({ href }) => href === "/profile/data-security").label,
    section: web.find(({ href }) => href === "/profile/data-security").section,
  }, { label: "数据规则", section: "support" });
});

test("Android-only header and registration presentation keeps website and auth contracts intact", async () => {
  const [follow, market, shell, registration] = await Promise.all([
    "app/follow/page.tsx", "app/market/page.tsx",
    "mobile-offline-src/main.tsx", "components/auth/AndroidRegistration.tsx",
  ].map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));
  assert.match(follow, /showGuestLanguageSwitcher=\{!shellNavigate\}/);
  assert.match(market, /showGuestLanguageSwitcher=\{!shellNavigate\}/);
  const guide = await readFile(new URL("../app/plant/page.tsx", import.meta.url), "utf8");
  assert.match(guide, /const shellNavigate = useInternalNavigate\(\)/);
  assert.match(guide, /showGuestLanguageSwitcher=\{!shellNavigate\}/);
  assert.match(shell, /className="primary-button" style=\{\{ display: "block", margin: "16px auto" \}\}/);
  assert.doesNotMatch(registration, /<h1>\{t\.auth\.register_title\}<\/h1>/);
  assert.doesNotMatch(registration, /\{t\.auth\.registration_intro\}/);
  assert.doesNotMatch(registration, /注册后获得账号编号/);
  assert.match(registration, /gridTemplateColumns: "minmax\(0, 1fr\)"/);
  assert.equal((registration.match(/fontSize: 13, lineHeight: 1\.55/g) || []).length, 2);
  assert.match(registration, /<AuthCaptcha compact action="register"/);
  assert.match(registration, /checked=\{terms\}/);
  assert.match(registration, /checked=\{crossBorder\}/);
  assert.match(shell, /<AuthCaptcha\s+interactionOnly\s+action="auth"/);
  const [captcha, widget] = await Promise.all([
    "components/AuthCaptcha.tsx", "components/auth/TurnstileChallengeView.tsx",
  ].map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));
  assert.match(captcha, /compact=\{compact\}/);
  assert.match(widget, /compact \? \{ size: "compact" as const \} : \{\}/);
});

test("first-use decision protects upgrades, sign-outs, and existing local data", async () => {
  let marker = null;
  let fresh = true;
  globalThis.window = { localStorage: {
    getItem: () => marker,
    setItem: (_key, value) => { marker = value; },
  } };
  const { isAndroidWelcomeEligible, shouldShowAndroidWelcome, markAndroidWelcomeCompleted } = await loadBundled("lib/android-first-use.ts", {
    "@capacitor/core": `export const Capacitor = { isNativePlatform: () => true };
      export const registerPlugin = () => ({ getInstallState: async () => ({ freshInstall: globalThis.__welcomeFresh }) });`,
  });
  const input = { signedIn: false, hasLocalContent: false, hasRememberedOwner: false, explicitlySignedOut: false };
  globalThis.__welcomeFresh = fresh;
  assert.equal(await shouldShowAndroidWelcome(input), true);
  assert.equal(isAndroidWelcomeEligible({ ...input, freshInstall: false, markerCompleted: false }), false);
  assert.equal(await shouldShowAndroidWelcome({ ...input, hasLocalContent: true }), false);
  assert.equal(await shouldShowAndroidWelcome({ ...input, hasRememberedOwner: true }), false);
  assert.equal(await shouldShowAndroidWelcome({ ...input, explicitlySignedOut: true }), false);
  assert.equal(await shouldShowAndroidWelcome({ ...input, signedIn: true }), false);
  markAndroidWelcomeCompleted();
  assert.equal(await shouldShowAndroidWelcome(input), false);
  marker = null;
  globalThis.__welcomeFresh = false;
  assert.equal(await shouldShowAndroidWelcome(input), false);
  delete globalThis.window;
  delete globalThis.__welcomeFresh;
});

test("shared web and Android registration submit the same consent and callback fields", async () => {
  let captured;
  globalThis.__registrationTestClient = { auth: { signUp: async (payload) => {
    captured = payload;
    return { data: { user: { id: "qa-user", identities: [{}] }, session: null }, error: null };
  } } };
  const { registerAccount } = await loadBundled("lib/registration.ts", {
    "@/lib/supabase": "export const supabase = globalThis.__registrationTestClient;",
    "@/lib/auth-return": "export const buildAuthEmailRedirect = (kind, path) => `https://life-space.uk/auth/confirm?returnTo=${encodeURIComponent(path)}`;",
  });
  const result = await registerAccount({ email: "qa@example.test", password: "a-password", captchaToken: "captcha", returnTo: "/archive" });
  assert.equal(result.error, null);
  assert.deepEqual(captured, { email: "qa@example.test", password: "a-password", options: {
    captchaToken: "captcha", emailRedirectTo: "https://life-space.uk/auth/confirm?returnTo=%2Farchive",
    data: { legal_terms_accepted: true, legal_terms_version: "2026-09-01",
      privacy_notice_accepted: true, privacy_notice_version: "2026-09-01",
      cross_border_consent: true, cross_border_consent_version: "2026-09-01" },
  } });
  delete globalThis.__registrationTestClient;
});
