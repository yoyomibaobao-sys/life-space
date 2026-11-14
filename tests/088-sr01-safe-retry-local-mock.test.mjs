import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
import test from "node:test";

const owner="11111111-1111-4111-8111-111111111111";
const foreign="22222222-2222-4222-8222-222222222222";
const archiveId="33333333-3333-4333-8333-333333333333";
const recordId="44444444-4444-4444-8444-444444444444";
const opId="55555555-5555-4555-8555-555555555555";
const localArchiveId="sr01-archive",localRecordId="sr01-record",localImageId="sr01-image";
const prevFetch=globalThis.fetch;
process.env.NEXT_PUBLIC_SUPABASE_URL="https://sr01.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="sr01-anon";
globalThis.window={dispatchEvent(){}};
globalThis.CustomEvent=class {constructor(type,data){this.type=type;this.detail=data?.detail;}};
let state;

function reset(status="failed",outcome="definite-rejection",attempt=1,mode="success"){
  state={
    auth:owner, mode,mediaError:false,storageError:false,
    remoteMedia:new Map(),remoteObjects:new Set(),writes:0,
    storagePosts:[],reserves:[],settles:0,prepared:0,
    reservationMessage:null,reservationStatus:null,injectRace:false,
    archives:new Map([[archiveId,{id:archiveId,user_id:owner,is_public:false,default_record_visibility:"private",trashed_at:null}]]),
    records:new Map([[recordId,{id:recordId,archive_id:archiveId,user_id:owner,trashed_at:null}]]),
    local:{
      archive:{id:localArchiveId,source_cloud_archive_id:archiveId,local_owner_user_id:owner,local_role:"cloud-offline-cache",cycles:[],sync:{status:"synced",attempt_count:0}},
      records:[{id:localRecordId,archive_id:localArchiveId,sync:{status:"synced",cloud_record_id:recordId},images:[
        {id:localImageId,archive_id:localArchiveId,record_id:localRecordId,name:"original.jpg",blob:new Blob(["original-bytes"],{type:"image/jpeg"}),metadata_stripped:true,mime_type:"image/jpeg",created_at:"2026-11-12T00:00:00Z",
         sync:{status,operation_kind:"upload-image",client_operation_id:opId,attempt_count:attempt,last_attempt_outcome:outcome,cloud_archive_id:archiveId,cloud_record_id:recordId}}
      ]}]
    }
  };
}
const fakeSupabase={
  auth:{
    getUser:async()=>({data:{user:{id:state.auth}},error:null}),
    getSession:async()=>({data:{session:{access_token:"test-token"}},error:null}),
  },
  from(table){
    const predicates=[];let payload=null;
    return {
      select(){return this},
      eq(key,val){predicates.push([key,val]);return this},
      is(key,val){predicates.push([key,val]);return this},
      insert(rows){payload=rows[0];return this},
      async maybeSingle(){
        if(table==="media"){
          if(payload){
            state.writes++;
            if(state.remoteMedia.has(payload.id))return {data:null,error:{code:"23505"}};
            state.remoteMedia.set(payload.id,{...payload});
            return {data:{...payload},error:null};
          }
          if(state.mediaError)return {data:null,error:{message:"media lookup failed"}};
          return {data:[...state.remoteMedia.values()].find(x=>predicates.every(([k,v])=>x[k]===v))||null,error:null};
        }
        const map=table==="archives"?state.archives:table==="records"?state.records:null;
        assert.ok(map,"unexpected table");
        return {data:[...map.values()].find(x=>predicates.every(([k,v])=>x[k]===v))||null,error:null};
      }
    };
  },
  storage:{
    from(bucket){
      assert.equal(bucket,"media");
      return {list:async(folder,{search})=>{
        if(state.storageError)return {data:null,error:{message:"storage list failed"}};
        return {data:[...state.remoteObjects].filter(x=>x.startsWith(folder+"/")).map(x=>({name:x.slice(folder.length+1)})).filter(x=>x.name.includes(search)),error:null};
      }};
    }
  }
};
globalThis.fetch=async(input,init)=>{
  const url=new URL(input);
  assert.equal(url.origin,"https://sr01.invalid","test must not reach QA or production");
  assert.equal(init.method,"POST");
  const mediaPrefix="/storage/v1/object/media/";
  assert.ok(url.pathname.startsWith(mediaPrefix));
  const key=url.pathname.slice(mediaPrefix.length).split("/").map(decodeURIComponent).join("/");
  state.storagePosts.push({key,upsert:init.headers["x-upsert"]});
  if(state.mode==="network")throw new Error("connection reset");
  if(/^http(403|408|409|425|429|499)$/.test(state.mode))
    return new Response('{"message":"synthetic failure"}',{status:Number(state.mode.slice(4))});
  if(state.mode==="http503"||state.mode==="commit503"){
    if(state.mode==="commit503")state.remoteObjects.add(key);
    return new Response('{"message":"unavailable"}',{status:503});
  }
  if(state.remoteObjects.has(key)&&init.headers["x-upsert"]==="false")
    return new Response('{"message":"duplicate"}',{status:409});
  state.remoteObjects.add(key);
  return new Response('{"ok":true}',{status:200});
};
const globals={
  supabase:fakeSupabase,
  detail:()=>structuredClone(state.local),
  updateImage:async(id,operation,patch)=>{
    const image=state.local.records[0].images[0];
    if(id!==image.id||operation!==image.sync.client_operation_id)return null;
    image.sync={...image.sync,...patch,attempt_count:image.sync.attempt_count+(patch.status==="uploading"?1:0)};
    if(patch.status==="uploading")image.sync.last_attempt_outcome="in-flight";
    if(patch.status==="failed")image.sync.last_attempt_outcome=patch.last_attempt_outcome||"unknown";
    if(patch.status==="synced"){image.sync.client_operation_id=null;image.sync.last_attempt_outcome="committed";}
    return structuredClone(image);
  },
  reserve:async(args)=>{
    state.reserves.push(structuredClone(args));
    if(state.injectRace)state.remoteObjects.add(args.storagePath);
    const message=state.reservationMessage||(state.local.records[0].images[0].sync.attempt_count>1?"already_reserved":"reserved");
    const status=state.reservationStatus||"reserved";
    return {ok:!["already_cancelled","reservation_conflict"].includes(message),reservation_id:opId,reservation_mode:"reservation",status,message};
  },
  settle:async()=>{state.settles++;return {ok:true};},
  prepare:async()=>{state.prepared++;}
};
globalThis.__sr01=globals;
const stubs={
  "@/lib/local-offline-db":[
    "export const getLocalArchiveDetail=async()=>globalThis.__sr01.detail();",
    "export const isPendingCloudCreateArchive=()=>false;",
    "export const isPendingCloudSyncStatus=s=>['pending-cloud-sync','uploading','failed'].includes(s);",
    "export const listPendingCloudSyncSummaries=async()=>[];",
    "export const preparePendingCloudSyncQueue=()=>globalThis.__sr01.prepare();",
    "export const updateLocalImageCloudSyncOperation=(id,op,patch)=>globalThis.__sr01.updateImage(id,op,patch);",
    "export const clearPendingCloudSyncPromptIfComplete=async()=>{};",
    "export const convertPendingCloudProjectToOfflineCache=async()=>{};",
    "export const updateLocalArchiveCloudSyncOperation=async()=>{throw Error('unexpected archive write')};",
    "export const updateLocalRecordCloudSyncOperation=async()=>{throw Error('unexpected record write')};",
    "export const persistLocalCloudArchiveMapping=async()=>{throw Error('unexpected mapping write')};",
    "export const discardVerifiedPendingArchiveEdit=async()=>{};",
    "export const discardVerifiedPendingRecordEdit=async()=>{};"
  ].join("\n"),
  "@/lib/supabase":"export const supabase=globalThis.__sr01.supabase;",
  // QA R2 shadow mirror is disabled in this historical source-upload retry
  // suite; the real R2 journal/retry flows run in dedicated R2 tests.
  "@/lib/r2-business-media-mirror":"export const mirrorCommittedRecordMedia=async()=> 'disabled';",
  // This 088 suite tests idempotent retries, not image decoding. Its original
  // intentionally synthetic non-JPEG bytes are handled by a codec boundary
  // stub; 128-r02-pending-photo-guard.test.mjs exercises the actual strict guard.
  "@/lib/pending-sync-photo-guard":[
    "export const preparePendingSyncPhoto=async(image,codecs)=>{",
    "const originalFile=new File([image.blob],image.name||'image.jpg',{type:'image/jpeg'});",
    "const result=await codecs.thumbnail(originalFile);",
    "return {originalFile,uploadFile:originalFile,thumbFile:result.file,standardized:null};",
    "};"
  ].join("\n"),
  "@/lib/android-connectivity":"export const isAndroidOnline=()=>true;",
  "@/lib/image-compression":[
    "export const standardizeRecordPhotoFile=async()=>{throw Error('unexpected compression')};",
    "export const createImageThumbnailFile=async()=>({wasGenerated:true,file:new File(['thumbnail-bytes'],'thumbnail.jpg',{type:'image/jpeg'})});"
  ].join("\n"),
  "@/lib/planting-region":"export const normalizePlantingRegion=x=>x;",
  "@/lib/storage-usage":[
    "export const reserveStorageUpload=args=>globalThis.__sr01.reserve(args);",
    "export const settleStorageUploadReservation=()=>globalThis.__sr01.settle();"
  ].join("\n"),
  "@/lib/supabase-schema-compat":"export const isMissingDatabaseColumn=()=>false;export const withoutCapturedAt=x=>x;",
  "@/lib/local-to-cloud-sync":"export const ensureCloudCycles=async()=>{};",
  "@/lib/android-project-taxonomy":"export const loadCloudProjectTaxonomy=async()=>[];",
  "@/lib/pending-cloud-taxonomy":"export const resolvePendingCloudTaxonomy=async()=>({sub_tag_id:null,group_tag_id:null});"
};
const bundle=await build({
  entryPoints:[path.resolve("lib/pending-cloud-sync.ts")],
  platform:"node",format:"esm",bundle:true,write:false,
  plugins:[{name:"088-sr01-dependencies",setup(b){
    b.onResolve({filter:/^@\//},args=>{
      if(args.path==="@/lib/media-storage-upload")
        return {path:path.resolve("lib/media-storage-upload.ts")};
      assert.ok(Object.hasOwn(stubs,args.path),"Unexpected dependency "+args.path);
      return {path:args.path,namespace:"stub"};
    });
    b.onLoad({filter:/.*/,namespace:"stub"},args=>({contents:stubs[args.path],loader:"js"}));
  }}]
});
const mod=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
const send=()=>mod.syncPendingCloudArchive({localArchiveId,targetRecordId:localRecordId,ownerContext:{userId:owner}});
const img=()=>state.local.records[0].images[0];
const pathPair=()=>mod.buildPendingMediaStoragePaths({userId:owner,recordId,operationId:opId,fileName:"original.jpg",thumbnailName:"thumbnail.jpg"});
const noRemoteWrites=()=>{assert.equal(state.reserves.length,0);assert.equal(state.storagePosts.length,0);assert.equal(state.writes,0);};

