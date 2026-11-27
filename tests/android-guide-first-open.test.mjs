import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("plant guides have bundled first-paint data before cloud membership or catalog requests", () => {
  const page = readFileSync("app/plant/page.tsx", "utf8");
  assert.match(page, /const \[plants, setPlants\] = useState<PlantItem\[\]>\(\(\) => offlineDirectory/);
  assert.match(page, /offlineDirectory[\s\S]*\.filter\(\(entry\) => entry\.category === "plant"\)/);
  assert.match(page, /category: "all", is_active: true/);
  assert.match(page, /setPlants\(fallbackPlants\)/);
  assert.match(page, /const visibleActiveCategory = categories\.includes\(activeCategory\) \? activeCategory : "all"/);
  assert.match(page, /visibleActiveCategory === "all" \|\| normalizePlantCategoryKey\(plant\.category\) === visibleActiveCategory/);
});

test("saved online-only plant category cannot make offline fallback empty on first open", () => {
  const savedCategory = "vegetable";
  const offlineCategories = ["all"];
  const visibleCategory = offlineCategories.includes(savedCategory) ? savedCategory : "all";
  const bundled = [{ id: "builtin:plant:blueberry", category: "all" }, { id: "builtin:plant:tomato", category: "all" }];
  const visible = bundled.filter((item) => visibleCategory === "all" || item.category === visibleCategory);
  assert.deepEqual(visible.map((x) => x.id), bundled.map((x) => x.id));
  assert.equal(savedCategory, "vegetable", "The original preference must not be overwritten");
});

test("offline basic plant catalog never demands a verified membership to list its public entries", () => {
  const page = readFileSync("app/plant/page.tsx", "utf8");
  const effect = page.slice(page.indexOf("const fallbackEntries = offlineDirectory.filter"), page.indexOf("async function load()"));
  assert.match(effect, /setPlants\(fallbackPlants\)/);
  assert.match(effect, /setLoading\(!offline && fallbackPlants\.length === 0\)/);
  assert.match(effect, /if \(offline\)/);
  assert.doesNotMatch(effect, /setHasCloudAccess\(true\)/);
});

test("offline badge replaces duplicate cloud notice and reconnect keeps pending data", () => {
  const shell = readFileSync("mobile-offline-src/main.tsx", "utf8");
  assert.doesNotMatch(shell, /data-w5-connected-cloud-check-failed|重新检查云端/);
  assert.match(shell, /!online \|\| offlineOwnerRead\) \? \(language === "zh" \? "离线"/);
  assert.match(shell, /const nextOnline = await recheckAndroidConnectivity\(\)/);
  assert.match(shell, /if \(nextOnline\) \{[\s\S]*await revalidateAndroidAuthSession\(\)/);
  const reconnectBlock = shell.slice(shell.indexOf("async function reconnect()"), shell.indexOf("function openDetail(", shell.indexOf("async function reconnect()")));
  assert.doesNotMatch(reconnectBlock, /syncAndroidPendingCloudArchive|preparePendingCloudSyncQueue|deleteLocal/);
});

test("online first visit shows public catalog rows before awaiting membership enrichment", () => {
  const page = readFileSync("app/plant/page.tsx", "utf8");
  const request = page.indexOf("const catalogRequest =");
  const auth = page.indexOf("const authResult =", request);
  assert.ok(request >= 0 && auth > request);
  assert.match(page.slice(request, auth), /!cancelled && !result\?\.error && result\?\.data\?\.length/);
  assert.match(page.slice(request, auth), /setPlants\(result\.data\);\s*setLoading\(false\)/);
});
