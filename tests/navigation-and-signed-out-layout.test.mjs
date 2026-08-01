import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("mobile personal space project summary opens the project archive", async () => {
  const profile = await source("app/profile/page.tsx");

  assert.match(profile, /<Link href="\/archive" style=\{mobileProjectStatsCardStyle\}>/);
  assert.match(profile, /<strong>项目档案<\/strong>/);
  assert.match(profile, /公开 \{publicArchiveCount\}/);
});

test("signed-out market does not repeat login and registration actions inside the page", async () => {
  const market = await source("app/market/page.tsx");

  assert.doesNotMatch(market, /登录后发布/);
  assert.doesNotMatch(market, /注册账号/);
  assert.match(market, /\{currentUserId \? \(/);
  assert.match(market, /我的发布/);
});

test("signed-out home uses a compact viewport-oriented layout", async () => {
  const home = await source("app/page.tsx");

  assert.match(home, /minHeight: "calc\(100vh - 70px\)"/);
  assert.match(home, /gridTemplateColumns: "repeat\(4, minmax\(0, 1fr\)\)"/);
  assert.match(home, /@media \(max-height: 720px\)/);
  assert.match(home, /记录四时变化，留下发现、收获与成长/);
  assert.match(home, /其他自然生活相关项目/);
  assert.doesNotMatch(home, /href="\/register"/);
  assert.doesNotMatch(home, /href="\/login"/);
  assert.doesNotMatch(home, /background: "rgba\(255,255,255,0\.82\)"/);
  assert.doesNotMatch(home, /boxShadow: "0 14px 36px/);
});

test("project archive label, following cards, and discover cards use the refined layout", async () => {
  const [archiveHeader, followedCard, followedCss, discoverCard, discoverCss] =
    await Promise.all([
      source("components/archive-ui/ArchiveDetailHeaderView.tsx"),
      source("components/discover/FollowedProjectCard.tsx"),
      source("components/discover/FollowedProjects.module.css"),
      source("components/discover/DiscoverProjectCard.tsx"),
      source("components/discover/DiscoverProjectFeed.module.css"),
    ]);

  assert.match(archiveHeader, /title="打开项目档案"/);
  assert.match(archiveHeader, /style=\{eyebrowButtonStyle\}/);
  assert.match(archiveHeader, /<span style=\{titleTextDisplayStyle\}>/);

  assert.match(followedCard, /className=\{styles\.nameRow\}/);
  assert.match(followedCard, /· \{systemName\}/);
  assert.match(followedCss, /\.body \{[\s\S]*?height: 88px/);

  assert.match(discoverCard, /className=\{styles\.imageStats\}/);
  assert.ok(
    discoverCard.indexOf("item.public_record_count") <
      discoverCard.indexOf('<div className={styles.body}>')
  );
  assert.match(discoverCss, /\.grid \{[\s\S]*?align-items: start/);
  assert.doesNotMatch(discoverCss, /\.body \{[^}]*flex: 1/);
  assert.doesNotMatch(discoverCss, /\.owner \{[^}]*margin-top: auto/);
});

test("plant detail exposes guide, experience cards, and records as peer tabs", async () => {
  const detail = await source("app/plant/[id]/page.tsx");

  assert.match(detail, /type PlantDetailTab = "guide" \| "experience" \| "records"/);
  assert.match(detail, /\["guide", "概要与种植办法"\]/);
  assert.match(detail, /\["experience", "经验卡"\]/);
  assert.match(detail, /\["records", "种植记录"\]/);
  assert.match(detail, /activeTab === "experience"/);
  assert.match(detail, /<PlantExperienceCardsSection cards=\{relatedExperienceCards\}/);
  assert.match(detail, /activeTab === "records"/);
  assert.match(detail, /\.from\("experience_cards"\)/);
  assert.match(detail, /is_experience_card_public/);
});
