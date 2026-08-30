import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const externalUrlModuleSource = (await source("lib/external-url.ts")).replace(
  "export function extractExternalHttpUrl(value?: string | null)",
  "export function extractExternalHttpUrl(value)"
);
const { extractExternalHttpUrl } = await import(
  `data:text/javascript;base64,${Buffer.from(externalUrlModuleSource).toString("base64")}`
);

test("mobile Guide keeps one compact row and clears advanced filters when collapsed", async () => {
  const [guide, favorites, zhCopy] = await Promise.all([
    source("app/plant/page.tsx"),
    source("app/archive/interests/page.tsx"),
    source("lib/i18n/zh.ts"),
  ]);

  assert.match(
    guide,
    /gridTemplateColumns: hasCloudAccess[\s\S]*?"minmax\(0, 1fr\) minmax\(90px, \.8fr\) auto"/
  );
  assert.match(
    guide,
    /option\.value === "all"[\s\S]*?`\$\{t\.plant\.category\}（\$\{option\.label\}）`[\s\S]*?: option\.label/
  );
  assert.match(guide, /if \(mobileFiltersOpen\) resetFilters\(\)/);
  assert.match(guide, /gridTemplateColumns: "repeat\(2, minmax\(0, 1fr\)\)"/);
  const mobileAdvancedBlock = guide.slice(
    guide.indexOf("{hasCloudAccess && mobileFiltersOpen ? ("),
    guide.indexOf("</div>\n              ) : null}", guide.indexOf("{hasCloudAccess && mobileFiltersOpen ? ("))
  );
  assert.doesNotMatch(mobileAdvancedBlock, /clear_environment_filters/);
  assert.doesNotMatch(favorites, /t\.plant_lists\.saved_on/);
  assert.match(favorites, /formatCardDate\(item\.createdAt\)/);
  assert.match(zhCopy, /my_saved: "我的收藏"/);
});

