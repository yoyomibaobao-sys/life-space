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

test("account navigation keeps membership contextual and export under data management", async () => {
  const [profile, navbar, membership, login, home] = await Promise.all([
    source("app/profile/page.tsx"),
    source("components/navbar.tsx"),
    source("app/membership/page.tsx"),
    source("app/login/page.tsx"),
    source("app/page.tsx"),
  ]);

  assert.match(profile, /value: "membership", label: "会员与容量"/);
  assert.match(profile, /value: "account", label: "数据与安全"/);
  assert.match(profile, /<MobileProfileModuleTabs/);
  assert.match(profile, /const showInfoModule = mobileProfileModule === "info"/);
  assert.match(profile, /<h2 style=\{dataTitleStyle\}>导出与备份<\/h2>/);
  assert.match(profile, /导出属于数据管理，不取决于是否开通云会员/);
  assert.ok(
    profile.indexOf("导出我的记录") > profile.indexOf("{showAccountModule ?")
  );
  assert.doesNotMatch(profile, /云会员与云空间/);
  assert.doesNotMatch(navbar, /membershipEntryStyle/);
  assert.doesNotMatch(navbar, />\s*云会员\s*<\/Link>/);
  assert.ok(
    navbar.indexOf('<NavItem href="/register"') <
      navbar.indexOf('href="/discover"')
  );
  assert.match(navbar, /!user && pathname === "\/"/);
  assert.match(navbar, /<Link href="\/login" style=\{loginLinkStyle\}>/);
  assert.match(navbar, /pathname !== "\/"/);
  assert.match(membership, /个人使用方案/);
  assert.match(membership, /1GB 个人云端存储/);
  assert.doesNotMatch(membership, /查看会员权益/);
  assert.doesNotMatch(login, /href="\/membership"/);
  assert.match(home, /href="\/membership"/);
  assert.match(home, /会员类别与权限/);
  assert.match(home, /查看免费使用、云端保存与公开互动的区别/);
  assert.match(
    navbar,
    /pathname === "\/"[\s\S]*?href="\/register"[\s\S]*?注册[\s\S]*?href="\/login"[\s\S]*?登录/
  );
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
  const [
    archiveHeader,
    followedCard,
    followedCss,
    discoverCard,
    discoverCss,
    discoverFormat,
    activityFormat,
    projectMeta,
    uiIcon,
    archiveCard,
    localProjectView,
    discoverData,
  ] =
    await Promise.all([
      source("components/archive-ui/ArchiveDetailHeaderView.tsx"),
      source("components/discover/FollowedProjectCard.tsx"),
      source("components/discover/FollowedProjects.module.css"),
      source("components/discover/DiscoverProjectCard.tsx"),
      source("components/discover/DiscoverProjectFeed.module.css"),
      source("lib/discover-card-format.ts"),
      source("lib/activity-time.ts"),
      source("components/ui/ProjectMetaLine.tsx"),
      source("components/ui/UiIcon.tsx"),
      source("components/archive/ArchiveCard.tsx"),
      source("components/archive-ui/localArchiveProjectView.ts"),
      source("lib/discover-project-feed.ts"),
    ]);

  assert.match(archiveHeader, /title="打开项目档案"/);
  assert.match(archiveHeader, /style=\{eyebrowButtonStyle\}/);
  assert.match(archiveHeader, /<span style=\{titleTextDisplayStyle\}>/);

  assert.match(followedCard, /className=\{styles\.nameRow\}/);
  assert.match(followedCard, /· \{systemName\}/);
  assert.match(followedCard, /<ProjectMetaLine/);
  assert.match(followedCard, /<CompactActivityTime/);
  assert.doesNotMatch(followedCard, /更新 ·|最新：/);
  assert.match(followedCss, /\.body \{[\s\S]*?height: 88px/);

  assert.match(discoverCard, /className=\{styles\.imageTitleArea\}/);
  assert.ok(
    discoverCard.indexOf("{item.card_summary}") <
      discoverCard.indexOf("className={styles.summaryTime}")
  );
  assert.match(discoverCard, /className=\{styles\.projectMeta\}/);
  assert.match(discoverCard, /<ProjectMetaLine[\s\S]*?recordCount=\{item\.public_record_count\}[\s\S]*?durationDays=\{durationDays\}[\s\S]*?ended=\{Boolean\(item\.archive_ended_at\)\}/);
  assert.doesNotMatch(discoverCard, /item\.public_comment_count/);
  assert.doesNotMatch(discoverCard, /view_count|浏览/);
  assert.doesNotMatch(discoverCard, /getProjectSystemName|species_name_snapshot/);
  assert.match(discoverCss, /\.grid \{[\s\S]*?align-items: stretch/);
  assert.match(discoverCss, /\.body \{[^}]*flex: 1/);
  assert.match(discoverCss, /\.imageTitleArea \{[\s\S]*?linear-gradient/);
  assert.doesNotMatch(discoverCss, /\.owner \{[^}]*margin-top: auto/);
  assert.match(discoverFormat, /formatCompactActivityTime as formatDiscoveryActivityTime/);
  assert.match(activityFormat, /formatRecentActivityTime/);
  assert.match(projectMeta, /recordCount/);
  assert.match(projectMeta, /durationDays/);
  assert.match(projectMeta, /viewCount/);
  assert.match(projectMeta, /followerCount/);
  assert.match(projectMeta, /commentCount/);
  assert.match(projectMeta, /updatedAt/);
  assert.match(projectMeta, /notation: "compact"/);
  assert.match(uiIcon, /"record"/);
  assert.match(uiIcon, /"duration"/);
  assert.match(uiIcon, /"view"/);
  assert.match(uiIcon, /"follow"/);
  assert.match(archiveCard, />无图</);
  assert.match(archiveCard, /<CompactActivityTime value=\{latestRecordTime\}/);
  assert.match(archiveCard, /<ProjectMetaLine/);
  assert.doesNotMatch(archiveCard, /最新无图|最新：|· 更新/);
  assert.doesNotMatch(localProjectView, /浏览 0|关注 0|最新：|· 更新/);
  assert.ok(
    discoverData.indexOf("latestNote ||") <
      discoverData.indexOf("row.latest_public_primary_image_url")
  );
  assert.match(discoverData, /archiveSummary \|\| "项目刚刚开始"/);
});

test("plant detail exposes guide, experience cards, and records as peer tabs", async () => {
  const detail = await source("app/plant/[id]/page.tsx");

  assert.match(detail, /type PlantDetailTab = "guide" \| "experience" \| "records"/);
  assert.match(detail, /\["guide", "概要与种植办法"\]/);
  assert.match(detail, /\["experience", "经验卡"\]/);
  assert.match(detail, /\["records", "种植记录"\]/);
  assert.match(detail, /activeTab === "experience"/);
  assert.match(detail, /<PlantExperienceCardsSection[\s\S]*?cards=\{relatedExperienceCards\}[\s\S]*?currentUserId=\{currentUserId\}/);
  assert.match(detail, /title="我的经验卡"/);
  assert.match(detail, /title="其他人的经验卡"/);
  assert.match(detail, /activeTab === "records"/);
  assert.match(detail, /\.from\("experience_cards"\)/);
  assert.match(detail, /is_experience_card_public/);
});

test("discover search separates projects, records, and covered experience cards", async () => {
  const [page, tabs, form, results, data, utils] = await Promise.all([
    source("app/discover/search/page.tsx"),
    source("components/discover-search/DiscoverSearchTabs.tsx"),
    source("components/discover-search/DiscoverSearchForm.tsx"),
    source("components/discover-search/DiscoverSearchResults.tsx"),
    source("lib/discover-search-data.ts"),
    source("lib/discover-search-utils.ts"),
  ]);

  assert.match(tabs, /label: "项目"/);
  assert.match(tabs, /label: "记录"/);
  assert.match(tabs, /label: "经验卡"/);
  assert.match(page, /fetchDiscoverProjectSearchResults/);
  assert.match(page, /fetchDiscoverSearchResults/);
  assert.match(page, /fetchDiscoverExperienceCardSearchResults/);
  assert.match(form, /searchKind === "records"/);
  assert.match(results, /<DiscoverProjectCard/);
  assert.match(results, /<ExperienceCardListCard/);
  assert.match(results, /kind === "projects"[\s\S]*?<DiscoverProjectCard/);
  assert.match(results, /recordItems\.map[\s\S]*?<ProjectCardRows/);
  assert.match(data, /\.from\("discovery_project_feed_view"\)/);
  assert.match(data, /hydrateExperienceCardListItems/);
  assert.match(data, /is_experience_card_public/);
  assert.match(utils, /params\.set\("type", kind\)/);
  assert.match(utils, /return "records"/);
});
