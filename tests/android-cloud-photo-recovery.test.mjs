import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build, transform } from "esbuild";
import "fake-indexeddb/auto";

const OWNER = "f99fd44d-820f-41f2-ad4e-85feb7c990a6";
const ARCHIVE = "724286b6-cc2c-45eb-8a85-a6b2f9fc9c55";
const RECORD = "42ddbbff-8de4-485c-90f3-55936393d7be";
const FILE = new File([new Uint8Array([3,8,9,10,21,54,88])],
  "r21-test-image.png", {type:"image/png"});
const THUMB = new File([new Uint8Array([7,11,18,23])],"r21-thumb.jpg",{type:"image/jpeg"});

const state = {
  ownerId:OWNER, records:new Map(), media:new Map(), storage:new Map(),
  writes:{ records:0, media:0, primary:0, thumb:0, reserve:0, settled:0 },
  lostAck:false,
};
state.records.set(RECORD,{id:RECORD,archive_id:ARCHIVE,user_id:OWNER});
globalThis.__r21Fake = state;
const mocks = {
  "lib/supabase": 'export const supabase=globalThis.__r21Api;',
  "lib/image-compression": 'export async function standardizeRecordPhotoFile(file){return {file,width:600,height:420}};export async function createImageThumbnailFile(){return {wasGenerated:true,file:globalThis.__r21Thumb}};',
  "lib/media-storage-upload": 'export async function uploadMediaStorageObject(path,file){return globalThis.__r21Upload(path,file)};',
  "lib/storage-usage": 'export async function reserveStorageUpload(){globalThis.__r21Fake.writes.reserve++;return {ok:true,reservation_mode:"reservation"}};export async function settleStorageUploadReservation(){globalThis.__r21Fake.writes.settled++;return {ok:true}};',
  "lib/membership": 'export function normalizeMembershipRpcResult(data){return data};export function canCreateMembershipContent(data){return data?.can_create_content===true}',
  "lib/storage-upload-maintenance": 'export async function isStorageUploadMaintenance(){return false}',
};
globalThis.__r21Thumb=THUMB;
globalThis.__r21Upload=async(path,file)=>{
  const name=path.includes("/thumb")||path.endsWith("-thumb.jpg")?"thumb":"primary";
  state.writes[name]++;
  state.storage.set(path,new Blob([await file.arrayBuffer()],{type:file.type}));
  if(state.lostAck){state.lostAck=false;return {error:{message:"lost response"}};}
  return {error:null};
};
function fakeQuery(table) {
  const eqs={};
  const q={
    select(){return q;},
    eq(k,v){eqs[k]=v;return q;},
    limit(){return Promise.resolve({data:[...state.media.values()].filter(row=>
      table==="media"&&Object.entries(eqs).every(([k,v])=>row[k]===v)),error:null});},
    maybeSingle(){
      if(table==="records")return Promise.resolve({data:state.records.get(eqs.id)||null,error:null});
      if(table==="archives")return Promise.resolve({data:eqs.user_id===OWNER?{id:ARCHIVE,user_id:OWNER}:null,error:null});
      return Promise.resolve({data:null,error:null});
    },
    insert(rows){
      if(table!=="media")throw Error("unexpected write");
      const item=rows[0];
      if(state.media.has(item.storage_path))throw Error("duplicate media");
      state.media.set(item.storage_path,item);state.writes.media++;
      return {select(){return {single:async()=>({data:{id:item.id},error:null})}}};
    },
  };
  return q;
}
globalThis.__r21Api={
  auth:{getUser:async()=>({data:{user:{id:state.ownerId}},error:null})},
  from:fakeQuery,
  rpc:async(name)=>name==="get_my_membership"
    ?{data:{can_create_content:true},error:null}:Promise.reject(Error("unexpected_rpc_"+name)),
  storage:{from:()=>({
    async download(path){
      const blob=state.storage.get(path);
      return blob?{data:blob,error:null}:{data:null,error:{statusCode:404,message:"Object not found"}};
    },
  })},
};

