import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { build } from "esbuild";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("full-screen record image shows header and bottom icon actions only when information is visible", () => {
  const lightbox = source("components/archive-detail/ArchiveLightbox.tsx");
  assert.match(lightbox, /mobileToolbarVisible \? "auto minmax\(0, 1fr\) auto"/);
  assert.match(lightbox, /<div>\{metaText\}<\/div>/);
  assert.match(lightbox, /\{dayText \? <div/);
  assert.match(lightbox, /\{index \+ 1\}\/\{images\.length\}/);
  assert.match(lightbox, /<UiIcon name="download" size=\{22\}/);
  assert.match(lightbox, /<UiIcon name="trash" size=\{21\}/);
  assert.match(lightbox, /<AppConfirmDialog open=\{trashConfirmOpen\}/);
  assert.doesNotMatch(lightbox, /publishHref|mobileMenuOpen|startHold|cancelHold|holdTriggered|imageActionOpen|分享图片|保存图片/);
  assert.doesNotMatch(source("lib/image-save.ts"), /shareViewedImage|navigator\.share/);
  assert.doesNotMatch(source("android/app/src/main/java/com/youshi/cultivation/ImageActionsPlugin.java"), /ACTION_SEND|public void share\(/);
});

test("record forwarding defaults every available image selected, while single-image trash keeps its media id", () => {
  const market = source("app/market/new/page.tsx");
  const cloud = source("components/archive-ui/CloudArchiveDetailController.tsx");
  assert.match(market, /setSelectedSourceMediaIds\(availableMedia\.map\(\(media\) => media\.id\)\)/);
  assert.match(market, /setDescription\(sourceRecord\.note\)/);
  assert.match(source("components/archive-detail/ArchiveRecordCard.tsx"), /recordId=\$\{item\.id\}/);
  assert.match(cloud, /dayText:.*getDayNumber\(/);
  assert.match(cloud, /requestCloudTrash\("media", image\.id\)/);
  assert.match(source("lib/i18n/zh.ts"), /delete_current_image: "移入回收站"/);
});

test("save fetches only the current accessible image bytes and refuses failed access", async () => {
  const calls = [];
  const result = await build({
    entryPoints: ["lib/image-save.ts"], bundle: true, write: false,
    platform: "node", format: "esm",
    plugins: [{ name: "native-image-stub", setup(ctx) {
      ctx.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: "capacitor", namespace: "image-test" }));
      ctx.onLoad({ filter: /.*/, namespace: "image-test" }, () => ({
        contents: `export const Capacitor = { isNativePlatform: () => true };
          export const registerPlugin = () => ({ save: async (value) => {
            globalThis.__imageCalls.push(value); return { cancelled: false };
          }});`, loader: "js",
      }));
    }}],
  });
  globalThis.__imageCalls = calls;
  const previousFetch = globalThis.fetch;
  const previousFile = globalThis.File;
  try {
    globalThis.File ||= class File extends Blob {
      constructor(parts, name, options) { super(parts, options); this.name = name; }
    };
    const api = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(api.saveViewedImage("https://private.example/expired", "photo"), /image_unavailable/);
    assert.equal(calls.length, 0);
    globalThis.fetch = async () => ({
      ok: true, headers: new Headers({ "content-length": "4" }),
      blob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
    });
    assert.equal(await api.saveViewedImage("blob:local-image", "qa-image"), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].mimeType, "image/png");
    assert.equal(calls[0].fileName, "LifeSpace-qa-image.png");
    assert.deepEqual([...Buffer.from(calls[0].data, "base64")], [137, 80, 78, 71]);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.File = previousFile;
    delete globalThis.__imageCalls;
  }
});
