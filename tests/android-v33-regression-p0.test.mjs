import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("P0 upload checks connectivity again on user action and still verifies cloud owner", () => {
  const shared = read("lib/pending-cloud-sync.ts");
  const android = read("lib/android-verified-pending-sync.ts");
  assert.match(shared, /!isAndroidOnline\(\) && !\(await recheckAndroidConnectivity\(\)\)/);
  assert.match(shared, /supabase\.auth\.getUser\(\)/);
  assert.match(shared, /source_cloud_archive_id/);
  assert.match(android, /await confirmVerifiedOwner\(params\.ownerContext\)/);
  assert.match(android, /await recheckAndroidConnectivity\(\)/);
  assert.match(android, /supabase\.auth\.getSession\(\)/);
  assert.match(android, /supabase\.auth\.getUser\(\)/);
  assert.match(android, /activeArchives\.has\(key\)/);
});

test("P0 temporary space projects expose only pending record rows", () => {
  const view = read("components/mobile/AndroidPendingRecordReview.tsx");
  const web = read("app/archive/page.tsx");
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(view, /\(detail\?\.records \|\| \[\]\)\.filter\(pendingRecord\)/);
  assert.match(view, /isPendingCloudSyncStatus\(record\.sync\.status\)/);
  assert.match(view, /record\.images\.some/);
  assert.match(view, /safelyCancelable\(record\)/);
  assert.match(view, /cancelNeverUploadedCloudRecord\(record\.id, owner\)/);
  assert.match(view, /supabase\.auth\.getUser\(\)/);
  assert.match(view, /\(record\.sync\.attempt_count \|\| 0\) === 0/);
  assert.match(web, /<AndroidPendingRecordReview/);
  assert.match(shell, /<AndroidPendingRecordReview/);
  assert.doesNotMatch(view, /deleteLocalRecord\(/);
});

test("P0 native APP never automatically opens the global pending-upload dialog", () => {
  const source = read("components/PendingCloudSyncPrompt.tsx");
  assert.match(source, /Capacitor\.isNativePlatform\(\)/);
  assert.match(source, /if \(Capacitor\.isNativePlatform\(\)\) return null/);
  assert.match(source, /scanningRef\.current/);
});

test("P1 preserves the October 18 camera-first, album-left, next-right photo-skip contract", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const camera = read("components/mobile/AndroidQuickCamera.tsx");
  assert.match(shell, /onClick=\{\(\) => setScreen\(\{ kind: "quick-add" \}\)\}/);
  assert.match(shell, /screen\.kind === "quick-add"[\s\S]*<AndroidQuickCamera/);
  assert.match(shell, /onSkip=\{skipQuickAddPhotos\}/);
  assert.match(camera, /onAlbum/);
  assert.match(camera, /onSkip/);
  assert.match(camera, /下一步/);
  assert.match(shell, /setQuickAddDraft\(\{ files: \[\], capturedAt: \[\], source: "camera", note: "" \}\)/);
  assert.doesNotMatch(shell, /data-android-record-media-optional/);
});

test("P1 temporary-space project opens pending-only read view, never editable cloud history", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const web = read("app/archive/page.tsx");
  assert.match(shell, /data-android-pending-only-detail="true"/);
  assert.match(shell, /setFocusedPendingKey\(item\.key\)/);
  assert.match(web, /data-w5-pending-only-detail="true"/);
  assert.match(web, /setW5FocusedPendingKey\(item\.key\)/);
  assert.match(shell, /focusedPendingKey === item\.key/);
  assert.match(web, /w5FocusedPendingKey === item\.key/);
  assert.match(read("components/mobile/AndroidPendingRecordReview.tsx"), /\(detail\?\.records \|\| \[\]\)\.filter\(pendingRecord\)/);
});

