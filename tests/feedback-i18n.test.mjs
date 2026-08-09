import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("feedback page uses local email handoff without database writes", () => {
  const page = read("app/feedback/page.tsx");

  assert.match(page, /feedback@coastline\.ai/);
  assert.match(page, /mailto:/);
  assert.match(page, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(page, /supabase/);
  assert.doesNotMatch(page, /fetch\(/);
});

test("feedback entry is available globally and inside profile", () => {
  const layout = read("app/layout.tsx");
  const profileLayout = read("app/profile/layout.tsx");
  const utilityBar = read("components/SiteUtilityBar.tsx");
  const footer = read("components/SiteFooter.tsx");

  assert.match(layout, /<SiteUtilityBar \/>/);
  assert.match(layout, /<SiteFooter \/>/);
  assert.match(profileLayout, /<ProfileFeedbackEntry \/>/);
  assert.match(utilityBar, /href="\/feedback"/);
  assert.match(footer, /href="\/feedback"/);
});

test("Chinese and English feedback copy stay in the shared dictionaries", () => {
  const zh = read("lib/i18n/zh.ts");
  const en = read("lib/i18n/en.ts");
  const hook = read("lib/i18n/useLanguage.ts");

  assert.match(zh, /feedback_email_label/);
  assert.match(zh, /存在即永恒/);
  assert.match(en, /feedback_email_label/);
  assert.match(en, /browser translation/);
  assert.match(hook, /lifespace-language-change/);
});

test("public membership terminology uses 商社会员", () => {
  const membershipPage = read("app/membership/page.tsx");
  const membershipLib = read("lib/membership.ts");
  const membershipDocs = read("docs/membership-access.md");

  assert.match(membershipPage, /商社会员/);
  assert.match(membershipPage, /商社空间/);
  assert.doesNotMatch(membershipPage, /商业会员/);
  assert.match(membershipLib, /return "商社会员"/);
  assert.match(membershipDocs, /商社会员采用“商社空间＋成员账号”/);
  assert.doesNotMatch(membershipDocs, /商业会员/);
});
