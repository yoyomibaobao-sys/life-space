import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const OWNER = "f99fd44d-820f-41f2-ad4e-85feb7c990a6";
const MEDIA = "ed4d0534-f686-42ff-82a6-1ab10e510063";
const QA_ORIGIN = "https://lifespace-site-media-qa-20261028.lifespace-assets-isolated-lab.workers.dev";
const QA_SUPABASE = "https://mablwxlipcgbmbnfdbkc.supabase.co";
const token = ["a", Buffer.from(JSON.stringify({iss:QA_SUPABASE+"/auth/v1"})).toString("base64url"), "signature"].join(".");
const oldEnv = Object.fromEntries(
  ["NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED", "NEXT_PUBLIC_R2_MEDIA_MIRROR_ORIGIN", "NEXT_PUBLIC_SUPABASE_URL"]
    .map(k => [k, process.env[k]])
);
const original = {
  window: globalThis.window, navigator: globalThis.navigator, fetch: globalThis.fetch,
};
const calls = [];
const journalMemory = new Map();
const mockLocalStorage = {
  get length() {return journalMemory.size;},
  key(i) {return [...journalMemory.keys()][i] || null;},
  getItem(k) {return journalMemory.get(k) ?? null;},
  setItem(k,v) {journalMemory.set(k,String(v));},
  removeItem(k) {journalMemory.delete(k);},
};
globalThis.__mirrorMockCapacitor = {
  isNativePlatform: () => globalThis.__mirrorIsNative || false,
  getPlatform: () => "android",
};
globalThis.__mirrorMockCapacitorHttp = {
  request: async options => {
    calls.push({transport:"native", ...options});
    return globalThis.__mirrorReply || {
      status:200, data:{status:"copied_verified"}, url:options.url,
    };
  },
};
globalThis.__mirrorMockSupabase = {
  auth: {
    async getUser() { return {data:{user:{id:globalThis.__mirrorCurrentOwner||OWNER}},error:null}; },
    async getSession() {
      return { data:{session:{user:{id:OWNER},access_token:globalThis.__mirrorToken||token}},error:null };
    },
  },
};
const built = await build({
  entryPoints:["lib/r2-business-media-mirror.ts"],
  bundle:true, format:"esm", platform:"node", write:false,
  plugins:[{
    name:"mirror-boundaries",
    setup(b) {
      b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:"supabase",namespace:"test-mock"}));
      b.onResolve({filter:/^@capacitor\/core$/},()=>({path:"capacitor",namespace:"test-mock"}));
      b.onLoad({filter:/.*/,namespace:"test-mock"},args=>({
        contents: args.path==="supabase"
          ? "export const supabase = globalThis.__mirrorMockSupabase"
          : "export const Capacitor = globalThis.__mirrorMockCapacitor; export const CapacitorHttp = globalThis.__mirrorMockCapacitorHttp",
        loader:"js",
      }));
    },
  }],
});
const {mirrorCommittedRecordMedia,getPendingR2MirrorCountForOwner,retryPendingR2MediaMirrorsForOwner} = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].contents).toString("base64")
);
function reset({keepJournal=false}={}) {
  if (!keepJournal) journalMemory.clear();
  calls.length=0;
  globalThis.__mirrorIsNative=false;
  globalThis.__mirrorCurrentOwner=OWNER;
  globalThis.__mirrorToken=token;
  globalThis.__mirrorReply=null;
  process.env.NEXT_PUBLIC_SUPABASE_URL=QA_SUPABASE;
  process.env.NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED="true";
  process.env.NEXT_PUBLIC_R2_MEDIA_MIRROR_ORIGIN=QA_ORIGIN;
  globalThis.window={location:{origin:QA_ORIGIN},localStorage:mockLocalStorage};
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{onLine:true}});
  globalThis.fetch=async (url,opts)=>{
    calls.push({transport:"web",url,opts});
    return { status:200,async json(){return {status:"copied_verified"};} };
  };
}
const media = {mediaId:MEDIA,ownerId:OWNER,thumbPath:OWNER+"/thumbnail.jpg"};
test("disabled by default and never dispatches a request", async()=>{
  reset(); process.env.NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED="false";
  assert.equal(await mirrorCommittedRecordMedia(media),"disabled");
  assert.equal(calls.length,0);
});
test("QA browser dispatches same-origin, Owner bearer, full before thumb", async()=>{
  reset();
  assert.equal(await mirrorCommittedRecordMedia(media),"mirrored");
  assert.deepEqual(calls.map(c=>JSON.parse(c.opts.body).variant),["full","thumb"]);
  assert(calls.every(c=>c.url===QA_ORIGIN+"/__internal/r2/business-media/mirror"));
  assert(calls.every(c=>c.opts.headers.Authorization==="Bearer "+token));
});
test("foreign Owner / Supabase issuer / production domain fail closed", async()=>{
  reset(); globalThis.__mirrorCurrentOwner="867387ba-eb8a-4233-860b-86531533fd56";
  assert.equal(await mirrorCommittedRecordMedia(media),"authentication_required");
  reset(); globalThis.__mirrorToken=["a",Buffer.from(JSON.stringify({iss:"https://other.supabase.co/auth/v1"})).toString("base64url"),"x"].join(".");
  assert.equal(await mirrorCommittedRecordMedia(media),"authentication_required");
  reset(); globalThis.window.location.origin="https://life-space.uk";
  assert.equal(await mirrorCommittedRecordMedia(media),"not_applicable");
  reset(); process.env.NEXT_PUBLIC_SUPABASE_URL="https://eidltoikfpnrzxruvawf.supabase.co";
  assert.equal(await mirrorCommittedRecordMedia(media),"not_applicable");
  assert.equal(calls.length,0);
});
test("full failure does not attempt thumb, thumbnail failure preserves retry scope",async()=>{
  reset(); globalThis.fetch=async (url,opts)=>{
    calls.push({url,opts});return {status:503,json:async()=>({error:"unavailable"})};
  };
  assert.equal(await mirrorCommittedRecordMedia(media),"full_pending");
  assert.equal(calls.length,1);
  reset();globalThis.fetch=async (url,opts)=>{
    calls.push({url,opts});
    const variant=JSON.parse(opts.body).variant;
    return {status:variant==="full"?200:503,json:async()=>({status:"copied_verified"})};
  };
  assert.equal(await mirrorCommittedRecordMedia(media),"thumb_pending");
  assert.equal(calls.length,2);
});
test("native QA uses redirect-blocked CapacitorHttp; mismatched reply is pending",async()=>{
  reset(); globalThis.__mirrorIsNative=true;
  globalThis.window.location.origin="https://localhost";
  assert.equal(await mirrorCommittedRecordMedia(media),"mirrored");
  assert.equal(calls.length,2);
  assert(calls.every(c=>c.transport==="native"&&c.disableRedirects===true));
  reset(); globalThis.__mirrorIsNative=true;
  globalThis.__mirrorReply={status:302,data:null,url:"https://life-space.uk/"};
  assert.equal(await mirrorCommittedRecordMedia(media),"full_pending");
  assert.equal(calls.length,1);
});
test("native standard build stays off unless explicitly opted into QA",async()=>{
  reset(); globalThis.__mirrorIsNative=true;
  process.env.NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED="false";
  assert.equal(await mirrorCommittedRecordMedia(media),"disabled");
  assert.equal(calls.length,0);
});

