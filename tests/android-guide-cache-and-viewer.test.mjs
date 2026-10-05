import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");

test("unchanged guide data cannot retrigger the Android directory reload loop", async () => {
  const bundle = await build({
    entryPoints: [path.join(root, "lib/offline-guide-directory.ts")],
    absWorkingDir: root,
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    alias: { "@": root },
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const values = new Map();
  const events = [];
  const previousStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  try {
    const guide = { id: "guide-1", category: "other", source: "public_guide", label: "果酱", overviewZh: "果实与糖的概要" };
    module.rememberGuideDirectory([guide]);
    module.rememberGuideDirectory([guide]);
    assert.deepEqual(events, ["lifespace-guide-directory-updated"]);
    module.rememberGuideDirectory([{ ...guide, overviewZh: "更新后的概要" }]);
    assert.equal(events.length, 2);
    assert.equal(module.findOfflineGuideEntry(module.loadOfflineGuideDirectory(), "guide-1")?.overviewZh, "更新后的概要");
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.window = previousWindow;
  }
});

test("public viewer uses the shared record card lightbox without owner controls", async () => {
  const source = await readFile(path.join(root, "components/archive-ui/ReadonlyPublicProjectDetail.tsx"), "utf8");
  assert.match(source, /<ArchiveRecordCard[\s\S]*?mode="viewer"[\s\S]*?onOpenLightbox=/);
  assert.match(source, /lightbox=\{lightbox \?/);
  assert.doesNotMatch(source, /<img key=\{image\.id\}/);
});
