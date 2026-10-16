import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { isShareableMp4, publicExperienceCardUrl, qaShareOrigin, shareMp4File, sharePublicCard } from "../lib/android-native-share.ts";

const plugin = fs.readFileSync("android/app/src/main/java/com/youshi/cultivation/NativeSharePlugin.java", "utf8");
const activity = fs.readFileSync("android/app/src/main/java/com/youshi/cultivation/MainActivity.java", "utf8");
const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const paths = fs.readFileSync("android/app/src/main/res/xml/file_paths.xml", "utf8");
const detail = fs.readFileSync("app/experience-cards/[id]/page.tsx", "utf8");
const list = fs.readFileSync("app/experience-cards/page.tsx", "utf8");

function mp4Header() {
  const bytes = new Uint8Array(12);
  bytes.set([0, 0, 0, 20], 0);
  bytes.set([102, 116, 121, 112], 4);
  return bytes;
}

test("a public card link keeps its title and https path, and only a real MP4 can be shared", () => {
  assert.equal(
    publicExperienceCardUrl("https://life-space.uk", "card-1"),
    "https://life-space.uk/experience-cards/card-1",
  );
  assert.equal(isShareableMp4({ name: "番茄-有时耕作.mp4", type: "video/mp4", size: 32 }, mp4Header()), true);
  assert.equal(isShareableMp4({ name: "note.txt", type: "text/plain", size: 32 }, mp4Header()), false);
  assert.equal(isShareableMp4({ name: "empty.mp4", type: "video/mp4", size: 0 }, mp4Header()), false);
  const html = new TextEncoder().encode("<html></html>");
  assert.equal(isShareableMp4({ name: "page.mp4", type: "video/mp4", size: html.length }, html), false);
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousOrigin = process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mablwxlipcgbmbnfdbkc.supabase.co";
  delete process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN;
  try {
    assert.throws(() => publicExperienceCardUrl("https://life-space.uk", "card-1"), /qa_share_origin_required/);
    process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN = "https://life-space.uk";
    assert.throws(() => publicExperienceCardUrl("https://life-space.uk", "card-1"), /qa_share_origin_required/);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN;
    else process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN = previousOrigin;
  }
});

test("QA market editing uses the validated QA HTTPS origin and never falls back to production", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousOrigin = process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN;
  const shell = fs.readFileSync("mobile-offline-src/main.tsx", "utf8");
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mablwxlipcgbmbnfdbkc.supabase.co";
    delete process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN;
    assert.throws(() => qaShareOrigin(), /qa_share_origin_required/);
    process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN = "https://life-space.uk";
    assert.throws(() => qaShareOrigin(), /qa_share_origin_required/);
    process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN = "http://qa.example";
    assert.throws(() => qaShareOrigin(), /qa_share_origin_required/);
    process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN = "https://qa.example";
    assert.equal(qaShareOrigin(), "https://qa.example");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://eidltoikfpnrzxruvawf.supabase.co";
    assert.equal(qaShareOrigin(), undefined);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN;
    else process.env.NEXT_PUBLIC_CLOUD_EXPORT_ORIGIN = previousOrigin;
  }
  const openWeb = shell.slice(shell.indexOf("  function openOnlineWeb("), shell.indexOf("  function applyShellPath("));
  assert.match(openWeb, /\/\^\\\/market\\\/\[\^\/\]\+\\\/edit/);
  assert.match(openWeb, /origin = qaShareOrigin\(\) \|\| origin/);
  assert.match(openWeb, /catch \{[\s\S]*showToast\(copy\.webOnly\);[\s\S]*return;/);
  assert.match(openWeb, /new URL\(pathname \+ search, origin\)/);
});

test("web share still uses the browser sheet and a cancel is not a failure", async () => {
  const original = navigator.share;
  const calls = [];
  navigator.share = async (payload) => { calls.push(payload); };
  try {
    assert.equal(await sharePublicCard("番茄", "https://life-space.uk/experience-cards/card-1"), "shared");
    assert.deepEqual(calls, [{ title: "番茄", url: "https://life-space.uk/experience-cards/card-1" }]);
    navigator.share = async () => { throw new DOMException("The user aborted a request.", "AbortError"); };
    assert.equal(await sharePublicCard("番茄", "https://life-space.uk/experience-cards/card-1"), "canceled");
  } finally {
    navigator.share = original;
  }
});

