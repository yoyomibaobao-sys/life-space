import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/archive/page.tsx", import.meta.url), "utf8");
const taxonomy = fs.readFileSync(new URL("../components/archive-ui/ArchiveTaxonomyPanel.tsx", import.meta.url), "utf8");
const androidShell = fs.readFileSync(new URL("../mobile-offline-src/main.tsx", import.meta.url), "utf8");
const cloudCreatePage = fs.readFileSync(new URL("../app/archive/new/page.tsx", import.meta.url), "utf8");
const legacyLocalCreatePage = fs.readFileSync(new URL("../app/local/archive/new/page.tsx", import.meta.url), "utf8");

test("installed Android runtime hides all/local source tabs but preserves cloud and pending", () => {
  assert.match(androidShell, /function w5WorkspaceSources\([\s\S]*?const visible = current\.filter\(\(source\) => source !== "all" && source !== "local"\);/);
  assert.match(androidShell, /return auth === "signed-in" \? \[\.\.\.visible, "pending"\] : visible;/);
  assert.match(androidShell, /sourceOptions=\{w5WorkspaceSources\(auth\.status, localSpaceEnabled, cloudReadable\)\.map/);
  assert.match(androidShell, /writeLocalSpaceVisibilityPreference\(visible\)/);
});

test("online website exposes only cloud while signed-in Android may also expose temporary space", () => {
  const sourceOptions = page.match(/sourceOptions=\{\[([\s\S]*?)\]\}/)?.[1] || "";
  assert.match(sourceOptions, /value: "cloud"/);
  assert.match(sourceOptions, /isCapacitorAndroid\(\) && currentOwnerContext\?\.userId[\s\S]*?value: "pending"/);
  assert.doesNotMatch(sourceOptions, /value:\s*"(?:all|local)"/);
});

test("online website defaults to cloud and ignores legacy all/local source URL parameters", () => {
  assert.match(page, /const \[activeSource, setActiveSource\] = useState<ArchiveSourceFilter>\("cloud"\)/);
  assert.match(page, /setActiveSource\(\s*isCapacitorAndroid\(\) && sourceParam === "pending" \? "pending" : "cloud"\s*\)/s);
  assert.match(page, /const showLocalArchives = false;/);
  assert.match(page, /isCapacitorAndroid\(\) && nextSource === "pending" \? "pending" : "cloud"/);
});

test("online website project creation is cloud-only and legacy local-create URLs redirect safely", () => {
  assert.equal(page.includes("/local/archive/new"), false);
  assert.doesNotMatch(page, /const mobileCreateHref[\s\S]*?\/local\/archive\/new/);
  assert.doesNotMatch(cloudCreatePage, /localCreateHref|localHref=/);
  assert.match(legacyLocalCreatePage, /router\.replace\("\/archive\/new" \+ window\.location\.search\)/);
});

test("website source tabs hide all/local while the independent category all-filter remains", () => {
  const sourceOptions = page.match(/sourceOptions=\{\[([\s\S]*?)\]\}/)?.[1] || "";
  assert.doesNotMatch(sourceOptions, /value:\s*"(?:all|local)"/);
  assert.match(taxonomy, /\{t\.archive_workspace\.all\}/);
});

test("hiding online local entries does not remove local storage readers or original data modules", () => {
  assert.match(page, /listVisibleLocalArchiveSummaries/);
  assert.match(page, /listVisibleLocalTaxonomyItems/);
  assert.match(page, /showLocalArchives = false/);
});

test("cloud offline cache and temporary pending queue remain wired", () => {
  assert.match(page, /listVisibleCloudOfflineArchiveSummaries/);
  assert.match(page, /data-w5-temporary-space="true"/);
  assert.match(page, /data-w5-cloud-pending="true"/);
  assert.match(page, /syncPendingCloudArchive\(/);
  assert.match(page, /cancelNeverUploadedCloudArchive\(/);
});

test("remote Android temporary-space copy, status, and actions use bilingual translations", () => {
  const en = fs.readFileSync(new URL("../lib/i18n/en.ts", import.meta.url), "utf8");
  const zh = fs.readFileSync(new URL("../lib/i18n/zh.ts", import.meta.url), "utf8");
  const keys = [
    "temporary_space", "pending_retry", "pending_create_cloud_project", "pending_upload",
    "pending_upload_action", "pending_retry_action", "pending_cancel_action", "pending_view_edit",
    "pending_login_required", "pending_loading", "pending_empty", "pending_account_changed",
    "pending_cancel_account_changed", "pending_cancel_blocked", "pending_cancel_create_confirm",
    "pending_cancel_edit_confirm", "pending_cancel_failed", "pending_cancel_safety_hint",
  ];
  for (const key of keys) {
    assert.ok(page.includes("t.archive_workspace." + key), key + " is used by the remote Android page");
    assert.ok(en.includes(key + ": \""), key + " has an English translation");
    assert.ok(zh.includes(key + ": \""), key + " has a Chinese translation");
  }
  assert.doesNotMatch(page, /待重试|待创建云项目|取消待上传|临时空间|查看／编辑|请登录后查看待上传内容|正在读取待上传内容/);
});
