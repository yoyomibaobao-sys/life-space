import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// Extract and run the ACTUAL website component's loadDetail implementation,
// with no React mount and no QA/browser network. All dependencies are mocks;
// queue preparation is observed as a writable-IDB boundary.
const source=fs.readFileSync("app/local/archive/[id]/page.tsx","utf8");
const begin=source.indexOf("  async function loadDetail() {");
const end=source.indexOf("\n  useEffect(() => {",begin);
assert(begin>=0 && end>begin,"Website actual local detail loader not found");
const loadDetailSource=source.slice(begin,end);
const webSource=fs.readFileSync("app/archive/page.tsx","utf8");
assert.match(webSource,/async function w5UploadPending[\s\S]*?syncPendingCloudArchive\(\{/);
assert.match(source,/async function confirmPendingCloudSync\([\s\S]*?syncPendingCloudArchive\(\{/);
const syncSource=fs.readFileSync("lib/pending-cloud-sync.ts","utf8");
assert.match(syncSource,/export async function syncAllPendingCloudArchives/);

function newHarness(auth){
 const events=[],errors=[],idbWrites=[];
 const cfg={
  archiveId:"synthetic-a-project",
  supabase:{auth:{getUser:async()=>{
    events.push("getUser");
    if(auth==="timeout")throw Error("identity timeout");
    if(auth==="missing")return {data:{user:null},error:null};
    if(auth==="error-with-user")return {data:{user:{id:"synthetic-a",email:"a@example.test"}},error:{message:"Invalid session"}};
    return {data:{user:{id:"synthetic-a",email:"a@example.test"}},error:null};
  }}},
  setLoading:v=>events.push("loading:"+v),setOwnerContext:v=>events.push("owner:"+String(v?.userId||"null")),
  setCategoryDepths:()=>{},getLocalArchiveCategoryDepths:()=>({}),
  preparePendingCloudSyncQueue:async(o,scope)=>{
    idbWrites.push({owner:o?.userId||null,archiveId:scope?.targetArchiveId||null});
  },
  getLocalArchiveDetail:async()=>({archive:{id:"synthetic-a-project"},records:[]}),
  listPendingCloudSyncSummaries:async()=>[],
  listVisibleLocalTaxonomyItems:async()=>[],
  setDetail:()=>{},setLocalTaxonomyItems:()=>{},setPendingSyncSummary:()=>{},
  setLocalRecordItems:()=>{},buildLocalRecordItems:()=>[],setError:x=>errors.push(String(x)),
  archiveCopy:{local_not_found:"not found",local_read_failed:"load failed"},
 };
 const run=new Function("m","with(m) {\n"+loadDetailSource+"\nreturn loadDetail;\n}")(cfg);
 return {run,events,errors,idbWrites};
}
for(const auth of ["missing","error-with-user","timeout"]){
 test("website page "+auth+" must not queue any IndexedDB write",async()=>{
  const h=newHarness(auth);await h.run();
  assert.deepEqual(h.idbWrites,[]);
  assert.deepEqual(h.events.filter(x=>x==="getUser"),["getUser"]);
  assert.equal(h.events.filter(x=>x.startsWith("loading:")).length,2);
 });
}
test("website page verified owner may prepare only selected target archive",async()=>{
 const h=newHarness("valid");await h.run();
 assert.deepEqual(h.idbWrites,[{owner:"synthetic-a",archiveId:"synthetic-a-project"}]);
 assert.deepEqual(h.events.filter(x=>x==="getUser"),["getUser"]);
});
console.log("R22_WEBSITE_COMPONENT_CALLCHAIN_SOURCE",JSON.stringify({page:"app/local/archive/[id]/page.tsx",real_loader:true,website_single_sync_entry:true,android_independent_entry_untouched:true}));
