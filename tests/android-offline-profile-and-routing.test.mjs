import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  parseAndroidShellPath,
  resolveOwnedShellArchiveId,
} from "../lib/android-shell-app-routes.ts";
import { buildOfflineProfileSnapshot } from "../lib/android-offline-profile.ts";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("offline profile does not use the network-only ProfilePage render path", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const profile = read("app/profile/page.tsx");
  const offlineProfile = read("components/profile/AndroidProfileController.tsx");

  assert.match(profile, /await supabase\.auth\.getUser/);
  assert.match(profile, /router\.push\(buildLoginHref\("\/profile"\)\)/);
  assert.doesNotMatch(shell, /<ProfilePage/);
  assert.match(shell, /<AndroidProfileController/);
  assert.match(shell, /buildOfflineProfileSnapshot/);
  assert.match(offlineProfile, /snapshot\.membership/);
  assert.match(offlineProfile, /<MobileProfileView/);
  assert.match(read("components/profile/MobileProfileView.tsx"), /t\.profile\.settings_title/);
  assert.match(read("components/profile/MobileProfileView.tsx"), /<MobileProfileModuleTabs/);
  assert.match(offlineProfile, /备份与导出|Backup & export/);
  assert.match(offlineProfile, /开通云会员|Cloud Membership/);
  assert.match(offlineProfile, /订单进度查询|Order progress/);
  assert.match(offlineProfile, /live\?\.isAdmin/);
  assert.match(read("components/profile/MobileProfilePresentation.tsx"), /export function MobileProfileModuleTabs/);
  assert.match(offlineProfile, /onLogout/);
  assert.match(shell, /explicitAndroidLogout/);
  assert.match(read("lib/android-auth-state.ts"), /clearCloudOfflineCacheOnExplicitLogout/);
});

test("offline /profile can render from stored owner and identity snapshot", () => {
  const snapshot = buildOfflineProfileSnapshot({
    owner: { userId: "user-1", email: "a@example.com" },
    profile: { username: "Garden", avatar_url: null, storage_used: 12, storage_limit: 30 },
    membership: null,
  });

  assert.equal(snapshot.userId, "user-1");
  assert.equal(snapshot.email, "a@example.com");
  assert.equal(snapshot.username, "Garden");
  assert.deepEqual(parseAndroidShellPath("/profile"), { kind: "profile" });
});

test("own /archive/:cloudId stays on live cloud-detail while online", () => {
  const ownedId = resolveOwnedShellArchiveId("cloud-1", [
    { id: "local-plain", source_cloud_archive_id: null },
    {
      id: "cache-1",
      local_role: "cloud-offline-cache",
      source_cloud_archive_id: "cloud-1",
    },
  ]);

  assert.equal(ownedId, "cache-1");
  assert.deepEqual(parseAndroidShellPath("/archive/cloud-1"), {
    kind: "archive",
    id: "cloud-1",
  });

  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /resolveAndroidArchiveScreen/);
  assert.match(shell, /kind: "cloud-detail"/);
  assert.match(shell, /getCloudOfflineCacheByCloudSource/);
  assert.match(shell, /<DeviceOwnedProjectDetail/);
  assert.doesNotMatch(shell, /kind === "public-archive"/);
});

test("owner cached cloud project does not enter ReadonlyPublicProjectDetail first", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const start = shell.indexOf('routed.kind === "archive"');
  const block = shell.slice(start, start + 1600);
  assert.match(block, /resolveAndroidArchiveScreen/);
  assert.match(block, /kind === "cloud-detail"/);
  const liveFirst = block.indexOf('kind === "cloud-detail"');
  const publicLater = block.indexOf("public-detail");
  assert.ok(liveFirst >= 0 && publicLater > liveFirst);
});

test("public discover archives can still use ReadonlyPublicProjectDetail", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /<ReadonlyPublicProjectDetail/);
  assert.match(shell, /row\.archive_id === routed\.id/);
  assert.match(shell, /kind: "public-detail"/);
});

test("/local/archive/:id internal links are taken over by applyShellPath", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.deepEqual(parseAndroidShellPath("/local/archive/local-9"), {
    kind: "local-archive",
    id: "local-9",
  });
  assert.match(shell, /function applyShellPath/);
  assert.match(shell, /applyShellPath\(url\.pathname, url\.search\)/);
  assert.match(shell, /routed\.kind === "local-archive"/);
  assert.match(shell, /openDetail\(routed\.id\)/);
});

test("/plant/:id offline links enter guide-detail", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.equal(parseAndroidShellPath("/plant/tomato")?.kind, "guide-detail");
  assert.equal(parseAndroidShellPath("/plant/guide/tomato")?.kind, "guide-detail");
  assert.match(shell, /routed\.kind === "guide-detail"/);
  assert.match(shell, /kind: "guide-detail"/);
  assert.match(
    read("components/archive-ui/DeviceOwnedProjectDetail.tsx"),
    /encyclopediaHref/,
  );
});

test("network-only links stay inside the offline shell", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.equal(parseAndroidShellPath("/membership/payment")?.kind, "network-required");
  assert.equal(parseAndroidShellPath("/profile/project-categories")?.kind, "project-categories");
  assert.equal(parseAndroidShellPath("/profile/recent")?.kind, "recent");
  assert.equal(parseAndroidShellPath("/profile/trash")?.kind, "trash");
  assert.equal(parseAndroidShellPath("/admin/memberships")?.kind, "network-required");
  assert.equal(parseAndroidShellPath("/legal")?.kind, "network-required");
  assert.match(shell, /showToast\(copy\.needNetwork\)/);
  assert.match(shell, /event\.preventDefault\(\)/);
  assert.match(shell, /event\.preventDefault\(\)/);
});
