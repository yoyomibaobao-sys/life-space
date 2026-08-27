import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function bytes(path) {
  return readFile(new URL(`../${path}`, import.meta.url));
}

test("crop cycles stay opt-in and support concurrent rename, trash, and restore", async () => {
  const [
    migration,
    trashMigration,
    settings,
    cloudDetail,
    localDetail,
    timeline,
    localDb,
    localSync,
  ] = await Promise.all([
    source("supabase/migrations/20260824120000_add_archive_cycle_preferences.sql"),
    source("supabase/migrations/20260827000119_add_archive_cycle_trash.sql"),
    source("components/archive-detail/ArchiveCycleSettings.tsx"),
    source("app/archive/[id]/page.tsx"),
    source("app/local/archive/[id]/page.tsx"),
    source("components/archive-detail/ArchiveCycleTimeline.tsx"),
    source("lib/local-offline-db.ts"),
    source("lib/local-to-cloud-sync.ts"),
  ]);

  assert.match(migration, /cycle_enabled boolean not null default false/i);
  assert.match(migration, /next_cycle_name text/i);
  assert.match(migration, /display_name text/i);
  assert.match(migration, /char_length\(btrim\(next_cycle_name\)\) between 1 and 80/i);
  assert.match(settings, /role="switch"/);
  assert.match(settings, /enabled \? copy\.cycle_enabled : copy\.cycle_disabled/);
  assert.doesNotMatch(settings, /nextCycleName/);
  assert.match(cloudDetail, /cycleEnabled \? cycles : \[\]/);
  assert.match(cloudDetail, /rpc\("create_archive_cycle"/);
  assert.match(cloudDetail, /rpc\("move_archive_cycle_to_trash"/);
  assert.match(cloudDetail, /update\(\{ display_name: displayName\.trim\(\)\.slice\(0, 80\) \|\| null \}\)/);
  assert.match(localDetail, /onRenameCycle=\{cycleEnabled \? renameLocalCycle : undefined\}/);
  assert.match(localDetail, /restoreLocalArchiveCycle/);
  assert.match(timeline, /copy\.rename_cycle/);
  assert.match(timeline, /<details style=\{cycleMoreStyle\}>/);
  assert.match(timeline, /cycle\.display_name \|\| terminology\.cycleLabel/);
  assert.match(localDb, /display_name: normalizeOptionalText\(displayName\)\?\.slice\(0, 80\) \|\| null/);
  assert.match(localDb, /trashed_cycles\?: LocalArchiveCycleTrash\[\]/);
  assert.match(localDb, /export async function deleteLocalArchiveCycle/);
  assert.match(localDb, /export async function restoreLocalArchiveCycle/);
  assert.match(localSync, /display_name: cycle\.display_name \|\| null/);
  assert.match(trashMigration, /create or replace function public\.create_archive_cycle/);
  assert.match(trashMigration, /max\(ac\.cycle_no\)/);
  assert.match(trashMigration, /create or replace function public\.restore_archive_cycle_from_trash/);
  assert.match(trashMigration, /Duplicate display names are allowed/i);
});

test("mobile My Space is single-line and taxonomy actions move to long press", async () => {
  const [archivePage, workspace, taxonomy] = await Promise.all([
    source("app/archive/page.tsx"),
    source("components/archive-ui/ArchiveWorkspaceTemplate.tsx"),
    source("components/archive-ui/ArchiveTaxonomyPanel.tsx"),
  ]);

  assert.match(archivePage, /personalSpaceMobileNameRowStyle[\s\S]*?membershipLabel/);
  assert.match(archivePage, /personalSpaceStorageTrackStyle/);
  assert.match(archivePage, /personalSpaceStorageTotalStyle/);
  assert.doesNotMatch(archivePage, /storageUsageLabel/);
  assert.match(archivePage, /sourceTrailingSlot=\{isMobileViewport \? \([\s\S]*?\+\{t\.nav\.project\}/);
  assert.match(workspace, /flexWrap: singleLine \? "nowrap" : "wrap"/);
  assert.match(workspace, /overflowX: singleLine \? "auto"/);

  assert.match(taxonomy, /setTimeout\(\(\) => \{[\s\S]*?onLongPress\(\)[\s\S]*?\}, 520\)/);
  assert.match(taxonomy, /onContextMenu=/);
  assert.match(taxonomy, /role="dialog"/);
  assert.match(taxonomy, /fontSize: 16/);
  assert.match(taxonomy, /overflowX: compact \? "auto"/);
  assert.match(taxonomy, /compact[\s\S]*?t\.archive_workspace\.subcategory[\s\S]*?t\.archive_workspace\.subcategory_prefix/);
  assert.doesNotMatch(taxonomy, /onDoubleClick=/);
  assert.match(taxonomy, /!compact && onDelete/);
});

test("followed users use stable follow order with optional pinning and a long-press menu", async () => {
  const [followPage, zhCopy] = await Promise.all([
    source("app/follow/page.tsx"),
    source("lib/i18n/zh.ts"),
  ]);

  assert.match(followPage, /fetchFollowedPublicProjects/);
  assert.match(followPage, /getTimeValue\(b\.followedAt\) - getTimeValue\(a\.followedAt\)/);
  assert.match(followPage, /lifespace-follow-pinned/);
  assert.match(followPage, /beginUserLongPress/);
  assert.match(followPage, /followT\.pin_user/);
  assert.match(followPage, /followT\.enter_space/);
  assert.match(followPage, /setUserConfirmId\(userMenuTargetId\)/);
  assert.match(followPage, /!isMobileViewport && selectedUserId !== "all"/);
  assert.match(followPage, /selectedUserProjects[\s\S]*?\.sort\(byRecentProject\)/);
  assert.doesNotMatch(zhCopy, /去别人的空间页点/);
  assert.match(zhCopy, /empty_users_intro: ""/);
});

test("User Information edits in place and dedicated pages return consistently", async () => {
  const [
    profile,
    payment,
    benefits,
    feedback,
    recent,
    followers,
    trash,
    backNavigation,
    zhCopy,
  ] = await Promise.all([
    source("app/profile/page.tsx"),
    source("app/membership/payment/page.tsx"),
    source("app/membership/benefits/page.tsx"),
    source("app/feedback/page.tsx"),
    source("app/profile/recent/page.tsx"),
    source("app/profile/followers/page.tsx"),
    source("app/profile/trash/page.tsx"),
    source("components/MobileBackNavigation.tsx"),
    source("lib/i18n/zh.ts"),
  ]);

  assert.match(profile, /value=\{username\}[\s\S]*?setUsername/);
  assert.match(profile, /type="file"[\s\S]*?handleUpload/);
  assert.doesNotMatch(profile, /identityEditButtonStyle|mobileProfileModule === "settings"/);
  assert.match(profile, /role="switch"/);
  assert.match(profile, /languageSwitchThumbStyle/);
  assert.match(profile, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  for (const page of [payment, benefits, feedback, recent, followers, trash]) {
    assert.match(page, /href="\/profile"/);
  }
  assert.ok(
    backNavigation.includes(
      'if (/^\\/membership\\/(payment|benefits)/.test(pathname)) return "/profile";'
    )
  );
  assert.match(backNavigation, /pathname\.startsWith\("\/feedback"\)\) return "\/profile"/);
  assert.match(zhCopy, /back_profile: "返回用户信息"/);
});

test("mobile Guide combines the category label and Experience uses publication date", async () => {
  const [plantPage, gallery, galleryStyles, zhCopy] = await Promise.all([
    source("app/plant/page.tsx"),
    source("components/experience-card/PublicExperienceGallery.tsx"),
    source("components/experience-card/PublicExperienceFeed.module.css"),
    source("lib/i18n/zh.ts"),
  ]);

  assert.match(plantPage, /option\.value === "all"[\s\S]*?`\$\{t\.plant\.category\}（\$\{option\.label\}）`[\s\S]*?: option\.label/);
  assert.match(plantPage, /options=\{mobileCategoryFilterOptions\}[\s\S]*?hideLabel/);
  assert.match(plantPage, /options=\{categoryFilterOptions\}/);
  assert.match(gallery, /role="button"/);
  assert.match(gallery, /closest\("a"\)/);
  assert.match(gallery, /className=\{styles\.previewDetails\}/);
  assert.match(gallery, /getPublishedMeta\(item\.published_at/);
  assert.doesNotMatch(gallery, /durationDays/);
  assert.match(galleryStyles, /\.previewMedia \{[\s\S]*?display: block;[\s\S]*?position: relative/);
  assert.match(zhCopy, /published_on: "发布于 "/);
});

test("public views and payment policies have a reproducible hardening migration", async () => {
  const migration = await source(
    "supabase/migrations/20260824121000_harden_public_views_and_payment_policies.sql"
  );

  assert.match(migration, /function public\.get_public_profiles_safe\(\)/i);
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(migration, /view public\.public_profiles[\s\S]*?security_invoker = true/i);
  assert.match(migration, /view public\.discovery_feed_view[\s\S]*?security_invoker = true/i);
  assert.match(migration, /left join public\.public_profiles as p/i);
  assert.match(migration, /view public\.discovery_view[\s\S]*?security_invoker = true/i);
  assert.match(migration, /view public\.user_flower_stats[\s\S]*?security_invoker = true/i);
  assert.match(migration, /revoke all on table public\.user_flower_stats/i);
  assert.match(migration, /grant select on table public\.user_flower_stats/i);
  assert.match(migration, /membership_payments_select_own_or_admin/i);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /membership_payments_reviewed_by_idx/i);
});

test("Alipay is direct on-page payment and never falls back to email", async () => {
  const [payment, membership, zhCopy, enCopy, envExample, accessDocs, qrPoster] = await Promise.all([
    source("app/membership/payment/page.tsx"),
    source("app/membership/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
    source(".env.example"),
    source("docs/membership-access.md"),
    bytes("public/payments/alipay-cloud-membership-64.jpg"),
  ]);

  assert.match(payment, /DEFAULT_ALIPAY_PAYMENT_QR_URL =\s*"\/payments\/alipay-cloud-membership-64\.jpg"/);
  assert.match(payment, /DEFAULT_ALIPAY_PAYEE_NAME = "有时空间"/);
  assert.match(payment, /NEXT_PUBLIC_ALIPAY_PAYMENT_QR_URL/);
  assert.match(payment, /NEXT_PUBLIC_ALIPAY_PAYEE_NAME/);
  assert.match(payment, /ALIPAY_PAYMENT_READY/);
  assert.match(payment, /src=\{orderDestinationUrl\}/);
  assert.match(payment, /\{orderDestinationLabel\}/);
  assert.match(payment, /order\?\.payment_destination_label/);
  assert.match(payment, /option === "alipay" && !ALIPAY_PAYMENT_READY/);
  assert.doesNotMatch(payment, /alipayMailHref|mailto:[^\n]*alipay/i);
  assert.match(membership, /domestic_payment_summary/);
  assert.match(membership, /overseas_payment_summary/);
  assert.doesNotMatch(membership, /domestic_before_email|overseas_after_email/);
  assert.doesNotMatch(zhCopy, /邮件获取支付宝|通过邮件获取支付宝收款方式/);
  assert.match(zhCopy, /不能只看用户上传的截图/);
  assert.doesNotMatch(enCopy, /email for (?:the )?Alipay/i);
  assert.match(envExample, /NEXT_PUBLIC_ALIPAY_PAYMENT_QR_URL=/);
  assert.match(envExample, /NEXT_PUBLIC_ALIPAY_PAYEE_NAME=/);
  assert.match(accessDocs, /订单页直接显示已配置的支付宝经营／商家收款码/);
  assert.match(accessDocs, /PayPal\.Me 链接必须在 PayPal 账户中标记为商业用途/);
  assert.doesNotMatch(accessDocs, /按订单邮件获取收款方式/);
  assert.ok(qrPoster.length > 100_000);
  assert.equal(qrPoster.subarray(0, 2).toString("hex"), "ffd8");
});
