import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

test("the Android create editor renders from its archive id without a Next router", async () => {
  const outfile = path.join("tests", ".tmp-android-editor-shell.mjs");
  try {
    await build({
      entryPoints: ["components/experience-card/ExperienceCardEditor.tsx"],
      bundle: true,
      outfile,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      external: ["react", "react/jsx-runtime", "react/jsx-dev-runtime"],
      plugins: [{
        name: "shell-editor-stubs",
        setup(ctx) {
          ctx.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "next-navigation", namespace: "stub" }));
          ctx.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link", namespace: "stub" }));
          ctx.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: "supabase", namespace: "stub" }));
          ctx.onLoad({ filter: /.*/, namespace: "stub" }, (args) => {
            if (args.path === "next-navigation") {
              return { contents: `export function useRouter() { throw new Error("expected app router to be mounted"); }
                export function useSearchParams() { throw new Error("expected app router to be mounted"); }`, loader: "js" };
            }
            if (args.path === "next-link") {
              return { contents: `export default function Link() { throw new Error("expected app router to be mounted"); }`, loader: "js" };
            }
            return { contents: `export const supabase = { auth: { getUser: async () => ({ data: { user: null } }) }, rpc: async () => ({ data: null }) };`, loader: "js" };
          });
        },
      }],
    });
    const module = await import(pathToFileURL(path.resolve(outfile)).href);
    const html = renderToStaticMarkup(React.createElement(module.default, {
      routerless: true,
      initialArchiveId: "project-1",
      onMissingUser() {},
      onOpenHref() {},
      onSaved() {},
    }));
    assert.match(html, /正在读取项目记录/);
    assert.doesNotMatch(html, /expected app router to be mounted/);
  } finally {
    fs.rmSync(outfile, { force: true });
  }
});

