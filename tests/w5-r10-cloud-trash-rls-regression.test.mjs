import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import vm from "node:vm";

const shell = readFileSync(new URL("../mobile-offline-src/main.tsx", import.meta.url), "utf8");
const nativeApi = readFileSync(new URL("../lib/android-remote-api.ts", import.meta.url), "utf8");
const source = readFileSync(new URL("../lib/cloud-trash.ts", import.meta.url), "utf8");
const QA = "https://mablwxlipcgbmbnfdbkc.supabase.co";
const USER = "f99fd44d-820f-41f2-ad4e-85feb7c990a6";
const ARCHIVE = "a5fda51d-bddc-43ce-ac65-3a695eda6a4e";

const output = await build({
  entryPoints: [fileURLToPath(new URL("../lib/cloud-trash.ts", import.meta.url))],
  bundle: true, platform: "browser", format: "iife", globalName: "__trashExports",
  write: false, logLevel: "silent",
  plugins: [{
    name: "isolated-trash-dependencies", setup(b) {
      b.onResolve({filter: /^(?:@\/lib\/supabase|@capacitor\/core|@\/lib\/android-remote-api)$/}, args =>
        ({path:args.path, namespace:"mock"}));
      b.onLoad({filter:/.*/, namespace:"mock"}, args => ({
        loader:"js", contents: args.path.endsWith("/supabase")
          ? "export const supabase = globalThis.__supabase;"
          : args.path === "@capacitor/core"
            ? "export const Capacitor = { isNativePlatform: () => globalThis.__native };"
            : "export const requestAndroidRemoteApi = (...a) => globalThis.__remote(...a);",
      }));
    },
  }],
});
const js = output.outputFiles[0].text;

function setup({native=true, url=QA, actor=USER, rpcResponse, remoteResponse, fetchResponse}={}) {
  const calls = {rpc:[], remote:[], http:[]};
  const client = {
    auth:{
      async getSession(){return {data:{session:{access_token:"private-test-token",user:{id:actor}}}};},
      async getUser(){return {data:{user:actor?{id:actor}:null},error:actor?null:{message:"unauthorized"}};},
    },
    async rpc(name,params) {
      calls.rpc.push({name,params});
      return rpcResponse ? rpcResponse(name,params) : {data:[{ok:true}],error:null};
    },
  };
  const context={
    __native:native, __supabase:client,
    __remote:async(path,opt)=>{calls.remote.push({path,opt});return remoteResponse||{status:200,data:{ok:true,action:"trashed"}};},
    process:{env:{NEXT_PUBLIC_SUPABASE_URL:url}},
    fetch:async(path,init)=>{calls.http.push({path,init});return fetchResponse||new Response(JSON.stringify({ok:true,action:"trashed"}),{status:200});},
    Headers,Response,Request,URL,JSON,Math,Number,Array,Object,String,Error,
  };
  vm.runInNewContext(js,context);
  return {api:context.__trashExports,calls};
}
const listRow = {
  trash_entry_id:"c44ad559-8b5d-4606-92b1-ef25cd8c22c1",
  target_type:"archive", target_id:ARCHIVE, deleted_at:"2026-11-02T12:00:00Z",
  status:"active", display_title:"QA测试项目", parent_title:null,
  child_record_count:0, child_media_count:0, can_retry:false,
};

test("R10 Android card uses existing cloud-trash operation; no direct trashed_at UPDATE",()=>{
  const actions=shell.slice(shell.indexOf("function renderProjectActions("),shell.indexOf("const baseNavigationItems"));
  assert.match(actions,/requestCloudTrash\("archives", archive\.id\)/);
  assert.match(actions,/action: \(\) => \{ void moveCloudToTrash\(\); \}/);
  assert.doesNotMatch(actions,/mutate\(\{ trashed_at: /);
  assert.match(actions,/typeof error\.message === "string"/);
  assert.doesNotMatch(actions,/showToast\(error instanceof Error \? error\.message : String\(error\)\)/);
  assert.match(shell.slice(shell.indexOf("function AndroidLocalTrash("),shell.indexOf("function readMobileOverlayOpen(")),/await emptyCloudTrash\(\)/);
  assert.match(nativeApi,/qa_export_to_production_rejected/);
});

test("QA native Owner move reuses authenticated move_archive_to_trash; never reaches production API",async()=>{
  const f=setup();
  assert.equal(await f.api.requestCloudTrash("archives",ARCHIVE),true);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.rpc)),[{name:"move_archive_to_trash",params:{p_archive_id:ARCHIVE}}]);
  assert.equal(f.calls.remote.length,0);
  assert.equal(f.calls.http.length,0);
});

test("QA RPC rejects nonowner, unauthenticated, and database errors without pretending success",async()=>{
  for(const response of [{data:[{ok:false,error_code:"not_found_or_forbidden"}],error:null},
                         {data:null,error:{code:"42501",message:"denied"}}]){
    const f=setup({actor:null,rpcResponse:()=>response});
    assert.equal(await f.api.requestCloudTrash("archives",ARCHIVE),false);
    assert.equal(f.calls.rpc.length,1);
    assert.equal(f.calls.remote.length,0);
  }
});

test("QA native list uses Owner-scoped RPC, validates rows, maps without privileged preview",async()=>{
  const f=setup({rpcResponse:(name)=>({data:[listRow,
    { ...listRow, target_type:"unknown" },{ ...listRow, trash_entry_id:null }],error:null})});
  const result=await f.api.fetchCloudTrash();
  assert.equal(result.ok,true);
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].id,ARCHIVE);
  assert.equal(result.items[0].type,"archive");
  assert.equal(result.items[0].previewUrl,null);
  assert.equal(result.items[0].title,"QA测试项目");
  assert.deepEqual(f.calls.rpc,[{name:"list_my_trash_entries",params:undefined}]);
  assert.equal(f.calls.remote.length,0);
});

test("QA native restore uses installed Owner-scoped restore RPC and keeps permission failures false",async()=>{
  const f=setup();
  assert.equal(await f.api.restoreCloudTrashItem("archive",ARCHIVE),true);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.rpc)),[{name:"restore_archive_from_trash",params:{p_archive_id:ARCHIVE}}]);
  const denied=setup({rpcResponse:()=>({data:[{ok:false,error_code:"not_found_or_forbidden"}],error:null})});
  assert.equal(await denied.api.restoreCloudTrashItem("archive",ARCHIVE),false);
  assert.equal(denied.calls.remote.length,0);
});

test("production-native and web retain existing authenticated REST paths",async()=>{
  const prod=setup({url:"https://production-project.supabase.co"});
  assert.equal(await prod.api.requestCloudTrash("archives",ARCHIVE),true);
  assert.equal(prod.calls.rpc.length,0);
  assert.equal(prod.calls.remote.length,1);
  assert.equal(prod.calls.remote[0].path,"/api/archives/"+ARCHIVE);
  assert.equal(prod.calls.remote[0].opt.method,"DELETE");
  const browser=setup({native:false,url:QA});
  assert.equal(await browser.api.requestCloudTrash("archives",ARCHIVE),true);
  assert.equal(browser.calls.rpc.length,0);
  assert.equal(browser.calls.http[0].path,"/api/archives/"+ARCHIVE);
});
