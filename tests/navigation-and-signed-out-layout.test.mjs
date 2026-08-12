import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("mobile personal space project summary opens the project archive", async () => {
  const [profile, zhCopy, enCopy] = await Promise.all([
    source("app/profile/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(profile, /<Link href="\/archive" style=\{mobileProjectStatsCardStyle\}>/);
  assert.match(profile, /<strong>\{t\.profile\.project_archives\}<\/strong>/);
  assert.match(profile, /\{t\.profile\.public_prefix\} \{publicArchiveCount\}/);
  assert.match(zhCopy, /project_archives: "项目档案"/);
  assert.match(enCopy, /project_archives: "Project archives"/);
});

test("mobile shell keeps an ordered fixed navigation and returns within the app", async () => {
  const [navbar, backNavigation, lightbox, footerStyles, layout, manifest, globals, zhCopy, enCopy] = await Promise.all([
    source("components/navbar.tsx"),
    source("components/MobileBackNavigation.tsx"),
    source("components/archive-detail/ArchiveLightbox.tsx"),
    source("components/SiteFooter.module.css"),
    source("app/layout.tsx"),
    source("app/manifest.ts"),
    source("app/globals.css"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  const mobileNav = navbar.slice(
    navbar.indexOf("function MobileBottomNav"),
    navbar.indexOf("function MobileBottomNavItem")
  );
  assert.ok(mobileNav.indexOf("labels.discover") < mobileNav.indexOf("labels.following"));
  assert.ok(mobileNav.indexOf("labels.following") < mobileNav.indexOf("labels.personal_space"));
  assert.ok(mobileNav.indexOf("labels.personal_space") < mobileNav.indexOf("labels.guide"));
  assert.ok(mobileNav.indexOf("labels.guide") < mobileNav.indexOf("labels.market"));
  assert.doesNotMatch(mobileNav, /labels\.me/);
  assert.match(navbar, /shouldShowMobileProfileEntry\(pathname\)/);
  assert.match(navbar, /\{user \? t\.nav\.me : t\.nav\.login\}/);
  assert.match(navbar, /flexDirection: "column"/);
  assert.match(navbar, /transform: "translateZ\(0\)"/);
  assert.match(navbar, /<LanguageSwitcher compact \/>/);
  assert.doesNotMatch(mobileNav, /href="\/feedback"/);
  assert.match(zhCopy, /discover: "发现"/);
  assert.match(enCopy, /discover: "Discover"/);
  assert.match(enCopy, /following: "Following"/);
  assert.match(enCopy, /personal_space: "My Space"/);
  assert.match(enCopy, /guide: "Guide"/);
  assert.match(enCopy, /market: "Market"/);
  assert.match(enCopy, /me: "Me"/);

  assert.match(backNavigation, /MIN_HORIZONTAL_DISTANCE = 72/);
  assert.doesNotMatch(backNavigation, /EDGE_GESTURE_WIDTH/);
  assert.match(backNavigation, /touchmove", handleTouchMove, \{ passive: false \}/);
  assert.match(backNavigation, /hasActiveMobileOverlay\(\)/);
  assert.match(backNavigation, /window\.history\.pushState/);
  assert.match(backNavigation, /window\.addEventListener\("popstate"/);
  assert.match(backNavigation, /router\.replace\(destination\)/);
  assert.match(backNavigation, /isAppHome\(pathname\)/);
  assert.match(layout, /<MobileBackNavigation \/>/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /theme_color: "#f6f8f3"/);
  assert.match(globals, /overscroll-behavior-x: none/);
  assert.match(lightbox, /data-mobile-swipe-ignore="true"/);
  assert.match(lightbox, /mobileOverlayOpen = "true"/);
  assert.doesNotMatch(lightbox, /maxDistance >= 120/);
  assert.match(lightbox, /window\.history\.back\(\)/);
  assert.match(footerStyles, /@media \(max-width: 759px\)[\s\S]*?\.footer \{[\s\S]*?display: none/);
});

test("mobile archive creation and project controls stay compact without clipping", async () => {
  const [archivePage, workspace, projectCard, newProjectShell, newProjectStyles, menu, menuStyles, listStyles] = await Promise.all([
    source("app/archive/page.tsx"),
    source("components/archive-ui/ArchiveWorkspaceTemplate.tsx"),
    source("components/archive-ui/ArchiveProjectCard.tsx"),
    source("components/archive-ui/ArchiveNewProjectFormShell.tsx"),
    source("components/archive-ui/ArchiveNewProjectFormShell.module.css"),
    source("components/ui/ResponsiveActionMenu.tsx"),
    source("components/ui/ResponsiveActionMenu.module.css"),
    source("components/experience-card/ExperienceCardListCard.module.css"),
  ]);

  assert.match(workspace, /showCreateToolbar = true/);
  assert.match(archivePage, /showCreateToolbar=\{!isMobileViewport\}/);
  assert.match(projectCard, /mobileStatusCategoryRowStyle[\s\S]*?flexWrap: "wrap"/);
  assert.match(projectCard, /mobileSelectRowStyle[\s\S]*?flexWrap: "wrap"/);
  assert.match(newProjectShell, /styles\.categoryDescription/);
  assert.doesNotMatch(newProjectShell, /selectedCategoryDescription/);
  assert.match(newProjectStyles, /@media \(max-width: 759px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(newProjectStyles, /-webkit-line-clamp: 2/);
  assert.match(newProjectStyles, /\.intro \{[\s\S]*?display: none/);
  assert.match(newProjectStyles, /\.form \{[\s\S]*?margin-top: 0/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /setOpen\(\(current\) => !current\)/);
  assert.match(menuStyles, /\.rootOpen/);
  assert.match(listStyles, /overflow: visible/);
});

test("mobile plant guides use compact parameters, actions, cards, and sticky tabs", async () => {
  const [detail, styles, experienceCard, experienceStyles] = await Promise.all([
    source("app/plant/[id]/page.tsx"),
    source("app/plant/[id]/page.module.css"),
    source("components/experience-card/ExperienceCardListCard.tsx"),
    source("components/experience-card/ExperienceCardListCard.module.css"),
  ]);

  assert.match(detail, /className=\{styles\.parameterGrid\}/);
  assert.match(detail, /className=\{styles\.contentTabs\}/);
  assert.match(detail, /className=\{styles\.section\}/);
  assert.match(styles, /@media \(max-width: 759px\)[\s\S]*?\.parameterGrid \{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.contentTabs \{[\s\S]*?position: sticky;[\s\S]*?top: calc\(50px \+ var\(--app-safe-area-top\)\);/);
  assert.match(detail, /className=\{styles\.heroActions\}/);
  assert.match(styles, /\.heroActions \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.heroAction \{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/);
  assert.match(experienceCard, /<div className=\{styles\.headerRow\}>[\s\S]*?styles\.title[\s\S]*?styles\.statusRow/);
  assert.match(experienceStyles, /\.headerRow \{[\s\S]*?align-items: flex-start/);
  assert.match(experienceStyles, /\.title \{[\s\S]*?margin: 0 0 4px/);
  assert.match(styles, /padding: 10px 10px calc\(34px \+ var\(--app-safe-area-bottom\)\)/);
});

test("account navigation keeps membership contextual and export under data management", async () => {
  const [profile, navbar, membership, login, home, zhCopy, enCopy] = await Promise.all([
    source("app/profile/page.tsx"),
    source("components/navbar.tsx"),
    source("app/membership/page.tsx"),
    source("app/login/page.tsx"),
    source("app/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(profile, /value: "membership", label: t\.profile\.modules\.membership/);
  assert.match(profile, /value: "account", label: t\.profile\.modules\.account/);
  assert.match(profile, /<MobileProfileModuleTabs/);
  assert.match(profile, /const showInfoModule = mobileProfileModule === "info"/);
  assert.match(profile, /<h2 style=\{dataTitleStyle\}>\{t\.profile\.export_backup\}<\/h2>/);
  assert.match(profile, /\{t\.profile\.export_intro\}/);
  assert.ok(
    profile.indexOf("t.profile.export_records") > profile.indexOf("{showAccountModule ?")
  );
  assert.match(zhCopy, /export_backup: "导出与备份"/);
  assert.match(enCopy, /export_backup: "Export & backup"/);
  assert.doesNotMatch(profile, /云会员与云空间/);
  assert.doesNotMatch(navbar, /membershipEntryStyle/);
  assert.doesNotMatch(navbar, />\s*云会员\s*<\/Link>/);
  assert.doesNotMatch(navbar, /<NavItem href="\/register"/);
  assert.doesNotMatch(navbar, /mobileRegisterActionStyle/);
  assert.match(navbar, /<Link href="\/login" style=\{loginLinkStyle\}>/);
  assert.match(navbar, /pathname !== "\/"/);
  assert.match(membership, /t\.membership_page/);
  assert.match(zhCopy, /eyebrow: "个人使用方案"/);
  assert.match(zhCopy, /1GB 个人云端存储/);
  assert.doesNotMatch(membership, /查看会员权益/);
  assert.doesNotMatch(login, /href="\/membership"/);
  assert.doesNotMatch(login, /登录后进入我的项目/);
  assert.match(home, /href="\/membership"/);
  assert.match(home, /t\.home\.membership_title/);
  assert.match(home, /t\.home\.membership_description/);
  assert.match(zhCopy, /membership_title: "会员类别与权限"/);
  assert.match(zhCopy, /membership_description: "本地免费使用，云会员可云端保存与公开互动"/);
  assert.match(
    home,
    /href="\/register"[\s\S]*?t\.register[\s\S]*?href="\/discover"[\s\S]*?t\.home\.browse_discover/
  );
  assert.match(home, /membershipLinkArrowStyle/);
  assert.match(navbar, /href="\/login"[\s\S]*?t\.nav\.login/);
});

test("signed-out market does not repeat login and registration actions inside the page", async () => {
  const [market, zhCopy, enCopy] = await Promise.all([
    source("app/market/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.doesNotMatch(market, /登录后发布/);
  assert.doesNotMatch(market, /注册账号/);
  assert.match(market, /\{currentUserId \? \(/);
  assert.match(market, /\{t\.market\.my_posts\}/);
  assert.match(zhCopy, /my_posts: "我的发布"/);
  assert.match(enCopy, /my_posts: "My posts"/);
});

test("mobile market keeps actions out of the global bar and uses compact management cards", async () => {
  const [navbar, market, mine, zhCopy, enCopy] = await Promise.all([
    source("components/navbar.tsx"),
    source("app/market/page.tsx"),
    source("app/market/mine/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.doesNotMatch(navbar, /mobileMarketMineButtonStyle|mobileMarketPublishButtonStyle/);
  assert.match(navbar, /if \(pathname\.startsWith\("\/market"\)\) return false/);
  assert.match(market, /t\.market\.intro_title/);
  assert.match(market, /t\.market\.intro_mobile/);
  assert.match(market, /href="\/market\/mine"[\s\S]*?t\.market\.my_posts/);
  assert.doesNotMatch(market, /href="\/market\/new"/);
  assert.match(zhCopy, /intro_mobile: "平台仅发布供需信息，不提供站内交易。"/);
  assert.match(enCopy, /intro_mobile: "Listings only; transactions do not take place in the app\."/);

  assert.match(mine, /href="\/market\/new"[\s\S]*?t\.market\.post_information/);
  assert.doesNotMatch(mine, /getMarketPostQuotaHint/);
  assert.match(mine, /gridTemplateColumns: "112px minmax\(0, 1fr\)"/);
  assert.match(mine, /WebkitLineClamp: 2/);
  assert.match(mine, /formatMarketTime\(item\.created_at\)[\s\S]*?views_prefix/);
  assert.match(mine, /marginTop: "auto"/);
});

test("signed-out home uses a compact viewport-oriented layout", async () => {
  const [home, zhCopy] = await Promise.all([
    source("app/page.tsx"),
    source("lib/i18n/zh.ts"),
  ]);

  assert.match(home, /minHeight: "calc\(100vh - 70px\)"/);
  assert.match(home, /gridTemplateColumns: "repeat\(4, minmax\(0, 1fr\)\)"/);
  assert.match(home, /@media \(max-height: 720px\)/);
  assert.match(home, /\.home-actions > a:last-child \{ grid-column: 1 \/ -1; \}/);
  assert.match(home, /\{t\.home\.poem\}/);
  assert.match(home, /\{t\.home\.cards\.map/);
  assert.match(zhCopy, /记录四时变化，留下发现、收获与成长/);
  assert.match(zhCopy, /其他自然生活相关项目/);
  assert.match(home, /href="\/register"/);
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
    zhCopy,
    enCopy,
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
      source("lib/i18n/zh.ts"),
      source("lib/i18n/en.ts"),
    ]);

  assert.match(archiveHeader, /title=\{copy\.open_project_archive\}/);
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
  assert.match(archiveCard, /\{t\.archive_workspace\.no_image\}/);
  assert.match(zhCopy, /no_image: "无图"/);
  assert.match(enCopy, /no_image: "No image"/);
  assert.match(archiveCard, /<CompactActivityTime value=\{latestRecordTime\}/);
  assert.match(archiveCard, /<ProjectMetaLine/);
  assert.doesNotMatch(archiveCard, /最新无图|最新：|· 更新/);
  assert.doesNotMatch(localProjectView, /浏览 0|关注 0|最新：|· 更新/);
  assert.ok(
    discoverData.indexOf("latestNote ||") <
      discoverData.indexOf("item.latest_public_primary_image_url")
  );
  assert.match(discoverData, /card_summary: latestNote \|\| archiveSummary/);
  assert.doesNotMatch(discoverData, /新增了照片|项目刚刚开始/);
});

test("plant detail exposes guide, experience cards, and records as peer tabs", async () => {
  const [detail, zhCopy, enCopy] = await Promise.all([
    source("app/plant/[id]/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(detail, /type PlantDetailTab = "guide" \| "experience" \| "records"/);
  assert.match(detail, /\["guide", copy\.guide_tab\]/);
  assert.match(detail, /"experience",[\s\S]*?experienceCardTabCount > 0/);
  assert.match(detail, /"records",[\s\S]*?plantingRecordTabCount > 0/);
  assert.match(detail, /`\$\{copy\.experience_cards\} \(\$\{experienceCardTabCount\}\)`/);
  assert.match(detail, /`\$\{copy\.growing_records\} \(\$\{plantingRecordTabCount\}\)`/);
  assert.match(detail, /activeTab === "experience"/);
  assert.match(detail, /<PlantExperienceCardsSection[\s\S]*?cards=\{relatedExperienceCards\}[\s\S]*?currentUserId=\{currentUserId\}/);
  assert.match(detail, /title=\{copy\.my_experience_cards\}/);
  assert.match(detail, /title=\{copy\.others_experience_cards\}/);
  assert.match(detail, /activeTab === "records"/);
  assert.match(detail, /\.from\("experience_cards"\)/);
  assert.match(detail, /is_experience_card_public/);
  assert.match(zhCopy, /guide_tab: "概要与种植办法"/);
  assert.match(enCopy, /guide_tab: "Overview & growing guide"/);
});

test("discover search separates three result types with one shared card format", async () => {
  const [page, tabs, form, results, resultCard, resultCardStyles, data, utils, zhCopy, enCopy] = await Promise.all([
    source("app/discover/search/page.tsx"),
    source("components/discover-search/DiscoverSearchTabs.tsx"),
    source("components/discover-search/DiscoverSearchForm.tsx"),
    source("components/discover-search/DiscoverSearchResults.tsx"),
    source("components/discover-search/DiscoverSearchResultCard.tsx"),
    source("components/discover-search/DiscoverSearchResultCard.module.css"),
    source("lib/discover-search-data.ts"),
    source("lib/discover-search-utils.ts"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(tabs, /label: t\.discover\.search_ui\.projects/);
  assert.match(tabs, /label: t\.discover\.search_ui\.records/);
  assert.match(tabs, /label: t\.discover\.search_ui\.experience_cards/);
  assert.match(zhCopy, /projects: "项目"/);
  assert.match(enCopy, /experience_cards: "Experience cards"/);
  assert.match(page, /fetchDiscoverProjectSearchResults/);
  assert.match(page, /fetchDiscoverSearchResults/);
  assert.match(page, /fetchDiscoverExperienceCardSearchResults/);
  assert.match(form, /searchKind === "records"/);
  assert.doesNotMatch(form, /按地区匹配公开/);
  assert.match(results, /kind === "projects"[\s\S]*?projectItems\.map[\s\S]*?<DiscoverSearchResultCard/);
  assert.match(results, /kind === "experience"[\s\S]*?experienceItems\.map[\s\S]*?<DiscoverSearchResultCard/);
  assert.match(results, /recordItems\.map[\s\S]*?<DiscoverSearchResultCard/);
  assert.doesNotMatch(results, /<DiscoverProjectCard|<ExperienceCardListCard|<ProjectCardRows/);
  assert.match(results, /imageUrl=\{item\.display_image_url\}/);
  assert.match(results, /imageUrl=\{item\.coverUrl\}/);
  assert.match(results, /imageUrl=\{displayImageUrl\}/);
  assert.match(results, /summary=\{item\.card_summary\?\.trim\(\) \|\| undefined\}/);
  assert.match(results, /summary=\{item\.description\?\.trim\(\) \|\| undefined\}/);
  assert.match(results, /summary=\{record\.note\?\.trim\(\) \|\| undefined\}/);
  assert.doesNotMatch(
    results,
    /查看按原始时间排列|这条记录以照片为主|这条记录没有文字|项目刚刚开始/
  );
  assert.match(resultCard, /<CompactActivityTime/);
  assert.match(resultCard, /className=\{styles\.card\}/);
  assert.match(resultCard, /sizes="\(max-width: 759px\) 106px, 108px"/);
  assert.match(resultCard, /\{summary \? <div className=\{styles\.summary\}>\{summary\}<\/div> : null\}/);
  assert.match(resultCardStyles, /\.grid\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(resultCardStyles, /\.card\s*\{[\s\S]*grid-template-columns: 108px minmax\(0, 1fr\);[\s\S]*padding: 8px;[\s\S]*border-radius: 14px;/);
  assert.match(resultCardStyles, /\.media\s*\{[\s\S]*width: 108px;[\s\S]*height: 108px;[\s\S]*border-radius: 10px;/);
  assert.match(resultCardStyles, /\.summary\s*\{[\s\S]*-webkit-line-clamp: 2;/);
  assert.match(resultCardStyles, /@media \(min-width: 760px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(resultCardStyles, /@media \(max-width: 759px\)[\s\S]*grid-template-columns: 106px minmax\(0, 1fr\);/);
  assert.match(resultCardStyles, /@media \(max-width: 759px\)[\s\S]*\.media \{[\s\S]*height: auto;[\s\S]*align-self: stretch;/);
  assert.match(resultCardStyles, /@media \(max-width: 759px\)[\s\S]*\.footer \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(data, /\.from\("discovery_project_feed_view"\)/);
  assert.match(data, /hydrateExperienceCardListItems/);
  assert.match(data, /is_experience_card_public/);
  assert.match(utils, /params\.set\("type", kind\)/);
  assert.match(utils, /return "records"/);
});

test("user navigation opens a compact profile directly and keeps the space entry obvious", async () => {
  const [userSpace, publicProfile, archiveDetail, zhCopy, enCopy] = await Promise.all([
    source("app/user/[id]/page.tsx"),
    source("app/user/[id]/profile/page.tsx"),
    source("app/archive/[id]/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(userSpace, /href=\{`\/user\/\$\{userId\}\/profile`\}/);
  assert.match(userSpace, /\{t\.profile\.space\.user_profile\}/);
  assert.match(zhCopy, /user_profile: "用户资料"/);
  assert.match(enCopy, /user_profile: "User profile"/);
  assert.doesNotMatch(userSpace, /名片|showCard|UserProfileCard/);

  assert.match(publicProfile, /<UserAvatar/);
  assert.match(publicProfile, /profileStatsGridStyle/);
  assert.match(publicProfile, /t\.profile\.public_profile\.enter_prefix/);
  assert.match(publicProfile, /t\.profile\.public_profile\.enter_suffix/);
  assert.doesNotMatch(publicProfile, /用户信息页|当前正在进行的交换、赠送、转让或求购信息/);

  assert.match(archiveDetail, /archiveCopy\.enter_user_space_prefix/);
  assert.match(archiveDetail, /archiveCopy\.enter_user_space_suffix/);
  assert.match(archiveDetail, /displayUsername/);
  assert.match(archiveDetail, /<UiIcon name="arrow-right" size=\{14\} \/>/);
  assert.match(archiveDetail, /background: "#edf6e9"/);
  assert.match(archiveDetail, /border: "1px solid #bfd5b8"/);
});

test("page headings omit copy that only restates the visible interface", async () => {
  const sources = await Promise.all([
    source("app/profile/page.tsx"),
    source("app/profile/recent/page.tsx"),
    source("app/profile/followers/page.tsx"),
    source("app/follow/page.tsx"),
    source("app/market/mine/page.tsx"),
    source("app/market/[id]/edit/page.tsx"),
    source("app/archive/new/page.tsx"),
    source("app/local/archive/new/page.tsx"),
    source("components/discover/DiscoverEmptyState.tsx"),
    source("components/discover/DiscoverUserSections.tsx"),
  ]);
  const combined = sources.join("\n");

  assert.doesNotMatch(
    combined,
    /用户信息页|最近访问过的项目记录页|正在关注你的用户|持续追踪中心|查看你正在追踪的项目和用户最近发生了什么|管理你发布过的交换、赠送、转让和求购信息|可修改标题、说明、地区、图片和封面|表单结构与本地项目一致|表单结构与云空间一致|公开记录会显示在这里|更多项目可进入空间查看/
  );
});
