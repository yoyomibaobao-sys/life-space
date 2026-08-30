import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const source = (path) => readFileSync(resolve(root, path), "utf8");

// Execute the real TS helpers/components, with only external I/O and framework
// boundaries stubbed. These tests do not substitute for a browser layout check.
function createLoader(stubs = {}, environment = {}) {
  const cache = new Map();
  function load(path) {
    let file = resolve(root, path);
    if (!existsSync(file)) file = [".ts", ".tsx", "/index.ts"].map((suffix) => file + suffix).find(existsSync);
    assert.ok(file, `Missing test module: ${path}`);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const localRequire = (name) => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name.startsWith("@/")) return load(name.slice(2));
      if (name.startsWith(".")) return load(resolve(dirname(file), name));
      return require(name);
    };
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", "window", compiled)(localRequire, loadedModule, loadedModule.exports, environment.window);
    return loadedModule.exports;
  }
  return load;
}

const load = createLoader();
const { fitInlineSummary } = load("lib/fit-inline-summary.ts");
const { getCompactCardLocation } = load("lib/card-location.ts");
const { getArchiveCycleTerminology } = load("lib/archive-cycle-terminology.ts");
const guideLibrary = load("lib/public-guide-library.ts");
const { getPracticalGuideContent } = load("lib/practical-guide-content.ts");
const entry = (category, name, extra = {}) => ({ id: `fixture-${category}-${name}`, category, name, source: "preset", ...extra });

test("inline record summaries normalize whitespace and preserve short content", () => {
  assert.equal(fitInlineSummary(" 越来越香，\n\n甜甜的。 ", () => true), "越来越香， 甜甜的。");
  assert.equal(fitInlineSummary("\n\t ", () => false), "");
  assert.equal(fitInlineSummary("开花了", (value) => value.length <= 3), "开花了");
});

test("inline record summaries reserve trailing-date space and choose the longest fitting prefix", () => {
  let calls = 0;
  const result = fitInlineSummary("一二三四五六七八九十", (value) => { calls++; return value.length + 10 <= 16; });
  assert.equal(result, "一二三四五…");
  assert.ok(calls < 8, "fitting uses a bounded binary search");
  assert.equal(fitInlineSummary("有文字但只有日期能放下", () => false), "");
});

test("summary truncation never cuts emoji families or combining characters", () => {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const fits = (value) => Array.from(segmenter.segment(value)).length <= 3;
  assert.equal(fitInlineSummary("👨‍👩‍👧‍👦e\u0301继续成长", fits), "👨‍👩‍👧‍👦e\u0301…");
});

test("market/card locations show only city, then region, then country", () => {
  assert.equal(getCompactCardLocation({ city: "宁波市", region: "浙江省", country: "中国" }), "宁波");
  assert.equal(getCompactCardLocation({ city: " ", region: "浙江省", country: "中国" }), "浙江");
  assert.equal(getCompactCardLocation({ city: null, region: "", country: "中国" }), "中国");
  assert.equal(getCompactCardLocation({ fallback: "中国 · 浙江 · 宁波市" }), "宁波");
  assert.equal(getCompactCardLocation({ city: "New York", region: "New York", country: "USA" }), "New York");
  assert.equal(getCompactCardLocation({}), "");
  assert.match(source("app/market/page.tsx"), /getCompactCardLocation/);
});

test("all project categories use rounds while stored custom names remain authoritative", () => {
  for (const category of ["plant", "system", "insect_fish", "other", null, "unknown"]) {
    const zh = getArchiveCycleTerminology(category, "zh");
    const en = getArchiveCycleTerminology(category, "en");
    assert.equal(zh.unit, "轮");
    assert.equal(zh.cycleLabel(7), "第7轮");
    assert.equal(en.unit, "round");
    assert.equal(en.cycleLabel(7), "Round 7");
  }
  assert.match(source("components/archive-detail/ArchiveCycleTimeline.tsx"), /cycle\.display_name \|\| terminology\.cycleLabel/);
  assert.match(source("lib/i18n/zh.ts"), /生长周期/);
});