test("a browser without file sharing does not pretend an MP4 was shared", async () => {
  const file = new File([mp4Header()], "番茄-有时耕作.mp4", { type: "video/mp4" });
  const originalShare = navigator.share;
  const originalCanShare = navigator.canShare;
  navigator.share = async () => { throw new Error("share should not run"); };
  navigator.canShare = () => false;
  try {
    assert.equal(await shareMp4File(file, { title: "番茄", text: "过程" }), "unsupported");
  } finally {
    navigator.share = originalShare;
    navigator.canShare = originalCanShare;
  }
});

test("a large MP4 is removed from the original call before both Capacitor state saves", () => {
  const normalized = plugin.replace(/\r\n/g, "\n");
  const shareMp4 = normalized.slice(normalized.indexOf("void shareMp4"), normalized.indexOf("@ActivityCallback"));
  const writeAt = shareMp4.indexOf("writeMp4(call.getString(\"fileName\"), call.getString(\"data\"))");
  const removeAt = shareMp4.indexOf("JSObject options = call.getData();\n            if (options != null) options.remove(\"data\");");
  const chooserAt = shareMp4.indexOf("openChooser(call, send, title)");
  assert.ok(writeAt > 0 && removeAt > writeAt && chooserAt > removeAt);
  assert.match(plugin, /try \(FileOutputStream output = new FileOutputStream\(file\)\)/);
  assert.doesNotMatch(plugin, /saveInstanceState\s*\(/);
  assert.doesNotMatch(shareMp4, /new JSObject\(\)/);

  const capacitorPlugin = fs.readFileSync("node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Plugin.java", "utf8");
  const bridge = fs.readFileSync("node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java", "utf8");
  const call = fs.readFileSync("node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/PluginCall.java", "utf8");
  assert.match(call, /public JSObject getData\(\) \{\s*return this\.data;/);
  assert.match(capacitorPlugin, /bridge\.setPluginCallForLastActivity\(call\);\s*lastPluginCallId = call\.getCallbackId\(\);\s*bridge\.saveCall\(call\);/);
  assert.match(capacitorPlugin, /JSObject callData = savedCall\.getData\(\);[\s\S]*callData\.toString\(\)/);
  assert.match(bridge, /Bundle bundle = handle\.getInstance\(\)\.saveInstanceState\(\);[\s\S]*call\.getData\(\)\.toString\(\)/);

  const video = "A".repeat(1_500_000);
  const options = { title: "经验卡", fileName: "card.mp4", data: video };
  options.data = undefined;
  delete options.data;
  const pluginState = JSON.stringify(options);
  const bridgeState = JSON.stringify(options);
  assert.equal(pluginState.includes(video), false);
  assert.equal(bridgeState.includes(video), false);
  assert.equal(pluginState, bridgeState);
  assert.match(pluginState, /经验卡/);
  assert.match(pluginState, /card\.mp4/);
  assert.ok(pluginState.length < 200);
  assert.ok(bridgeState.length < 200);
});

test("Android share opens the system sheet for a link or an MP4 and treats cancel as a return", () => {
  assert.match(activity, /registerPlugin\(NativeSharePlugin\.class\)/);
  assert.match(plugin, /Intent\.ACTION_SEND/);
  assert.match(plugin, /text\/plain/);
  assert.match(plugin, /video\/mp4/);
  assert.match(plugin, /FileProvider\.getUriForFile/);
  assert.match(plugin, /FLAG_GRANT_READ_URI_PERMISSION/);
  assert.match(plugin, /native-share/);
  assert.match(plugin, /bytes\[4\] != 'f'/);
  assert.match(plugin, /"canceled"/);
  assert.match(plugin, /call\.resolve\(response\)/);
  assert.doesNotMatch(plugin, /Documents\/LifeSpace|deleteExperienceCard|cacheDir\(\), "image-actions"/);
  assert.match(manifest, /android.intent.action.SEND/);
  assert.match(manifest, /video\/mp4/);
  assert.match(paths, /cache-path name="my_cache_images" path="\."/);
  assert.match(detail, /isPubliclyAvailable/);
  assert.match(detail, /sharePublicCard\(detail\.card\.title, url\)/);
  assert.match(list, /sharePublicCard\(item\.title, url\)/);
  assert.match(detail, /share_failed_browser/);
  assert.match(list, /share_failed_use_copy/);
});