test("403 confirmed failure then one safe retry preserves all identities",async()=>{
  reset("pending-cloud-sync",null,0,"http403");
  const first=await send();assert.equal(first.success,false);
  assert.equal(img().sync.last_attempt_outcome,"definite-rejection");
  assert.equal(img().sync.attempt_count,1);
  assert.equal(img().sync.client_operation_id,opId);
  state.mode="success";
  const result=await send();
  assert.equal(result.success,true,JSON.stringify(result));
  assert.equal(img().sync.status,"synced");
  assert.equal(img().sync.attempt_count,2);
  assert.equal(state.reserves.length,2);
  assert.ok(state.reserves.every(x=>x.reservationId===opId));
  assert.equal(state.remoteMedia.size,1);
  assert.equal(state.remoteObjects.size,2);
  assert.deepEqual(new Set(state.storagePosts.slice(-2).map(x=>x.key)),new Set(Object.values(pathPair())));
  assert.ok(state.storagePosts.slice(-2).every(x=>x.upsert==="false"));
  const again=await send();assert.equal(again.success,true);
  assert.equal(state.storagePosts.length,3);
  assert.equal(state.writes,1);
});

test("historical UNKNOWN / in-flight / null outcomes block remote writes",async()=>{
  for(const [status,outcome] of [["failed","unknown"],["failed",null],["failed","in-flight"],["uploading","in-flight"]]){
    reset(status,outcome);
    const sync=structuredClone(img().sync);
    const result=await send();
    assert.equal(result.success,false,status+"/"+outcome);
    noRemoteWrites();
    assert.deepEqual(img().sync,sync);
  }
});

