import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { build } from "esbuild";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";

async function moduleFrom(entry) {
  const result = await build({entryPoints:[entry],bundle:true,write:false,platform:"node",format:"esm"});
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
}
const db=await moduleFrom("lib/local-offline-db.ts");
const request=(r)=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const finished=(tx)=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
const owner={userId:"w5-qa-owner",email:"qa@example.invalid"};
async function fixture(){
  const data=new Map();
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
  globalThis.indexedDB=new IDBFactory();
  globalThis.window={localStorage,indexedDB};
  const open=indexedDB.open("life-space-local-offline",6);
  open.onupgradeneeded=()=>{for(const name of ["archives","records","images","taxonomy"]){const store=open.result.createObjectStore(name,{keyPath:"id"});if(name==="images")store.createIndex("archive_id","archive_id");if(name==="records")store.createIndex("archive_id","archive_id");}};
  const conn=await request(open);
  const tx=conn.transaction("archives","readwrite"); const done=finished(tx);
  tx.objectStore("archives").add({
    id:"qa-offline-project",title:"临时空间已缓存项目",category:"system",main_category:"system",system_name:"堆肥",
    local_owner_user_id:owner.userId,local_owner_email:owner.email,
    source_cloud_archive_id:"11111111-1111-4111-8111-111111111111",
    source_cloud_saved_at:"2026-11-02T01:00:00.000Z",status:"active",
    created_at:"2026-11-02T01:00:00.000Z",updated_at:"2026-11-02T01:00:00.000Z",
    local_only:true,sync:{status:"local-only"},
  });
  await done;conn.close();
}
function jpeg(){
  // A small deterministic JPEG-like local File; image decoding is not needed for
  // the IDB storage regression, and unsupported canvas safely keeps original bytes.
  return new File([Uint8Array.from([255,216,255,224,0,16,74,70,73,70,0,255,217])],
     "qa-synthetic.jpg",{type:"image/jpeg"});
}
function failChromiumBlobWrites(){
  const original=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(value,...args){
    if(this.name==="images" && value?.blob instanceof Blob) {
      throw new DOMException("Failed to write blobs (IOError)","UnknownError");
    }
    return original.call(this,value,...args);
  };
  return ()=>{IDBObjectStore.prototype.add=original};
}
test("SAF discards only uncommitted candidate grants, never the active saved permission",()=>{
 const java=fs.readFileSync("android/app/src/main/java/com/youshi/cultivation/LocalSafPlugin.java","utf8");
 const discard=java.slice(java.indexOf("public void discardDirectory("),java.indexOf("public void directoryStatus("));
 assert.match(discard,/candidateTree/);
 assert.match(discard,/discarded\.toString\(\)\.equals\(saved\)/);
 assert.match(discard,/releasePersistableUriPermission\(discarded, flags\)/);
 assert.doesNotMatch(discard,/clear\(\)|for \(.*getPersistedUriPermissions\(\)\)[\s\S]*releasePersistableUriPermission\(permission\.getUri/);
});
test("WebView simulated IndexedDB Blob IOError is bypassed using byte-backed new record media",async()=>{
 await fixture();const restore=failChromiumBlobWrites();
 try{
   const record=await db.createLocalRecord({archive_id:"qa-offline-project",note:"断网合成JPEG",image_files:[jpeg()]});
   const detail=await db.getLocalArchiveDetail("qa-offline-project",owner);
   const added=detail.records.find(x=>x.id===record.id);
   assert.ok(added,"new record must survive DB roundtrip");
   assert.equal(added.images.length,1);
   assert.equal(added.images[0].blob instanceof Blob,true);
   assert.equal(added.images[0].blob.type,"image/jpeg");
   assert.equal(added.images[0].blob.size,jpeg().size);
   assert.equal(added.images[0].sync.operation_kind,"upload-image");
 }finally{restore();}
});
test("successful serialized image never disables original pending operation ownership",async()=>{
 await fixture();const restore=failChromiumBlobWrites();
 try{
   const record=await db.createLocalRecord({archive_id:"qa-offline-project",note:"pending原子性",image_files:[jpeg()]});
   const list=await db.listPendingCloudSyncSummaries(owner);
   const detail=await db.getLocalArchiveDetail("qa-offline-project",owner);
   const added=detail.records.find(x=>x.id===record.id);
   assert.ok(added);
   assert.equal(added.images[0].sync.depends_on_operation_id,added.sync.client_operation_id);
   assert.ok(list.length>=1);
 }finally{restore();}
});
test("a complete IndexedDB media failure aborts the pending record and leaves the original archive intact",async()=>{
 await fixture();
 const originalAdd=IDBObjectStore.prototype.add;
 IDBObjectStore.prototype.add=function(value,...args){
   if(this.name==="images") throw new DOMException("simulated persistent storage exhausted","QuotaExceededError");
   return originalAdd.call(this,value,...args);
 };
 try{
   await assert.rejects(db.createLocalRecord({archive_id:"qa-offline-project",note:"must rollback",image_files:[jpeg()]}),/simulated persistent storage exhausted/);
 }finally{IDBObjectStore.prototype.add=originalAdd;}
 const conn=await request(indexedDB.open("life-space-local-offline",6));
 const tx=conn.transaction(["archives","records","images"],"readonly");
 const [parent,records,images]=await Promise.all([
   request(tx.objectStore("archives").get("qa-offline-project")),
   request(tx.objectStore("records").getAll()),
   request(tx.objectStore("images").getAll()),
 ]);
 assert.equal(records.length,0,"a failed media add must not leave an orphan record");
 assert.equal(images.length,0);
 assert.equal(parent.id,"qa-offline-project");
 assert.equal(parent.sync.status,"local-only","previous project and sync data remain intact");
 conn.close();
});
