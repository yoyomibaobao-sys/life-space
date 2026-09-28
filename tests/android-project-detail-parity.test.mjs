import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("Android project details share one presentation across cloud, local, and offline adapters", () => {
  const tabs = read("components/archive-ui/ArchiveProjectDetailTabs.tsx");
  const layout = read("components/archive-ui/archiveProjectDetailLayout.ts");
  const adapters = read("lib/local-archive-detail-adapters.ts");
  const deviceDetail = read("components/archive-ui/DeviceOwnedProjectDetail.tsx");
  const cloudDetail = read("app/archive/[id]/page.tsx");
  const localDetail = read("app/local/archive/[id]/page.tsx");
  const offline = read("mobile-offline-src/main.tsx");

  assert.match(tabs, /archiveProjectDetailTabWrapStyle/);
  assert.match(layout, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(layout, /archiveProjectDetailHeaderProjectStyle/);
  assert.match(layout, /archiveProjectDetailStatsStyle/);
  assert.match(layout, /archiveProjectDetailEmptyStateStyle/);

  assert.match(cloudDetail, /<ArchiveProjectDetailTabs/);
  assert.match(cloudDetail, /<ArchiveDetailHeader/);
  assert.match(cloudDetail, /archiveProjectDetailMainStyle\(isMobileViewport\)/);
  assert.doesNotMatch(cloudDetail, /archiveDetailTabWrapStyle/);

  assert.match(localDetail, /<ArchiveProjectDetailTabs/);
  assert.match(localDetail, /<ArchiveDetailHeaderView/);
  assert.match(localDetail, /archiveProjectDetailMainStyle\(isMobileViewport\)/);
  assert.match(localDetail, /variant="local"/);

  assert.match(offline, /<DeviceOwnedProjectDetail/);
  assert.match(deviceDetail, /<ArchiveProjectDetailTabs/);
  assert.match(deviceDetail, /<ArchiveDetailHeaderView/);
  assert.match(deviceDetail, /<ArchiveCycleTimeline/);
  assert.match(deviceDetail, /<ArchiveRecordCard/);
  assert.match(deviceDetail, /variant="local"/);
  assert.match(deviceDetail, /<MobilePageHeaderView/);
  assert.match(deviceDetail, /archiveProjectDetailMainStyle\(true\)/);
  assert.doesNotMatch(offline, /className="top-tabs"/);
  assert.doesNotMatch(offline, /className="property-list"/);
  assert.doesNotMatch(offline, /<ArchiveRecordCardShell/);

  assert.match(adapters, /isCloudOfflineCacheArchive/);
  assert.match(adapters, /canEditLocalArchiveFields/);
  assert.match(adapters, /canEditLocalArchiveRecord/);
  assert.match(deviceDetail, /canEditLocalArchiveRecord\(archive, source\)/);
  assert.match(deviceDetail, /mode=\{editable \? "owner" : "viewer"\}/);
  assert.match(deviceDetail, /isCloudCache \? archiveCopy\.cloud_read_only_notice/);
  assert.match(deviceDetail, /archiveCopy\.pending_sync_workspace_notice/);
});

test("offline language toggle notifies the shared i18n hook", () => {
  const offline = read("mobile-offline-src/main.tsx");
  assert.match(offline, /setStoredLanguage\(resolved\)/);
  assert.match(offline, /lifespace-language-change/);
});
