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
