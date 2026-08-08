import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("dates use one numeric card and precise-time contract", async () => {
  const [dateTime, activity, archiveDate, notifications, marketTypes, marketDetail, profileDates] = await Promise.all([
    source("lib/date-time.ts"),
    source("lib/activity-time.ts"),
    source("lib/archive-page-utils.ts"),
    source("app/notifications/page.tsx"),
    source("lib/market-types.ts"),
    source("app/market/[id]/page.tsx"),
    source("lib/user-profile-shared.ts"),
  ]);

  assert.match(dateTime, /formatCardDate/);
  assert.match(dateTime, /`\$\{date\.getFullYear\(\)\}\/\$\{pad\(date\.getMonth\(\) \+ 1\)\}\/\$\{pad\(date\.getDate\(\)\)\}`/);
  assert.doesNotMatch(dateTime, /`\$\{date\.getFullYear\(\)\}-\$\{pad\(date\.getMonth\(\) \+ 1\)\}-\$\{pad\(date\.getDate\(\)\)\}`/);
  assert.match(dateTime, /formatPreciseDateTime/);
  assert.match(dateTime, /分钟前|小时前|天前/);
  assert.doesNotMatch(dateTime, /en-US|month: "short"/);
  assert.match(activity, /formatRecentActivityTime/);
  assert.match(activity, /formatPreciseDateTime/);
  assert.match(archiveDate, /formatCardDate/);
  assert.match(notifications, /formatPreciseDateTime/);
  assert.match(marketTypes, /formatMarketTime[\s\S]*?formatCardDate\(value\)/);
  assert.match(marketDetail, /formatPreciseDateTime\(item\.created_at\)/);
  assert.match(profileDates, /formatProfileDate[\s\S]*?formatCardDate\(value\)/);
  assert.match(profileDates, /formatProfileDateTime[\s\S]*?formatPreciseDateTime\(value\)/);
});
