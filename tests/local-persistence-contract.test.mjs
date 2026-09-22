import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

function functionBody(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

test("new local projects commit to IndexedDB before returning", () => {
  const db = read("lib/local-offline-db.ts");
  const createArchive = functionBody(
    db,
    "export async function createLocalArchive(",
    "export async function getLocalArchiveDetail("
  );

  assert.match(createArchive, /db\.transaction\(ARCHIVE_STORE, "readwrite"\)/);
  assert.match(createArchive, /objectStore\(ARCHIVE_STORE\)\.add\(archive\)/);
  assert.match(createArchive, /await done;/);
  assert.match(createArchive, /finally \{[\s\S]*?db\.close\(\)/);
});

test("new local records, photos and project metadata commit atomically", () => {
  const db = read("lib/local-offline-db.ts");
  const createRecord = functionBody(
    db,
    "export async function createLocalRecord(",
    "export async function deleteLocalRecord("
  );

  assert.match(
    createRecord,
    /db\.transaction\([\s\S]*?ARCHIVE_STORE,[\s\S]*?RECORD_STORE,[\s\S]*?IMAGE_STORE[\s\S]*?"readwrite"/
  );
  assert.match(createRecord, /recordStore\.add\(record\)/);
  assert.match(createRecord, /imageStore\.add\(image\)/);
  assert.match(createRecord, /archiveStore\.put\(normalizedArchive\)/);
  assert.match(createRecord, /transaction\.abort\(\)/);
  assert.match(createRecord, /await done;/);
  assert.match(createRecord, /finally \{[\s\S]*?db\.close\(\)/);
});

test("Android update copy promises only same-signature overwrite retention", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const zh = read("lib/i18n/zh.ts");
  const legal = read("lib/legal-content.ts");
  const rules = read("AGENTS.md");

  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(zh, /使用同一正式签名更新时，已有本地项目、记录和照片缓存会继续保留/);
  assert.match(legal, /卸载、清理浏览器数据或更换设备可能(?:造成|导致)丢失/);
  assert.match(rules, /构建成功不能替代真机覆盖安装验证/);
});