test("503, network loss and ambiguous 503 after commit are not retried",async()=>{
  for(const mode of ["http503","network","commit503"]){
    reset("pending-cloud-sync",null,0,mode);
    assert.equal((await send()).success,false);
    assert.equal(img().sync.last_attempt_outcome,"unknown");
    const written=state.storagePosts.length;
    assert.equal((await send()).success,false);
    assert.equal(state.storagePosts.length,written);
  }
});

test("existing full/thumb object or media row rejects retry without overwrite",async()=>{
  for(const which of ["storagePath","thumbPath"]){
    reset();state.remoteObjects.add(pathPair()[which]);
    assert.equal((await send()).success,false);
    noRemoteWrites();
  }
  for(const mode of ["mediaId","mainPath","thumbPath"]){
    reset();
    state.remoteMedia.set(mode,{
      id:mode==="mediaId"?opId:foreign,
      record_id:recordId,user_id:owner,
      storage_path:mode==="mainPath"?pathPair().storagePath:"other",
      thumb_path:mode==="thumbPath"?pathPair().thumbPath:"other"
    });
    assert.equal((await send()).success,false,mode);
    noRemoteWrites();
  }
});

test("Owner, record, project mismatch and remote lookup failure fail closed",async()=>{
  for(const mode of ["auth","owner","record-owner","record-archive","record-missing","image-mapping","media-id-mapping","media-read","storage-read"]){
    reset();
    if(mode==="auth")state.auth=foreign;
    if(mode==="owner")state.archives.get(archiveId).user_id=foreign;
    if(mode==="record-owner")state.records.get(recordId).user_id=foreign;
    if(mode==="record-archive")state.records.get(recordId).archive_id=foreign;
    if(mode==="record-missing")state.records.clear();
    if(mode==="image-mapping")img().sync.cloud_record_id=foreign;
    if(mode==="media-id-mapping")img().sync.cloud_media_id=foreign;
    if(mode==="media-read")state.mediaError=true;
    if(mode==="storage-read")state.storageError=true;
    assert.equal((await send()).success,false,mode);
    noRemoteWrites();
  }
});