test("every confirmed non-plant preset has distinct bilingual practical content", () => {
  const directory = source("supabase/migrations/20260829120000_expand_domain_guide_hierarchy.sql").split("with allowed (category, name) as (")[1];
  const presets = [...directory.matchAll(/\('(system|insect_fish|other)', '([^']+)'\)/g)];
  assert.equal(presets.length, 110);
  const overviews = { zh: new Set(), en: new Set() };
  for (const [, category, name] of presets) {
    for (const language of ["zh", "en"]) {
      const content = getPracticalGuideContent(entry(category, name), language);
      assert.ok(content, `${category}/${name}/${language} missing`);
      assert.ok(content.overview.length > 12, name);
      assert.equal(content.sections.length, 4, name);
      assert.ok(content.sections.every((section) => section.items.length > 0 && section.items.every((item) => item.trim().length > (language === "zh" ? 8 : 20))), name);
      assert.equal(content.cycle, null, "do not invent a universal cycle");
      assert.ok(content.cautions.length > 0);
      overviews[language].add(content.overview);
      for (const reference of content.sources) assert.equal(new URL(reference.url).protocol, "https:");
    }
  }
  assert.equal(overviews.zh.size, presets.length);
  assert.equal(overviews.en.size, presets.length);
});

test("practical fallbacks never replace plant entries, user-approved guides, or other-category names", () => {
  assert.equal(getPracticalGuideContent(entry("plant", "水榕"), "zh"), null);
  assert.equal(getPracticalGuideContent(entry("system", "水榕"), "zh"), null);
  assert.equal(getPracticalGuideContent(entry("other", "果酱", { source: "approved" }), "zh"), null);
  assert.equal(getPracticalGuideContent(entry("insect_fish", "用户自己的名称"), "zh"), null);
});

test("stored guide copy takes precedence and is not attributed to fallback references", () => {
  const custom = entry("insect_fish", "龟", {
    summary: "管理员已核对的概要",
    content: { sections: [{ title: "特别养护", items: ["保留原有经核实的操作"] }], cautions: ["特别提醒"] },
  });
  const rendered = guideLibrary.buildPublicGuideContent(custom, "zh");
  assert.equal(rendered.overview, custom.summary);
  assert.deepEqual(rendered.sections, custom.content.sections);
  assert.deepEqual(rendered.cautions, custom.content.cautions);
  assert.deepEqual(rendered.sources, []);
  assert.deepEqual(custom.content.sections, [{ title: "特别养护", items: ["保留原有经核实的操作"] }]);
});

test("guide source links reject unsafe schemes and keep explicit source attribution", () => {
  const content = guideLibrary.buildPublicGuideContent(entry("other", "自定义", {
    source: "approved",
    content: { overview: "独立概要", sources: [{ title: "unsafe", url: "javascript:alert(1)" }, { title: "资料", url: "https://example.org/guide" }, { title: "", url: "https://example.org" }] },
  }), "zh");
  assert.equal(content.overview, "独立概要");
  assert.deepEqual(content.sources, [{ title: "资料", url: "https://example.org/guide" }]);
});

test("aquatic-plant practical content retains the existing filter traits", () => {
  const aquatic = entry("insect_fish", "水榕", {
    content_template: "aquatic_plant",
    content: { filters: { light: "low", temperature: "warm", growth_form: "epiphyte", difficulty: "easy" } },
  });
  const traits = guideLibrary.getPublicGuideFilterTraits(aquatic);
  assert.deepEqual(traits, { light: "low", temperature: "warm", growthForm: "epiphyte", difficulty: "easy" });
  const content = guideLibrary.buildPublicGuideContent(aquatic, "zh");
  assert.equal(content.parameters.length, 4);
  assert.ok(content.parameters.some((parameter) => parameter.value === "附生"));
  assert.equal(content.cycle, null);
  assert.equal(guideLibrary.matchesPublicGuideFilters(aquatic, { light: "low", temperature: "all", growthForm: "all", difficulty: "all" }), true);
  assert.equal(guideLibrary.matchesPublicGuideFilters(aquatic, { light: "high", temperature: "all", growthForm: "all", difficulty: "all" }), false);
});

test("animal and food guidance keeps species identification and concrete safety boundaries", () => {
  const fullText = (category, name) => JSON.stringify(getPracticalGuideContent(entry(category, name), "zh"));
  assert.match(fullText("insect_fish", "龟"), /水龟|陆龟/);
  assert.match(fullText("insect_fish", "马"), /兽医/);
  assert.match(fullText("other", "酱油"), /不能确认安全/);
  assert.match(fullText("other", "果酒"), /勿密闭装瓶/);
  assert.match(fullText("other", "果汁"), /巴氏杀菌/);
  assert.match(fullText("system", "堆肥"), /不能保证/);
});

test("only vertical Home discovery and experience cards share the fixed height module", () => {
  for (const path of ["components/discover/DiscoverProjectCard.tsx", "components/experience-card/PublicExperienceGallery.tsx"]) {
    const code = source(path);
    assert.match(code, /VerticalFeedCard\.module\.css/);
    assert.match(code, /verticalCard\.card/);
    assert.match(code, /verticalCard\.media/);
    assert.match(code, /verticalCard\.copy/);
  }
  for (const path of ["components/project/ProjectSummaryCard.tsx", "components/archive/ArchiveCard.tsx", "components/archive-ui/ArchiveProjectCard.tsx", "components/discover/FollowedProjectCard.tsx", "app/market/page.tsx", "components/experience-card/ExperienceCardListCard.tsx"]) {
    assert.doesNotMatch(source(path), /VerticalFeedCard/);
  }
  const css = source("components/project/ProjectSummaryCard.module.css");
  assert.match(css, /\.media \{[^}]*width: 112px;[^}]*height: 112px;[^}]*align-self: start/);
  assert.doesNotMatch(css, /align-self: stretch/);
});

