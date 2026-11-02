import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const file = (name) => fs.readFileSync(new URL("../" + name, import.meta.url),"utf8");
const db=file("lib/local-offline-db.ts");
const sync=file("lib/pending-cloud-sync.ts");
const adapter=file("lib/local-archive-detail-adapters.ts");
const view=file("components/archive-ui/DeviceOwnedProjectDetail.tsx");
const cache=file("lib/cloud-offline-cache.ts");
const actor="f99fd44d-820f-41f2-ad4e-85feb7c990a6";
const cloud="a5fda51d-bddc-43ce-ac65-3a695eda6a4e";
const cycleCloud="f55fa87b-1536-41f8-a7bb-52f2374c6d80";
const archive=(extras={})=>({local_role:"cloud-offline-cache",local_owner_user_id:actor,status:"active",
  source_cloud_archive_id:cloud,sync:{status:"synced",cloud_archive_id:cloud,pending_fields:[]},
  cycles:[{id:"cloud_cache_cycle_"+cycleCloud,source_cloud_cycle_id:cycleCloud,status:"active",
    started_at:"2026-10-01T00:00:00Z",ended_at:null,display_name:"Original"}],...extras});
const owner={userId:actor};
const source=ts.createSourceFile("cache.ts",db,ts.ScriptTarget.ES2022,true);
function extract(name){
  let hit=null;
  function visit(node){
    if(ts.isFunctionDeclaration(node)&&node.name?.text===name)hit=node.getText(source);
    ts.forEachChild(node,visit);
  }
  visit(source);
  assert.ok(hit,"Missing callable "+name);return hit;
}
const compiled=ts.transpileModule(
  extract("assertWritableCachedCloudArchive")+"\n"+extract("stageCachedCloudCycleEdit")+
  "\nglobalThis.__rules={guard:assertWritableCachedCloudArchive,stage:stageCachedCloudCycleEdit};",
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}},
).outputText;
let seq=0;
const mock={
  resolveLocalArchiveRole:(a)=>a.local_role,
  normalizeOptionalText:(v)=>typeof v==="string"&&v.trim()?v.trim():null,
  markArchivePendingPrompt:(a)=>({...a,pending_sync_prompt_mode:"manual"}),
  queueCloudSyncOperation:(old,input)=>({...old,status:"pending-cloud-sync",
    operation_kind:"update-archive",client_operation_id:old.status==="synced"?"op-"+(++seq):(old.client_operation_id||"op-"+(++seq)),
    pending_fields:[...(old.pending_fields||[]),...(input.pendingFields||[])]}),
  Error,
};
vm.runInNewContext(compiled,mock);
const {guard,stage}=mock.__rules;

test("Owner-mapped active cloud archive can edit fields but cannot end or restore offline",()=>{
  assert.doesNotThrow(()=>guard(archive(),owner));
  assert.throws(()=>guard(archive(),owner,{status:"ended"}));
  assert.throws(()=>guard(archive(),owner,{ended_at:null}));
  assert.match(view,/canEditLocalArchiveFields\(archive, ownerContext\)/);
  assert.match(view,/canDeleteArchive: canEditArchive && !isCloudCache/);
  assert.match(view,/if \(isCloudCache\) return;/);
  assert.match(adapter,/archive\.local_owner_user_id === ownerContext\.userId/);
});

test("Archive cache rejects wrong owner, ended, missing mapping and inconsistent sync mapping",()=>{
  for(const bad of [null,{userId:"other"},{userId:""}])assert.throws(()=>guard(archive(),bad));
  assert.throws(()=>guard(archive({status:"ended"}),owner));
  assert.throws(()=>guard(archive({source_cloud_archive_id:null}),owner));
  assert.throws(()=>guard(archive({sync:{status:"synced",cloud_archive_id:"other"}}),owner));
  const uploading=archive({sync:{status:"uploading",cloud_archive_id:cloud,pending_fields:["title"]}});
  assert.throws(()=>guard(uploading,owner));
  assert.doesNotThrow(()=>guard(uploading,owner,undefined,true));
});

test("existing valid cloud cycle stages same identity and existing archive update-archive operation",()=>{
  const input=archive();
  const changed=input.cycles.map(c=>({...c,display_name:"Changed"}));
  const result=stage(input,changed[0].id,changed,owner,"2026-11-02T13:00:00Z");
  assert.equal(result.cycles[0].id,input.cycles[0].id);
  assert.equal(result.cycles[0].source_cloud_cycle_id,cycleCloud);
  assert.equal(result.cycles[0].display_name,"Changed");
  assert.equal(result.sync.status,"pending-cloud-sync");
  assert.equal(result.sync.operation_kind,"update-archive");
  assert.ok(result.sync.pending_fields.includes("cycle:"+cycleCloud));
  assert.equal(input.cycles[0].display_name,"Original");
});

