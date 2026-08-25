import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the homepage uses the confirmed natural-life-space copy without a local-record entry", async () => {
  const [homepage, zhCopy, enCopy] = await Promise.all([
    source("app/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  for (const text of [
    "有时·耕作",
    "LifeSpace",
    "自然生活空间",
    "一个围绕耕作、生态与自然生活展开的空间",
    "记录四时变化",
    "留下发现、收获与成长",
    "让生命被看见",
    "让生活有迹可循",
    "留其间，守其度",
    "顺其时，共生长",
  ]) {
    assert.match(zhCopy, new RegExp(text));
  }

  assert.match(homepage, /\{t\.home\.brand\}/);
  assert.match(homepage, /<BrandMark size=\{40\} tone="quiet"/);
  assert.match(homepage, /\{t\.home\.cards\.map/);
  assert.match(enCopy, /space_title: "A Natural Living Space"/);

  assert.doesNotMatch(homepage, /你所照料的、陪伴着的生命/);
  assert.doesNotMatch(homepage, /顺其时，共养成/);
  assert.doesNotMatch(homepage, /一个围绕耕作展开的生活空间/);
  assert.doesNotMatch(homepage, /href="\/local"/);
  assert.doesNotMatch(homepage, /本地记录/);
  assert.doesNotMatch(homepage, /trialNote|cloudNote/);
});

test("plant navigation and visible plant links consistently use guidance wording", async () => {
  const paths = [
    "components/navbar.tsx",
    "app/plant/page.tsx",
    "app/plant/[id]/page.tsx",
    "app/archive/plans/page.tsx",
    "app/archive/interests/page.tsx",
    "components/archive-ui/ArchiveNewProjectFormShell.tsx",
    "app/local/archive/new/page.tsx",
  ];
  const files = await Promise.all(paths.map(source));
  const zhCopy = await source("lib/i18n/zh.ts");

  for (const file of files) {
    assert.doesNotMatch(file, /索引/);
  }

  assert.match(files[0], /\{t\.nav\.guide\}/);
  assert.match(files[1], /t\.plant\.title/);
  assert.match(zhCopy, /guide: "指引"/);
  assert.match(zhCopy, /title: "植物指引"/);
});

test("other project copy consistently refers to natural life", async () => {
  const [homepage, categories, zhCopy] = await Promise.all([
    source("app/page.tsx"),
    source("lib/archive-categories.ts"),
    source("lib/i18n/zh.ts"),
  ]);

  for (const file of [categories, zhCopy]) {
    assert.match(file, /其他自然生活相关项目/);
    assert.doesNotMatch(file, /其他耕作相关项目/);
  }
  assert.match(homepage, /t\.home\.cards\.map/);
});

test("desktop navigation keeps guidance before marketplace and Home tabs place guidance after Experience", async () => {
  const [navbar, homeTabs] = await Promise.all([
    source("components/navbar.tsx"),
    source("components/home/HomeSectionTabs.tsx"),
  ]);
  const desktopStart = navbar.indexOf("<div style={getNavItemsWrapStyle(isCompact)}>");
  const mobileStart = navbar.indexOf("function MobileBottomNav");
  const desktopNav = navbar.slice(desktopStart, mobileStart);

  assert.ok(desktopStart >= 0 && mobileStart > desktopStart);
  assert.ok(desktopNav.indexOf('href="/plant"') < desktopNav.indexOf('href="/market"'));
  assert.ok(homeTabs.indexOf('href: "/discover"') < homeTabs.indexOf('href: "/experience"'));
  assert.ok(homeTabs.indexOf('href: "/experience"') < homeTabs.indexOf('href: "/plant"'));
});

test("local recording is offered only after a network registration or login failure", async () => {
  const [registration, login, zhCopy, enCopy] = await Promise.all([
    source("app/register/page.tsx"),
    source("app/login/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(zhCopy, /network_local_fallback: ".*先本地记录/);
  assert.match(enCopy, /network_local_fallback: ".*local/);

  for (const page of [registration, login]) {
    assert.match(page, /setShowLocalFallback\(true\)/);
    assert.match(page, /showLocalFallback \? \(/);
    assert.match(page, /t\.auth\.local_first/);
    assert.match(page, /t\.auth\.network_local_fallback/);
    assert.doesNotMatch(page, /先本地使用/);
  }
});
