import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const speciesId = "00000000-0000-4000-8000-000000000001";
const row = {
  id: speciesId, slug: "camellia", common_name: "山茶花", is_active: true,
  aliases: [{ species_id: speciesId, alias_name: "茶花", relation_type: "exact" }],
  translations: [], summary_zh: "山茶花的可信基础概要", summary_en: "Basic camellia overview",
};

function loadTypeScript(file, stubs) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { fileName: file, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  const noop = () => null;
  new Function("require", "module", "exports", js)((name) => {
    if (name in stubs) return stubs[name];
    if (name.endsWith(".module.css")) return { __esModule: true, default: {} };
    if (name.startsWith("@/") || name === "next/navigation") {
      return new Proxy({ __esModule: true, default: noop }, {
        get: (target, key) => key in target ? target[key] : noop,
      });
    }
    return require(name);
  }, module, module.exports);
  return module.exports;
}

function fixture(status, catalogRows = [row]) {
  const calls = [];
  const states = [];
  const effects = [];
  let slot = 0;
  const react = {
    ...React,
    useState(initial) {
      const index = slot++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
      }];
    },
    useMemo: (compute) => compute(),
    useEffect: (effect) => { effects.push(effect); },
  };
  const supabase = {
    rpc(name, args) {
      calls.push({ kind: "rpc", name, args });
      if (name === "get_public_plant_catalog") return Promise.resolve({
        data: args.p_lookup ? [] : catalogRows, error: null,
      });
      if (name === "get_my_membership") return Promise.resolve({
        data: [{ status, can_create_content: false }], error: null,
      });
      throw Error(`unexpected RPC: ${name}`);
    },
    auth: { getUser: async () => ({ data: { user: status === "guest" ? null : { id: "test-user" } } }) },
    from(name) {
      const filters = [];
      const query = {
        select() { return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        or() { return query; }, order() { return query; }, limit() { return query; },
        maybeSingle() {
          calls.push({ kind: "table", name, filters });
          if (["plant_parameters", "plant_growth_cycle", "plant_care_guides"].includes(name)) {
            assert.equal(filters[0][1], speciesId, `member ${name} must use a species UUID`);
          }
          return Promise.resolve({ data: name === "plant_parameters" ? { sun_score: 8 }
            : name === "plant_growth_cycle" ? { species_id: speciesId, germination_days: 14 }
            : name === "plant_care_guides" ? { planting_guide: "完整养护" } : null, error: null });
        },
        then(resolve) {
          calls.push({ kind: "table", name, filters });
          return Promise.resolve({ data: [] }).then(resolve);
        },
      };
      return query;
    },
  };
  const directory = loadTypeScript("lib/guide-directory-search.ts", {
    "./archive-categories": { getArchiveCategoryLabel: () => "" },
  });
  const compat = loadTypeScript("lib/plant-guide-compat.ts", {
    "@/lib/supabase": { supabase },
    "@/lib/guide-directory-search": directory,
    "@/lib/supabase-schema-compat": { isMissingDatabaseFunction: () => false },
  });
  const copy = new Proxy({ default_title: "植物", growth_types: {}, categories: {}, subcategories: {} }, {
    get: (target, key) => key in target ? target[key] : "文字",
  });
  const page = loadTypeScript("app/plant/[id]/page.tsx", {
    react,
    "@/lib/supabase": { supabase },
    "@/lib/plant-guide-compat": compat,
    "@/lib/membership": {
      normalizeMembershipRpcResult: (data) => data?.[0] || null,
      canAccessMembershipGuidance: (membership) => ["active", "trialing"].includes(membership?.status),
    },
    "@/lib/i18n/useLanguage": { useLanguage: () => ({ language: "zh", t: {
      nav: { back: "返回" }, archive: { categories: { plant_label: "植物" } },
      plant: { detail: copy, categories: {}, subcategories: {} },
    } }) },
    "@/lib/use-guide-interest-refresh": { useGuideInterestRefresh() {} },
    "@/lib/offline-guide-directory": { getOfflineGuideOverview: () => "" },
    "@/lib/plant-env": { getEnvironmentDetailItems: () => [], getEnvironmentTags: () => [] },
    "@/lib/plant-shared": { getPlantGrowthTypeLabel: () => "" },
    "@/lib/media-urls": { resolveMediaDisplayPairs: async () => [] },
    "@/lib/supabase-schema-compat": { isMissingDatabaseFunction: () => false },
  });
  return { compat, calls, states, effects, render: () => {
    slot = 0;
    return page.PlantDetailContent({ id: "茶花" });
  } };
}

for (const [status, shouldBeFull] of [
  ["guest", false], ["expired", false], ["trialing", true], ["active", true],
]) {
  test(`${status} alias detail resolves the public summary and ${shouldBeFull ? "full member" : "basic"} content`, async () => {
    const scenario = fixture(status);
    scenario.render();
    assert.equal(scenario.effects.length, 1);
    scenario.effects[0]();
    for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(scenario.states[0].id, speciesId);
    assert.equal(scenario.states[3], row.summary_zh);
    assert.equal(scenario.states[13], shouldBeFull);
    const memberTables = scenario.calls.filter((call) => call.kind === "table"
      && ["plant_parameters", "plant_growth_cycle", "plant_care_guides"].includes(call.name));
    assert.deepEqual(memberTables.map((call) => call.name).sort(), shouldBeFull
      ? ["plant_parameters", "plant_growth_cycle", "plant_care_guides"].sort() : []);
    if (shouldBeFull) {
      assert.equal(scenario.states[4]?.sun_score, 8);
      assert.equal(scenario.states[5]?.germination_days, 14);
      assert.equal(scenario.states[6]?.planting_guide, "完整养护");
    }
  });
}

test("unknown names cannot resolve to an unrelated plant", async () => {
  const scenario = fixture("guest");
  assert.deepEqual((await scenario.compat.loadPublicPlantCatalogDetail("未知")).data, []);
  assert.deepEqual(scenario.calls.filter((call) => call.kind === "rpc").map((call) => call.args.p_lookup),
    ["未知", null]);
});

test("a duplicate exact alias cannot choose a species arbitrarily", async () => {
  const other = { ...row, id: "00000000-0000-4000-8000-000000000002" };
  const scenario = fixture("guest", [row, other]);
  assert.deepEqual((await scenario.compat.loadPublicPlantCatalogDetail("茶花")).data, []);
});

for (const [alias, canonical] of [["毛豆", "大豆"], ["萝卜", "白萝卜"]]) {
  test(`${alias} resolves to the active ${canonical} overview`, async () => {
    const plant = { ...row, common_name: canonical, summary_zh: `${canonical}简化概要`,
      aliases: [{ species_id: speciesId, alias_name: alias, relation_type: "exact" }] };
    const scenario = fixture("guest", [plant]);
    const result = await scenario.compat.loadPublicPlantCatalogDetail(alias);
    assert.equal(result.data[0].id, speciesId);
    assert.equal(result.data[0].summary_zh, plant.summary_zh);
  });
}
