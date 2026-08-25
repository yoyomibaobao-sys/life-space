import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("followed projects use real archive columns and expose load failures", async () => {
  const [followPage, followData, profileShared, recentPage] = await Promise.all([
    source("app/follow/page.tsx"),
    source("lib/follow-data.ts"),
    source("lib/user-profile-shared.ts"),
    source("app/profile/recent/page.tsx"),
  ]);

  for (const file of [followPage, followData, profileShared, recentPage]) {
    assert.doesNotMatch(file, /cover_thumb_url/);
  }
  assert.match(followPage, /\.eq\("is_public", true\)/);
  assert.match(followPage, /setProjectLoadError\(true\)/);
  assert.match(followPage, /projectLoadError \? \(/);
  assert.match(followPage, /followT\.project_load_failed/);
});

test("mobile personal and following views stay compact", async () => {
  const [archivePage, followPage, footerStyles] = await Promise.all([
    source("app/archive/page.tsx"),
    source("app/follow/page.tsx"),
    source("components/SiteFooter.module.css"),
  ]);

  assert.match(
    archivePage,
    /localArchives\.length === 0 \? \([\s\S]*?isMobileViewport \? null : \(/
  );
  assert.match(archivePage, /width: 76,[\s\S]*?flex: "0 1 76px"/);
  assert.match(archivePage, /personalSpaceInlineEntryStyle[\s\S]*?fontSize: 13/);
  assert.match(footerStyles, /@media \(max-width: 759px\)[\s\S]*?display: none/);
  assert.match(followPage, /followedUserAllButtonStyle/);
  assert.doesNotMatch(followPage, /followedUserHintStyle/);
  assert.match(followPage, /followedUserSpaceShortcutStyle/);
  assert.match(followPage, /href=\{`\/user\/\$\{item\.id\}`\}/);
});

test("admin section links remain reachable without long reverse scrolling", async () => {
  const admin = await source("app/admin/memberships/page.tsx");

  assert.match(admin, /id="admin-section-navigation"/);
  assert.match(admin, /function adminAnchorNavStyle\(mobile: boolean\)/);
  assert.match(admin, /position: "sticky"/);
  assert.match(admin, /scrollMarginTop: adminSectionScrollMarginTop/g);
  assert.match(admin, /window\.location\.hash\.slice\(1\)/);
  assert.match(admin, /scrollIntoView\(\{ block: "start" \}\)/);
});

test("website brand marks use the quieter visual treatment", async () => {
  const [mark, homepage, navbar] = await Promise.all([
    source("components/BrandMark.tsx"),
    source("app/page.tsx"),
    source("components/navbar.tsx"),
  ]);

  assert.match(mark, /tone\?: "standard" \| "quiet"/);
  assert.match(mark, /saturate\(0\.68\) brightness\(1\.08\)/);
  assert.match(homepage, /<BrandMark size=\{40\} tone="quiet"/);
  assert.match(navbar, /<BrandMark size=\{24\} tone="quiet"/);
});