const output=await build({
  entryPoints:["lib/cloud-record-photo-recovery.ts"],
  platform:"node",format:"esm",bundle:true,write:false,target:"es2022",
  plugins:[{name:"r21-isolate",setup(builder){
    builder.onResolve({filter:/^@\//},(args)=>({path:args.path.slice(2),namespace:"fake"}));
    builder.onLoad({filter:/.*/,namespace:"fake"},({path})=>{
      const source=mocks[path];
      if(!source)throw Error("missing R21 isolated mock "+path);
      return {contents:source,loader:"js"};
    });
  }}],
});
const moduleUrl="data:text/javascript;base64,"+Buffer.from(output.outputFiles[0].text).toString("base64");
const recovery=await import(moduleUrl);
function createRequestId(){
  return crypto.randomUUID();
}

test("durable blob and owner/project/request scoping before any server write",async()=>{
  const requestId=createRequestId();
  const entry=await recovery.stageRecovery({
    ownerId:OWNER,archiveId:ARCHIVE,requestId,note:"R21 isolated test",files:[FILE],
  });
  assert.equal(entry.phase,"prepared");
  assert.equal(entry.recordId,null);
  const stored=await recovery.readRecovery(OWNER,ARCHIVE,requestId);
  assert.deepEqual(new Uint8Array(await stored.photos[0].image.arrayBuffer()),
    new Uint8Array(await FILE.arrayBuffer()));
  assert.equal(await recovery.readRecovery(OWNER,ARCHIVE,crypto.randomUUID()),null);
  assert.equal(state.writes.records,0);
  assert.equal(state.writes.media,0);
  await recovery.eraseRecovery(OWNER,ARCHIVE,requestId);
});

test("bind confirmed record only once and reject mismatched id",async()=>{
  const requestId=createRequestId();
  const initial=await recovery.stageRecovery({ownerId:OWNER,archiveId:ARCHIVE,
    requestId,note:"binding",files:[FILE]});
  const bound=await recovery.bindRecoveryRecord(initial,{ id: RECORD });
  assert.equal(bound.recordId,RECORD);
  assert.equal(bound.recordProof, "create-receipt");
  assert.ok(bound.photos[0].path.includes("/"+RECORD+"/"));
  await assert.rejects(recovery.bindRecoveryRecord(initial,{ id: crypto.randomUUID() }),/record_conflict/);
  await recovery.eraseRecovery(OWNER,ARCHIVE,requestId);
});

test("one media-only upload confirms storage SHA and avoids second record",async()=>{
  const requestId=createRequestId();
  const staged=await recovery.stageRecovery({ownerId:OWNER,archiveId:ARCHIVE,
    requestId,note:"first-media",files:[FILE]});
  const bound=await recovery.bindRecoveryRecord(staged,{ id: RECORD });
  const countBefore={...state.writes};
  const first = recovery.completeRecovery(bound);
  const concurrent = recovery.completeRecovery(bound);
  assert.equal(concurrent, first);
  const complete = await first;
  assert.equal(complete.phase,"media-confirmed");
  assert.equal(state.writes.records,0);
  assert.equal(state.writes.media-countBefore.media,1);
  assert.equal(state.writes.primary-countBefore.primary,1);
  assert.equal(state.writes.thumb-countBefore.thumb,1);
  assert.equal(state.media.size,1);
  const after = { ...state.writes };
  assert.equal((await recovery.completeRecovery(bound)).phase, "media-confirmed");
  assert.deepEqual(state.writes, after);
  await recovery.eraseRecovery(OWNER,ARCHIVE,requestId);
});

test("lost upload acknowledgment preserves path; replay skips existing storage",async()=>{
  const requestId=createRequestId();
  const staged=await recovery.stageRecovery({ownerId:OWNER,archiveId:ARCHIVE,
    requestId,note:"acklost",files:[FILE]});
  const bound=await recovery.bindRecoveryRecord(staged,{ id: RECORD });
  state.lostAck=true;
  const first=state.writes.primary;
  await assert.rejects(recovery.completeRecovery(bound),/upload_unknown/);
  assert.equal(state.writes.primary-first,1);
  const retry=await recovery.completeRecovery(bound);
  assert.equal(retry.phase,"media-confirmed");
  assert.equal(state.writes.primary-first,1);
  assert.equal(state.writes.records,0);
  await recovery.eraseRecovery(OWNER,ARCHIVE,requestId);
});

test("foreign server session blocks recovery before reserve/upload",async()=>{
  const requestId=createRequestId();
  const staged=await recovery.stageRecovery({ownerId:OWNER,archiveId:ARCHIVE,
    requestId,note:"owner-negative",files:[FILE]});
  const bound=await recovery.bindRecoveryRecord(staged,{ id: RECORD });
  const before={...state.writes};
  state.ownerId=crypto.randomUUID();
  await assert.rejects(recovery.completeRecovery(bound),/auth_owner_mismatch/);
  assert.deepEqual(state.writes,before);
  state.ownerId=OWNER;
  await recovery.eraseRecovery(OWNER,ARCHIVE,requestId);
});

test("record ID in another archive or under another Owner cannot reserve or upload", async () => {
  const requestId = createRequestId();
  const entry = await recovery.stageRecovery({ ownerId: OWNER, archiveId: ARCHIVE,
    requestId, note: "same note", files: [FILE] });
  const bound = await recovery.bindRecoveryRecord(entry, { id: RECORD });
  const original = state.records.get(RECORD);
  const before = { ...state.writes };
  try {
    for (const row of [
      { ...original, archive_id: crypto.randomUUID() },
      { ...original, user_id: crypto.randomUUID() },
    ]) {
      state.records.set(RECORD, row);
      await assert.rejects(recovery.completeRecovery(bound), /recovery_record_owner_denied/);
      assert.deepEqual(state.writes, before);
    }
  } finally {
    state.records.set(RECORD, original);
    await recovery.eraseRecovery(OWNER, ARCHIVE, requestId);
  }
});

const composer = await readFile(new URL("../app/archive/[id]/AddRecord.tsx", import.meta.url), "utf8");
const recoverSource = composer.slice(
  composer.indexOf("  async function recoverConfirmedRecordPhoto()"),
  composer.indexOf("  async function handleAdd()"),
);
const { code: recoverCode } = await transform(recoverSource, { loader: "ts" });

for (const [title, journalType] of [
  ["missing journal", "missing"],
  ["journal without a record ID", "unbound"],
  ["legacy record ID with no receipt provenance", "legacy"],
]) {
  test(`same-note older record cannot be selected with ${title}`, async () => {
    const requestId = createRequestId();
    const staged = journalType === "missing" ? null : await recovery.stageRecovery({
      ownerId: OWNER, archiveId: ARCHIVE, requestId, note: "same note", files: [FILE],
    });
    if (journalType === "legacy") await recovery.writeRecovery({ ...staged, recordId: RECORD });
    const before = await recovery.readRecovery(OWNER, ARCHIVE, requestId);
    const writes = { ...state.writes };
    let touchedRecordLookup = false;
    let error = "";
    const deps = {
      archiveId: ARCHIVE, submissionNeedsReview: true, mobileMode: true,
      isAndroidRecordGallery: () => true, photoRecoveryBusy: { current: false },
      setRecoveringPhoto() {}, setRecoveryError: (value) => { error = value; },
      publicationAccessRef: { current: { ownerId: OWNER, isCurrent: () => true, revalidate: async () => true } },
      membershipScope: { current: { live: true, revoked: false, paused: false, ownerId: OWNER } },
      supabase: { auth: { getUser: async () => ({ data: { user: { id: OWNER } } }) },
        from() {
          touchedRecordLookup = true;
          const query = { select: () => query, eq: () => query,
            limit: async () => ({ data: [{ id: RECORD, archive_id: ARCHIVE, user_id: OWNER, note: "same note" }] }) };
          return query;
        } },
      peekCloudPickerResume: () => ({ requestId, phase: "submitting-unknown", fields: { text: "same note" } }),
      readRecovery: recovery.readRecovery, language: "zh",
      bindRecoveryRecord: recovery.bindRecoveryRecord, completeRecovery: recovery.completeRecovery,
      eraseRecovery: recovery.eraseRecovery, markRecoveryUnknown: recovery.markRecoveryUnknown,
      clearCloudPickerResume: () => assert.fail("pending marker must survive"),
      clearSelectedFiles: () => assert.fail("attachments must survive"),
      setSubmissionNeedsReview: () => assert.fail("pending state must survive"),
    };
    const run = new Function(...Object.keys(deps), recoverCode + "\nreturn recoverConfirmedRecordPhoto();");
    await run(...Object.values(deps));
    assert.match(error, /无法确认补图目标/);
    assert.equal(touchedRecordLookup, false);
    assert.deepEqual(state.writes, writes);
    const after = await recovery.readRecovery(OWNER, ARCHIVE, requestId);
    assert.equal(after?.recordId, before?.recordId);
    assert.equal(after?.phase, before?.phase);
    if (before) {
      assert.deepEqual(await after.photos[0].image.arrayBuffer(), await before.photos[0].image.arrayBuffer());
      await recovery.eraseRecovery(OWNER, ARCHIVE, requestId);
    }
  });
}
