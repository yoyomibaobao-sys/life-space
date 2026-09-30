import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  liveCloudCardImageUrl,
  resolveAndroidArchiveScreen,
} from "../lib/android-shell-app-routes.ts";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const cacheOwned = [
  {
    id: "cache-1",
    local_role: "cloud-offline-cache",
    source_cloud_archive_id: "cloud-1",
  },
];

test("cloud archive with cache still routes to live cloud-detail while online", () => {
  assert.deepEqual(
    resolveAndroidArchiveScreen({
      online: true,
      archiveId: "cloud-1",
      cloudUserId: "owner",
      cloudArchives: [{ id: "cloud-1" }],
      activityOwnerUserId: null,
      hasPublicFeedItem: false,
      ownedLocalArchives: cacheOwned,
    }),
    { kind: "cloud-detail", archiveId: "cloud-1" },
  );
  assert.deepEqual(
    resolveAndroidArchiveScreen({
      online: true,
      archiveId: "cloud-1",
      cloudUserId: "owner",
      cloudArchives: [],
      activityOwnerUserId: null,
      hasPublicFeedItem: false,
      ownedLocalArchives: cacheOwned,
    }),
    { kind: "cloud-detail", archiveId: "cloud-1" },
  );
});

test("cloud archive with cache routes to DeviceOwned cache while offline", () => {
  assert.deepEqual(
    resolveAndroidArchiveScreen({
      online: false,
      archiveId: "cloud-1",
      cloudUserId: "owner",
      cloudArchives: [{ id: "cloud-1" }],
      activityOwnerUserId: null,
      hasPublicFeedItem: false,
      ownedLocalArchives: cacheOwned,
    }),
    { kind: "local-detail", archiveId: "cache-1" },
  );
});

test("online cloud cards use live images even when a cache thumbnail is missing", () => {
  assert.equal(
    liveCloudCardImageUrl({
      display_cover_thumb_url: "https://cdn.example/live-thumb.jpg",
      display_cover_image_url: "https://cdn.example/live.jpg",
      cover_image_url: "https://cdn.example/cover.jpg",
    }),
    "https://cdn.example/live-thumb.jpg",
  );
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /liveCloudCardImageUrl\(archive\)/);
  assert.match(shell, /data-android-live-cloud-list/);
  assert.doesNotMatch(shell, /mappedCloudIds/);
  const liveBranchStart = shell.indexOf("liveCloudWorkspace ? (");
  const liveBranch = shell.slice(
    liveBranchStart,
    shell.indexOf("            ) : (", liveBranchStart),
  );
  assert.match(liveBranch, /filteredCloudArchives.map\(renderCloudProjectCard\)/);
  assert.doesNotMatch(liveBranch, /data-android-cloud-cache-list/);
  assert.doesNotMatch(liveBranch, /filteredCloudCaches.map/);
});

test("online cloud cards and live detail have no cache save-to-device entry", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const card = shell.slice(
    shell.indexOf("function renderCloudProjectCard"),
    shell.indexOf("const baseNavigationItems"),
  );
  assert.doesNotMatch(card, /saveLocalCopy|refreshLocalCopy|openLocalCopy|actionSlot/);
  const cloud = read("components/archive-ui/CloudArchiveDetailController.tsx");
  assert.match(cloud, /canSaveToLocal: false/);
  assert.doesNotMatch(cloud, /onSaveToLocal|saveToLocalLabel|saveCloudArchiveToLocal/);
  assert.match(cloud, /<ArchiveProjectDetailView/);
  assert.match(cloud, /<ArchiveExperienceCards/);
});

test("cloud cache media cannot open lightbox; local and live cloud still can", () => {
  const device = read("components/archive-ui/DeviceOwnedProjectDetail.tsx");
  assert.match(device, /canOpenMediaLightbox=\{!isCloudCache\}/);
  assert.match(device, /if \(isCloudCache\) return/);
  const records = read("components/archive-detail/ArchiveRecordCard.tsx");
  assert.match(records, /canOpenMediaLightbox = true/);
  assert.match(records, /data-media-lightbox="disabled"/);
  const cloud = read("components/archive-ui/CloudArchiveDetailController.tsx");
  assert.match(cloud, /canOpenMediaLightbox/);
  assert.doesNotMatch(cloud, /canOpenMediaLightbox=\{false\}/);
});

test("public-detail and network feeds show unavailable after going offline", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /screen\.kind === "public-detail"/);
  assert.match(shell, /screen\.kind === "discover-search"/);
  assert.match(shell, /screen\.kind === "following"/);
  assert.match(shell, /screen\.kind === "market"/);
  assert.match(shell, /screen\.kind === "public-cloud-detail"/);
  for (const kind of [
    "public-detail",
    "discover-search",
    "following",
    "market",
    "public-cloud-detail",
  ]) {
    const start = shell.indexOf(`{screen.kind === "${kind}"`);
    assert.ok(start >= 0, kind);
    const block = shell.slice(start, start + 700);
    assert.match(block, /!online/);
    assert.match(block, /<MobileNetworkUnavailableState/);
  }
  assert.match(shell, /!online \?[\s\S]*DiscoverProjectGrid/);
});

test("cloud cache badge stays on the cache path, not successful live cloud detail", () => {
  assert.match(
    read("components/archive-ui/DeviceOwnedProjectDetail.tsx"),
    /isCloudCache \? workspaceCopy\.cloud_cache_copy/,
  );
  assert.doesNotMatch(
    read("components/archive-ui/CloudArchiveDetailController.tsx"),
    /cloud_cache_copy/,
  );
});

test("public cloud route reads an actual cover image instead of forcing null", () => {
  const source = read("lib/cloud-archive-detail.ts");
  assert.match(source, /resolveMediaDisplayPairs/);
  assert.doesNotMatch(
    source.slice(source.indexOf("export async function resolveCloudArchiveRoute")),
    /display_image_url: null/,
  );
});
