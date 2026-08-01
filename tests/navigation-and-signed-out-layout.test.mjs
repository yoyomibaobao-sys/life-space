import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("mobile personal space project summary opens the project archive", async () => {
  const profile = await source("app/profile/page.tsx");

  assert.match(profile, /<Link href="\/archive" style=\{mobileProjectStatsCardStyle\}>/);
  assert.match(profile, /<strong>项目档案<\/strong>/);
  assert.match(profile, /公开 \{publicArchiveCount\}/);
});

test("signed-out market does not repeat login and registration actions inside the page", async () => {
  const market = await source("app/market/page.tsx");

  assert.doesNotMatch(market, /登录后发布/);
  assert.doesNotMatch(market, /注册账号/);
  assert.match(market, /\{currentUserId \? \(/);
  assert.match(market, /我的发布/);
});

test("signed-out home uses a compact viewport-oriented layout", async () => {
  const home = await source("app/page.tsx");

  assert.match(home, /minHeight: "calc\(100vh - 70px\)"/);
  assert.match(home, /gridTemplateColumns: "repeat\(4, minmax\(0, 1fr\)\)"/);
  assert.match(home, /@media \(max-height: 720px\)/);
  assert.match(home, /记录四时变化，留下发现、收获与成长/);
  assert.match(home, /其他自然生活相关项目/);
});