test("mobile filters use compact independent help and one-line experience categories", () => {
  const discover = source("components/discover/DiscoverFilterBar.tsx");
  const css = source("components/ui/CategoryFilterRow.module.css");
  assert.match(css, /\.withHelp \{[^}]*repeat\(5, minmax\(0, 1fr\)\) max-content/);
  assert.match(css, /\.experience \{[^}]*1fr 1fr 1\.65fr 1\.65fr 1fr/);
  assert.match(css, /font-size: 13px/);
  assert.match(css, /white-space: nowrap/);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)/);
  assert.match(discover, /aria-pressed=\{helpOnly\}/);
  assert.match(source("lib/i18n/zh.ts"), /help_only: "仅求助"/);
});

const uiCopy = {
  meta: { records: "记录", record_suffix: "条", duration_ended: "已结束", duration_ongoing: "进行中", day_suffix: "天", views: "浏览", follows: "关注", comments: "评论", photos: "照片", projects: "项目", bookmarks: "关注", helpful: "采纳", updated: "更新" },
  archive_workspace: { set_private: "设为私密", set_public: "设为公开" },
};
const uiLoader = createLoader({
  "@/lib/i18n/useLanguage": { useLanguage: () => ({ language: "zh", t: uiCopy }) },
  "next/link": ({ children, ...props }) => React.createElement("a", props, children),
  "@/components/ui/UiIcon": ({ name }) => React.createElement("i", { "data-icon": name }),
  "@/components/local/LocalBlobImage": () => null,
  "@/components/archive/MobileArchiveTaxonomyInline": () => React.createElement("span", null, "种植 · 谷"),
});

test("rendered project cards wrap full titles, omit guide names, and retain textual visibility", () => {
  const ProjectSummaryCard = uiLoader("components/project/ProjectSummaryCard.tsx").default;
  const html = renderToStaticMarkup(React.createElement(ProjectSummaryCard, {
    href: "/archive/fixture", ariaLabel: "我的长项目名", title: "我的很长的项目名称应当完整换行显示", systemName: "不应出现的指引名",
    cover: null, imageAlt: "项目照片", fallbackIcon: "sprout", categoryLabel: "虫鱼生态", showCategoryBadge: false,
    visibilityLabel: "公开", latestText: "越来越香，\n甜甜的。", latestTime: "2026-05-20T12:00:00Z", recordCount: 6, durationDays: 109, followerCount: 2,
    classificationText: "其他 · 美食", ended: true, endedLabel: "已结束",
  }));
  assert.match(html, /我的很长的项目名称应当完整换行显示/);
  assert.match(html, /class="visibility">公开/);
  assert.match(html, /越来越香， 甜甜的。/);
  assert.match(html, /<time/);
  assert.doesNotMatch(html, /不应出现的指引名|虫鱼生态|data-icon="view"/);
  assert.match(html, /class="ended">已结束/);
});

test("detail views use readable 浏览 text and mobile list view counts are hidden", () => {
  const ProjectMetaLine = uiLoader("components/ui/ProjectMetaLine.tsx").default;
  const detail = renderToStaticMarkup(React.createElement(ProjectMetaLine, { viewCount: 12, textViewCount: true }));
  assert.match(detail, /浏览 12/);
  assert.doesNotMatch(detail, /data-icon="view"|mobile-app-desktop-only/);
  const list = renderToStaticMarkup(React.createElement(ProjectMetaLine, { viewCount: 12 }));
  assert.match(list, /class="mobile-app-desktop-only"/);
  assert.match(source("app/archive/[id]/page.tsx"), /textViewCount/);
});

function interestFixture(results) {
  const calls = [];
  const events = [];
  const client = { from(table) {
    const chain = { select(...args) { calls.push([table, "select", ...args]); return chain; }, eq(...args) { calls.push([table, "eq", ...args]); return chain; }, delete() { calls.push([table, "delete"]); return chain; }, upsert(...args) { calls.push([table, "upsert", ...args]); return chain; }, then(resolve, reject) { return Promise.resolve(results[table] || { error: null }).then(resolve, reject); } };
    return chain;
  } };
  const interestModule = createLoader({ "@/lib/supabase": { supabase: client } }, { window: { dispatchEvent: (event) => events.push(event.type) } })("lib/guide-interests.ts");
  return { ...interestModule, calls, events };
}