test("full Storage search page is not proof of object absence",async()=>{
  reset();
  const {storagePath}=pathPair();
  for(let i=0;i<100;i++)state.remoteObjects.add(storagePath+"-"+i);
  assert.equal((await send()).success,false);
  noRemoteWrites();
  assert.equal(img().sync.attempt_count,1);
});

test("bad reservation states block Storage and media writes",async()=>{
  for(const [status,message] of [
    ["settled","already_settled"],["cancelled","already_cancelled"],
    ["reserved","reservation_conflict"],["unknown","already_reserved"],
    ["reserved","unexpected"]
  ]){
    reset();state.reservationStatus=status;state.reservationMessage=message;
    assert.equal((await send()).success,false,status+"/"+message);
    assert.equal(state.reserves.length,1);
    assert.equal(state.storagePosts.length,0);
    assert.equal(state.writes,0);
  }
});

test("HTTP 408, 409, 425, 429 and 499 are uncertain and never auto-retry",async()=>{
  for(const mode of ["http408","http409","http425","http429","http499"]){
    reset("pending-cloud-sync",null,0,mode);
    assert.equal((await send()).success,false,mode);
    assert.equal(img().sync.last_attempt_outcome,"unknown",mode);
    const count=state.storagePosts.length;
    assert.equal((await send()).success,false,mode);
    assert.equal(state.storagePosts.length,count,mode);
  }
});

test("precheck-to-insert race returns 409 without overwriting a competing object",async()=>{
  reset();state.injectRace=true;
  assert.equal((await send()).success,false);
  assert.equal(state.storagePosts.length,1);
  assert.equal(state.storagePosts[0].upsert,"false");
  assert.equal(state.remoteMedia.size,0);
  assert.equal(img().sync.last_attempt_outcome,"unknown");
  const count=state.storagePosts.length;
  assert.equal((await send()).success,false);
  assert.equal(state.storagePosts.length,count);
});

test("first normal upload still works and second dispatch is a no-op",async()=>{
  reset("pending-cloud-sync",null,0);
  const result=await send();assert.equal(result.success,true,JSON.stringify(result));
  assert.equal(state.remoteMedia.size,1);
  assert.equal(state.remoteObjects.size,2);
  assert.equal(state.reserves.length,1);
  assert.equal((await send()).success,true);
  assert.equal(state.reserves.length,1);
  assert.equal(state.storagePosts.length,2);
});

process.on("exit",()=>{globalThis.fetch=prevFetch;});
