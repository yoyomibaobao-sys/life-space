import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("local card and properties expose voluntary cloud transfer without duplicating it in Details", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const detail = read("components/archive-ui/DeviceOwnedProjectDetail.tsx");
  assert.match(shell, /extraActions=\{source === "local" && local && canOfferLocalCloudTransfer\(local\)/);
  assert.match(shell, /label: language === "zh" \? "上传到云端"/);
  assert.match(shell, /onClick: \(\) => beginLocalTransfer\(local\.id\)/);
  assert.match(shell, /onTransferToCloud=\{canOfferLocalCloudTransfer\(detail\.archive\) &&[\s\S]*!pendingSync\.some/);
  assert.equal((detail.match(/onTransferToCloud && !isCloudCache/g) || []).length, 1);
  const detailsNotice = detail.slice(detail.indexOf("statusNotice={"), detail.indexOf("activeTab="));
  assert.doesNotMatch(detailsNotice, /onTransferToCloud|上传到云端|Upload to cloud/);
  assert.match(detail, /mobileOwnerSettings=\{[\s\S]*footerAction=\{onTransferToCloud && !isCloudCache/);
});

test("offline transfer preserves its entry but cannot call the transfer engine", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const begin = shell.slice(shell.indexOf("function beginLocalTransfer("), shell.indexOf("async function confirmLocalTransfer("));
  assert.match(begin, /if \(!online\) \{ showToast\([\s\S]*联网后可上传到云端[\s\S]*return;/);
  assert.match(begin, /if \(!authenticatedOwnerContext\) \{ openCloudLogin\("local-transfer", archiveId\); return; \}/);
  assert.doesNotMatch(begin, /syncLocalArchiveToCloud|syncPendingCloudArchive/);
});

test("signed-out transfer returns from bundled login to confirmation with private default", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /kind: "cloud-login"; returnTo:[^\r\n]*"local-transfer"[^\r\n]*"membership-payment"[^\r\n]*"membership-refund"; archiveId\?: string/);
  assert.match(shell, /destination\.returnTo === "local-transfer" && destination\.archiveId[\s\S]*setTransferVisibility\("private"\)[\s\S]*kind: "local-transfer"/);
  assert.match(shell, /screen\.kind === "local-transfer"[\s\S]*data-android-local-transfer="true"/);
  assert.match(shell, /上传到云端不等于公开/);
  assert.match(shell, /transferVisibility === "private"[\s\S]*transferVisibility === "public"/);
  assert.match(shell, /onClick=\{\(\) => void confirmLocalTransfer\(archive\.id\)\}/);
});

test("local transfer and cloud pending use different explicit engines and preserve engine conflict handling", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const transfer = shell.slice(shell.indexOf("async function confirmLocalTransfer("), shell.indexOf("async function claimUnowned("));
  const pending = shell.slice(shell.indexOf("async function uploadPending("), shell.indexOf("function beginLocalTransfer("));
  const engine = read("lib/local-to-cloud-sync.ts");
  assert.match(transfer, /syncLocalArchiveToCloud\(\{[\s\S]*localArchiveId: archiveId[\s\S]*visibility: transferVisibility/);
  assert.doesNotMatch(transfer, /syncPendingCloudArchive|syncAllPendingCloudArchives/);
  assert.match(transfer, /if \(!result\.success\) \{ setTransferError\(result\.error\)/);
  assert.match(transfer, /loadList\(authenticatedOwnerContext\)[\s\S]*loadCloudList\(cloudUserId\)[\s\S]*kind: "cloud-detail", archiveId: result\.cloudArchiveId/);
  assert.match(pending, /syncPendingCloudArchive\(\{/);
  assert.match(pending, /syncAllPendingCloudArchives\(\{/);
  assert.doesNotMatch(pending, /syncLocalArchiveToCloud/);
  assert.match(engine, /sourceCloudArchiveId && !archive\.migration_cloud_archive_id[\s\S]*原云端项目仍然保留/);
  assert.match(engine, /existingCloudArchiveId: cloudArchiveId/);
  assert.match(engine, /completeLocalArchiveCloudTransfer\(/);
});

test("Follow and Profile stay bundled with shared presentations", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /screen\.kind === "following"[\s\S]*<FollowPage \/>/);
  assert.doesNotMatch(shell, /screen\.kind === "following" \? \([\s\S]{0,250}<CloudLogin/);
  assert.match(shell, /screen\.kind === "profile"[\s\S]*<AndroidProfileController/);
  const profile = read("components/profile/AndroidProfileController.tsx");
  assert.match(profile, /<MobileProfileView/);
  assert.match(profile, /onLogin=\{!snapshot\.userId && online \? onLogin/);
});
