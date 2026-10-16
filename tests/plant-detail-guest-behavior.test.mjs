import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const plantId = "00000000-0000-4000-8000-000000000001";

test("a visitor sees the plant basic overview while Android auth never resolves", async () => {
  const states = [];
  const effects = [];
  let slot = 0;
  const react = {
    ...React,
    useState(initial) {
      const index = slot++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useMemo: (compute) => compute(),
    useEffect: (effect) => { effects.push(effect); },
  };
  const row = {
    id: plantId, slug: "basil", common_name: "罗勒", scientific_name: "Ocimum basilicum",
    is_active: true, aliases: [], translations: [], summary_zh: "先从少量罗勒开始观察。", summary_en: "Start with a little basil.",
  };
  const calls = [];
  const supabase = {
    rpc(name) {
      calls.push(name);
      if (name === "get_public_plant_catalog") return Promise.resolve({ data: [row], error: null });
      throw Error(`unexpected RPC before auth: ${name}`);
    },
    auth: { getUser: () => new Promise(() => {}) },
    from() { throw Error("public plant reading should not need a direct table query"); },
  };
  const noop = () => null;
  const copy = new Proxy({ default_title: "植物", growth_types: {}, categories: {}, subcategories: {} }, {
    get: (target, key) => key in target ? target[key] : "文字",
  });
  const stubs = {
    react,
    "@/lib/supabase": { supabase },
    "@/lib/i18n/useLanguage": { useLanguage: () => ({ language: "zh", t: { nav: { back: "返回" }, archive: { categories: { plant_label: "植物" } }, plant: { detail: copy, categories: {}, subcategories: {} } } }) },
    "@/lib/use-guide-interest-refresh": { useGuideInterestRefresh() {} },
    "@/lib/plant-guide-compat": { loadPublicPlantCatalogDetail: () => supabase.rpc("get_public_plant_catalog") },
    "@/lib/offline-guide-directory": { getOfflineGuideOverview: () => "" },
    "@/lib/plant-env": { getEnvironmentDetailItems: () => [], getEnvironmentTags: () => [] },
    "@/lib/plant-shared": { getPlantGrowthTypeLabel: () => "" },
    "@/lib/supabase-schema-compat": { isMissingDatabaseFunction: () => false },
  };
  const source = readFileSync(new URL("../app/plant/[id]/page.tsx", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { fileName: "page.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  function localRequire(name) {
    if (name in stubs) return stubs[name];
    if (name.endsWith(".module.css")) return { __esModule: true, default: {} };
    if (name.startsWith("@/") || name === "next/navigation") {
      return new Proxy({ __esModule: true, default: noop }, { get: (obj, key) => key in obj ? obj[key] : noop });
    }
    return require(name);
  }
  new Function("require", "module", "exports", js)(localRequire, module, module.exports);
  const PlantDetailContent = module.exports.PlantDetailContent;
  const props = { id: plantId };
  slot = 0;
  PlantDetailContent(props);
  assert.equal(effects.length, 1);
  effects[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["get_public_plant_catalog"]);
  assert.equal(states[3], "先从少量罗勒开始观察。");
  assert.equal(states[17], false);
  assert.equal(states[0].common_name, "罗勒");
  slot = 0;
  const rendered = PlantDetailContent(props);
  function collectText(node, found = []) {
    if (typeof node === "string") found.push(node);
    else if (Array.isArray(node)) node.forEach((part) => collectText(part, found));
    else if (node?.props) {
      if (typeof node.props.text === "string") found.push(node.props.text);
      collectText(node.props.children, found);
    }
    return found;
  }
  assert.match(collectText(rendered).join(" "), /先从少量罗勒开始观察/);
});