test("failed, stale, unmapped and foreign cycle edits are refused before local commit",()=>{
  const a=archive();
  const next=a.cycles.map(c=>({...c,display_name:"New"}));
  assert.throws(()=>stage(a,next[0].id,next,{userId:"B"},"2026-11-02"));
  assert.throws(()=>stage(a,"not-found",next,owner,"2026-11-02"));
  assert.throws(()=>stage(archive({status:"ended"}),next[0].id,next,owner,"2026-11-02"));
  assert.throws(()=>stage(a,next[0].id,[{...next[0],source_cloud_cycle_id:"wrong"}],owner,"2026-11-02"));
  assert.throws(()=>stage(archive({cycles:[{...a.cycles[0],source_cloud_cycle_id:null}]}),
    next[0].id,next,owner,"2026-11-02"));
});

test("cycle edit and project edit both use existing durable archive row and pending operation",()=>{
  for(const name of ["endLocalArchiveCycle","updateLocalArchiveCycleDates","updateLocalArchiveCycleName"]){
    const start=db.indexOf("export async function "+name+"(");
    const end=db.indexOf("export async function ",start+25);
    const body=db.slice(start,end);
    assert.match(body,/assertWritableCachedCloudArchive\(normalizedArchive, ownerContext\)/);
    assert.match(body,/store\.put\(stageCachedCloudCycleEdit\(/);
    assert.match(body,/await done;/);
  }
  assert.match(db,/assertWritableCachedCloudArchive\(normalizedArchive, ownerContext, updates\)/);
  assert.match(db,/operationKind: "update-archive"/);
  assert.match(db,/archiveStore\.put\(mergedCacheArchive\)/);
});

test("manual sync PATCH only existing mapped cycles with exact cloud UUID and owner-scoped parent",()=>{
  assert.match(sync,/cycleIds = \[\.\.\.new Set/);
  assert.match(sync,/source_cloud_cycle_id === cloudCycleId/);
  assert.match(sync,/\.from\("archive_cycles"\)[\s\S]{0,300}\.update\(/);
  assert.match(sync,/\.eq\("id", cloudCycleId\)[\s\S]{0,70}\.eq\("archive_id", params\.cloudArchiveId\)/);
  assert.match(sync,/if \(error \|\| data\?\.id !== cloudCycleId\)/);
  assert.match(sync,/detail\.archive\.local_owner_user_id === userId/);
  assert.match(sync,/detail\.archive\.source_cloud_archive_id === cloudArchiveId/);
  assert.doesNotMatch(sync.slice(sync.indexOf("const cycleIds ="),sync.indexOf("await updateLocalArchiveCloudSyncOperation(",sync.indexOf("const cycleIds ="))),/\.insert\(/);
  assert.match(sync,/detail\.archive\.local_role !== "cloud-offline-cache" &&/);
});

test("failure or unknown receipt retains pending, no duplicate cycle creation and no auto upload",()=>{
  const start=sync.indexOf("async function syncArchiveUpdate(");
  const end=sync.indexOf("async function findCloudRecord",start);
  const section=sync.slice(start,end);
  const ack=section.lastIndexOf('status: "synced"');
  const retryError=section.indexOf('status: "failed"');
  assert.ok(ack>section.indexOf('const cycleIds ='));
  assert.ok(retryError>ack);
  assert.match(section,/assertUploadClaim\(claimed, operationId\)/);
  assert.match(section,/操作|期次更新回执未确认/);
  assert.match(sync,/export function syncPendingCloudArchive/);
  assert.doesNotMatch(view,/syncAllPendingCloudArchives/);
});

test("cache refresh protects unacknowledged archive fields and modified cycle rows",()=>{
  const start=db.indexOf("async function replaceCloudOfflineCacheUnlocked");
  const end=db.indexOf("const cacheWrites = ",start);
  const text=db.slice(start,end);
  assert.match(text,/pendingCycleIds = new Set/);
  assert.match(text,/previous\.cycles\?\.find/);
  assert.match(text,/currentCloudCycleIds/);
  assert.match(text,/!currentCloudCycleIds\.has\(old\.source_cloud_cycle_id\)/);
  assert.match(text,/pendingFieldsForCache/);
  assert.match(text,/sync: previous\.sync/);
  assert.match(text,/archiveStore\.put\(mergedCacheArchive\)/);
  assert.match(cache,/await replaceCloudOfflineCache/);
});

test("new/delete cloud cycles remain disabled; original local/SAF protection unchanged",()=>{
  assert.match(view,/onStartCycle=\{canEditArchive && cycleEnabled && !isCloudCache/);
  assert.match(view,/onDeleteCycle=\{canEditArchive && cycleEnabled && !isCloudCache/);
  assert.match(db,/assertWritableUserArchive\(normalizedArchive, "云端期次离线时只读"\)/);
  assert.match(view,/canManageCycle: canEditArchive && cycleEnabled/);
});
