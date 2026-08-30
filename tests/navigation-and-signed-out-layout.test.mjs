import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("profile uses an editable identity card and explicit account entries", async () => {
  const [profile, zhCopy, enCopy] = await Promise.all([
    source("app/profile/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(profile, /profileIdentityCardStyle/);
  assert.match(profile, /会员编号/);
  assert.match(profile, /被采纳的次数/);
  assert.match(profile, /空间用量/);
  assert.match(profile, /开通云会员/);
  assert.match(profile, /订单进度查询/);
  assert.match(profile, /会员类别说明/);
  assert.match(profile, /浏览历史/);
  assert.match(profile, /备份与导出/);
  assert.match(profile, /账号管理/);
  assert.doesNotMatch(profile, /showInfoModule|mobileProfileModule === "settings"/);
  assert.match(profile, /<input[\s\S]*?value=\{username\}[\s\S]*?onChange=\{\(event\) => setUsername/);
  assert.match(profile, /role="switch"/);
  assert.doesNotMatch(profile, /identityEditButtonStyle/);
  assert.match(profile, /t\.profile\.language_setting/);
  assert.match(profile, /t\.profile\.country_region/);
  assert.match(profile, /t\.profile\.registered_user_rights/);
  assert.match(profile, /t\.profile\.cloud_member_rights/);
  assert.match(profile, /href="\/membership\/benefits"/);
  assert.doesNotMatch(profile, /value: "space"/);
  assert.doesNotMatch(profile, /href="\/archive"/);
  assert.match(zhCopy, /membership: "会员类信息"/);
  assert.match(zhCopy, /payment: "支付类信息"/);
  assert.match(zhCopy, /registered_user_rights: "仅浏览公开内容"/);
  assert.match(zhCopy, /cloud_member_rights: "可发布公开记录"/);
  assert.match(enCopy, /registered_user_rights: "Browse public content only"/);
  assert.match(enCopy, /cloud_member_rights: "Can publish public records"/);
});

test("mobile shell keeps an ordered fixed navigation and returns within the app", async () => {
  const [navbar, backNavigation, authReturn, lightbox, footerStyles, layout, manifest, globals, zhCopy, enCopy] = await Promise.all([
    source("components/navbar.tsx"),
    source("components/MobileBackNavigation.tsx"),
    source("lib/auth-return.ts"),
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
  assert.ok(mobileNav.indexOf("labels.home") < mobileNav.indexOf("labels.following"));
  assert.ok(mobileNav.indexOf("labels.following") < mobileNav.indexOf("labels.market"));
  assert.ok(mobileNav.indexOf("labels.market") < mobileNav.indexOf("labels.me"));
  assert.match(
    mobileNav,
    /MobileBottomNavItem \{\.\.\.items\[1\]\}[\s\S]*?QuickCaptureNavAction[\s\S]*?MobileBottomNavItem \{\.\.\.items\[2\]\}/
  );
  assert.doesNotMatch(mobileNav, /labels\.personal_space|labels\.guide/);
  assert.match(mobileNav, /href: user \? "\/archive" : buildLoginHref\("\/archive"\)/);
  assert.match(navbar, /getMobilePageTitle\(pathname, t\.nav, t\.market\)/);
  assert.match(navbar, /flexDirection: "column"/);
  assert.match(navbar, /transform: "translateZ\(0\)"/);
  assert.doesNotMatch(navbar, /LanguageSwitcher/);
  assert.match(navbar, /hasPageManagedMobileTopNav\(pathname\)/);
  assert.doesNotMatch(mobileNav, /href="\/feedback"/);
  assert.match(zhCopy, /discover: "发现"/);
  assert.match(enCopy, /discover: "Discover"/);
  assert.match(enCopy, /following: "Following"/);
  assert.match(enCopy, /personal_space: "My Space"/);
  assert.match(enCopy, /guide: "Guide"/);
  assert.match(enCopy, /market: "Market"/);
  assert.match(enCopy, /me: "Me"/);

  assert.doesNotMatch(backNavigation, /MIN_HORIZONTAL_DISTANCE|handleTouchMove|touchstart|touchend/);
  assert.match(backNavigation, /useSearchParams\(\)/);
  assert.match(backNavigation, /currentRoute/);
  assert.match(backNavigation, /hasActiveMobileOverlay\(\)/);
  assert.doesNotMatch(backNavigation, /window\.history\.pushState/);
  assert.match(backNavigation, /window\.history\.back\(\)/);
  assert.match(backNavigation, /router\.replace\(destination\)/);
  assert.match(backNavigation, /isAppExitRoot\(pathname\)/);
  assert.match(authReturn, /!value\.startsWith\("\/\/"\)/);
  assert.match(authReturn, /pathOnly === "\/login" \|\| pathOnly === "\/register"/);
  assert.match(authReturn, /encodeURIComponent\(getSafeReturnTo\(returnTo\)\)/);
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

test("the center plus accumulates photos and carries all of them into one new record", async () => {
  const [navbar, action, quickCapture, chooser, cloudRecord, localRecord, cloudQuickRecord] = await Promise.all([
    source("components/navbar.tsx"),
    source("components/quick-record/QuickCaptureNavAction.tsx"),
    source("lib/quick-capture.ts"),
    source("app/quick-record/page.tsx"),
    source("app/archive/[id]/AddRecord.tsx"),
    source("app/local/archive/[id]/page.tsx"),
    source("lib/cloud-quick-capture-record.ts"),
  ]);

  assert.match(navbar, /<QuickCaptureNavAction/);
  assert.match(action, /type="file"/);
  assert.match(action, /accept="image\/\*"/);
  assert.match(action, /capture="environment"/);
  assert.doesNotMatch(action, /standardizeRecordPhotoFile/);
  assert.match(action, /saveQuickCapture/);
  assert.match(action, /processing_photo/);
  assert.match(quickCapture, /indexedDB\.open/);
  assert.match(quickCapture, /appendQuickCaptureFiles/);
  assert.match(quickCapture, /\.\.\.existing,[\s\S]*?\.\.\.accepted\.map/);
  assert.doesNotMatch(quickCapture, /MAX_RECORD_PHOTOS_PER_RECORD/);
  assert.match(chooser, /listVisibleLocalArchiveSummaries/);
  assert.match(chooser, /\.from\("archives"\)/);
  assert.match(chooser, /!user && localResult\.archives\.length === 0/);
  assert.match(chooser, /buildLoginHref\(`\/quick-record\?capture=/);
  assert.match(chooser, /quickCapture=\$\{capture\.id\}/);
  assert.match(chooser, /continue_take_photo/);
  assert.match(chooser, /add_from_album/);
  assert.match(chooser, /multiple/);
  assert.match(chooser, /appendQuickCaptureFiles/);
  assert.ok(
    chooser.indexOf("t.quick_record.create_cloud_project") <
      chooser.indexOf("t.quick_record.create_local_project")
  );
  assert.match(cloudRecord, /quickCaptureToFiles/);
  assert.match(localRecord, /quickCaptureToFiles/);
  assert.match(cloudRecord, /deleteQuickCapture/);
  assert.match(localRecord, /deleteQuickCapture/);
  assert.match(cloudQuickRecord, /getQuickCapturePhotos/);
  assert.match(cloudQuickRecord, /for \(let index = 0; index < files\.length; index \+= 1\)/);
  assert.match(cloudQuickRecord, /mediaIds\.push/);
});

test("mobile primary pages use contextual top bars and keep notifications in My Space", async () => {
  const [navbar, topBar, homeTabs, archivePage, followPage, marketPage, experiencePage, plantPage, discoverFilters, projectCard] = await Promise.all([
    source("components/navbar.tsx"),
    source("components/mobile/MobileContentTopBar.tsx"),
    source("components/home/HomeSectionTabs.tsx"),
    source("app/archive/page.tsx"),
    source("app/follow/page.tsx"),
    source("app/market/page.tsx"),
    source("app/experience/page.tsx"),
    source("app/plant/page.tsx"),
    source("components/discover/DiscoverFilterBar.tsx"),
    source("components/archive-ui/ArchiveProjectCard.tsx"),
  ]);

  assert.match(topBar, /showNotification = false/);
  assert.match(homeTabs, /label: t\.nav\.activity, href: "\/discover"/);
  assert.match(homeTabs, /label: t\.nav\.experience,[\s\S]*?href: "\/experience"/);
  assert.match(homeTabs, /label: t\.nav\.guide, href: "\/plant"/);
  assert.match(homeTabs, /active === "activity"[\s\S]*?"\/discover\/search"/);
  assert.match(experiencePage, /onSearch=\{\(\) => setSearchOpen\(\(open\) => !open\)\}/);
  assert.match(plantPage, /onSearch=\{\(\) => setIsMobileSearchOpen\(\(open\) => !open\)\}/);
  assert.match(archivePage, /<Link href="\/profile" style=\{personalSpaceAvatarLinkStyle\}>/);
  assert.match(archivePage, /<MobileNotificationLink \/>/);
  assert.doesNotMatch(followPage, /showNotification/);
  assert.doesNotMatch(marketPage, /showNotification/);
  assert.match(marketPage, /const \[mobileFiltersOpen, setMobileFiltersOpen\] = useState\(false\)/);
  assert.match(marketPage, /isMobileViewport \? \([\s\S]*?mobileFiltersOpen \? \([\s\S]*?<MobileMarketFilters/);
  assert.match(discoverFilters, /filterStyles\.withHelp/);
  assert.match(await source("components/ui/CategoryFilterRow.module.css"), /repeat\(5, minmax\(0, 1fr\)\) max-content/);
  assert.match(discoverFilters, /aria-pressed=\{helpOnly\}/);
  assert.match(projectCard, /width: mobileMode \? 96 : 104/);
  assert.match(navbar, /function shouldShowMobileCreateAction\(pathname: string\)[\s\S]*?return false/);
  assert.match(navbar, /pathname\.startsWith\("\/quick-record"\)\) return labels\.add_record/);
});

test("mobile archive creation and project controls stay compact without clipping", async () => {
  const [archivePage, workspace, archiveCard, projectCard, projectCardStyles, newProjectShell, newProjectStyles, menu, menuStyles, listStyles] = await Promise.all([
    source("app/archive/page.tsx"),
    source("components/archive-ui/ArchiveWorkspaceTemplate.tsx"),
    source("components/archive-ui/ArchiveProjectCard.tsx"),
    source("components/project/ProjectSummaryCard.tsx"),
    source("components/project/ProjectSummaryCard.module.css"),
    source("components/archive-ui/ArchiveNewProjectFormShell.tsx"),
    source("components/archive-ui/ArchiveNewProjectFormShell.module.css"),
    source("components/ui/ResponsiveActionMenu.tsx"),
    source("components/ui/ResponsiveActionMenu.module.css"),
    source("components/experience-card/ExperienceCardListCard.module.css"),
  ]);

  assert.match(workspace, /showCreateToolbar = true/);
  assert.match(archivePage, /showCreateToolbar=\{!isMobileViewport\}/);
  assert.match(archiveCard, /<ProjectSummaryCard/);
  assert.match(archiveCard, /actionSlot=/);
  assert.match(projectCard, /className=\{styles\.titleRow\}/);
  assert.match(projectCard, /className=\{styles\.classification\}/);
  assert.match(projectCardStyles, /grid-template-columns: 112px minmax\(0, 1fr\)/);
  assert.match(projectCard, /<InlineRecordSummary/);
  assert.match(projectCardStyles, /\.title \{[^}]*white-space: normal/);
  assert.match(await source("components/ui/InlineRecordSummary.module.css"), /-webkit-line-clamp: 2/);
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
  assert.match(detail, /<MobilePageHeader[\s\S]*?className=\{styles\.mobileSavedAction\}/);
  assert.match(detail, /className=\{`\$\{styles\.heroHeadingRow\} mobile-app-desktop-only`\}/);
  assert.match(styles, /\.heroHeadingRow \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto auto/);
  assert.match(styles, /\.heroAction \{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/);
  assert.match(styles, /\.environmentTagList \{[\s\S]*?gap: 5px 6px/);
  assert.match(experienceCard, /<div className=\{styles\.headerRow\}>[\s\S]*?styles\.title[\s\S]*?styles\.statusRow/);
  assert.match(experienceStyles, /\.headerRow \{[\s\S]*?align-items: flex-start/);
  assert.match(experienceStyles, /\.title \{[\s\S]*?margin: 0 0 4px/);
  assert.match(styles, /padding: 10px 10px calc\(34px \+ var\(--app-safe-area-bottom\)\)/);
});

test("account navigation exposes the confirmed independent menu entries", async () => {
  const [profile, navbar, membership, login, home, zhCopy, enCopy] = await Promise.all([
    source("app/profile/page.tsx"),
    source("components/navbar.tsx"),
    source("app/membership/page.tsx"),
    source("app/login/page.tsx"),
    source("app/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(profile, /id="language-settings"/);
  assert.match(profile, /role="switch"/);
  assert.match(profile, /"Cloud Membership" : "开通云会员"/);
  assert.match(profile, /"Order progress" : "订单进度查询"/);
  assert.match(profile, /"Membership types" : "会员类别说明"/);
  assert.match(profile, /"Browsing history" : "浏览历史"/);
  assert.match(profile, /"Backup & export" : "备份与导出"/);
  assert.match(profile, /"Account management" : "账号管理"/);
  assert.match(profile, /<MobileProfileModuleTabs/);
  assert.match(profile, /href: "\/admin\/memberships"/);
  assert.match(profile, /isAdmin[\s\S]*?adminMembershipProfileModule/);
  assert.match(profile, /display: "grid"/);
  assert.match(profile, /overflowX: "visible"/);
  assert.match(profile, /gridTemplateColumns: "1fr"/);
  assert.match(profile, /compact && isActive/);
  assert.match(profile, /desktopProfileModulesStyle/);
  assert.match(profile, /mobileProfileCompactTabStyle[\s\S]*?minHeight: 46/);
  assert.doesNotMatch(profile, /mobileProfileModule === "adminMembership"/);
  assert.doesNotMatch(profile, /showInfoModule|mobileProfileModule === "settings"/);
  assert.match(profile, /admin_get_membership_payment_queue_count/);
  assert.match(profile, /admin_get_membership_refund_queue_count/);
  assert.match(profile, /"\/admin\/memberships#refund-review"/);
  assert.match(profile, /"\/admin\/memberships#payment-review"/);
  assert.match(profile, /<h2 style=\{dataTitleStyle\}>\{t\.profile\.export_backup\}<\/h2>/);
  assert.match(profile, /\{t\.profile\.export_intro\}/);
  assert.ok(
    profile.indexOf("t.profile.export_records") > profile.indexOf("{showBackupModule ?")
  );
  assert.match(zhCopy, /export_backup: "导出与备份"/);
  assert.match(enCopy, /export_backup: "Export & backup"/);
  assert.doesNotMatch(profile, /云会员与云空间/);
  assert.doesNotMatch(navbar, /membershipEntryStyle/);
  assert.doesNotMatch(navbar, />\s*云会员\s*<\/Link>/);
  assert.doesNotMatch(navbar, /<NavItem href="\/register"/);
  assert.doesNotMatch(navbar, /mobileRegisterActionStyle/);
  assert.match(navbar, /<Link href=\{buildLoginHref\(pathname\)\} style=\{loginLinkStyle\}>/);
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
    /href=\{currentUserId \? "\/archive" : "\/register"\}[\s\S]*?t\.home\.enter_my_space[\s\S]*?isNativeApp === false[\s\S]*?href="\/api\/download\/android"[\s\S]*?href="\/discover"/
  );
  assert.match(home, /session\?\.user && Capacitor\.isNativePlatform\(\)/);
  assert.match(login, /isNativeApp === false[\s\S]*?href="\/api\/download\/android"/);
  assert.match(home, /membershipLinkArrowStyle/);
  assert.match(navbar, /buildLoginHref\(pathname\)[\s\S]*?t\.nav\.login/);
});

test("mobile account actions, membership copy, and plant names stay compact", async () => {
  const [navbar, profile, membership, payment, benefits, zhCopy, enCopy] = await Promise.all([
    source("components/navbar.tsx"),
    source("app/profile/page.tsx"),
    source("app/membership/page.tsx"),
    source("app/membership/payment/page.tsx"),
    source("app/membership/benefits/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(navbar, /supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(navbar, /mobileLogoutButtonStyle/);
  assert.match(profile, /onClick=\{\(\) => void handleProfileLogout\(\)\}[\s\S]*?style=\{accountLogoutButtonStyle\}[\s\S]*?t\.nav\.logout_full/);
  assert.doesNotMatch(navbar, /mobileMeMenuOpen|mobileMeMoreButtonStyle|mobileMeMenuStyle/);

  assert.doesNotMatch(membership, /t\.membership_page\.business_/);
  assert.match(membership, /mobileBenefitsCardStyle/);
  assert.match(membership, /href="\/membership\/payment"/);
  assert.match(membership, /href="\/membership\/benefits"/);
  assert.ok(
    membership.indexOf('href="/membership/payment"') <
      membership.indexOf('href="/membership/benefits"'),
  );
  assert.doesNotMatch(membership, /mobileBenefitsActionsStyle/);
  assert.match(payment, /payment_page_title/);
  assert.match(payment, /domestic_payment_action/);
  assert.match(payment, /overseas_payment_action/);
  assert.match(payment, /create_membership_payment_order_json/);
  assert.match(payment, /submit_membership_payment_order_json/);
  assert.match(payment, /from\("payment-proofs"\)/);
  assert.doesNotMatch(payment, /createOrder\("wechat"\)/);
  assert.match(benefits, /cloudPlan\.items\.map/);
  assert.match(benefits, /t\.membership_page\.rules\.map/);
  assert.match(zhCopy, /mobile_items: \["1GB 云端存储与同步"/);
  assert.match(zhCopy, /interested_plants: "我的植物收藏"/);
  assert.match(zhCopy, /planting_plan: "我的种植计划"/);
  assert.match(enCopy, /interested_plants: "My saved plants"/);
  assert.match(enCopy, /planting_plan: "My planting plans"/);
});

test("plant guide renders a small batch and restores the list position", async () => {
  const [guide, zhCopy, enCopy] = await Promise.all([
    source("app/plant/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(guide, /INITIAL_VISIBLE_PLANT_COUNT = 24/);
  assert.match(guide, /PLANT_BATCH_SIZE = 24/);
  assert.match(guide, /filteredPlants\.slice\(0, visiblePlantCount\)/);
  assert.match(guide, /typeof window\.IntersectionObserver === "undefined"/);
  assert.match(guide, /new IntersectionObserver/);
  assert.match(guide, /visiblePlantCount: nextVisiblePlantCount/);
  assert.match(guide, /scrollY: window\.scrollY/);
  assert.match(guide, /window\.scrollTo\(\{ top: scrollY \}\)/);
  assert.match(zhCopy, /load_more: "继续加载"/);
  assert.match(enCopy, /load_more: "Load more"/);
});

test("following stays an independent bottom destination and returns there after login", async () => {
  const [navbar, follow] = await Promise.all([
    source("components/navbar.tsx"),
    source("app/follow/page.tsx"),
  ]);

  assert.match(navbar, /label: labels\.following/);
  assert.match(navbar, /href: user \? "\/follow" : buildLoginHref\("\/follow"\)/);
  assert.match(navbar, /active: pathname\.startsWith\("\/follow"\)/);
  assert.match(follow, /buildLoginHref\(getCurrentInternalPath\(\)\)/);
  assert.match(follow, /fetchFollowedPublicProjects/);
  assert.match(follow, /followT\.user_projects_load_failed/);
  assert.match(follow, /followT\.empty_followed_user_projects/);
  assert.doesNotMatch(
    follow,
    /followedUsersArchivesPromise[\s\S]*?\.from\("archives"\)/
  );
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

test("mobile market keeps actions out of the global bar and uses readable management cards", async () => {
  const [navbar, market, mine, zhCopy, enCopy] = await Promise.all([
    source("components/navbar.tsx"),
    source("app/market/page.tsx"),
    source("app/market/mine/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.doesNotMatch(navbar, /mobileMarketMineButtonStyle|mobileMarketPublishButtonStyle/);
  assert.match(navbar, /hasPageManagedMobileTopNav/);
  assert.match(market, /<MobileContentTopBar/);
  assert.match(market, /getMarketPostTypeOptions\(language\)\.map/);
  assert.match(market, /href="\/market\/mine"[\s\S]*?t\.market\.my_posts/);
  assert.match(market, /mobileHeaderStyle[\s\S]*?display: "flex"/);
  assert.match(market, /mobileFilterTopGridStyle[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(market, /<option value="all">\{t\.market\.all_categories\}<\/option>/);
  assert.doesNotMatch(market, /mobileFilterLabelStyle/);
  assert.match(market, /mobileFilterControlStyle[\s\S]*?height: 36[\s\S]*?fontSize: 13/);
  assert.match(market, /cardStyle[\s\S]*?gridTemplateColumns: "88px minmax\(0, 1fr\)"/);
  assert.match(market, /infoValueStyle[\s\S]*?whiteSpace: "nowrap"/);
  assert.doesNotMatch(market, /href="\/market\/new"/);
  assert.match(zhCopy, /my_posts: "我的发布"/);
  assert.match(enCopy, /my_posts: "My posts"/);

  assert.match(mine, /href="\/market\/new"[\s\S]*?t\.market\.post_information/);
  assert.doesNotMatch(mine, /getMarketPostQuotaHint/);
  assert.match(mine, /cardOpenLinkStyle[\s\S]*?gridTemplateColumns: "98px minmax\(0, 1fr\)"/);
  assert.match(mine, /descriptionStyle[\s\S]*?WebkitLineClamp: 2/);
  assert.match(mine, /formatMarketTime\(item\.created_at\)/);
  assert.doesNotMatch(mine, /views_prefix/);
  assert.match(mine, /<MobilePageHeader[\s\S]*?title=\{t\.market\.mine_title\}[\s\S]*?right=/);
  assert.match(mine, /cardContentStyle[\s\S]*?height: 98/);
});

test("mobile archive detail only offers Add record to the project owner", async () => {
  const navbar = await source("components/navbar.tsx");

  assert.match(navbar, /select\("title, category, species_id, species_name_snapshot, system_name, user_id"\)/);
  assert.match(navbar, /ownerId: String\(data\?\.user_id \|\| ""\)/);
  assert.match(navbar, /const canShowMobileCreateAction = Boolean/);
  assert.match(navbar, /mobileArchiveTitleInfo\?\.ownerId === user\.id/);
  assert.match(navbar, /\) : canShowMobileCreateAction \? \(/);
});

test("signed-out home uses a compact viewport-oriented layout", async () => {
  const [home, zhCopy] = await Promise.all([
    source("app/page.tsx"),
    source("lib/i18n/zh.ts"),
  ]);

  assert.match(home, /minHeight: "calc\(100vh - 70px\)"/);
  assert.match(home, /gridTemplateColumns: "repeat\(4, minmax\(0, 1fr\)\)"/);
  assert.match(home, /@media \(max-height: 720px\)/);
  assert.match(home, /\.home-actions > a:first-child \{ grid-column: 1 \/ -1; \}/);
  assert.match(home, /data-has-download=\{isNativeApp === false \? "true" : "false"\}/);
  assert.match(home, /\.home-poem[\s\S]*border-left: 3px solid/);
  assert.match(home, /\{t\.home\.poem\}/);
  assert.match(home, /\{t\.home\.cards\.map/);
  assert.match(zhCopy, /记录四时变化，留下发现、收获与成长/);
  assert.match(zhCopy, /其他自然生活相关项目/);
  assert.match(home, /href=\{currentUserId \? "\/archive" : "\/register"\}/);
  assert.match(home, /href="\/api\/download\/android"/);
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
  assert.match(followedCss, /\.body \{[\s\S]*?height: 104px/);

  assert.match(discoverCard, /className=\{styles\.imageTitleArea\}/);
  assert.match(discoverCard, /<InlineRecordSummary text=\{item\.card_summary\} time=\{item\.public_activity_at\}/);
  assert.match(discoverCard, /className=\{styles\.projectMeta\}/);
  assert.match(discoverCard, /<ProjectMetaLine[\s\S]*?recordCount=\{item\.public_record_count\}[\s\S]*?durationDays=\{durationDays\}[\s\S]*?ended=\{Boolean\(item\.archive_ended_at\)\}/);
  assert.doesNotMatch(discoverCard, /item\.public_comment_count/);
  assert.match(discoverCard, /followerCount=\{item\.follower_count\}/);
  assert.doesNotMatch(discoverCard, /viewCount=/);
  assert.doesNotMatch(discoverCard, /getProjectSystemName|species_name_snapshot/);
  assert.match(discoverCss, /\.grid \{[\s\S]*?align-items: stretch/);
  assert.match(discoverCss, /^\.body \{[^}]*min-height: 49px/m);
  assert.match(discoverCss, /\.imageTitleArea \{[\s\S]*?linear-gradient/);
  assert.match(discoverCard, /styles\.imageRegion\} \$\{verticalCard\.media/);
  assert.match(await source("components/ui/VerticalFeedCard.module.css"), /--feed-image-ratio: 1 \/ 1\.08/);
  assert.match(discoverCss, /\.summary \{[\s\S]*?line-height: 1\.35/);
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

test("activity search keeps desktop filters while mobile splits projects and records", async () => {
  const [page, tabs, header, form, results, resultCard, resultCardStyles, data, utils, experiencePage, zhCopy, enCopy] = await Promise.all([
    source("app/discover/search/page.tsx"),
    source("components/discover-search/DiscoverSearchTabs.tsx"),
    source("components/discover-search/DiscoverSearchHeader.tsx"),
    source("components/discover-search/DiscoverSearchForm.tsx"),
    source("components/discover-search/DiscoverSearchResults.tsx"),
    source("components/discover-search/DiscoverSearchResultCard.tsx"),
    source("components/discover-search/DiscoverSearchResultCard.module.css"),
    source("lib/discover-search-data.ts"),
    source("lib/discover-search-utils.ts"),
    source("app/experience/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(tabs, /label: t\.discover\.search_ui\.projects/);
  assert.match(tabs, /label: t\.discover\.search_ui\.records/);
  assert.match(tabs, /label: t\.discover\.search_ui\.all/);
  assert.doesNotMatch(tabs, /label: t\.discover\.search_ui\.experience_cards/);
  assert.match(tabs, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(zhCopy, /projects: "项目"/);
  assert.match(enCopy, /experience_cards: "Experience cards"/);
  assert.match(page, /fetchDiscoverProjectSearchResults/);
  assert.match(page, /fetchDiscoverSearchResults/);
  assert.doesNotMatch(page, /fetchDiscoverExperienceCardSearchResults/);
  assert.match(experiencePage, /fetchDiscoverExperienceCardSearchResults/);
  assert.match(experiencePage, /onSearch=\{\(\) => setSearchOpen/);
  assert.doesNotMatch(experiencePage, /window\.history\.pushState/);
  assert.match(header, /<MobilePageHeader/);
  assert.match(header, /onSearchKindChange\("projects"\)/);
  assert.match(header, /onSearchKindChange\("records"\)/);
  assert.doesNotMatch(header, /onSearchKindChange\("all"\)/);
  assert.match(form, /searchKind === "records"/);
  assert.match(
    form,
    /mobileGridStyle[\s\S]*?minmax\(82px, \.95fr\) minmax\(64px, \.72fr\) minmax\(94px, 1\.15fr\)/
  );
  assert.doesNotMatch(form, /renderSearchKindControl\(true\)/);
  assert.match(form, /renderSearchKindControl\(false\)/);
  assert.match(form, /projects_records/);
  assert.match(form, /t\.discover\.search_ui\.all_categories/);
  assert.match(form, /t\.discover\.search_ui\.region_short_placeholder/);
  assert.match(form, /mobileKeywordPlaceholder/);
  assert.match(form, /mobileRecordOptionsStyle/);
  assert.match(zhCopy, /all_categories: "全部类别"/);
  assert.match(zhCopy, /region_short_placeholder: "地区"/);
  assert.doesNotMatch(form, /按地区匹配公开/);
  assert.match(results, /kind === "projects"[\s\S]*?projectItems\.map[\s\S]*?<ProjectSummaryCard/);
  assert.match(results, /kind === "experience"[\s\S]*?experienceItems\.map[\s\S]*?<DiscoverSearchResultCard/);
  assert.match(results, /recordItems\.map[\s\S]*?<DiscoverSearchResultCard/);
  assert.doesNotMatch(results, /<DiscoverProjectCard|<ExperienceCardListCard|<ProjectCardRows/);
  assert.match(results, /cover=\{item\.display_image_url \? \{ kind: "url", url: item\.display_image_url \} : null\}/);
  assert.match(results, /imageUrl=\{item\.coverUrl\}/);
  assert.match(results, /imageUrl=\{displayImageUrl\}/);
  assert.match(results, /summary=\{item\.description\?\.trim\(\) \|\| undefined\}/);
  assert.match(results, /summary=\{record\.note\?\.trim\(\) \|\| undefined\}/);
  assert.doesNotMatch(
    results,
    /查看按原始时间排列|这条记录以照片为主|这条记录没有文字|项目刚刚开始/
  );
  assert.match(resultCard, /<CompactActivityTime/);
  assert.match(resultCard, /className=\{styles\.card\}/);
  assert.match(resultCard, /className=\{styles\.mediaCategory\}>\{category\}/);
  assert.match(resultCard, /sizes="\(max-width: 759px\) 112px, 108px"/);
  assert.match(resultCard, /className=\{styles\.mobileUpdateRow\}/);
  assert.match(resultCard, /className=\{styles\.mobileSummary\}/);
  assert.match(resultCardStyles, /\.grid\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(resultCardStyles, /\.card\s*\{[\s\S]*grid-template-columns: 108px minmax\(0, 1fr\);[\s\S]*padding: 8px;[\s\S]*border-radius: 14px;/);
  assert.match(resultCardStyles, /\.media\s*\{[\s\S]*width: 108px;[\s\S]*height: 108px;[\s\S]*border-radius: 10px;/);
  assert.match(resultCardStyles, /\.mediaCategory\s*\{[\s\S]*position: absolute;[\s\S]*top: 7px;[\s\S]*left: 7px;/);
  assert.match(resultCardStyles, /\.summary\s*\{[\s\S]*-webkit-line-clamp: 2;/);
  assert.match(resultCardStyles, /@media \(min-width: 760px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(resultCardStyles, /@media \(max-width: 759px\)[\s\S]*grid-template-columns: 112px minmax\(0, 1fr\);/);
  assert.match(resultCardStyles, /@media \(max-width: 759px\)[\s\S]*\.media \{[\s\S]*width: 112px;[\s\S]*height: 112px;[\s\S]*align-self: start;/);
  assert.match(resultCardStyles, /@media \(max-width: 759px\)[\s\S]*\.footer \{[\s\S]*flex-direction: column;/);
  assert.match(resultCardStyles, /\.meta \{[\s\S]*order: -1;/);
  assert.match(data, /\.from\("discovery_project_feed_view"\)/);
  assert.match(data, /hydrateExperienceCardListItems/);
  assert.match(data, /is_experience_card_public/);
  assert.match(utils, /params\.set\("type", kind\)/);
  assert.match(utils, /return "records"/);
});

test("legacy user profile routes merge into the canonical user space", async () => {
  const [userSpace, userSpaceHeader, publicProfile, archiveDetail] = await Promise.all([
    source("app/user/[id]/page.tsx"),
    source("components/user-space/UserSpaceHeader.tsx"),
    source("app/user/[id]/profile/page.tsx"),
    source("app/archive/[id]/page.tsx"),
  ]);

  assert.match(userSpace, /<UserSpaceHeader/);
  assert.match(publicProfile, /redirect\(`\/user\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.doesNotMatch(userSpace, /名片|showCard|UserProfileCard/);

  assert.doesNotMatch(userSpaceHeader, /\/profile/);

  assert.match(archiveDetail, /href=\{isOwner \? "\/archive" : `\/user\/\$\{activeArchive\.user_id\}`\}/);
  assert.match(archiveDetail, /displayUsername/);
  assert.match(archiveDetail, /<UiIcon name="arrow-right" size=\{15\} \/>/);
  assert.match(archiveDetail, /style=\{attributeCreatorLinkStyle\}/);
  assert.match(archiveDetail, /style=\{projectPageFollowStyle\(isProjectFollowed\)\}/);
  assert.match(archiveDetail, /background: followed \? "#f6f7f5" : "#edf7ea"/);
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
