import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("new local and cloud record photos share the 1800px quality-82 standard", async () => {
  const [
    compression,
    localDb,
    addRecord,
    archiveDetail,
  ] = await Promise.all([
    source("lib/image-compression.ts"),
    source("lib/local-offline-db.ts"),
    source("app/archive/[id]/AddRecord.tsx"),
    source("app/archive/[id]/page.tsx"),
  ]);

  assert.match(compression, /RECORD_PHOTO_MAX_EDGE = 1800/);
  assert.match(compression, /RECORD_PHOTO_QUALITY = 0\.82/);
  assert.match(
    compression,
    /standardizeRecordPhotoFile[\s\S]*maxWidthOrHeight: RECORD_PHOTO_MAX_EDGE[\s\S]*quality: RECORD_PHOTO_QUALITY/,
  );

  for (const file of [localDb, addRecord, archiveDetail]) {
    assert.match(file, /standardizeRecordPhotoFile/);
  }

  assert.doesNotMatch(localDb, /MAX_LOCAL_IMAGE_EDGE = 1600/);
});

test("local-to-cloud transfer reuses the existing app standard without recompression", async () => {
  const sync = await source("lib/local-to-cloud-sync.ts");

  assert.doesNotMatch(sync, /compressImageFile/);
  assert.match(sync, /const uploadFile = originalFile/);
  assert.match(sync, /width: params\.image\.width \?\? null/);
  assert.match(sync, /height: params\.image\.height \?\? null/);
});

test("the web UI states the standard and does not promise automatic system-album writes", async () => {
  const [cloudComposer, localComposer, rules] = await Promise.all([
    source("app/archive/[id]/AddRecord.tsx"),
    source("app/local/archive/[id]/page.tsx"),
    source("AGENTS.md"),
  ]);

  for (const composer of [cloudComposer, localComposer]) {
    assert.match(composer, /1800px/);
    assert.match(composer, /质量 82%/);
    assert.match(composer, /小图不放大/);
  }

  assert.match(rules, /同时保存原图到系统相册/);
  assert.match(rules, /默认关闭/);
  assert.match(rules, /网页 \/ PWA 不能可靠控制系统相册/);
});