function installMiniDom() {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    localStorage: globalThis.localStorage,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const store = new Map([["lang", "zh"]]);
  const localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
  function styleObject() {
    const values = {};
    return new Proxy(values, {
      get(target, key) {
        if (key === "setProperty") return (name, value) => { target[name] = String(value); };
        if (key === "getPropertyValue") return (name) => target[name] || "";
        if (key === "removeProperty") return (name) => { const current = target[name] || ""; delete target[name]; return current; };
        return target[key] ?? "";
      },
      set(target, key, value) {
        target[key] = value == null ? "" : String(value);
        return true;
      },
    });
  }
  function linkChildren(node) {
    const kids = node.childNodes;
    node.firstChild = kids[0] || null;
    node.lastChild = kids[kids.length - 1] || null;
    kids.forEach((child, index) => {
      child.parentNode = node;
      child.previousSibling = kids[index - 1] || null;
      child.nextSibling = kids[index + 1] || null;
    });
  }
  function createNode(nodeType, name) {
    const listeners = new Map();
    const node = {
      nodeType,
      nodeName: name,
      tagName: name,
      ownerDocument: null,
      parentNode: null,
      childNodes: [],
      firstChild: null,
      lastChild: null,
      nextSibling: null,
      previousSibling: null,
      style: styleObject(),
      attributes: new Map(),
      className: "",
      id: "",
      text: "",
      value: "",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      setAttribute(attr, value) { this.attributes.set(attr, String(value)); if (attr === "class") this.className = String(value); if (attr === "id") this.id = String(value); },
      getAttribute(attr) { return this.attributes.has(attr) ? this.attributes.get(attr) : null; },
      removeAttribute(attr) { this.attributes.delete(attr); },
      hasAttribute(attr) { return this.attributes.has(attr); },
      appendChild(child) { this.childNodes.push(child); linkChildren(this); return child; },
      insertBefore(child, before) {
        const index = before ? this.childNodes.indexOf(before) : this.childNodes.length;
        this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
        linkChildren(this);
        return child;
      },
      removeChild(child) {
        const index = this.childNodes.indexOf(child);
        if (index >= 0) this.childNodes.splice(index, 1);
        child.parentNode = null;
        linkChildren(this);
        return child;
      },
      addEventListener(type, listener, options) {
        const capture = options === true || options?.capture === true;
        const key = `${type}:${capture ? "capture" : "bubble"}`;
        const list = listeners.get(key) || [];
        list.push(listener);
        listeners.set(key, list);
      },
      removeEventListener(type, listener, options) {
        const capture = options === true || options?.capture === true;
        const key = `${type}:${capture ? "capture" : "bubble"}`;
        listeners.set(key, (listeners.get(key) || []).filter((item) => item !== listener));
      },
      dispatchEvent(event) {
        const path = [];
        let current = this;
        while (current) { path.push(current); current = current.parentNode; }
        for (const target of [...path].reverse()) {
          for (const listener of target._listeners?.get(`${event.type}:capture`) || []) listener.call(target, event);
        }
        for (const target of path) {
          event.currentTarget = target;
          for (const listener of target._listeners?.get(`${event.type}:bubble`) || []) listener.call(target, event);
          if (event._stopped) break;
        }
        return true;
      },
      click() {
        const event = {
          type: "click",
          target: this,
          bubbles: true,
          cancelable: true,
          defaultPrevented: false,
          button: 0,
          buttons: 0,
          clientX: 0,
          clientY: 0,
          pageX: 0,
          pageY: 0,
          screenX: 0,
          screenY: 0,
          timeStamp: Date.now(),
          altKey: false,
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          eventPhase: 3,
          preventDefault() { this.defaultPrevented = true; },
          stopPropagation() { this._stopped = true; },
          isPropagationStopped() { return Boolean(this._stopped); },
        };
        event.nativeEvent = event;
        this.dispatchEvent(event);
      },
      focus() {},
      blur() {},
      scrollIntoView() {},
      getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return {}; } }; },
      contains(other) {
        let current = other;
        while (current) { if (current === this) return true; current = current.parentNode; }
        return false;
      },
    };
    Object.defineProperty(node, "textContent", {
      get() {
        if (this.nodeType === 3) return this.nodeValue || "";
        return this.childNodes.map((child) => child.textContent || "").join("");
      },
      set(value) {
        if (this.nodeType === 3) { this.nodeValue = String(value ?? ""); return; }
        this.childNodes = [];
        if (value != null && value !== "") this.appendChild(createNode(3, "#text"));
        if (this.lastChild) this.lastChild.nodeValue = String(value ?? "");
        linkChildren(this);
      },
    });
    node._listeners = listeners;
    return node;
  }
  const document = createNode(9, "#document");
  document.ownerDocument = document;
  document.documentElement = createNode(1, "HTML");
  document.head = createNode(1, "HEAD");
  document.body = createNode(1, "BODY");
  document.documentElement.ownerDocument = document;
  document.head.ownerDocument = document;
  document.body.ownerDocument = document;
  document.appendChild(document.documentElement);
  document.documentElement.appendChild(document.head);
  document.documentElement.appendChild(document.body);
  document.createElement = (name) => {
    const element = createNode(1, String(name).toUpperCase());
    element.ownerDocument = document;
    return element;
  };
  document.createElementNS = (_namespace, name) => document.createElement(name);
  document.createTextNode = (text) => {
    const node = createNode(3, "#text");
    node.nodeValue = String(text ?? "");
    node.ownerDocument = document;
    return node;
  };
  document.createComment = (text) => {
    const node = createNode(8, "#comment");
    node.nodeValue = String(text ?? "");
    node.ownerDocument = document;
    return node;
  };
  document.createDocumentFragment = () => createNode(11, "#fragment");
  document.visibilityState = "visible";
  document.hasFocus = () => true;
  document.elementFromPoint = () => null;
  const windowListeners = new Map();
  const windowObject = {
    document,
    localStorage,
    navigator: { language: "zh-CN", clipboard: { writeText: async () => {} }, share: undefined },
    location: { hash: "", pathname: "/experience-cards/card-1", search: "", origin: "https://life-space.local", href: "https://life-space.local/experience-cards/card-1" },
    addEventListener(type, listener) {
      const list = windowListeners.get(type) || [];
      list.push(listener);
      windowListeners.set(type, list);
    },
    removeEventListener(type, listener) {
      windowListeners.set(type, (windowListeners.get(type) || []).filter((item) => item !== listener));
    },
    dispatchEvent(event) {
      for (const listener of windowListeners.get(event.type) || []) listener(event);
      return true;
    },
    getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    confirm: () => true,
    scrollTo() {},
    getComputedStyle: () => styleObject(),
    HTMLElement: function HTMLElement() {},
    HTMLIFrameElement: function HTMLIFrameElement() {},
    Element: function Element() {},
    Node: function Node() {},
    SVGElement: function SVGElement() {},
  };
  document.activeElement = document.body;
  document.defaultView = windowObject;
  globalThis.window = windowObject;
  globalThis.document = document;
  globalThis.localStorage = localStorage;
  globalThis.requestAnimationFrame = windowObject.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowObject.cancelAnimationFrame;
  return {
    document,
    uninstall() {
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.localStorage = previous.localStorage;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
      globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    },
  };
}

function findButton(node, text) {
  if (String(node.nodeName).toUpperCase() === "BUTTON" && String(node.textContent).includes(text)) return node;
  for (const child of node.childNodes || []) {
    const found = findButton(child, text);
    if (found) return found;
  }
  return null;
}

