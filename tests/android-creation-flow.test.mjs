import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}
async function loadLiveCreate(stubs) {
  const result = await build({ entryPoints: ["lib/android-live-cloud-create.ts"], bundle: true,
    write: false, platform: "node", format: "esm", plugins: [{ name: "stubs", setup(ctx) {
      ctx.onResolve({ filter: /^@\// }, (args) => stubs[args.path]
        ? { path: args.path, namespace: "stub" }
        : { path: path.resolve(args.path.slice(2) + ".ts") });
      ctx.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: stubs[args.path], loader: "js" }));
    } }] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}
const snapshot = await load("lib/cloud-taxonomy-snapshot.ts");
const taxonomy = await load("lib/pending-cloud-taxonomy.ts");
const capabilities = await load("lib/android-creation-capabilities.ts");
const read = (path) => fs.readFileSync(path, "utf8");

const sub = { id: "sub-1", kind: "subcategory", label: "一级", category: "system", parentId: null };
const group = { id: "group-1", kind: "group", label: "二级", category: "system", parentId: sub.id };
const pending = { category: "system", subcategory: sub.label, group_name: group.label,
  intended_cloud_sub_tag_id: sub.id, intended_cloud_group_tag_id: group.id };

test("owner-scoped taxonomy snapshot retains actual IDs and denies signed-out and other owners", () => {
  const map = new Map();
  const storage = { getItem: (key) => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
  snapshot.saveCloudTaxonomySnapshot("A", [sub, group], storage);
  assert.deepEqual(snapshot.readCloudTaxonomySnapshot(null, storage), []);
  assert.deepEqual(snapshot.readCloudTaxonomySnapshot("B", storage), []);
  const entries = snapshot.readCloudTaxonomySnapshot("A", storage);
  assert.deepEqual(entries.map((entry) => entry.id), [sub.id, group.id]);
  assert.equal(entries[0].ownerUserId, "A");
  assert.match(entries[0].cachedAt, /^\d{4}-/);
  snapshot.clearCloudTaxonomySnapshot("A", storage);
  assert.deepEqual(snapshot.readCloudTaxonomySnapshot("A", storage), []);
});

test("pending cloud IDs validate category and parent, while missing and legacy labels fall back ungrouped", () => {
  assert.deepEqual(taxonomy.resolvePendingCloudTaxonomy(pending, [sub, group]), {
    sub_tag_id: sub.id, group_tag_id: group.id, warning: null,
  });
  for (const entries of [[group], [sub], [{ ...sub, category: "plant" }, group], [sub, { ...group, parentId: "other" }]]) {
    const result = taxonomy.resolvePendingCloudTaxonomy(pending, entries);
    assert.equal(result.sub_tag_id, null);
    assert.equal(result.group_tag_id, null);
    assert.equal(result.warning, taxonomy.TAXONOMY_SYNC_WARNING);
  }
  const legacy = taxonomy.resolvePendingCloudTaxonomy({ category: "system", subcategory: sub.label, group_name: group.label }, [sub, group]);
  assert.equal(legacy.sub_tag_id, null);
  assert.equal(legacy.warning, taxonomy.TAXONOMY_SYNC_WARNING);
});

test("four states expose precise project destinations and existing photo targets", () => {
  assert.deepEqual(capabilities.projectCreationDestinations(true, true), ["live-cloud", "local-only"]);
  assert.deepEqual(capabilities.projectCreationDestinations(false, true), ["pending-cloud", "local-only"]);
  assert.deepEqual(capabilities.projectCreationDestinations(true, false), ["local-only", "login"]);
  assert.deepEqual(capabilities.projectCreationDestinations(false, false), ["local-only"]);
  assert.deepEqual(capabilities.quickAddExistingSources(true, true), ["live-cloud", "local-only"]);
  assert.deepEqual(capabilities.quickAddExistingSources(false, true), ["cloud-cache", "pending-cloud", "local-only"]);
  assert.deepEqual(capabilities.quickAddExistingSources(true, false), ["local-only"]);
  assert.deepEqual(capabilities.quickAddExistingSources(false, false), ["local-only"]);
});

test("center action opens the in-app camera, supports album or skip, then preserves draft through project choice", () => {
  const shell = read("mobile-offline-src/main.tsx");
  const camera = read("components/mobile/AndroidQuickCamera.tsx");
  assert.match(shell, /onClick=\{\(\) => setScreen\(\{ kind: "quick-add" \}\)\}/);
  assert.match(shell, /screen\.kind === "quick-add"[\s\S]*<AndroidQuickCamera/);
  assert.match(camera, /getUserMedia/);
  assert.match(camera, /onAlbum/);
  assert.match(camera, /onSkip/);
  assert.match(shell, /onAlbum=\{\(\) => quickGallery\.current\?\.click\(\)\}/);
  assert.match(shell, /skipQuickAddPhotos[\s\S]*files: \[\][\s\S]*setScreen\(\{ kind: "choose-project" \}\)/);
  assert.doesNotMatch(shell, /quick-add-album/);
  assert.match(shell, /acceptQuickAddImageFiles[\s\S]*setQuickAddDraft\(\{ files, capturedAt, source, note: "" \}\)[\s\S]*setScreen\(\{ kind: "choose-project" \}\)/);
  assert.match(shell, /kind: "cloud-login"; returnTo: "choose-project"/);
  assert.match(shell, /openCloudLogin\("choose-project"\)/);
  assert.match(shell, /initialFiles=\{quickAddDraft\?\.files\}/);
  assert.match(shell, /setQuickAddDraft\(null\)/);
  assert.match(read("app/archive/[id]/AddRecord.tsx"), /initialFiles[\s\S]*appendFiles\(initialFiles\)/);
  assert.match(read("app/archive/[id]/AddRecord.tsx"), /URL\.revokeObjectURL/);
});

test("project-open center plus adds to the current project from records, properties, or experience", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /screen\.kind === "market" \|\| screen\.kind === "market-mine"[\s\S]*className="market-add"[\s\S]*kind: "market-new"/);
  const localDetail = read("components/archive-ui/DeviceOwnedProjectDetail.tsx");
  const cloudDetail = read("components/archive-ui/CloudArchiveDetailController.tsx");

  assert.match(shell, /screen\.kind === "detail" \|\| screen\.kind === "cloud-detail"[\s\S]*aria-label=\{copy\.addRecord\}/);
  assert.match(shell, /screen\.kind === "detail"[\s\S]*setScreen\(\{ kind: "new-record", archiveId: detail\.archive\.id \}\)/);
  assert.match(shell, /setDetailAddRecordRequest\(\(current\) => \(\{ archiveId: screen\.archiveId, nonce: \(current\?\.nonce \|\| 0\) \+ 1 \}\)\)/);
  assert.match(shell, /addRecordRequest=\{detailAddRecordRequest\?\.archiveId === screen\.archiveId \? detailAddRecordRequest\.nonce : 0\}/);
  assert.match(localDetail, /onFloatingAdd=\{showFloatingAdd \? onAddRecord : undefined\}/);
  assert.match(cloudDetail, /setTab\("records"\)[\s\S]*setAddOpen\(true\)/);
  assert.match(cloudDetail, /onFloatingAdd=\{showFloatingAdd \? \(\) => setAddOpen\(true\) : undefined\}/);
  assert.match(shell, /showFloatingAdd=\{false\}/);
});

