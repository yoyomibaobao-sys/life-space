import assert from "node:assert/strict";
import { build } from "esbuild";
import { IDBFactory } from "fake-indexeddb";
import { randomUUID } from "node:crypto";

const BASELINE = process.argv.includes("--baseline");
const OWNER_A = "qa-synthetic-owner-a";
const OWNER_B = "qa-synthetic-owner-b";
const CLOUD_ID = "11111111-1111-4111-8111-111111111111";
const RECORD_OP = "22222222-2222-4222-8222-222222222222";
const time = "2026-11-09T09:00:00.000Z";
const trace = [];
const state = { auth: OWNER_A, authMode: "valid", recordOutcome:"success", remoteRecords:new Map() };
const b64 = x=>Buffer.from(x).toString("base64");

const supabase = {
 auth: {
  getUser:async()=>{
   trace.push({kind:"identity_check",mode:state.authMode,remote:state.auth});
   if(state.authMode==="timeout")throw Error("Mock identity timeout");
   if(state.authMode==="auth_error")return {data:{user:null},error:{message:"Invalid session"}};
   return {data:{user:state.auth?{id:state.auth,email:"owner@example.test"}:null},error:null};
  },
 },
 from(table){
  trace.push({kind:"http_SELECT_or_builder",table});
  const q={table,mode:"select",filters:[],rows:null};
  const b={
   select(){return b;},eq(k,v){q.filters.push([k,v]);return b;},is(k,v){q.filters.push([k,v]);return b;},
   insert(rows){q.mode="insert";q.rows=rows;trace.push({kind:"business_POST",table,operationId:rows?.[0]?.id});return b;},
   update(rows){q.mode="update";q.rows=rows;trace.push({kind:"business_PATCH",table});return b;},
   async maybeSingle(){
    if(q.table==="archives")return {data:{id:CLOUD_ID,user_id:OWNER_A,is_public:false,default_record_visibility:"private"},error:null};
    if(q.table==="records"){
     if(q.mode==="insert"){
      if(state.recordOutcome==="unknown"||state.recordOutcome==="http500")return {data:null,error:{message:state.recordOutcome==="unknown"?"mock response timeout / UNKNOWN":"mock 500"}};
      const row={id:q.rows[0].id,archive_id:CLOUD_ID,user_id:OWNER_A};
      state.remoteRecords.set(row.id,row);
      return {data:row,error:null};
     }
     return {data:state.remoteRecords.get(RECORD_OP)||null,error:null};
    }
    return {data:null,error:null};
   },
  };
  return b;
 },
 async rpc(name){trace.push({kind:"business_RPC",name});return {data:null,error:null};},
};
globalThis.__r22Mocks = {supabase};
function fakeModules(){
 return {name:"R22-no-network-Mocks",setup(buildApi){
  buildApi.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:"supabase",namespace:"r22"}));
  buildApi.onResolve({filter:/^@\/lib\/android-connectivity$/},()=>({path:"connectivity",namespace:"r22"}));
  buildApi.onResolve({filter:/^@\/lib\/media-storage-upload$/},()=>({path:"media",namespace:"r22"}));
  buildApi.onResolve({filter:/^@\/lib\/storage-usage$/},()=>({path:"usage",namespace:"r22"}));
  buildApi.onLoad({filter:/.*/,namespace:"r22"},a=>({
   loader:"js",
   contents:a.path==="supabase"?"export const supabase = globalThis.__r22Mocks.supabase;":
    a.path==="connectivity"?"export const isAndroidOnline = ()=>true;":
    a.path==="media"?"export async function uploadMediaStorageObject(){throw Error('NO MEDIA MOCK UPLOAD PERMITTED')}":
    "export async function reserveStorageUpload(){throw Error('NO MEDIA RESERVATION PERMITTED')};export async function settleStorageUploadReservation(){throw Error('NO MEDIA SETTLEMENT PERMITTED')};export async function cancelStorageUploadReservation(){throw Error('NO MEDIA CANCEL PERMITTED')};export async function reconcileMediaUploadCommit(){throw Error('NO MEDIA RECONCILE PERMITTED')}",
  }));
 }};
}
async function fromSource(file){
 const result=await build({entryPoints:[file],bundle:true,write:false,format:"esm",platform:"node",plugins:[fakeModules()],logLevel:"error"});
 return await import("data:text/javascript;base64,"+b64(result.outputFiles[0].contents));
}
const sync=await fromSource(BASELINE?".wp10-delivery/C-W4-SHARED-SYNC-OWNER-GATE-R22/preimage/lib/pending-cloud-sync.ts":"lib/pending-cloud-sync.ts");
const local=await fromSource("lib/local-offline-db.ts");

