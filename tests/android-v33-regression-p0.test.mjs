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

test("P1 record creation defaults to text and media is optional in both runtime modes", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const nav = read("components/quick-record/QuickCaptureNavAction.tsx");
  const select = read("app/quick-record/page.tsx");
  const local = read("app/local/archive/[id]/page.tsx");
  assert.match(shell, /onClick=\{skipQuickAddPhotos\}/);
  assert.match(shell, /data-android-record-media-optional="true"/);
  assert.match(nav, /data-w5-record-entry-menu="true"/);
  assert.match(nav, /文字记录（不拍照）/);
  assert.match(nav, /router\.push\("\/quick-record\?textOnly=1"\)/);
  assert.match(select, /const textOnly = searchParams\.get\("textOnly"\) === "1"/);
  assert.match(select, /if \(!capture && !textOnly\)/);
  assert.match(local, /setAddRecordOpen\(true\)/);
});
