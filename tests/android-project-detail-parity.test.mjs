import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

  assert.match(cloudDetail, /<ArchiveProjectDetailView/);
  assert.match(cloudDetail, /archiveProjectDetailNoticeLinkStyle|ArchiveProjectDetailView/);
  assert.doesNotMatch(cloudDetail, /archiveDetailTabWrapStyle/);

  assert.match(localDetail, /view=\{ArchiveProjectDetailView\}/);

  assert.match(offline, /<DeviceOwnedProjectDetail/);
  assert.match(deviceDetail, /ArchiveProjectDetailView/);
  assert.match(deviceDetail, /<ArchiveRecordCard/);
  assert.match(deviceDetail, /variant="local"/);
  assert.doesNotMatch(offline, /className="top-tabs"/);
  assert.doesNotMatch(offline, /className="property-list"/);
  assert.doesNotMatch(offline, /<ArchiveRecordCardShell/);

  assert.match(adapters, /isCloudOfflineCacheArchive/);
  assert.match(adapters, /canEditLocalArchiveFields/);
  assert.match(adapters, /canEditLocalArchiveRecord/);
  assert.match(deviceDetail, /canEditLocalArchiveRecord\(archive, source\)/);
  assert.match(deviceDetail, /mode=\{editable \? "owner" : "viewer"\}/);
  assert.match(deviceDetail, /archiveCopy\.cloud_read_only_notice/);
  assert.doesNotMatch(deviceDetail, /archiveCopy\.saved_on_this_device/);
  assert.match(deviceDetail, /isCloudCache \? workspaceCopy\.cloud_cache_copy/);
  assert.match(deviceDetail, /encyclopediaHref/);
  assert.match(read("components/archive-ui/ArchiveProjectDetailView.tsx"), /archiveProjectDetailGuideLinkStyle/);
  assert.match(layout, /archiveProjectDetailGuideLinkStyle/);
  assert.match(deviceDetail, /archiveCopy\.pending_sync_workspace_notice/);
});

test("offline language toggle notifies the shared i18n hook", () => {
  const offline = read("mobile-offline-src/main.tsx");
  assert.match(offline, /setStoredLanguage\(resolved\)/);
  assert.match(offline, /lifespace-language-change/);
});

test("mobile detail renders one header even without the website stylesheet", async () => {
  const filename = `.archive-detail-render-${process.pid}.cjs`;
  const output = path.join(root, filename);
  try {
    const result = await build({
      entryPoints: ["components/archive-ui/ArchiveProjectDetailView.tsx"],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      packages: "external",
      outfile: output,
      plugins: [{
        name: "css-module-stub",
        setup(pluginBuild) {
          pluginBuild.onLoad({ filter: /\.module\.css$/ }, () => ({
            contents: "export default {}", loader: "js",
          }));
        },
      }],
    });
    fs.writeFileSync(output, result.outputFiles[0].contents);
    const View = createRequire(import.meta.url)(output).default;
    const props = {
      archive: { id: "sample", title: "离线", category: "plant", status: "active" },
      records: [], cycles: [], cycleEnabled: false, mode: "owner",
      capabilities: { canWriteArchive: false, canManageCycle: false },
      language: "zh", copy: { detail_navigation: "详情", details: "记录", dossier: "档案" },
      username: "", archiveDisplayName: "", archiveCategoryLabel: "",
      recordCount: 0, durationDays: null, activeTab: "experience",
      onTabChange: () => {}, experienceTabLabel: "经验", experienceContent: null,
      onToggleArchiveVisibility: () => {}, headerFallbackHref: "/archive",
      headerBackLabel: "返回", onHeaderBack: () => {},
      emptyRecordsText: "无", renderRecord: () => null,
    };
    const mobile = renderToStaticMarkup(React.createElement(View, {
      ...props, isMobileViewport: true,
    }));
    const desktop = renderToStaticMarkup(React.createElement(View, {
      ...props, isMobileViewport: false,
    }));
    assert.equal((mobile.match(/<header\b/g) || []).length, 1);
    assert.equal((mobile.match(/<h1\b/g) || []).length, 0);
    assert.equal((desktop.match(/<header\b/g) || []).length, 2);
    assert.equal((desktop.match(/<h1\b/g) || []).length, 1);
  } finally {
    fs.rmSync(output, { force: true });
  }
});