test("live cloud creation and existing cloud record reuse canonical storage composer", () => {
  const shell = read("mobile-offline-src/main.tsx");
  assert.match(shell, /createLiveCloudArchive\(/);
  assert.match(shell, /<CloudArchiveDetailController[\s\S]*initialFiles=\{quickAddDraft\?\.files\}/);
  assert.match(read("components/archive-detail/ArchiveAddRecordSection.tsx"), /<AddRecord[\s\S]*initialFiles=\{initialFiles\}/);
  const live = read("lib/android-live-cloud-create.ts");
  assert.match(live, /id: input\.id/);
  assert.match(live, /recovered = await supabase\.from\("archives"\)/);
  assert.doesNotMatch(live, /from\("sub_tags"\)\.insert|from\("group_tags"\)\.insert/);
});

test("live cloud stable ID recovers a lost response and retry does not create twice", async () => {
  const rows = new Map();
  let inserts = 0;
  globalThis.__cloudCreation = { rows, get inserts() { return inserts; } };
  const live = await loadLiveCreate({
    "@/lib/supabase": `export const supabase = {
      auth: { getUser: async () => ({data:{user:{id:"A"}},error:null}) },
      rpc: async () => ({ data: { active: true }, error: null }),
      from: () => ({
        select: () => ({ eq: (_key, id) => ({ maybeSingle: async () => ({data:globalThis.__cloudCreation.rows.get(id)||null,error:null}) }) }),
        insert: (input) => ({ select: () => ({ maybeSingle: async () => {
          globalThis.__cloudCreation.rows.set(input[0].id,{id:input[0].id,user_id:input[0].user_id});
          globalThis.__cloudCreation.onInsert();
          return {data:null,error:new Error("response lost")};
        } }) }),
      }),
    };`,
    "@/lib/android-project-taxonomy": `export const loadCloudProjectTaxonomy = async () => ([
      {id:"sub-1",kind:"subcategory",category:"system",parentId:null},
      {id:"group-1",kind:"group",category:"system",parentId:"sub-1"}
    ]);`,
    "@/lib/membership": `export const normalizeMembershipRpcResult = () => ({}); export const canCreateMembershipContent = () => true;`,
  });
  globalThis.__cloudCreation.onInsert = () => { inserts += 1; };
  const input = { id: "stable-id", userId: "A", title: "堆肥", category: "system", systemName: "堆肥", subTagId: "sub-1", groupTagId: "group-1" };
  assert.equal(await live.createLiveCloudArchive(input), "stable-id");
  assert.equal(await live.createLiveCloudArchive(input), "stable-id");
  assert.equal(inserts, 1);
  assert.equal(rows.get("stable-id").user_id, "A");
  delete globalThis.__cloudCreation;
});

test("pending sync validates taxonomy before insert and keeps record/image path", () => {
  const sync = read("lib/pending-cloud-sync.ts");
  assert.match(sync, /resolvePendingCloudTaxonomy\(archive, await loadCloudProjectTaxonomy\(params\.userId\)\)/);
  assert.match(sync, /sub_tag_id: taxonomy\.sub_tag_id,[\s\S]*group_tag_id: taxonomy\.group_tag_id/);
  assert.match(sync, /taxonomyWarning[\s\S]*const pendingRecords = detail\.records/);
  assert.match(sync, /activeArchiveSyncs\.get\(key\)/);
  const cache = read("lib/cloud-offline-cache.ts");
  assert.match(cache, /source_cloud_sub_tag_id: archive\.sub_tag_id/);
  assert.match(cache, /source_cloud_group_tag_id: archive\.group_tag_id/);
});

test("taxonomy safety rules are identical in both project charters", () => {
  const agents = read("AGENTS.md").replace(/\r\n/g, "\n");
  const charter = read("总纲.md").replace(/\r\n/g, "\n");
  const section = agents.split("### 五、云端分类身份与数据安全")[1];
  assert.ok(section);
  const rules = section.split("\n\n")[1]?.trim();
  assert.ok(rules);
  assert.ok(charter.includes(rules));
});
