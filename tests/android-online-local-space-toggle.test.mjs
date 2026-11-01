import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const profile = fs.readFileSync(new URL("../app/profile/page.tsx", import.meta.url), "utf8");
const categoryRoute = fs.readFileSync(new URL("../app/profile/project-categories/page.tsx", import.meta.url), "utf8");
const categoryView = fs.readFileSync(new URL("../components/profile/ProjectCategorySettingsView.tsx", import.meta.url), "utf8");

test("online Android profile no longer exposes the legacy local-space visibility switch", () => {
  assert.doesNotMatch(profile, /nativeLocalSpaceVisible|toggleNativeLocalSpaceVisibility|lifespace_android_show_local_space_v1|启用本地空间/);
  assert.doesNotMatch(profile, /preferencesExtra=/);
});

test("online website and Android project-category settings hide the local-space tab", () => {
  assert.match(categoryRoute, /hideLocalSpace=\{true\}/);
  assert.doesNotMatch(categoryRoute, /isOnlineAndroid|useIsNativeApp|isAndroidSafAvailable/);
  assert.match(categoryView, /hideLocalSpace = true/);
  assert.match(categoryView, /\{!hideLocalSpace \?/);
  assert.match(categoryView, /此处仅设置云空间分组/);
});

test("hiding online local grouping controls preserves saved local grouping data", () => {
  assert.match(categoryRoute, /getLocalArchiveCategoryDepths\(user\.id\)/);
  assert.match(categoryRoute, /saveLocalArchiveCategoryDepths\(localDepths, userId\)/);
  assert.doesNotMatch(categoryView, /removeItem|localStorage\.clear|deleteLocalArchiveCategoryDepths/);
});
