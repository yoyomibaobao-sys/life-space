import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { build } from "esbuild";

const source = fs.readFileSync("mobile-offline-src/main.tsx", "utf8");
const create = fs.readFileSync("lib/local-offline-db.ts", "utf8");
const native = fs.readFileSync("android/app/src/main/java/com/youshi/cultivation/LocalSafPlugin.java", "utf8");
const profile = fs.readFileSync("components/profile/AndroidProfileController.tsx", "utf8");

test("online Android startup and login never request SAF or import the S6 origin", () => {
  const init = source.slice(source.indexOf("async function initialize()"), source.indexOf("void initialize();"));
  assert.ok(init.length > 100);
  assert.doesNotMatch(init, /connectLocalSafDirectory\(|chooseAndValidateSafDirectory\(|regrantSavedSafDirectory\(|migrateLegacyLocalOrigin\(\)/);
  assert.match(init, /preparePendingCloudSyncQueue\(/);
  assert.match(init, /loadList\(/);
  const recovery = source.slice(source.indexOf("const connectSaf ="), source.indexOf("const loadCloudList ="));
  assert.match(recovery, /connectLocalSafDirectory\(\)/, "legacy recovery source is preserved");
  assert.equal((source.match(/onClick=\{\(\) => void connectSaf\(\)\}/g) || []).length, 0,
    "online shell has no reachable SAF picker or recovery button");
  assert.equal((source.match(/connectSaf\(\)/g) || []).length, 0,
    "legacy recovery helper is inert and never invoked");
});

test("standalone local creation and old settings are hidden without changing stored data", () => {
  assert.match(source, /const localSpaceEnabled = false;/);
  assert.match(source, /function w5WorkspaceSources\(/);
  assert.match(source, /auth === "checking" \? \[\] : auth === "signed-in" \? \["cloud", "pending"\] : \["cloud"\]/);
  assert.match(source, /projectCreationDestinations\(online, signedIn, false\)/);
  assert.match(source, /\(!screen\.destination \|\| screen\.destination === "local-only"\)/);
  assert.match(source, /data-android-shell-page="s6-local-create-deferred"/);
  assert.match(source, /onCreate=\{\(guide\) => auth\.status === "signed-in"[\s\S]*destination: online \? "live-cloud" : "pending-cloud"/);
  assert.doesNotMatch(source, /onLocalSpaceVisibilityChange=\{updateLocalSpaceVisibility\}/);
  assert.match(profile, /onLocalSpaceVisibilityChange \?/);
  assert.match(source, /LOCAL_SPACE_VISIBILITY_KEY = "lifespace_android_show_local_space_v1"/);
  assert.doesNotMatch(source, /localStorage\.clear\(|indexedDB\.deleteDatabase\(/);
});

test("cloud and pending creation do not touch the explicit SAF create branch", async () => {
  const bundle = await build({ entryPoints: ["lib/android-creation-capabilities.ts"], write: false, bundle: true, platform: "node", format: "esm" });
  const capabilities = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
  assert.deepEqual(capabilities.projectCreationDestinations(true, true, false), ["live-cloud"]);
  assert.deepEqual(capabilities.projectCreationDestinations(false, true, false), ["pending-cloud"]);
  assert.deepEqual(capabilities.projectCreationDestinations(false, false, false), []);
  const explicitLocal = create.slice(create.indexOf("export async function createLocalArchive("), create.indexOf("export async function deleteLocalArchive("));
  assert.match(explicitLocal, /if \(!wantsPendingCloud && isAndroidSafAvailable\(\)\)/);
  assert.match(explicitLocal, /migrateLegacyLocalProjectsIfNeeded\(true\)/);
  assert.match(source, /sync_destination: owner\?\.userId && destination === "pending-cloud" \? "pending-cloud" : "local-only"/);
  assert.match(source, /preparePendingCloudSyncQueue\(/);
  assert.match(source, /listPendingCloudSyncSummaries\(/);
  assert.match(source, /syncPendingCloudArchive\(/);
  assert.match(source, /refreshCloudOfflineCaches\(/);
});

test("online trash never loads, restores, or purges independent local or SAF data", () => {
  const section = source.slice(source.indexOf("function AndroidLocalTrash("), source.indexOf("function ProjectForm("));
  assert.match(section, /Promise\.resolve\(\[\] as Awaited<ReturnType<typeof listLocalArchiveCycleTrash>>\)/);
  assert.match(section, /Promise\.resolve\(\[\] as Awaited<ReturnType<typeof listLocalProjectTrash>>\)/);
  const clear = section.slice(section.indexOf("async function clearAllTrash()"), section.indexOf("return <section data-android-shell-page="));
  assert.match(clear, /await emptyCloudTrash\(\)/);
  assert.doesNotMatch(clear, /purgeLocalArchiveCycleTrash\(|deleteLocalArchive\(/);
  assert.match(section, /fetchCloudTrash\(/);
  assert.match(section, /restoreCloudTrashItem\(/);
  assert.match(source, /const \[activeSpace, setActiveSpace\] = useState<ArchiveCategorySpace>\(\s*\(\) => "cloud"/);
});

test("R08 SAF native and original local storage support are sealed, not deleted", () => {
  assert.match(native, /releasePersistableUriPermission\(discarded, flags\)/);
  assert.match(native, /getPersistedUriPermissions\(\)/);
  assert.match(create, /export async function connectLocalSafDirectory\(/);
  assert.match(create, /export async function createLocalRecord\(/);
  assert.match(create, /export async function listPendingCloudSyncSummaries\(/);
  assert.match(source, /pickAndroidRecordPhotos/);
  assert.match(source, /acceptQuickAddImageFiles/);
});
