import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("feedback page uses local email handoff without database writes", () => {
  const page = read("app/feedback/page.tsx");

  assert.match(page, /yoyomibaobao@gmail\.com/);
  assert.match(page, /mailto:/);
  assert.match(page, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(page, /supabase/);
  assert.doesNotMatch(page, /fetch\(/);
});

test("feedback stays in navigation and the profile list without a duplicate banner", () => {
  const layout = read("app/layout.tsx");
  const profileLayout = read("app/profile/layout.tsx");
  const navbar = read("components/navbar.tsx");
  const footer = read("components/SiteFooter.tsx");
  const profile = read("app/profile/page.tsx");

  assert.doesNotMatch(layout, /<SiteUtilityBar \/>/);
  assert.match(layout, /<SiteFooter \/>/);
  assert.doesNotMatch(profileLayout, /ProfileFeedbackEntry/);
  assert.match(navbar, /<DesktopUtilityActions feedbackLabel=\{t\.feedback\} \/>/);
  assert.match(navbar, /href="\/feedback"/);
  assert.doesNotMatch(navbar, /LanguageSwitcher/);
  assert.doesNotMatch(footer, /LanguageSwitcher/);
  assert.match(profile, /role="switch"/);
  assert.match(profile, /setLanguage\(language === "zh" \? "en" : "zh"\)/);
  assert.match(navbar, /desktopUtilityDividerStyle/);
  assert.doesNotMatch(navbar, /\{user\.email\}/);
  assert.match(footer, /href="\/feedback"/);
  assert.match(profile, /href: "\/feedback", label: t\.feedback_and_contact/);
});

test("Chinese and English feedback copy stay in the shared dictionaries", () => {
  const zh = read("lib/i18n/zh.ts");
  const en = read("lib/i18n/en.ts");
  const hook = read("lib/i18n/useLanguage.ts");

  assert.match(zh, /feedback_email_label/);
  assert.match(zh, /那些真实存在过的，便不会轻易消逝/);
  assert.match(en, /feedback_email_label/);
  assert.doesNotMatch(zh, /browser_translation_hint/);
  assert.doesNotMatch(en, /browser_translation_hint/);
  assert.match(hook, /lifespace-language-change/);
});

test("public membership terminology uses 商社会员", () => {
  const membershipPage = read("app/membership/page.tsx");
  const membershipLib = read("lib/membership.ts");
  const membershipDocs = read("docs/membership-access.md");
  const zh = read("lib/i18n/zh.ts");

  assert.match(membershipPage, /t\.membership_page/);
  assert.match(zh, /business_title: "商社会员"/);
  assert.match(zh, /value: "商社空间"/);
  assert.doesNotMatch(membershipPage, /商业会员/);
  assert.doesNotMatch(zh, /商业会员/);
  assert.match(membershipLib, /return "商社会员"/);
  assert.match(membershipDocs, /商社会员采用“商社空间＋成员账号”/);
  assert.doesNotMatch(membershipDocs, /商业会员/);
});