test("the Android author detail expands its editor without a Next router", async () => {
  const outfile = path.join("tests", ".tmp-android-author-editor.mjs");
  const dom = installMiniDom();
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let root;
  try {
    const card = {
      id: "card-1",
      user_id: "user-1",
      archive_id: "project-1",
      title: "阳台番茄",
      description: "",
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      cover_media_id: null,
      source_record_count: 0,
      playback_media_ids: null,
    };
    const archive = {
      id: "project-1",
      user_id: "user-1",
      title: "阳台番茄",
      category: "plant",
      species_id: null,
      system_name: "",
      species_name_snapshot: "",
      is_public: false,
      default_record_visibility: "private",
    };
    await build({
      entryPoints: ["author-editor-entry"],
      bundle: true,
      outfile,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      external: ["react", "react/jsx-runtime", "react/jsx-dev-runtime"],
      plugins: [{
        name: "author-editor-stubs",
        setup(ctx) {
          ctx.onResolve({ filter: /^author-editor-entry$/ }, () => ({ path: "author-editor-entry", namespace: "author-entry" }));
          ctx.onLoad({ filter: /.*/, namespace: "author-entry" }, () => ({
            contents: `export { ExperienceCardContent } from "./app/experience-cards/[id]/page.tsx";
              export { InternalNavigationProvider } from "./components/navigation/InternalLink.tsx";`,
            loader: "js",
            resolveDir: process.cwd(),
          }));
          ctx.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "next-navigation", namespace: "author-stub" }));
          ctx.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link", namespace: "author-stub" }));
          ctx.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: "supabase", namespace: "author-stub" }));
          ctx.onResolve({ filter: /^@\/components\/experience-card\/ExperienceCardVideoPanel$/ }, () => ({ path: "video", namespace: "author-stub" }));
          ctx.onResolve({ filter: /^@\/components\/experience-card\/ExperienceCardInteractions$/ }, () => ({ path: "interactions", namespace: "author-stub" }));
          ctx.onResolve({ filter: /^@\/components\/experience-card\/ExperienceCardTimeline$/ }, () => ({ path: "timeline", namespace: "author-stub" }));
          ctx.onResolve({ filter: /^@\/components\/AndroidAppDownloadPrompt$/ }, () => ({ path: "download", namespace: "author-stub" }));
          ctx.onResolve({ filter: /\.css$/ }, () => ({ path: "css", namespace: "author-stub" }));
          ctx.onLoad({ filter: /.*/, namespace: "author-stub" }, (args) => {
            if (args.path === "next-navigation") {
              return { contents: `export function useRouter() { throw new Error("expected app router to be mounted"); }
                export function useSearchParams() { throw new Error("expected app router to be mounted"); }
                export function usePathname() { throw new Error("expected app router to be mounted"); }`, loader: "js" };
            }
            if (args.path === "next-link") {
              return { contents: `export default function Link() { throw new Error("expected app router to be mounted"); }`, loader: "js" };
            }
            if (args.path === "supabase") {
              return { contents: `const card = ${JSON.stringify(card)};
                const archive = ${JSON.stringify(archive)};
                function builder(table) {
                  const payload = table === "experience_cards" ? { data: card, error: null }
                    : table === "archives" ? { data: archive, error: null }
                    : table === "public_profiles" ? { data: { id: "user-1", username: "ying", avatar_url: null, account_number: "LSa2026001" }, error: null }
                    : { data: [], error: null };
                  const chain = {
                    select() { return chain; }, eq() { return chain; }, in() { return chain; },
                    is() { return chain; }, order() { return chain; }, limit() { return chain; },
                    maybeSingle: async () => payload,
                    then(resolve, reject) { return Promise.resolve(payload).then(resolve, reject); },
                  };
                  return chain;
                }
                export const supabase = {
                  auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
                  from: builder,
                  rpc: async (name) => name === "get_my_membership"
                    ? { data: { can_create_content: true }, error: null }
                    : { data: false, error: null },
                };`, loader: "js" };
            }
            if (args.path === "video") {
              return { contents: `import { forwardRef } from "react"; export default forwardRef(function Panel() { return null; });`, loader: "js" };
            }
            if (args.path === "css") return { contents: `export default new Proxy({}, { get: () => "" });`, loader: "js" };
            return { contents: `export default function Stub() { return null; }`, loader: "js" };
          });
        },
      }],
    });
    const page = await import(`${pathToFileURL(path.resolve(outfile)).href}?author=1`);
    const { InternalNavigationProvider } = page;
    const container = dom.document.createElement("div");
    dom.document.body.appendChild(container);
    let renderError = null;
    root = createRoot(container, {
      onUncaughtError(error) { renderError = error; },
      onCaughtError(error) { renderError = error; },
    });
    await act(async () => {
      root.render(React.createElement(InternalNavigationProvider, {
        onNavigate: () => true,
        children: React.createElement(page.ExperienceCardContent, {
          id: "card-1",
          routerless: true,
          onBack() {},
          onMissingUser() {},
          onOpenHref() {},
        }),
      }));
    });
    let editButton = null;
    for (let attempt = 0; attempt < 20 && !editButton; attempt += 1) {
      editButton = findButton(container, "编辑经验卡");
      if (!editButton) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    }
    assert.ok(editButton, container.textContent);
    await act(async () => { editButton.click(); });
    let opened = false;
    for (let attempt = 0; attempt < 20 && !opened; attempt += 1) {
      opened = String(container.textContent).includes("全部记录") && String(container.textContent).includes("保存修改");
      if (!opened) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    }
    assert.equal(renderError, null);
    assert.match(container.textContent, /全部记录/);
    assert.match(container.textContent, /保存修改/);
    assert.doesNotMatch(container.textContent, /expected app router to be mounted/);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      root.unmount();
    });
    root = null;
  } finally {
    if (root) {
      try { root.unmount(); } catch { /* already unmounted */ }
    }
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
    dom.uninstall();
    fs.rmSync(outfile, { force: true });
  }
});
