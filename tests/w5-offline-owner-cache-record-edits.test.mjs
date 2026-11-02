import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { build } from "esbuild";

const owner="f99fd44d-820f-41f2-ad4e-85feb7c990a6";
const other="e7777777-0000-4000-8000-123456789012";
const archive=(patch={})=>({
  id:"cloud_cache_archive_"+owner+"_a5fda51d-bddc-43ce-ac65-3a695eda6a4e",
  local_role:"cloud-offline-cache",local_owner_user_id:owner,status:"active",
  source_cloud_archive_id:"a5fda51d-bddc-43ce-ac65-3a695eda6a4e",...patch,
});
const synced=(patch={})=>({sync:{status:"synced",cloud_record_id:"b5baa3e2-68c9-45a3-ab9f-8a98cd4ef526",...patch}});
const pending=()=>({sync:{status:"pending-cloud-sync",cloud_record_id:"b5baa3e2-68c9-45a3-ab9f-8a98cd4ef526"}});
const db=readFileSync(new URL("../lib/local-offline-db.ts",import.meta.url),"utf8");
const adapter=readFileSync(new URL("../lib/local-archive-detail-adapters.ts",import.meta.url),"utf8");
const view=readFileSync(new URL("../components/archive-ui/DeviceOwnedProjectDetail.tsx",import.meta.url),"utf8");
const sync=readFileSync(new URL("../lib/pending-cloud-sync.ts",import.meta.url),"utf8");
const cache=readFileSync(new URL("../lib/cloud-offline-cache.ts",import.meta.url),"utf8");

const ast=ts.createSourceFile("db.ts",db,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
let helper;
ts.forEachChild(ast,function visit(node){
  if(ts.isFunctionDeclaration(node)&&node.name?.text==="assertWritableCachedCloudRecord")helper=node.getText(ast);
  ts.forEachChild(node,visit);
});
assert.ok(helper,"cache writer guard declared");
const compiled=ts.transpileModule("globalThis.__guard="+helper.replace("function assertWritableCachedCloudRecord","function cachedRecordGuard")+";undefined;",{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const realm={
  getOwnerUserId:ctx=>ctx?.userId||null,
  resolveLocalArchiveRole:a=>a.local_role,
  normalizeOptionalText:s=>typeof s==="string"&&s.trim()?s.trim():null,
  isPendingCloudSyncStatus:s=>["pending-cloud-sync","uploading","failed"].includes(s),
  Error,
};
vm.runInNewContext(compiled,realm);
const guard=realm.__guard;

test("valid owner-mapped, active synced record can be edited into pending queue",()=>{
  assert.doesNotThrow(()=>guard(archive(),synced(),{userId:owner}));
  assert.doesNotThrow(()=>guard(archive(),pending(),{userId:owner}));
  assert.match(db,/nextRecord\.sync = queueCloudSyncOperation\(nextRecord\.sync, \{[\s\S]*?operationKind: "update-record"/);
  assert.match(sync,/await syncRecord\(\{ record, cloudArchive, userId, cycleMap \}\)/);
});

test("missing owner, cross-owner, absent source, ended and missing synced record ID cannot write",()=>{
  for(const ctx of [null,{userId:other},{userId:""}])
    assert.throws(()=>guard(archive(),synced(),ctx));
  assert.throws(()=>guard(archive({source_cloud_archive_id:null}),synced(),{userId:owner}));
  assert.throws(()=>guard(archive({status:"ended"}),synced(),{userId:owner}));
  assert.throws(()=>guard(archive(),synced({cloud_record_id:null}),{userId:owner}));
  assert.throws(()=>guard(archive(),{sync:{status:"local-only"}},{userId:owner}));
});

test("source writer validates cached owner both in SAF legacy branch and IndexedDB before queuing",()=>{
  const start=db.indexOf("export async function updateLocalRecordFields(");
  const end=db.indexOf("export async function updateLocalRecordSyncMeta(",start);
  const section=db.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(section,/assertWritableCachedCloudRecord\(archive, record, ownerContext\)/);
  assert.match(section,/assertWritableCachedCloudRecord\(normalizedArchive, record, ownerContext\)/);
  assert.match(section,/operationKind: "update-record"/);
  assert.match(section,/markArchivePendingPrompt/);
  assert.match(section,/await requestToPromise\(recordStore\.put\(nextRecord\)\)/);
  assert.match(section,/await done;/);
});

test("owner detail passes authenticated Owner to edit writer; synced cached delete remains blocked",()=>{
  assert.match(view,/canEditLocalArchiveRecord\(archive, source, ownerContext\)/);
  assert.match(view,/\}, ownerContext\);/);
  assert.match(view,/onRecordDeleted=\{editable && !isCloudCache \?/);
  assert.match(view,/canEditArchive = canEditLocalArchiveFields\(archive, ownerContext\)/);
  assert.match(adapter,/archive\.local_owner_user_id !== ownerContext\.userId/);
  assert.match(adapter,/record\.sync\?\.status === "synced"/);
});

test("cache refresh preserves queued record edits and auto-sync stays disabled",()=>{
  assert.match(db,/const pendingRecords = allRecords\.filter\(/);
  assert.match(db,/for \(const record of pendingRecords\) \{\s*await requestToPromise\(recordStore\.put\(record\)\)/);
  assert.match(cache,/await replaceCloudOfflineCache\(/);
  assert.match(sync,/if \(!isAndroidOnline\(\)\)/);
  assert.match(sync,/export function syncPendingCloudArchive/);
  assert.match(sync,/detail\.archive\.local_role !== "cloud-offline-cache"/);
  assert.doesNotMatch(view,/syncAllPendingCloudArchives/);
});

test("adapter real compiled function rejects unknown owner and unmapped record",async()=>{
  const b=await build({
    entryPoints:[fileURLToPath(new URL("../lib/local-archive-detail-adapters.ts",import.meta.url))],
    bundle:true,write:false,platform:"browser",format:"iife",globalName:"__cacheAdapter",logLevel:"silent",
    plugins:[{name:"mock-db",setup(x){
      x.onResolve({filter:/@\/lib\/local-offline-db$/},()=>({path:"db",namespace:"mock"}));
      x.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:"export const isPendingCloudSyncStatus=s=>['pending-cloud-sync','uploading','failed'].includes(s);",loader:"js"}));
    }}],
  });
  const ctx={};
  vm.runInNewContext(b.outputFiles[0].text,ctx);
  const can=ctx.__cacheAdapter.canEditLocalArchiveRecord;
  assert.equal(can(archive(),synced(),{userId:owner}),true);
  assert.equal(can(archive(),synced(),{userId:other}),false);
  assert.equal(can(archive(),synced({cloud_record_id:null}),{userId:owner}),false);
  assert.equal(can(archive({status:"ended"}),synced(),{userId:owner}),false);
  assert.equal(can(archive(),{sync:{status:"local-only"}},{userId:owner}),false);
});
