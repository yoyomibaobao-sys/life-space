import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import React from "react";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const copy = new Proxy({}, { get: (_, key) => key === "archive"
  ? { categories: { fallback_label: "公开项目" }, experience_cards: "经验卡" }
  : key === "record" ? { open_image_preview: "查看图片", next_image: "下一张", previous_image: "上一张", close_preview: "关闭" }
    : key === "nav" ? { back: "返回" } : "文字" });

test("a visitor clicks a public record image, navigates two images, and closes the actual lightbox", async () => {
  const slots = new Map();
  let active = null;
  let cursor = 0;
  const effects = [];
  const hooks = {
    ...React,
    useState(initial) {
      const key = active;
      const cells = slots.get(key) || [];
      slots.set(key, cells);
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (value) => { cells[index] = typeof value === "function" ? value(cells[index]) : value; }];
    },
    useRef(initial) {
      const cells = slots.get(active) || [];
      slots.set(active, cells);
      const index = cursor++;
      if (!(index in cells)) cells[index] = { current: initial };
      return cells[index];
    },
    useEffect(effect) { if (active === "public") effects.push(effect); },
    useMemo(compute) { return compute(); },
  };
  function render(Component, props, key) {
    active = key; cursor = 0;
    const result = Component(props);
    active = null;
    return result;
  }
  const archive = { id: "project-1", title: "公开项目", category: "plant", is_public: true, system_name: "罗勒" };
  const media = [
    { id: "image-1", record_id: "record-1", url: "https://example.test/1.jpg", display_url: "https://example.test/1.jpg" },
    { id: "image-2", record_id: "record-1", url: "https://example.test/2.jpg", display_url: "https://example.test/2.jpg" },
  ];
  const records = [{ id: "record-1", record_time: "2026-10-01T00:00:00Z", visibility: "public", note: "两张公开图片" }];
  function table(name) {
    const q = {
      select() { return q; }, eq() { return q; }, in() { return Promise.resolve({ data: media, error: null }); },
      maybeSingle() { return Promise.resolve({ data: archive, error: null }); },
      order() { return Promise.resolve({ data: records, error: null }); },
    };
    assert.ok(["archives", "records", "media"].includes(name));
    return q;
  }
  const dummy = () => null;
  const stubs = {
    react: hooks,
    "@/components/archive-ui/ArchiveProjectDetailView": { __esModule: true, default: dummy },
    "@/components/archive-ui/ArchiveProjectDetailStatus": { __esModule: true, default: dummy, ArchiveProjectDetailLoading: dummy },
    "@/components/archive-detail/ArchiveRecordCardShell": { __esModule: true, default: dummy },
    "@/lib/supabase": { supabase: { from: table } },
    "@/lib/i18n/useLanguage": { useLanguage: () => ({ language: "zh", t: copy }) },
    "@/lib/media-urls": { attachMediaDisplayUrls: async (_client, rows) => rows },
    "@/lib/recent-browse": { saveRecentArchiveBrowse() {} },
    "@/lib/archive-categories": { getArchiveCategoryLabel: () => "种植" },
    "@/lib/archive-detail-utils": {
      buildMediaList: (rows) => (rows || []).map((row) => ({ url: row.display_url || row.url, alt: "公开图片" })),
      RECORD_TAG_OPTIONS: [], formatDateTime: () => "2026-10-01", getDayNumber: () => 1,
      smallActionButtonStyle: {}, getTouchDistance: () => 0,
    },
    "@/lib/archive-cycle-terminology": { getArchiveCycleTerminology: () => ({}) },
    "@/lib/date-time": { localDateTimeInputToIso: (value) => value, toLocalDateTimeInputValue: (value) => value },
    "@/lib/tag-labels": { getBehaviorTagLabel: () => "" },
    "@/components/StatusBarTheme": { APP_STATUS_BAR_DARK: "dark", APP_STATUS_BAR_LIGHT: "light", setAppStatusBarHidden() {}, setAppStatusBarTheme() {} },
  };
  const cache = new Map();
  function load(path) {
    let file = resolve(root, path);
    if (!existsSync(file)) file = [".ts", ".tsx"].map((suffix) => file + suffix).find(existsSync);
    assert.ok(file, path);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = (name) => {
      if (name in stubs) return stubs[name];
      if (name.endsWith(".module.css")) return { __esModule: true, default: {} };
      if (name.startsWith("@/")) {
        if (name === "@/components/archive-detail/ArchiveRecordCard") return load(name.slice(2));
        const noOp = new Proxy({ __esModule: true, default: dummy }, { get: (obj, property) => property in obj ? obj[property] : dummy });
        return noOp;
      }
      if (name.startsWith(".")) return load(resolve(dirname(file), name));
      return require(name);
    };
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", compiled)(localRequire, module, module.exports);
    return module.exports;
  }
  const PublicDetail = load("components/archive-ui/ReadonlyPublicProjectDetail.tsx").default;
  const Lightbox = load("components/archive-detail/ArchiveLightbox.tsx").default;
  const item = { archive_id: archive.id, archive_title: archive.title, system_name: archive.system_name };
  const initial = render(PublicDetail, { item, language: "zh", onBack() {} }, "public");
  assert.ok(initial);
  for (const effect of effects.splice(0)) effect();
  await new Promise((resolve) => setImmediate(resolve));
  const detail = render(PublicDetail, { item, language: "zh", onBack() {} }, "public");
  assert.equal(detail.props.records.length, 1);
  assert.equal(detail.props.mode, "viewer");
  const recordElement = detail.props.renderRecord(detail.props.records[0], 0);
  const recordTree = render(recordElement.type, recordElement.props, "record");
  function collect(node, match, output = []) {
    if (Array.isArray(node)) { node.forEach((child) => collect(child, match, output)); return output; }
    if (!node || typeof node !== "object") return output;
    if (match(node)) output.push(node);
    collect(node.props?.children, match, output);
    return output;
  }
  const mediaGrid = collect(recordTree, (node) => node.type?.name === "MobileRecordMediaGrid")[0];
  assert.ok(mediaGrid, "visitor uses the real ArchiveRecordCard media grid");
  const gridTree = render(mediaGrid.type, mediaGrid.props, "media-grid");
  const imageButtons = collect(gridTree, (node) => node.type === "button" && node.props["aria-label"] === "查看图片");
  assert.equal(imageButtons.length, 2);
  imageButtons[0].props.onClick({ stopPropagation() {} });

  let opened = render(PublicDetail, { item, language: "zh", onBack() {} }, "public");
  assert.ok(opened.props.lightbox, "ArchiveLightbox receives image state after a click");
  assert.equal(opened.props.lightbox.images.length, 2);
  assert.equal(opened.props.lightbox.index, 0);
  function renderedLightbox() {
    const present = render(PublicDetail, { item, language: "zh", onBack() {} }, "public");
    return render(Lightbox, { ...present.props.lightbox, isMobileViewport: false }, "lightbox");
  }
  const event = { stopPropagation() {}, preventDefault() {} };
  collect(renderedLightbox(), (node) => node.type === "button" && node.props["aria-label"] === "下一张")[0].props.onClick(event);
  assert.equal(render(PublicDetail, { item, language: "zh", onBack() {} }, "public").props.lightbox.index, 1);
  collect(renderedLightbox(), (node) => node.type === "button" && node.props["aria-label"] === "上一张")[0].props.onClick(event);
  assert.equal(render(PublicDetail, { item, language: "zh", onBack() {} }, "public").props.lightbox.index, 0);
  collect(renderedLightbox(), (node) => node.type === "button" && node.props["aria-label"] === "关闭")[0].props.onClick(event);
  assert.equal(render(PublicDetail, { item, language: "zh", onBack() {} }, "public").props.lightbox, null);
});