test("plant detail uses the unified mobile header and opens the cloud-first project form", async () => {
  const [detail, styles, zhCopy, projectForm] = await Promise.all([
    source("app/plant/[id]/page.tsx"),
    source("app/plant/[id]/page.module.css"),
    source("lib/i18n/zh.ts"),
    source("components/archive-ui/ArchiveNewProjectFormShell.tsx"),
  ]);

  assert.match(detail, /<MobilePageHeader[\s\S]*?title=\{displayName\}/);
  assert.match(detail, /className=\{styles\.mobileSavedAction\}/);
  assert.match(detail, /className=\{`\$\{styles\.mobileActions\} mobile-app-grid-only`\}/);
  assert.match(detail, /\{copy\.plant_guide\}/);
  assert.doesNotMatch(detail, /copy\.plant_archive|copy\.back_to_record/);
  assert.match(detail, /className=\{`\$\{styles\.heroHeadingRow\} mobile-app-desktop-only`\}/);
  assert.match(detail, /href=\{createProjectHref\}/);
  assert.doesNotMatch(detail, /projectChooserOpen|setProjectChooserOpen/);
  assert.match(projectForm, /storageMode === "cloud"/);
  assert.match(projectForm, /localHref/);
  assert.match(styles, /\.backLink \{[\s\S]*?text-decoration: underline/);
  assert.match(styles, /\.mobileActions \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.heroHeadingRow \{[\s\S]*?minmax\(0, 1fr\) auto auto/);
  assert.match(zhCopy, /plant_guide: "植物指引"/);
  assert.match(zhCopy, /new_project: "新建项目"/);
});

test("cycle trash preserves records, allows duplicate display names, and ignores the display switch", async () => {
  const [cloudMigration, localDb, localPage, trashPage] = await Promise.all([
    source("supabase/migrations/20260827000119_add_archive_cycle_trash.sql"),
    source("lib/local-offline-db.ts"),
    source("app/local/archive/[id]/page.tsx"),
    source("app/profile/trash/page.tsx"),
  ]);

  assert.match(cloudMigration, /create or replace function public\.create_archive_cycle/);
  assert.match(cloudMigration, /select coalesce\(max\(ac\.cycle_no\), 0\) \+ 1/);
  assert.match(cloudMigration, /create or replace function public\.move_archive_cycle_to_trash/);
  assert.match(cloudMigration, /create or replace function public\.restore_archive_cycle_from_trash/);
  const restoreFunction = cloudMigration.match(
    /create or replace function public\.restore_archive_cycle_from_trash[\s\S]*?\n\$\$;/i
  )?.[0] || "";
  assert.match(restoreFunction, /te\.owner_user_id\s*=\s*v_user_id/i);
  assert.match(restoreFunction, /v_archive\.user_id is distinct from v_user_id/i);
  assert.doesNotMatch(restoreFunction, /display_name\s*=/i);
  assert.doesNotMatch(restoreFunction, /cycle_enabled\s*=/i);
  assert.match(localDb, /record_ids: recordsToTrash\.map\(\(record\) => record\.id\)/);
  const localDeleteFunction = localDb.slice(
    localDb.indexOf("export async function deleteLocalArchiveCycle"),
    localDb.indexOf("export async function restoreLocalArchiveCycle")
  );
  assert.doesNotMatch(localDeleteFunction, /cycle_id:\s*null/);
  assert.match(localDb, /\[\.\.\.cycles, \.\.\.trashedCycles\.map/);
  assert.match(localPage, /archive\.trashed_cycles/);
  assert.match(localPage, /restoreLocalArchiveCycle/);
  assert.match(trashPage, /listLocalArchiveCycleTrash/);
  assert.match(trashPage, /restoreLocalArchiveCycle/);
});

test("market publishing manages all images first and links to the exact source record", async () => {
  const [createPage, editPage, detailPage, deleteButton, action] = await Promise.all([
    source("app/market/new/page.tsx"),
    source("app/market/[id]/edit/page.tsx"),
    source("app/market/[id]/page.tsx"),
    source("app/archive/[id]/DeleteRecordButton.tsx"),
    source("components/quick-record/QuickCaptureNavAction.tsx"),
  ]);

  assert.match(createPage, /selectedSourceMediaIds/);
  assert.match(createPage, /pendingImages/);
  assert.ok(
    createPage.indexOf("imagePickerSectionStyle") <
      createPage.indexOf('<label style={labelStyle}>{t.market.type}</label>')
  );
  assert.match(createPage, /source_media_id: item\.id/);
  assert.match(createPage, /targetType: "market_media"/);
  assert.match(createPage, /setMarketPostCover/);
  assert.match(editPage, /handleUploadImages/);
  assert.match(editPage, /marketMedia\.map/);
  assert.match(editPage, /setMarketPostCover/);
  assert.match(detailPage, /`\/archive\/\$\{sourceArchiveId\}\?record=\$\{sourceRecord\.id\}`/);
  assert.match(deleteButton, /from\("market_media"\)[\s\S]*?source_record_id/);
  assert.match(action, /isMarketPath/);
  assert.match(action, /href="\/market\/new"/);
  assert.match(action, /t\.market\.post_information/);
});

test("external marketplace share text is normalized to its HTTP URL", () => {
  assert.equal(
    extractExternalHttpUrl("【淘宝】https://item.taobao.com/item.htm?id=123"),
    "https://item.taobao.com/item.htm?id=123"
  );
  assert.equal(
    extractExternalHttpUrl("闲鱼： https://www.goofish.com/item?id=9。"),
    "https://www.goofish.com/item?id=9"
  );
  assert.equal(extractExternalHttpUrl("【淘宝】不是网址"), "");
  assert.equal(extractExternalHttpUrl("javascript:alert(1)"), "");
});

test("unpaid orders expire while submitted orders retain an immutable destination snapshot", async () => {
  const [migration, paymentPage, adminPage] = await Promise.all([
    source("supabase/migrations/20260827000145_add_payment_order_expiry_and_destination.sql"),
    source("app/membership/payment/page.tsx"),
    source("app/admin/memberships/page.tsx"),
  ]);

  assert.match(migration, /now\(\) \+ interval '24 hours'/i);
  assert.match(migration, /mp\.status = 'pending_payment'[\s\S]*?expires_at/i);
  assert.match(migration, /v_order\.status in \('submitted', 'needs_update'\)/i);
  assert.match(migration, /close_reason = 'destination_changed'/i);
  assert.match(migration, /protect_membership_payment_order_snapshot/i);
  assert.match(migration, /payment_destination_version is distinct from old\.payment_destination_version/i);
  assert.match(migration, /cancel_membership_payment_order_json/i);
  assert.match(paymentPage, /get_my_open_membership_payment_order_json/);
  assert.match(paymentPage, /cancel_membership_payment_order_json/);
  assert.match(paymentPage, /order\.payment_destination_url/);
  assert.match(adminPage, /admin_list_membership_payment_queue_v2/);
  assert.match(adminPage, /row\.payment_destination_label/);
});

test("profile modules are compact on mobile, side-by-side on desktop, and restore position", async () => {
  const [profile, helpful, admin] = await Promise.all([
    source("app/profile/page.tsx"),
    source("app/profile/helpful/page.tsx"),
    source("app/admin/memberships/page.tsx"),
  ]);

  assert.match(profile, /PROFILE_RETURN_STATE_KEY/);
  assert.match(profile, /JSON\.stringify\(\{ scrollY: window\.scrollY, module: mobileProfileModule \}\)/);
  assert.match(profile, /window\.scrollTo\(\{ top: targetY/);
  assert.match(profile, /compact && isActive/);
  assert.match(profile, /desktopProfileModulesStyle/);
  assert.match(profile, /gridTemplateColumns: "repeat\(3, minmax\(0, 1fr\)\)"/);
  assert.match(profile, /whiteSpace: "nowrap", overflowX: "auto"/);
  assert.match(profile, /href="\/profile\/helpful"/);
  assert.match(helpful, /profile\/flowers\/page/);
  assert.match(admin, /new IntersectionObserver/);
  assert.match(admin, /setActiveAdminSection/);
  assert.match(admin, /position: "sticky"/);
  assert.match(admin, /scrollIntoView\(\{ block: "start" \}\)/);
});