test("Pending record cancellation uses the app dialog and rechecks the selected owner and archive", () => {
  const view = read("components/mobile/AndroidPendingRecordReview.tsx");
  assert.doesNotMatch(view, /window\.confirm\(/);
  assert.match(view, /<AppConfirmDialog[\s\S]*?open=\{Boolean\(confirmRecord\)\}[\s\S]*?destructive[\s\S]*?onCancel=\{\(\) => setConfirmTarget\(null\)\}/);
  assert.match(view, /confirmTarget\.ownerId === owner\.userId && confirmTarget\.archiveId === archiveId/);
  assert.match(view, /detail\?\.archive\.id === archiveId && detail\.archive\.local_owner_user_id === owner\.userId/);
  assert.match(view, /pending\.find\(\(record\) => record\.id === confirmTarget\.recordId && safelyCancelable\(record\)\)/);
  assert.match(view, /onConfirm=\{\(\) => \{[\s\S]*?if \(record\) void cancel\(record\)/);
  assert.match(view, /data\.user\?\.id !== owner\.userId/);
  assert.match(view, /await cancelNeverUploadedCloudRecord\(record\.id, owner\)/);
});

test("Pending project cancellation uses current owner, screen and queue identity", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /pendingCancelTarget\.ownerId === authenticatedOwnerContext\.userId/);
  assert.match(shell, /pendingCancelTarget\.ownerId === cloudUserId && pendingCancelTarget\.screen === screen/);
  assert.match(shell, /item\.summaries\[0\]\.local_archive_id === pendingCancelTarget\.archiveId/);
  assert.match(shell, /item\.local\?\.local_owner_user_id === pendingCancelTarget\.ownerId/);
  assert.match(shell, /<AppConfirmDialog\s+open=\{Boolean\(confirmedPendingProject\)\}/);
  assert.match(shell, /await cancelNeverUploadedCloudArchive\(item\.summaries\[0\]\.local_archive_id, authenticatedOwnerContext\)/);
  assert.doesNotMatch(shell, /window\.confirm\(language === "zh" \? "确认取消尚未上传/);
});

test("Comment and market deletion retain scoped confirmation and shared feedback", () => {
  const archive = read("components/archive-detail/ArchiveCommentsSection.tsx");
  const market = read("components/market/MarketCommentsSection.tsx");
  const detail = read("components/market/MarketDetailController.tsx");
  const edit = read("app/market/[id]/edit/page.tsx");
  for (const source of [archive, market, detail, edit]) {
    assert.doesNotMatch(source, /window\.(confirm|alert)\(/);
    assert.match(source, /<AppConfirmDialog[\s\S]*?destructive/);
  }
  assert.match(archive, /comment\.record_id === recordId/);
  assert.match(market, /comment\.market_post_id === marketPostId/);
  assert.match(detail, /payload\.item\.user_id === deleteTarget\.ownerId && payload\.currentUserId === deleteTarget\.ownerId/);
  assert.match(detail, /await requestMarketPostDeletion\(item\.id\)/);
  assert.match(edit, /media\.market_post_id === id && media\.user_id === user\.id/);
  assert.match(edit, /await requestMarketMediaDeletion\(media\.id\)/);
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /import Toast, \{ showToast \} from "@\/components\/Toast"/);
  assert.match(shell, /<Toast \/>/);
  assert.match(read("components/Toast.tsx"), /clearTimeout\(timer\)/);
});

test("Local delete uses one scoped UI confirmation and rejects stale owner or cache targets", () => {
  const view = read("components/archive-ui/DeviceOwnedProjectDetail.tsx");
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(view, /deleteArchiveTarget\?\.archiveId === archive\.id && deleteArchiveTarget\.ownerId === currentOwnerId/);
  assert.match(view, /recordDeleteScope\?\.archiveId === archive\.id && recordDeleteScope\.ownerId === currentOwnerId/);
  assert.match(view, /if \(target\) onDeleteRecord\(target\.id\)/);
  assert.match(view, /if \(canConfirmArchiveDelete\) onDeleteArchive\(\)/);
  assert.doesNotMatch(shell, /window\.(confirm|alert|prompt)\(/);
  assert.match(shell, /resolveAndroidReadOwner\(getAndroidAuthSnapshot\(\)\)\?\.userId !== ownerId/);
  assert.match(shell, /detail\.archive\.local_role === "cloud-offline-cache"/);
  assert.match(shell, /detail\.records\.some\(\(record\) => record\.id === recordId && record\.archive_id === archiveId\)/);
});

test("Web and Android confirmation share one accessible and guarded dialog", () => {
  const web = read("components/ConfirmDialog.tsx");
  const app = read("components/mobile/AppConfirmDialog.tsx");
  assert.match(web, /<AppConfirmDialog[\s\S]*?destructive=\{danger\}[\s\S]*?confirmDisabled=\{confirmDisabled\}[\s\S]*?cancelDisabled=\{cancelDisabled\}/);
  assert.match(app, /aria-labelledby=\{titleId\}/);
  assert.match(app, /aria-describedby=\{message \? messageId : undefined\}/);
  assert.match(app, /if \(!cancelDisabled\) onCancel\(\)/);
  assert.match(app, /disabled=\{confirmDisabled\}/);
  assert.match(app, /disabled=\{cancelDisabled\}/);
  assert.match(app, /overflowY: "auto"/);
});

test("Cloud decisions retain verified owner, publication access and reconciliation", () => {
  const cloud = read("components/archive-ui/CloudArchiveDetailController.tsx");
  assert.doesNotMatch(cloud, /window\.(confirm|alert|prompt)\(/);
  assert.match(cloud, /pendingDecision\.archiveId === archiveId && pendingDecision\.userId === userId/);
  assert.match(cloud, /pendingDecision\.epoch === access\.current\.epoch/);
  assert.match(cloud, /pendingDecision\.authority === getAndroidAuthSnapshot\(\)/);
  assert.match(cloud, /pendingDecision\.readRevision === latestRead\.current/);
  assert.match(cloud, /onToggleArchiveStatus=\{requestArchiveStatusChange\}/);
  assert.match(cloud, /onToggleEnded=\{requestArchiveStatusChange\}/);
  assert.match(cloud, /if \(publish && !approved\)/);
  assert.match(cloud, /if \(!approved\) return;\s*retainCloudPublicationReconciliation\(userId, archiveId\)/);
  assert.match(cloud, /<AppConfirmDialog\s+open=\{decisionCurrent\}/);
});

test("Android export asks for confirmation before acquiring a fresh owner token to save", () => {
  const profile = read("components/profile/AndroidProfileController.tsx");
  assert.doesNotMatch(profile, /window\.(confirm|alert|prompt)\(/);
  assert.match(profile, /estimateAndroidCloudExport\(request\)[\s\S]*?setExportConfirmation\(\{ ownerId, question, timeZone, revision \}\)/);
  assert.match(profile, /async function confirmCloudExport\(\)[\s\S]*?await supabase\.auth\.getUser\(\)[\s\S]*?await supabase\.auth\.getSession\(\)/);
  assert.match(profile, /identity\.data\.user\?\.id !== target\.ownerId/);
  assert.match(profile, /session\.data\.session\?\.user\.id !== target\.ownerId/);
  assert.match(profile, /saveAndroidCloudExport\(cloudExportRequest\(session\.data\.session\.access_token, target\.timeZone\)\)/);
  assert.match(profile, /onConfirm=\{\(\) => void confirmCloudExport\(\)\}/);
});