test("full failure survives a simulated reload and explicit retry verifies both sizes", async()=>{
  reset();
  globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return {status:503,json:async()=>({})};};
  assert.equal(await mirrorCommittedRecordMedia(media),"full_pending");
  assert.equal(getPendingR2MirrorCountForOwner(OWNER),1);
  const onlyStored = [...journalMemory.values()].join("");
  assert(!onlyStored.includes(token));
  assert(!onlyStored.includes("thumbnail.jpg"));
  reset({keepJournal:true});
  const result = await retryPendingR2MediaMirrorsForOwner(OWNER);
  assert.deepEqual(result,{attempted:1,completed:1,pending:0,blocked:false});
  assert.deepEqual(calls.map(c=>JSON.parse(c.opts.body).variant),["full","thumb"]);
  assert.equal(getPendingR2MirrorCountForOwner(OWNER),0);
});
test("thumb-only pending survives restart and does not repeat verified full", async()=>{
  reset();
  globalThis.fetch=async(url,opts)=>{
    calls.push({url,opts});
    return {status:JSON.parse(opts.body).variant==="thumb"?503:200,
      json:async()=>({status:"copied_verified"})};
  };
  assert.equal(await mirrorCommittedRecordMedia(media),"thumb_pending");
  reset({keepJournal:true});
  const result=await retryPendingR2MediaMirrorsForOwner(OWNER);
  assert.deepEqual(result,{attempted:1,completed:1,pending:0,blocked:false});
  assert.deepEqual(calls.map(c=>JSON.parse(c.opts.body).variant),["thumb"]);
});
test("other Owner and disabled QA cannot retry or enumerate this journal", async()=>{
  reset();
  globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return {status:503,json:async()=>({})};};
  await mirrorCommittedRecordMedia(media);
  calls.length=0;
  const other="867387ba-eb8a-4233-860b-86531533fd56";
  assert.equal(getPendingR2MirrorCountForOwner(other),0);
  assert.equal((await retryPendingR2MediaMirrorsForOwner(other)).attempted,0);
  process.env.NEXT_PUBLIC_R2_MEDIA_MIRROR_ENABLED="false";
  assert.equal(getPendingR2MirrorCountForOwner(OWNER),0);
  assert.equal((await retryPendingR2MediaMirrorsForOwner(OWNER)).blocked,true);
  assert.equal(calls.length,0);
});
test("storage failure blocks request before leaking a bearer or creating a shadow write",async()=>{
  reset();
  globalThis.window.localStorage={...mockLocalStorage,setItem(){throw Error("QuotaExceededError");}};
  assert.equal(await mirrorCommittedRecordMedia(media),"journal_unavailable");
  assert.equal(calls.length,0);
});
test("malformed persisted journal fails closed without a network request",async()=>{
  reset();
  journalMemory.set("lifespace:r2-qa-mirror:v1:"+OWNER+":"+MEDIA,JSON.stringify({unexpected:"invalid"}));
  assert.equal(await mirrorCommittedRecordMedia(media),"journal_unavailable");
  assert.equal(calls.length,0);
});
process.on("exit",()=>{
  for(const [k,v] of Object.entries(oldEnv)){
    if(v===undefined) delete process.env[k]; else process.env[k]=v;
  }
  globalThis.window=original.window;
  globalThis.fetch=original.fetch;
});
