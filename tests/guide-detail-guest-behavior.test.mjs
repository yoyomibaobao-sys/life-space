import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const guideId = "00000000-0000-4000-8000-000000000077";

test("a guest can render an ordinary guide's basic detail while Android auth lookup is stalled", async () => {
  const state = [];
  const effects = [];
  let slot = 0;
  const react = {
    ...React,
    useState(initial) {
      const index = slot++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useMemo: (compute) => compute(),
    useEffect: (effect) => { effects.push(effect); },
  };
  const row = { id: guideId, category: "system", source: "preset", name: "堆肥",
    summary: "把材料分层放入堆肥箱，先观察湿度和气味。", is_active: true };
  const rpcCalls = [];
  const supabase = {
    rpc(name) {
      rpcCalls.push(name);
      if (name === "get_public_guide_catalog") return { maybeSingle: async () => ({ data: row, error: null }) };
      throw Error(`unexpected RPC: ${name}`);
    },
    auth: { getUser: () => new Promise(() => {}) },
    from() { throw Error("the public detail should not directly SELECT guide_entries"); },
  };
  const guideHelpers = {
    publicGuideCopy: { zh: { publicLibrary: "指引", overviewPractice: "概要与实操",
      experienceCards: "经验卡", relatedProjects: "关联项目", newProject: "新建项目",
      membershipForFull: "Plus 云端用户可见" } },
    getPublicGuideName: (entry) => entry.name,
    getPublicGuideSummary: (entry) => entry.summary,
    getPublicGuideSectionName: () => "",
  };
  const blank = () => null;
  const stubs = {
    react,
    "@/lib/supabase": { supabase },
    "@/lib/public-guide-library": guideHelpers,
    "@/lib/i18n/useLanguage": { useLanguage: () => ({ language: "zh", t: { nav: { back: "返回" }, archive: {}, loading: "读取中" } }) },
    "@/lib/use-guide-interest-refresh": { useGuideInterestRefresh() {} },
    "@/lib/offline-guide-directory": { getOfflineGuideName: () => "", getOfflineGuideOverview: () => "", getOfflineGuideParameters: () => [] },
    "@/lib/archive-categories": { getArchiveCategoryIcon: () => "leaf", getArchiveCategoryLabel: () => "农设" },
    "@/lib/auth-return": { buildLoginHref: (href) => href },
    "@/lib/supabase-schema-compat": { isMissingDatabaseFunction: () => false },
    "@/components/Toast": { showToast() {} },
  };
  const src = readFileSync(new URL("../components/plant-detail/GuideDetailView.tsx", import.meta.url), "utf8");
  const js = ts.transpileModule(src, { fileName: "GuideDetailView.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (name in stubs) return stubs[name];
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith("@/")) return new Proxy({ __esModule: true, default: blank }, { get: (obj, key) => key in obj ? obj[key] : blank });
    return require(name);
  };
  new Function("require", "module", "exports", js)(localRequire, module, module.exports);
  const GuideDetailView = module.exports.default;
  const props = { id: guideId };
  slot = 0;
  GuideDetailView(props);
  assert.equal(effects.length, 1);
  effects[0]();
  await new Promise((resolve) => setImmediate(resolve));
  slot = 0;
  const rendered = GuideDetailView(props);
  function texts(node, found = []) {
    if (typeof node === "string") found.push(node);
    else if (Array.isArray(node)) node.forEach((part) => texts(part, found));
    else if (node?.props) texts(node.props.children, found);
    return found;
  }
  const viewText = texts(rendered).join(" ");
  assert.match(viewText, /把材料分层放入堆肥箱/);
  assert.doesNotMatch(viewText, /完整栽培秘密/);
  assert.deepEqual(rpcCalls, ["get_public_guide_catalog"]);
});
