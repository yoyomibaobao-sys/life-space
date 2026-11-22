import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(path.join(root, name), "utf8");

test("user information edits country, province and city independently in the same row", () => {
  const android = read("components/profile/AndroidProfileController.tsx");
  const web = read("app/profile/page.tsx");
  assert.match(android, /data-android-profile-inline-location="true"/);
  assert.match(web, /data-mobile-profile-inline-location="true"/);
  for (const field of ["username", "country", "region", "city"]) {
    assert.match(android, new RegExp('startEditing\\("' + field + '"\\)'));
    assert.match(web, new RegExp('beginMobileInlineEdit\\("' + field + '"\\)'));
  }
  assert.doesNotMatch(android, /setRegionName\(""/);
  assert.match(android, /mode === "country"[\s\S]*country_code/);
  assert.match(android, /mode === "region"[\s\S]*region_name/);
  assert.match(web, /field === "country"[\s\S]*country_code/);
  assert.match(web, /field === "region"[\s\S]*region_name/);
  assert.match(android, /snapshot\.email \? <div/);
});

test("home category rows stay directly beneath existing sticky top header on scroll", () => {
  const css = read("components/ui/CategoryFilterRow.module.css");
  assert.match(css, /\.sticky\s*\{[\s\S]*position:\s*sticky;/);
  assert.match(css, /top:\s*calc\(50px \+ var\(--app-safe-area-top/);
  assert.match(read("components/discover/DiscoverFilterBar.tsx"), /filterStyles\.sticky/);
  assert.match(read("app/experience/page.tsx"), /filterStyles\.sticky/);
  assert.match(read("mobile-offline-src/main.tsx"), /filterStyles\.sticky/);
  assert.match(read("components/plant/GuideCategoryTabs.module.css"), /position:\s*sticky;/);
});

test("my space source and category bars stay together above the project list in both runtimes", () => {
  const template = read("components/archive-ui/ArchiveWorkspaceTemplate.tsx");
  const globals = read("app/globals.css");
  const standalone = read("mobile-offline-src/offline.css");
  assert.match(template, /className="ls-sticky-workspace-controls"/);
  assert.match(template, /<ArchiveSourceSwitcher[\s\S]*\{filtersSlot\}[\s\S]*<\/div>/);
  for (const css of [globals, standalone]) {
    assert.match(css, /\.ls-sticky-workspace-controls\s*\{[\s\S]*position:\s*sticky;/);
  }
});
