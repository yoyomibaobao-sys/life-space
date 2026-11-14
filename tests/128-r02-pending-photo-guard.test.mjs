import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const fixture = Uint8Array.from([255,216,255,224,0,16,74,70,73,70,0,1,1,1,2,3,4,5,6,255,217]);
const fakeJPEG = (name="qa128.jpg") => new File([fixture], name, {type:"image/jpeg"});
const bundled = await build({
  entryPoints:["lib/pending-sync-photo-guard.ts"],
  bundle:true, format:"esm", platform:"node", write:false,
});
const {restorePendingPhotoFile,preparePendingSyncPhoto,validatePendingPhotoBytes} =
  await import("data:text/javascript;base64,"+Buffer.from(bundled.outputFiles[0].contents).toString("base64"));

function sourceImage(blob, opts={}) {
  return {id:"local_image_qa128",blob,mime_type:"image/jpeg",
    name:"qa128.jpg",cached_size:fixture.byteLength,
    metadata_stripped:true,...opts};
}
function codecs({failThumb=false, badThumb=false, standardCalls=null}={}) {
  return {
    async standardize(file, flags) {
      if (standardCalls) standardCalls.push(flags);
      return {file,width:100,height:100};
    },
    async thumbnail(file) {
      if (failThumb) return {file,wasGenerated:false};
      if (badThumb) return {file:new File(["corrupt"],"bad.jpg",{type:"image/jpeg"}),wasGenerated:true};
      return {file:new File([fixture],"thumb-qa128.jpg",{type:"image/jpeg"}),wasGenerated:true};
    },
  };
}
test("R01 reproduced: direct File from IndexedDB byte-backed object is 15 ASCII bytes", async()=>{
  const wrapper={data:fixture.buffer.slice(0),type:"image/jpeg"};
  const raw=new File([wrapper],"broken.jpg",{type:"image/jpeg"});
  assert.equal(raw.size,15);
  assert.equal(await raw.text(),"[object Object]");
});
test("new IndexedDB {data:ArrayBuffer,type} restores actual JPEG instead of 15 bytes",async()=>{
  const stored={data:fixture.buffer.slice(0),type:"image/jpeg"};
  const result=await restorePendingPhotoFile(sourceImage(stored));
  assert.equal(result.size,fixture.length);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()),fixture);
});
test("legacy Blob remains compatible",async()=>{
  const result=await restorePendingPhotoFile(sourceImage(new Blob([fixture],{type:"image/jpeg"})));
  assert.equal(result.size,fixture.length);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()),fixture);
});
test("metadata_stripped still verifies source and prepares a separate JPEG thumbnail",async()=>{
  const standardCalls=[];
  const result=await preparePendingSyncPhoto(sourceImage({data:fixture.buffer.slice(0),type:"image/jpeg"}),codecs({standardCalls}));
  assert.equal(result.uploadFile.size,fixture.byteLength);
  assert.equal(result.thumbFile.type,"image/jpeg");
  assert.equal(result.thumbFile.size,fixture.byteLength);
  assert.equal(standardCalls.length,0);
});
test("unsanitized image goes through secure standardization and always generates thumbnail",async()=>{
  const standardCalls=[];
  const result=await preparePendingSyncPhoto(sourceImage(new Blob([fixture],{type:"image/jpeg"}),{metadata_stripped:false}),codecs({standardCalls}));
  assert.equal(standardCalls.length,1);
  assert.equal(standardCalls[0].requireSanitized,true);
  assert.ok(result.standardized);
  assert.equal(result.thumbFile.size,fixture.byteLength);
});
test("invalid object and 15-byte text cannot be reuploaded",async()=>{
  await assert.rejects(restorePendingPhotoFile(sourceImage({data:{a:1},type:"image/jpeg"})),/图片字节无效/);
  await assert.rejects(restorePendingPhotoFile(sourceImage(new Blob(["[object Object]"],{type:"image/jpeg"}),{cached_size:15})),/图片字节无效/);
});
test("cached size mismatch and wrong MIME signature fail before remote work",async()=>{
  await assert.rejects(restorePendingPhotoFile(sourceImage({data:fixture.buffer.slice(0),type:"image/jpeg"},{cached_size:15})),/图片字节无效/);
  await assert.rejects(restorePendingPhotoFile(sourceImage(new Blob([fixture],{type:"image/png"}),{mime_type:"image/png"})),/图片字节无效/);
});
test("truncated JPEG is rejected before thumbnail/Storage",async()=>{
  const truncated=fixture.slice(0,-2);
  await assert.rejects(validatePendingPhotoBytes(new Blob([truncated],{type:"image/jpeg"}),"image/jpeg"),/图片字节无效/);
});
test("thumbnail processing failure or corrupt output rejects, keeps source promise uncommitted",async()=>{
  const image=sourceImage({data:fixture.buffer.slice(0),type:"image/jpeg"});
  await assert.rejects(preparePendingSyncPhoto(image,codecs({failThumb:true})),/缩略图/);
  await assert.rejects(preparePendingSyncPhoto(image,codecs({badThumb:true})),/缩略图/);
});
test("upload executor prepares and validates both sizes before media reservation/write",()=>{
  const source=fs.readFileSync("lib/pending-cloud-sync.ts","utf8");
  const start=source.indexOf("async function syncImage(");
  const prepare=source.indexOf("await preparePendingSyncPhoto(",start);
  const reserve=source.indexOf("await reserveStorageUpload(",start);
  const write=source.indexOf("await uploadMediaStorageObject(",start);
  assert.ok(start>0 && prepare>start && reserve>prepare && write>reserve);
  assert.match(source,/last_attempt_outcome:\s*attemptOutcome/);
  assert.match(source,/getOperationId\(image\)/);
  assert.match(source,/mirrorCommittedRecordMedia/);
  assert.match(source,/await clearPendingCloudSyncPromptIfComplete/);
});
