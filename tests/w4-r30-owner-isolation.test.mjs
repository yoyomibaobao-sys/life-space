import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/archive/page.tsx", import.meta.url), "utf8");

test("auth owner changes synchronously invalidate prior account state", () => {
  assert.match(source, /supabase\.auth\.onAuthStateChange\(/);
  assert.match(source, /sessionOwnerRef\.current = id;[\s\S]{0,150}\+\+ownerEpochRef\.current;/);
  assert.match(source, /clearOwnerView\(owner\);/);
  assert.match(source, /setArchives\(\[\]\);/);
  assert.match(source, /setVerifiedOwnerId\(null\);/);
});

test("locally cached session and server authenticated user must agree", () => {
  assert.match(source, /await supabase\.auth\.getSession\(\)/);
  assert.match(source, /await supabase\.auth\.getUser\(\)/);
  assert.match(source, /serverAuth\.user\?\.id !== user\.id/);
  assert.match(source, /\(user\?\.id \|\| null\) !== sessionOwnerRef\.current/);
});

test("delayed old Owner requests cannot publish results", () => {
  assert.match(source, /const epoch = ownerEpochRef\.current;/);
  assert.match(source, /const stillCurrent = \(id: string\) => epoch === ownerEpochRef\.current && sessionOwnerRef\.current === id;/);
  assert.match(source, /if \(!stillCurrent\(user\.id\)\) return;[\s\S]{0,100}setArchives\(enrichedArchives\);/);
  assert.match(source, /if \(ownerEpochRef\.current === epoch\) \{[\s\S]{0,100}loadingRef\.current = false;/);
});

test("rendered private project list is always owner-filtered and memo invalidates", () => {
  assert.match(source, /archives\.filter\(\(item\) => item\.user_id === verifiedOwnerId\)/);
  assert.match(source, /\[archives, verifiedOwnerId, ownerReady\]/);
  assert.match(source, /const filtered = authorizedArchives\.filter/);
  assert.match(source, /\[authorizedArchives\]/);
});

test("stale IndexedDB data cannot overwrite a newly active owner", () => {
  assert.match(source, /ownerContext\?\.userId \|\| null\) === sessionOwnerRef\.current/);
  assert.match(source, /if \(!stillCurrent\(\)\) return;[\s\S]{0,90}setLocalArchives\(result\.archives\);/);
});

test("cloud writes and destructive controls require a verified current owner", () => {
  assert.match(source, /function requireCloudWriteAccess\(\) \{[\s\S]{0,100}!isVerifiedOwner\(\)/);
  assert.match(source, /async function deleteArchive\(item: ArchiveItem\) \{\s*if \(!isVerifiedOwner\(item\.user_id\)\) return;/);
  assert.match(source, /!isVerifiedOwner\(deleteArchiveTarget\.user_id\)/);
  assert.match(source, /async function toggleArchivePublic\(item: ArchiveItem\) \{\s*if \(!isVerifiedOwner\(item\.user_id\)\) return;/);
});

test("Android pending workspace still reuses its original pending queue", () => {
  assert.match(source, /buildAndroidCloudWorkspace\(\{/);
  assert.match(source, /pending: currentOwnerContext\?\.userId \? pendingCloudSyncSummaries\.filter/);
  assert.match(source, /live: w5Online \? authorizedArchives : \[\]/);
});
