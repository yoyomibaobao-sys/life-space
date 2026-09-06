import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("Android packages a same-origin standalone local project surface", () => {
  const config = read("capacitor.config.ts");
  const packageJson = read("package.json");
  const source = read("mobile-offline-src/main.tsx");
  const generated = read("mobile-shell/offline.html");

  assert.match(config, /url: serverUrl\.origin/);
  assert.match(config, /hostname: serverUrl\.hostname/);
  assert.match(packageJson, /"android:sync": "npm run android:offline && cap sync android"/);
  assert.match(source, /listVisibleLocalArchiveSummaries/);
  assert.match(source, /createLocalArchive/);
  assert.match(source, /createLocalRecord/);
  assert.match(source, /updateLocalArchiveFields/);
  assert.match(source, /updateLocalRecordFields/);
  assert.match(source, /deleteLocalArchive/);
  assert.match(source, /deleteLocalRecord/);
  assert.match(source, /accept="image\/\*"/);
  assert.doesNotMatch(source, /capture=/);
  assert.match(generated, /life-space-local-offline/);
  assert.match(generated, /本地离线模式/);
  assert.doesNotMatch(generated, /<script[^>]+src=/i);
  assert.doesNotMatch(generated, /<link[^>]+stylesheet/i);
});

test("signed RC local data migrates on-device before the old origin is retired", () => {
  const migration = read("lib/local-origin-migration.ts");
  const nextConfig = read("next.config.ts");
  const db = read("lib/local-offline-db.ts");
  const nativeClient = read(
    "android/app/src/main/java/com/youshi/cultivation/LifeSpaceWebViewClient.java",
  );
  const activity = read(
    "android/app/src/main/java/com/youshi/cultivation/MainActivity.java",
  );
  const bridge = read("mobile-shell/legacy-local-bridge.html");

  assert.match(migration, /life-space-canary\.yoyomibaobao\.workers\.dev/);
  assert.match(nextConfig, /frame-src 'self'/);
  assert.match(nextConfig, /life-space-canary\.yoyomibaobao\.workers\.dev/);
  assert.match(migration, /mergeLocalOriginBaseSnapshot/);
  assert.match(migration, /mergeLocalOriginImage/);
  assert.match(db, /export async function mergeLocalOriginBaseSnapshot/);
  assert.match(db, /export async function mergeLocalOriginImage/);
  assert.match(nativeClient, /assets\.open\("public\/legacy-local-bridge\.html"\)/);
  assert.match(nativeClient, /request is sent to workers\.dev/);
  assert.match(activity, /new LifeSpaceWebViewClient\(bridge, getAssets\(\)\)/);
  assert.match(bridge, /lifespace-local-origin-migration-v1/);
  assert.match(bridge, /getAllKeys\(db, IMAGE_STORE\)/);
  assert.match(bridge, /waitForAck\(nonce, "image-ack", seq\)/);
});

test("new local projects inherit the signed-in account only on this device", () => {
  const newLocalProject = read("app/local/archive/new/page.tsx");
  const ownerSync = read("components/LocalOwnerContextSync.tsx");
  const zh = read("lib/i18n/zh.ts");

  assert.match(newLocalProject, /supabase\.auth\.getSession\(\)/);
  assert.match(newLocalProject, /local_owner_user_id: currentUser\?\.id \|\| null/);
  assert.match(ownerSync, /rememberLocalOwnerContext/);
  assert.match(zh, /这不会上传云端/);
});
