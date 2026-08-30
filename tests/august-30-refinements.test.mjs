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
    new Function("require", "module", "exports", "window", "sessionStorage", compiled)(localRequire, loadedModule, loadedModule.exports, environment.window, environment.window?.sessionStorage);
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

function loadFunction(path, name, scope) {
  const tree = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(declaration, `Function not found: ${name}`);
  const compiled = ts.transpileModule(declaration.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  return new Function(...Object.keys(scope), `${compiled}; return ${name};`)(...Object.values(scope));
}

test("cloud guide selection saves category and name together without changing other project fields", async () => {
  const names = load("lib/system-name-candidates.ts");
  const activeArchive = { id: "project", category: "plant", title: "我的观察", source: "朋友赠送", note: "保留备注", archive_summary: "保留摘要", is_public: false, species_id: "old-plant", species_name_snapshot: "紫苏", sub_tag_id: "old-sub", group_tag_id: "old-group" };
  const writes = [];
  const states = [];
  const candidates = [{ id: "aquatic-guide", label: "金鱼藻", category: "insect_fish", source: "public_guide" }];
  const scope = {
    isOwner: true, archiveCopy: { save_retry: "重试", system_name_empty: "不能为空", system_name_updated: "已更新" },
    archiveProfileSystemNameCandidateList: candidates, activeArchive,
    normalizeArchiveCategory: loadFunction("app/archive/[id]/page.tsx", "normalizeArchiveCategory", {}),
    resolveSystemNameSelection: names.resolveSystemNameSelection,
    saveMobileArchivePatch: async (field, patch) => { writes.push({ field, patch }); return true; },
    setMobileArchiveError() {},
    setMobileArchiveName: (value) => states.push(["name", value]),
    setMobileArchiveCategory: (value) => states.push(["category", value]),
    setSpecies: (value) => states.push(["species", value]),
    setArchiveSubcategoryLabel() {}, setArchiveGroupLabel() {},
    me: "owner", language: "zh",
    supabase: { from() { throw new Error("Known guides must not create a pending plant"); } },
  };
  const save = loadFunction("app/archive/[id]/page.tsx", "saveArchiveSystemNameSelection", scope);
  await save({ name: "金鱼藻", candidateId: "aquatic-guide" });
  assert.equal(writes.length, 1);
  const next = { ...activeArchive, ...writes[0].patch };
  assert.deepEqual([next.category, next.system_name, next.species_id, next.species_name_snapshot], ["insect_fish", "金鱼藻", null, null]);
  assert.deepEqual([next.title, next.source, next.note, next.archive_summary, next.is_public], ["我的观察", "朋友赠送", "保留备注", "保留摘要", false]);
  assert.deepEqual([next.sub_tag_id, next.group_tag_id], [null, null]);
  assert.ok(states.some(([field, value]) => field === "category" && value === "insect_fish"));

  const failedSave = loadFunction("app/archive/[id]/page.tsx", "saveArchiveSystemNameSelection", {
    ...scope, saveMobileArchivePatch: async () => false,
    setSpecies() { throw new Error("A failed save must not change the displayed plant"); },
  });
  await assert.rejects(failedSave({ name: "金鱼藻" }), /重试/);
});

test("local guide selection clears stale plant links and saves its classification in one update", async () => {
  const names = load("lib/system-name-candidates.ts");
  const archive = { id: "local-project", title: "青梅蜜", category: "plant", system_name: "梅", species_name: "梅", plant_id: "old-plant", plant_slug: "old-plum", source: "自家", note: "已有记录不变" };
  const updates = [];
  const save = loadFunction("app/local/archive/[id]/page.tsx", "saveLocalArchiveProfileField", {
    detail: { archive },
    archiveCopy: { system_name_empty: "不能为空", local_profile_updated: "已更新" },
    systemNameCandidates: [{ id: "food-guide", label: "梅子蜜", category: "other", source: "public_guide" }],
    resolveSystemNameSelection: names.resolveSystemNameSelection,
    resolveExactSystemNameCandidate: names.resolveExactSystemNameCandidate,
    updateLocalArchiveProfile: async (patch) => updates.push(patch),
  });
  await save({ field: "systemName", value: { name: "梅子蜜", candidateId: "food-guide", category: "other" } });
  assert.equal(updates.length, 1);
  const next = { ...archive, ...updates[0] };
  assert.deepEqual([next.category, next.system_name, next.species_name, next.plant_id, next.plant_slug], ["other", "梅子蜜", null, null, null]);
  assert.deepEqual([next.title, next.source, next.note], ["青梅蜜", "自家", "已有记录不变"]);
});


function candidateClient(tables) {
  const requests = [];
  return {
    requests,
    from(table) {
      const filters = [];
      requests.push({ table, filters });
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        order() { return this; },
        then(resolve) {
          const data = (tables[table] || []).filter((row) => filters.every(([key, value]) =>
            key.includes(".") || row[key] === value));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}

test("guide autocomplete searches food and water plants even when planting is selected", async () => {
  const names = load("lib/system-name-candidates.ts");
  const client = candidateClient({
    guide_entries: [
      { id: "guide-food", name: "梅子蜜", name_en: "Plum honey", category: "other", is_active: true, guide_sections: { name: "美食", name_en: "Food" } },
      { id: "guide-water", name: "金鱼藻", name_en: "Hornwort", category: "insect_fish", is_active: true, guide_sections: { name: "水草" } },
      { id: "inactive", name: "不应出现的草", category: "plant", is_active: false },
    ],
  });
  const candidates = await names.getSystemNameCandidates({ category: "plant", includeOtherCategories: true, limit: null, supabase: client });
  const food = names.filterSystemNameCandidates(candidates, "梅子蜜", "plant");
  assert.equal(food[0].id, "guide-food");
  assert.equal(food[0].category, "other");
  assert.equal(food[0].sectionName, "美食");
  assert.equal(names.filterSystemNameCandidates(candidates, "Hornwort", "plant")[0].category, "insect_fish");
  assert.equal(names.resolveExactSystemNameCandidate(candidates, "金鱼藻").category, "insect_fish");
  assert.ok(!candidates.some((candidate) => candidate.id === "inactive"));
  assert.ok(!client.requests.some((request) => request.table === "archives"), "public suggestions do not read private project names");
});

test("guide lookup filters the full catalog before limiting visible suggestions", async () => {
  const names = load("lib/system-name-candidates.ts");
  const species = Array.from({ length: 360 }, (_, i) => ({ id: `plant-${i}`, common_name: `植物候选${String(i).padStart(3, "0")}` }));
  const candidates = await names.getSystemNameCandidates({ category: "plant", plantSpeciesRows: species, limit: null });
  assert.equal(candidates.length, 360);
  const matches = names.filterSystemNameCandidates(candidates, "植物候选359", "plant");
  assert.deepEqual(matches.map((candidate) => candidate.plantId), ["plant-359"]);
  assert.equal(names.filterSystemNameCandidates(candidates, "", "plant").length, 10);
});

test("exact guide inference rejects ambiguous names, partial names, and private custom names", () => {
  const names = load("lib/system-name-candidates.ts");
  const candidates = [
    { id: "one", label: "浮萍", category: "plant", source: "plant_species", plantId: "one" },
    { id: "two", label: "浮萍", category: "insect_fish", source: "public_guide" },
    { label: "私人试验草", category: "plant", source: "cloud_archive" },
    { label: "当前名字", category: "other", source: "current" },
  ];
  assert.equal(names.resolveExactSystemNameCandidate(candidates, "浮萍"), null);
  assert.equal(names.resolveExactSystemNameCandidate(candidates, "浮"), null);
  assert.equal(names.resolveExactSystemNameCandidate(candidates, "私人试验草"), null);
  assert.equal(names.resolveExactSystemNameCandidate(candidates, "当前名字"), null);
  assert.equal(names.filterSystemNameCandidates(candidates, "浮萍", "plant").length, 2);
  const chosen = names.resolveSystemNameSelection(candidates, { name: "浮萍", candidateId: "two", category: "insect_fish" }, "plant");
  assert.equal(chosen.category, "insect_fish");
  assert.equal(chosen.plantId, null);
});

test("plant mirror guides enrich aliases while preserving the real plant foreign key", async () => {
  const names = load("lib/system-name-candidates.ts");
  const candidates = await names.getSystemNameCandidates({
    category: "plant", limit: null,
    plantSpeciesRows: [{ id: "real-species", common_name: "紫苏", scientific_name: "Perilla frutescens", slug: "perilla" }],
    supabase: candidateClient({ guide_entries: [{ id: "mirror-guide", name: "紫苏", name_en: "Perilla", category: "plant", is_active: true, guide_sections: { name: "香草" } }] }),
  });
  const perilla = names.resolveExactSystemNameCandidate(candidates, "Perilla");
  assert.equal(perilla.id, "real-species");
  assert.equal(perilla.plantId, "real-species");
  assert.equal(perilla.sectionName, "香草");
  assert.equal(names.filterSystemNameCandidates(candidates, "Perilla", "plant").length, 1);
  const publicOnly = names.resolveSystemNameSelection(
    [{ id: "guide-not-species", label: "新植物", category: "plant", source: "public_guide" }],
    { name: "新植物", candidateId: "guide-not-species" }, "other",
  );
  assert.equal(publicOnly.category, "plant");
  assert.equal(publicOnly.plantId, null);
});

test("guide changes bind the selected category and discard incompatible plant links", () => {
  const names = load("lib/system-name-candidates.ts");
  const candidates = [
    { id: "water", label: "金鱼藻", category: "insect_fish", source: "public_guide" },
    { id: "food", label: "梅子蜜", category: "other", source: "public_guide" },
    { id: "plant", label: "紫苏", category: "plant", source: "plant_species", plantId: "plant", plantSlug: "perilla", aliases: ["Perilla"] },
  ];
  const aquatic = names.resolveSystemNameSelection(candidates, { name: "金鱼藻" }, "plant");
  assert.deepEqual([aquatic.name, aquatic.category, aquatic.plantId, aquatic.plantSlug], ["金鱼藻", "insect_fish", null, null]);
  const food = names.resolveSystemNameSelection(candidates, { name: "梅子蜜" }, "system");
  assert.equal(food.category, "other");
  const plant = names.resolveSystemNameSelection(candidates, { name: "perilla" }, "other");
  assert.deepEqual([plant.name, plant.category, plant.plantId, plant.plantSlug], ["紫苏", "plant", "plant", "perilla"]);
  const custom = names.resolveSystemNameSelection(candidates, { name: "我的新试验", isNewCandidate: true }, "system");
  assert.deepEqual([custom.name, custom.category, custom.candidate, custom.plantId], ["我的新试验", "system", null, null]);
});

test("the new project form puts the required linked guide before the required category without a default category", () => {
  const copy = load("lib/i18n/zh.ts").default;
  const Form = createLoader({
    "@/lib/i18n/useLanguage": { useLanguage: () => ({ language: "zh", t: copy }) },
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
  })("components/archive-ui/ArchiveNewProjectFormShell.tsx").default;
  const html = renderToStaticMarkup(React.createElement(Form, {
    backHref: "/archive", backLabel: "返回", eyebrow: "本地", title: "新建项目",
    category: null, onCategoryChange() {}, projectTitle: "", onProjectTitleChange() {},
    systemControl: React.createElement("input", { required: true, "aria-label": "关联指引" }),
    sourceControl: React.createElement("input"), note: "", onNoteChange() {}, notice: "",
    submitText: "创建项目", loadingText: "保存中", onSubmit() {},
  }));
  assert.ok(html.indexOf("项目名称 *") < html.indexOf("关联指引 *"));
  assert.ok(html.indexOf("关联指引 *") < html.indexOf("种类 *"));
  assert.match(html, /role="radiogroup"[^>]*aria-required="true"/);
  assert.equal((html.match(/aria-checked="false"/g) || []).length, 4);
  assert.doesNotMatch(html, /aria-checked="true"/);
});


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
  assert.match(guides, /selectedSection=\{publicGuideCategories\[guideSection\]/);
  assert.match(guides, /searchInput=\{publicGuideSearchInputs\[guideSection\]/);
  assert.doesNotMatch(guides, /\{copy\.notice\}|\{copy\.publicLibrary\}/);
});

test("mobile primary identity stays in its existing row and market detail titles/actions move into the top bar", () => {
  const archive = source("app/archive/page.tsx");
  const profile = source("app/profile/page.tsx");
  const mine = source("app/market/mine/page.tsx");
  assert.doesNotMatch(archive, /<MobilePageHeader/);
  assert.match(archive, /personalSpaceMobileNameRowStyle/);
  assert.match(profile, /<MobilePageHeader[\s\S]*?title=\{t\.profile\.settings_title\}/);
  assert.doesNotMatch(profile, /云空间与本地分别设置/);
  assert.match(mine, /<MobilePageHeader[\s\S]*?title=\{t\.market\.mine_title\}[\s\S]*?right=\{[\s\S]*?t\.market\.post_information/);
  assert.match(source("components/navbar.tsx"), /pathname === "\/market\/new"\) return marketLabels\.new_title/);
});

const waterEntry = (name, traits = {}) => entry("insect_fish", name, {
  content_template: "aquatic_plant",
  content: { filters: { light: "low_medium", temperature: "warm", growth_form: "epiphyte", difficulty: "easy", ...traits } },
});
const emptyWaterFilters = { light: [], temperature: [], growthForm: "all", difficulty: "all" };

test("water-plant conditions use OR within a dimension and AND across dimensions", () => {
  const plant = waterEntry("水榕");
  assert.equal(guideLibrary.matchesPublicGuideFilters(plant, emptyWaterFilters), true);
  assert.equal(guideLibrary.matchesPublicGuideFilters(plant, { ...emptyWaterFilters, light: ["high", "medium"] }), true);
  assert.equal(guideLibrary.matchesPublicGuideFilters(plant, { ...emptyWaterFilters, light: ["high"] }), false);
  assert.equal(guideLibrary.matchesPublicGuideFilters(plant, { ...emptyWaterFilters, light: ["medium"], difficulty: "hard" }), false);
  assert.equal(guideLibrary.matchesPublicGuideFilters(plant, { ...emptyWaterFilters, temperature: ["c18_22", "c22_26"] }), true);
  assert.equal(guideLibrary.matchesPublicGuideFilters(plant, { ...emptyWaterFilters, light: ["high"], temperature: ["c22_26"] }), false);
  assert.equal(guideLibrary.matchesPublicGuideFilters(waterEntry("金鱼藻", { growth_form: "stem_floating" }), { ...emptyWaterFilters, growthForm: "floating" }), true);
});

test("water-temperature filters use numeric reference overlaps, not guessed qualitative tags", () => {
  const plant = waterEntry("水榕");
  assert.equal(guideLibrary.matchesPublicGuideFilters(plant, { ...emptyWaterFilters, temperature: ["c18_22"] }), false, "touching only at 22°C is not an overlapping range");
  assert.equal(guideLibrary.matchesPublicGuideFilters(plant, { ...emptyWaterFilters, temperature: ["c22_26"] }), true);
  assert.equal(guideLibrary.getPublicGuideTemperatureLabel(plant, "zh"), "22–28℃");
  const unknown = waterEntry("未核实水草");
  assert.equal(guideLibrary.matchesPublicGuideFilters(unknown, { ...emptyWaterFilters, temperature: ["c22_26"] }), false);
  assert.equal(guideLibrary.matchesPublicGuideFilters(unknown, { ...emptyWaterFilters, temperature: ["unknown"] }), true);
  assert.match(guideLibrary.getPublicGuideTemperatureLabel(unknown, "zh"), /待确认/);
  assert.equal(guideLibrary.matchesPublicGuideFilters({ ...plant, source: "approved" }, { ...emptyWaterFilters, temperature: ["c22_26"] }), false, "never apply a preset to a user's guide by name");
});

test("explicit water-temperature values take priority and invalid ranges do not inherit a preset", () => {
  const { getAquaticTemperatureReference } = load("lib/aquatic-guide-temperature.ts");
  assert.deepEqual(getAquaticTemperatureReference(waterEntry("水榕", { temperature_min_c: 19, temperature_max_c: 21 })), { min: 19, max: 21, species: "水榕" });
  assert.equal(getAquaticTemperatureReference(waterEntry("水榕", { temperature_min_c: 29, temperature_max_c: 20 })), null);
  assert.equal(getAquaticTemperatureReference(waterEntry("水榕", { temperature_min_c: "22", temperature_max_c: 28 })), null);
  const content = guideLibrary.buildPublicGuideContent(waterEntry("水榕"), "zh");
  assert.ok(content.cautions.some((text) => text.includes("Anubias barteri var. nana")));
  assert.ok(content.sources.some((reference) => reference.url.includes("dennerleplants.com")));
});

test("cold and hot water filters use verified numeric ranges without inventing unknown values", () => {
  const hornwort = waterEntry("金鱼藻");
  for (const band of ["c0_10", "c10_18"]) {
    assert.equal(guideLibrary.matchesPublicGuideFilters(hornwort, { ...emptyWaterFilters, temperature: [band] }), true);
    assert.equal(guideLibrary.matchesPublicGuideFilters(waterEntry("水榕"), { ...emptyWaterFilters, temperature: [band] }), false);
  }
  assert.equal(guideLibrary.matchesPublicGuideFilters(hornwort, { ...emptyWaterFilters, temperature: ["c30_plus"] }), false);
  const stored = waterEntry("独立测试指引", { temperature_min_c: 29, temperature_max_c: 33 });
  assert.equal(guideLibrary.matchesPublicGuideFilters(stored, { ...emptyWaterFilters, temperature: ["c30_plus"] }), true);
  assert.equal(guideLibrary.getPublicGuideTemperatureMatchLabel(stored, ["c30_plus"], "zh"), "本次匹配：30–33℃");
  const unknown = waterEntry("未核实水草");
  assert.equal(guideLibrary.matchesPublicGuideFilters(unknown, { ...emptyWaterFilters, temperature: ["c0_10", "c30_plus"] }), false);
  assert.equal(guideLibrary.getPublicGuideTemperatureMatchLabel(unknown, ["unknown"], "zh"), "");
});

test("temperature result labels show only the actual overlap and preserve gaps between choices", () => {
  const hornwort = waterEntry("金鱼藻");
  assert.equal(guideLibrary.getPublicGuideTemperatureMatchLabel(hornwort, ["c26_30"], "zh"), "本次匹配：26–28℃");
  assert.equal(guideLibrary.getPublicGuideTemperatureMatchLabel(hornwort, ["c26_30", "c0_10"], "zh"), "本次匹配：1–10℃、26–28℃");
  assert.equal(guideLibrary.getPublicGuideTemperatureMatchLabel(hornwort, ["c22_26", "c18_22", "c22_26"], "en"), "Matched range: 18–26°C");
  assert.equal(guideLibrary.getPublicGuideTemperatureMatchLabel(hornwort, "all", "zh"), "");
  assert.equal(guideLibrary.getPublicGuideTemperatureMatchLabel(hornwort, [], "zh"), "");
  assert.equal(guideLibrary.getPublicGuideTemperatureLabel(hornwort, "en"), "1–28°C");
});

test("plant filters remain unchanged while only water plants expose multi-select conditions", () => {
  const page = source("app/plant/page.tsx");
  assert.match(page, /useState<EnvironmentFilters>\(\{\s*light: "all",\s*water: "all",\s*temperature: "all",\s*scene: "all",\s*indoor: "all"/);
  assert.match(page, /matchesEnvironmentFilters\(/);
  assert.match(page, /\["light", "temperature"\] as const/);
  assert.match(page, /type="checkbox" checked=\{checked\}/);
  assert.match(page, /activeSection\?\.slug === "aquatic_plants" &&\s*hasCloudAccess/);
});

test("guide directory URLs scope searches and category filters to one major category", () => {
  const { buildGuideDirectoryHref } = load("lib/guide-directory-navigation.ts");
  for (const major of ["plant", "system", "insect_fish", "other"]) {
    const url = new URL(buildGuideDirectoryHref(major, "  梅 & 莫斯  ", "section-2"), "https://example.test");
    assert.equal(url.pathname, "/plant");
    assert.equal(url.searchParams.get("section"), major);
    assert.equal(url.searchParams.get("q"), "梅 & 莫斯");
    assert.equal(url.searchParams.get("category"), major === "plant" ? null : "section-2");
  }
  assert.equal(buildGuideDirectoryHref("other", " "), "/plant?section=other");
});

test("login and registration preserve a guide return path but reject auth loops and external URLs", () => {
  const auth = load("lib/auth-return.ts");
  const destination = "/plant/guide/test?from=insect_fish#overview";
  for (const href of [auth.buildLoginHref(destination), auth.buildRegisterHref(destination)]) {
    assert.equal(new URL(href, "https://example.test").searchParams.get("returnTo"), destination);
  }
  for (const unsafe of ["https://evil.test", "//evil.test", "/\\evil.test", "/login?returnTo=/profile", "/register", "/check-email", "/reset-password", "/auth/callback", "/plant\u0000"]) {
    assert.equal(auth.getSafeReturnTo(unsafe), "/archive", unsafe);
  }
  assert.match(source("app/login/page.tsx"), /buildRegisterHref/);
  assert.match(source("app/register/page.tsx"), /router\.replace\(returnTo\)/);
  assert.match(source("app/check-email/page.tsx"), /buildLoginHref\(returnTo\)/);
});

function navigationFixture(routes) {
  const values = new Map();
  const sessionStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const window = { location: { origin: "https://example.test", pathname: "/plant/guide/test", search: "?from=insect_fish" }, sessionStorage, scrollY: 12 };
  const navigation = createLoader({}, { window })("lib/mobile-navigation.ts");
  navigation.writeMobileRouteHistory(routes);
  return { navigation, sessionStorage };
}

test("page-header back skips login/register and pre-login copies of the same detail page", () => {
  const destination = "/plant?section=insect_fish&q=龟&category=section-turtle";
  const current = "/plant/guide/test?from=insect_fish";
  const { navigation } = navigationFixture([destination, "/plant/guide/test", "/login?returnTo=guide", "/register?returnTo=guide", current]);
  assert.equal(navigation.getMobileSourceRoute(current, "/plant"), destination);
  navigation.prepareMobileSourceReturn(current, destination);
  assert.deepEqual(navigation.readMobileRouteHistory(), [destination]);
});

test("detail header uses its category fallback after direct visits or auth-only history", () => {
  const current = "/plant/guide/test?from=insect_fish";
  for (const history of [[current], ["/login", "/check-email", current], []]) {
    const { navigation } = navigationFixture(history);
    assert.equal(navigation.getMobileSourceRoute(current, "/plant?section=insect_fish"), "/plant?section=insect_fish");
  }
});

test("logical detail returns preserve the source chain and original scroll marker", () => {
  const { navigation, sessionStorage } = navigationFixture(["/discover", "/archive/project", "/user/owner"]);
  sessionStorage.setItem("lifespace:mobile-scroll-positions:v1", JSON.stringify({ "/archive/project": 320 }));
  assert.equal(navigation.getMobileSourceRoute("/user/owner", "/follow"), "/archive/project");
  navigation.prepareMobileSourceReturn("/user/owner", "/archive/project");
  assert.deepEqual(navigation.readMobileRouteHistory(), ["/discover", "/archive/project"]);
  assert.equal(JSON.parse(sessionStorage.getItem("lifespace:mobile-restore-scroll:v1")).scrollY, 320);
  assert.equal(navigation.getMobileSourceRoute("/archive/project", "/archive"), "/discover");
});

test("saved-guide status links into the matching collection without an unsave toggle", () => {
  const zh = load("lib/i18n/zh.ts").default;
  const SavedGuideStatus = createLoader({
    "@/lib/i18n/useLanguage": { useLanguage: () => ({ language: "zh", t: zh }) },
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
  })("components/plant-detail/SavedGuideStatus.tsx").default;
  for (const category of ["plant", "system", "insect_fish", "other"]) {
    const html = renderToStaticMarkup(React.createElement(SavedGuideStatus, { category }));
    assert.match(html, /已收藏/);
    assert.match(html, /打开我的收藏/);
    assert.ok(html.includes(`/archive/interests?section=${category}`));
    assert.doesNotMatch(html, /<button|取消收藏/);
  }
});

test("space group selectors show a single concise path, never repeated empty levels", () => {
  const zh = load("lib/i18n/zh.ts").default;
  const Taxonomy = createLoader({ "@/lib/i18n/useLanguage": { useLanguage: () => ({ language: "zh", t: zh }) } })("components/archive/MobileArchiveTaxonomyInline.tsx").default;
  const props = { category: "plant", subTags: [{ id: "first", name: "屋顶菜园", category: "plant" }], groupTags: [{ id: "second", name: "东边种植箱", sub_tag_id: "first" }], maxDepth: 3, onChangeCategory: () => {}, onChangeGroup: () => {} };
  const render = (extra) => renderToStaticMarkup(React.createElement(Taxonomy, { ...props, ...extra }));
  const empty = render({});
  assert.equal((empty.match(/>未分组</g) || []).length, 1);
  assert.doesNotMatch(empty, />一级分组<|>二级分组</);
  assert.match(render({ subTagId: "first" }), /屋顶菜园/);
  assert.doesNotMatch(render({ subTagId: "first" }), /未分组/);
  assert.match(render({ subTagId: "first", groupTagId: "second" }), /屋顶菜园 · 东边种植箱/);
  assert.doesNotMatch(render({ subTagId: "first", groupTagId: "second", maxDepth: 2 }), /东边种植箱/);
  assert.doesNotMatch(render({ maxDepth: 1 }), /未分组/);
  assert.match(empty, /white-space:normal/);
  assert.match(empty, /overflow-wrap:anywhere/);
  assert.doesNotMatch(empty, /overflow-x:auto|white-space:nowrap/);
  const cardStyles = source("components/project/ProjectSummaryCard.module.css");
  const classification = cardStyles.match(/\.classification\s*\{([^}]+)\}/)?.[1];
  const slot = cardStyles.match(/\.classificationSlot\s*\{([^}]+)\}/)?.[1];
  assert.ok(classification && slot);
  assert.doesNotMatch(classification + slot, /overflow[^:]*:\s*(?:auto|scroll|hidden)|white-space:\s*nowrap/);
});

test("food examples specify usable quantities, stages and distinct safety controls in both languages", () => {
  for (const language of ["zh", "en"]) {
    const ume = JSON.stringify(getPracticalGuideContent(entry("other", "梅子蜜"), language));
    const vinegar = JSON.stringify(getPracticalGuideContent(entry("other", "醋"), language));
    const dry = JSON.stringify(getPracticalGuideContent(entry("other", "干制"), language));
    assert.match(ume, /300\s?g/);
    assert.match(ume, language === "zh" ? /1：1/ : /1:1/);
    assert.match(ume, language === "zh" ? /冷藏/ : /refrigerat/i);
    assert.match(vinegar, /625\s?mL/);
    assert.match(vinegar, /27–29/);
    assert.match(vinegar, /5%/);
    for (const threshold of ["57–60", "63–68", "71.1", "74"]) assert.ok(dry.includes(threshold));
    assert.match(dry, language === "zh" ? /肉鱼虾不要.*露天晒/ : /Do not sun-dry meat or seafood/);
    assert.match(dry, language === "zh" ? /不保证杀菌或常温保质/ : /not sterilization or shelf stability/);
  }
});

test("non-plant details remove redundant preset, creation and guest prompts while keeping parent links", () => {
  const page = source("app/plant/guide/[id]/page.tsx");
  assert.doesNotMatch(page, /className=\{styles\.sourceLabel\}|className=\{styles\.bottomAction\}/);
  assert.match(page, /<Link href=\{fallbackHref\} className=\{styles\.categoryBadge\}/);
  assert.match(page, /<Link href=\{`\$\{fallbackHref\}&category=/);
  assert.match(page, /signedIn \? <span>\{copy\.membershipForFull\}<\/span> : null/);
  assert.equal(publicGuideCopyZh(), "登录／注册后查看基础概要");
  function publicGuideCopyZh() { return guideLibrary.publicGuideCopy.zh.registerForOverview; }
});

test("additional food examples give named recipes, measured quantities and explicit storage boundaries", () => {
  for (const language of ["zh", "en"]) {
    const jam = JSON.stringify(getPracticalGuideContent(entry("other", "果酱"), language));
    const pickle = JSON.stringify(getPracticalGuideContent(entry("other", "腌渍"), language));
    const juice = JSON.stringify(getPracticalGuideContent(entry("other", "果汁"), language));
    const rice = JSON.stringify(getPracticalGuideContent(entry("other", "米酒"), language));
    assert.match(jam, /230\s?g/);
    assert.match(jam, /5\s?mL/);
    assert.match(jam, language === "zh" ? /冷藏/ : /refrigerat/i);
    assert.match(pickle, /2\.27\s?kg/);
    assert.match(pickle, /21–24/);
    assert.match(pickle, language === "zh" ? /不直接加无盐水/ : /do not dilute with plain water/);
    assert.match(juice, /32/);
    assert.match(juice, language === "zh" ? /不等于杀菌/ : /not pasteurization/);
    assert.match(rice, /500\s?g/);
    assert.match(rice, language === "zh" ? /若酒曲标注8g配2kg米，则用2g/ : /use 2 g only when/);
    assert.match(rice, /24–36/);
    assert.match(rice, language === "zh" ? /甜酒酿也可能含酒精/ : /may contain alcohol/);
  }
});

test("incomplete stored water-temperature ranges are not silently replaced by a preset", () => {
  const { getAquaticTemperatureReference } = load("lib/aquatic-guide-temperature.ts");
  for (const filters of [{ temperature_min_c: 20 }, { temperature_max_c: 26 }, { temperature_min_c: null, temperature_max_c: 26 }]) {
    assert.equal(getAquaticTemperatureReference(entry("insect_fish", "水榕", { content_template: "aquatic_plant", content: { filters } })), null);
  }
});

test("settings headers use each page name in both languages instead of generic Me or Membership", () => {
  const tree = ts.createSourceFile("navbar.tsx", source("components/navbar.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const titleFunction = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "getMobilePageTitle");
  assert.ok(titleFunction);
  const compiled = ts.transpileModule(titleFunction.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const getTitle = new Function(`${compiled}; return getMobilePageTitle;`)();
  for (const language of ["zh", "en"]) {
    const copy = load(`lib/i18n/${language}.ts`).default;
    const expected = {
      "/profile": copy.profile.settings_title,
      "/profile/project-categories": copy.archive_workspace.group_settings_title,
      "/profile/recent": copy.profile.recent.title,
      "/membership/payment": copy.membership_page.payment_page_title,
      "/membership/benefits": copy.membership_page.benefits_rules_title,
      "/membership/refund": copy.refund_request_page.title,
      "/feedback": copy.feedback_and_contact,
    };
    for (const [path, title] of Object.entries(expected)) {
      assert.ok(title);
      assert.equal(getTitle(path, copy), title);
    }
  }
});

test("saved-status refresh is owner-scoped, ignores stale/errors and cleans up on unmount", async () => {
  for (const plant of [true, false]) {
    const pending = [];
    const reads = [];
    const values = [];
    const listeners = new Map();
    let cleanup;
    const browser = {
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name) => listeners.delete(name),
    };
    const supabase = {
      from: (table) => {
        const read = { table, filters: [] };
        reads.push(read);
        const query = {
          select: (column) => { read.column = column; return query; },
          eq: (column, value) => { read.filters.push([column, value]); return query; },
          maybeSingle: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
        };
        return query;
      },
    };
    const { useGuideInterestRefresh: mountRefreshEffect } = createLoader({
      react: { useEffect: (effect) => { cleanup = effect(); } },
      "@/lib/supabase": { supabase },
      "@/lib/guide-interests": { GUIDE_INTERESTS_CHANGED: "saved-guides-changed" },
    }, { window: browser })("lib/use-guide-interest-refresh.ts");
    mountRefreshEffect("member-1", "guide-1", plant, (value) => values.push(value));
    listeners.get("focus")();
    listeners.get("saved-guides-changed")();
    assert.equal(reads[0].table, plant ? "user_plant_interests" : "user_guide_interests");
    assert.deepEqual(reads[0].filters, [["user_id", "member-1"], [plant ? "species_id" : "guide_id", "guide-1"]]);
    pending[1].resolve({ data: null, error: null });
    await new Promise(setImmediate);
    pending[0].resolve({ data: { id: "older-saved-row" }, error: null });
    await new Promise(setImmediate);
    assert.deepEqual(values, [false]);
    listeners.get("pageshow")();
    pending[2].resolve({ data: null, error: { message: "temporarily unavailable" } });
    await new Promise(setImmediate);
    assert.deepEqual(values, [false]);
    listeners.get("focus")();
    pending[3].reject(new Error("network offline"));
    await new Promise(setImmediate);
    assert.deepEqual(values, [false]);
    listeners.get("focus")();
    cleanup();
    pending[4].resolve({ data: { id: "after-unmount" }, error: null });
    await new Promise(setImmediate);
    assert.equal(listeners.size, 0);
    assert.deepEqual(values, [false]);
  }
});