function waitRequest(v){return new Promise((ok,bad)=>{v.onsuccess=()=>ok(v.result);v.onerror=()=>bad(v.error);});}
function waitTx(t){return new Promise((ok,bad)=>{t.oncomplete=ok;t.onabort=()=>bad(t.error);t.onerror=()=>bad(t.error);});}
async function fixture({withImage=true,role="cloud-offline-cache"}={}){
 trace.length=0;state.auth=OWNER_A;state.authMode="valid";state.recordOutcome="success";state.remoteRecords=new Map();
 const store=new Map();
 globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 globalThis.indexedDB=new IDBFactory();
 globalThis.window={indexedDB,localStorage,dispatchEvent:()=>{}};
 Object.defineProperty(globalThis,"navigator",{configurable:true,value:{onLine:true}});
 globalThis.CustomEvent=class{constructor(name,params){this.type=name;this.detail=params?.detail}};
 const req=indexedDB.open("life-space-local-offline",6);
 req.onupgradeneeded=()=>{
  for(const name of ["archives","records","images","taxonomy"])req.result.createObjectStore(name,{keyPath:"id"});
 };
 const db=await waitRequest(req);
 const tr=db.transaction(["archives","records","images"],"readwrite");const done=waitTx(tr);
 tr.objectStore("archives").put({id:"local-a",title:"Synthetic QA",category:"system",main_category:"system",system_name:"Compost",source_cloud_archive_id:CLOUD_ID,source_cloud_saved_at:time,local_role:role,local_owner_user_id:OWNER_A,local_owner_email:"a@example.test",status:"active",created_at:time,updated_at:time,local_only:true,sync:{status:"synced",cloud_archive_id:CLOUD_ID,attempt_count:0}});
 tr.objectStore("records").put({id:"record-a",archive_id:"local-a",note:"Synthetic pending",record_time:time,created_at:time,updated_at:time,local_only:true,sync:{status:"local-only",cloud_archive_id:CLOUD_ID,attempt_count:0}});
 if(withImage)tr.objectStore("images").put({id:"image-a",archive_id:"local-a",record_id:"record-a",blob:new Blob([Uint8Array.from([1,2,3])],{type:"image/png"}),mime_type:"image/png",name:"synthetic.png",original_size:3,cached_size:3,sort_order:0,created_at:time,local_only:true,sync:{status:"local-only",cloud_archive_id:CLOUD_ID,attempt_count:0}});
 await done;db.close();
 trace.length=0;
}
async function snapshot(){
 const db=await waitRequest(indexedDB.open("life-space-local-offline",6));
 const tx=db.transaction(["archives","records","images"],"readonly");
 const out={};for(const name of ["archives","records","images"])out[name]=await waitRequest(tx.objectStore(name).getAll());
 await waitTx(tx);db.close();
 return out;
}
const cases=[];
async function verify(label,fn){try{await fn();cases.push({case:label,pass:true});}catch(e){cases.push({case:label,pass:false,error:String(e.stack||e).slice(0,900)});}}
const params={ownerContext:{userId:OWNER_A,email:"a@example.test"}};
for(const [label,mode,identity] of [
 ["cross_owner", "valid",OWNER_B],["unverified_null_session","valid",null],["auth_error","auth_error",null],["identity_timeout","timeout",null]
]){
 await verify(label,async()=>{
  await fixture();state.authMode=mode;state.auth=identity;
  const before=await snapshot();
  let result;try{result=await sync.syncAllPendingCloudArchives(params);}catch(e){result={rejected:true,error:String(e)};}
  const after=await snapshot();
  const changed=after.records[0].sync.status!==before.records[0].sync.status||after.images[0].sync.status!==before.images[0].sync.status;
  const calls=trace.filter(x=>x.kind==="identity_check").length;
  const post=trace.filter(x=>x.kind==="business_POST"||x.kind==="business_PATCH"||x.kind==="business_RPC");
  if(BASELINE){assert.equal(changed,true,"Prepatch should prove pre-auth IndexedDB mutation");}
  else{assert.equal(changed,false,"Auth not proven must preserve IDB and queue");assert.equal(after.records[0].sync.client_operation_id,before.records[0].sync.client_operation_id);}
  assert.equal(post.length,0,"Unauthorized case must never issue business write");
  assert(calls>=1,"Expected remote auth check");
  console.log("CASE",label,JSON.stringify({identity_checks:calls,record_sync_before:before.records[0].sync.status,record_sync_after:after.records[0].sync.status,image_sync_after:after.images[0].sync.status,business_http_writes:post.length,rejected:!!result?.rejected}));
 });
}
await verify("legitimate_owner_active_record_sync",async()=>{
 await fixture({withImage:false,role:"saved-local-copy"});state.auth=OWNER_A;
 const result=await sync.syncAllPendingCloudArchives(params);
 const row=(await snapshot()).records[0];
 const posts=trace.filter(x=>x.kind==="business_POST");
 assert.equal(result.length,1);assert.equal(result[0].success,true);
 assert.equal(posts.length,1);assert.equal(posts[0].operationId,row.sync.cloud_record_id,"Remote operation ID must be persisted as the synced cloud record ID");
 assert.equal(row.sync.status,"synced");
 console.log("CASE legitimate_owner_active_record_sync",JSON.stringify({success:result[0].success,remote_POST:posts.length,record_sync:row.sync.status,operation_id:row.sync.client_operation_id}));
});
await verify("unknown_receipt_preserves_pending_no_repeat_post",async()=>{
 await fixture({withImage:false,role:"saved-local-copy"});state.auth=OWNER_A;state.recordOutcome="unknown";
 const first=await sync.syncAllPendingCloudArchives(params);
 const afterFirst=(await snapshot()).records[0];
 const post1=trace.filter(x=>x.kind==="business_POST").length;
 const second=await sync.syncAllPendingCloudArchives(params);
 const afterSecond=(await snapshot()).records[0];
 const post2=trace.filter(x=>x.kind==="business_POST").length;
 assert.equal(first[0].success,false);assert.equal(afterFirst.sync.status,"failed");
 assert(afterFirst.sync.attempt_count>0);assert.equal(post1,1);assert.equal(post2,1,"UNKNOWN must not duplicate POST");
 assert.equal(afterSecond.sync.client_operation_id,afterFirst.sync.client_operation_id);
 assert.equal(second[0].success,false);
 console.log("CASE unknown_receipt_preserves_pending_no_repeat_post",JSON.stringify({initial_POST:post1,after_retry_POST:post2,pending:afterSecond.sync.status,attempts:afterSecond.sync.attempt_count}));
});
await verify("http500_receipt_preserves_pending_no_repeat_post",async()=>{
 await fixture({withImage:false,role:"saved-local-copy"});state.auth=OWNER_A;state.recordOutcome="http500";
 const first=await sync.syncAllPendingCloudArchives(params);
 const beforeRetry=(await snapshot()).records[0];
 const posted=trace.filter(x=>x.kind==="business_POST").length;
 const second=await sync.syncAllPendingCloudArchives(params);
 const afterRetry=(await snapshot()).records[0];
 assert.equal(first[0].success,false);assert.equal(second[0].success,false);
 assert.equal(beforeRetry.sync.status,"failed");assert(beforeRetry.sync.attempt_count>0);
 assert.equal(afterRetry.sync.client_operation_id,beforeRetry.sync.client_operation_id);
 assert.equal(posted,1);assert.equal(trace.filter(x=>x.kind==="business_POST").length,1);
 console.log("CASE http500_receipt_preserves_pending_no_repeat_post",JSON.stringify({posted,pending:afterRetry.sync.status,attempts:afterRetry.sync.attempt_count}));
});
await verify("single_project_cross_owner_prequeue_gate",async()=>{
 await fixture();state.auth=OWNER_B;
 const before=await snapshot();
 const result=await sync.syncPendingCloudArchive({localArchiveId:"local-a",ownerContext:params.ownerContext});
 const after=await snapshot();
 assert.equal(result.success,false);assert.equal(after.records[0].sync.status,before.records[0].sync.status);
 assert.equal(after.images[0].sync.status,before.images[0].sync.status);
 assert.equal(trace.filter(x=>x.kind==="business_POST").length,0);
 console.log("CASE single_project_cross_owner_prequeue_gate",JSON.stringify({success:result.success,pending_unchanged:true}));
});
const fail=cases.filter(x=>!x.pass);console.log("R22_SUMMARY",JSON.stringify({baseline:BASELINE,total:cases.length,pass:cases.length-fail.length,failures:fail}));
if(fail.length)process.exitCode=1;