test("shared favorites counter sums both libraries and filters both by the signed-in owner", async () => {
  const fixture = interestFixture({ user_plant_interests: { count: 3 }, user_guide_interests: { count: 4 } });
  assert.equal(await fixture.getGuideInterestCount("owner-a"), 7);
  assert.deepEqual(fixture.calls.filter((call) => call[1] === "eq"), [
    ["user_plant_interests", "eq", "user_id", "owner-a"], ["user_guide_interests", "eq", "user_id", "owner-a"],
  ]);
});

test("favorites counter never labels a partial or failed read as a complete total", async () => {
  for (const table of ["user_plant_interests", "user_guide_interests"]) {
    const fixture = interestFixture({ user_plant_interests: { count: 3 }, user_guide_interests: { count: 4 }, [table]: { error: { message: "unavailable" } } });
    assert.equal(await fixture.getGuideInterestCount("owner-a"), null);
  }
});

test("saving is idempotent and removing a guide includes both owner and guide filters", async () => {
  const fixture = interestFixture({});
  await fixture.setGuideInterest("owner-a", "guide-a", true);
  assert.deepEqual(fixture.calls[0], ["user_guide_interests", "upsert", { user_id: "owner-a", guide_id: "guide-a" }, { onConflict: "user_id,guide_id", ignoreDuplicates: true }]);
  await fixture.setGuideInterest("owner-a", "guide-a", false);
  assert.deepEqual(fixture.calls.slice(1), [["user_guide_interests", "delete"], ["user_guide_interests", "eq", "user_id", "owner-a"], ["user_guide_interests", "eq", "guide_id", "guide-a"]]);
  assert.deepEqual(fixture.events, ["guide-interests-changed", "guide-interests-changed"]);
});

test("failed saves preserve UI state and never emit a success-change event", async () => {
  const failure = new Error("permission denied");
  const fixture = interestFixture({ user_guide_interests: { error: failure } });
  await assert.rejects(() => fixture.setGuideInterest("owner-a", "guide-a", true), failure);
  assert.deepEqual(fixture.events, []);
});

test("guide favorites SQL has owner RLS, cloud-member insert gating, and no anonymous/update grants", () => {
  const sql = source("supabase/migrations/20260830143000_add_user_guide_interests.sql");
  assert.match(sql, /primary key \(user_id, guide_id\)/);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /references public\.guide_entries\(id\) on delete cascade/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all .* from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, delete .* to authenticated/);
  assert.doesNotMatch(sql, /grant[^;]*(?:update[^;]*to authenticated|to anon)/);
  for (const operation of ["select", "delete"]) assert.match(sql, new RegExp(`for ${operation} to authenticated[\\s\\S]*?using \\(\\(select auth\\.uid\\(\\)\\) = user_id\\)`));
  const insertPolicy = sql.split('create policy "guide interests owner add"')[1].split('create policy "guide interests owner remove"')[0];
  assert.match(insertPolicy, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(insertPolicy, /select public\.has_active_cloud_access\(\)/);
  assert.match(insertPolicy, /guide\.id = user_guide_interests\.guide_id and guide\.is_active = true/);
});

test("favorites and guide libraries share four tabs, retain per-domain searches, and only water plants add filters", () => {
  const favorites = source("app/archive/interests/page.tsx");
  const guides = source("app/plant/page.tsx");
  assert.match(favorites, /<GuideCategoryTabs value=\{activeCategory\}/);
  assert.match(guides, /<GuideCategoryTabs/);
  assert.match(favorites, /useSearchParams\(\)/);
  assert.match(favorites, /router\.replace\([\s\S]*?scroll: false/);
  assert.match(guides, /activeSection\?\.slug === "aquatic_plants"/);
  assert.match(guides, /activeSectionByCategory\[category\]/);
  assert.match(guides, /searchInput=\{publicGuideSearchInputs\[guideSection\]/);
  assert.doesNotMatch(guides, /\{copy\.notice\}|\{copy\.publicLibrary\}/);
});

test("mobile primary identity stays in its existing row and market detail titles/actions move into the top bar", () => {
  const archive = source("app/archive/page.tsx");
  const profile = source("app/profile/page.tsx");
  const mine = source("app/market/mine/page.tsx");
  assert.doesNotMatch(archive, /<MobilePageHeader/);
  assert.match(archive, /personalSpaceMobileNameRowStyle/);
  assert.match(profile, /<MobilePageHeader[\s\S]*?title=""[\s\S]*?compact/);
  assert.doesNotMatch(profile, /云空间与本地分别设置/);
  assert.match(mine, /<MobilePageHeader[\s\S]*?title=\{t\.market\.mine_title\}[\s\S]*?right=\{[\s\S]*?t\.market\.post_information/);
  assert.match(source("components/navbar.tsx"), /pathname === "\/market\/new"\) return marketLabels\.new_title/);
});
