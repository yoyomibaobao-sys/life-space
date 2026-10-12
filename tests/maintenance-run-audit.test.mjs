import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { build } from "esbuild";

const mockAdmin = 'export function getSupabaseAdmin() { return globalThis.__auditTest.client; }';
const mockWorker = [
  'export async function runCloudTrialLifecycle() {',
  ' const t=globalThis.__auditTest; t.lifecycleCalls++;',
  ' if (t.workerFails && t.lifecycleCalls === 1) throw Error("internal worker failure");',
  ' return { processed: 2, notificationsCreated: 0, cleanupFailed: t.lifecycleCleanupFails };',
  '}',
  'export async function runStorageDeletionWorkerBatches() {',
  ' const t=globalThis.__auditTest; t.deletionCalls++;',
  ' return {claimed:4,deleted:2,notFound:1,retainedShared:1,failed:t.deletionFails,retryScheduled:t.deletionRetryScheduled};',
  '}'
].join("\n");

async function loadRoute() {
  const result = await build({
    entryPoints: ["app/api/internal/storage-deletion-worker/route.ts"],
    bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{name: "audit-test-isolates-operations", setup(ctx) {
      ctx.onResolve({filter:/^@\/lib\/supabaseAdmin$/}, () => ({path:"admin",namespace:"audit-mock"}));
      ctx.onResolve({filter:/^@\/lib\/server\/storage-deletion-worker$/}, () => ({path:"worker",namespace:"audit-mock"}));
      ctx.onResolve({filter:/^server-only$/}, () => ({path:"empty",namespace:"audit-mock"}));
      ctx.onLoad({filter:/.*/,namespace:"audit-mock"}, args => ({
        contents: args.path==="admin"?mockAdmin:args.path==="worker"?mockWorker:"export {};",
        loader:"js"
      }));
    }}]
  });
  return import("data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].contents).toString("base64"));
}

function freshState() {
  const f={writes:[],lifecycleCalls:0,deletionCalls:0,workerFails:false,auditFails:false,lifecycleCleanupFails:0,deletionFails:0,deletionRetryScheduled:0};
  const response=async()=>({error:f.auditFails?new Error("simulated QA audit unavailable"):null});
  f.client={from(name) {
    assert.equal(name,"maintenance_run_audits");
    return {
      insert(value) {
        f.writes.push(["insert",value]);
        return {abortSignal:response};
      },
      update(value) {
        f.writes.push(["update",value]);
        return {eq(column,value) {
          assert.equal(column,"id");
          assert.equal(value,f.writes[0][1].id);
          return {abortSignal:response};
        }};
      }
    };
  }};
  globalThis.__auditTest=f;return f;
}
const originalSecret=process.env.CRON_SECRET;
test.after(()=> {if(originalSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=originalSecret;delete globalThis.__auditTest;});
const call=(headers={}) => new Request("https://example.invalid/api/internal/storage-deletion-worker",{headers});

test("missing secret and unauthorized callers never trigger audit or cleanup",async()=>{
  const api=await loadRoute();const f=freshState();
  delete process.env.CRON_SECRET;
  assert.equal((await api.GET(call())).status,503);
  process.env.CRON_SECRET="QA_FAKE_CRON_SECRET";
  assert.equal((await api.GET(call())).status,401);
  assert.equal((await api.GET(call({authorization:"Bearer wrong"}))).status,401);
  assert.equal(f.writes.length,0);assert.equal(f.lifecycleCalls,0);assert.equal(f.deletionCalls,0);
});

test("authorized Vercel Cron records zero-PII counts and preserves original response",async()=>{
  const api=await loadRoute();const f=freshState();process.env.CRON_SECRET="QA_FAKE_CRON_SECRET";
  const r=await api.GET(call({authorization:"Bearer QA_FAKE_CRON_SECRET","user-agent":"vercel-cron/1.0"}));
  assert.equal(r.status,200);const body=await r.json();
  assert.equal(body.storageDeletion.claimed,4);
  assert.equal(f.lifecycleCalls,2);assert.equal(f.deletionCalls,1);
  assert.deepEqual(f.writes.map(x=>x[0]),["insert","update"]);
  assert.equal(f.writes[0][1].source,"vercel");assert.equal(f.writes[0][1].status,"running");
  assert.equal(f.writes[1][1].status,"succeeded");
  assert.equal(f.writes[1][1].deletion_claimed,4);
  assert.equal(f.writes[1][1].deletion_completed,4);
  assert.equal(f.writes[1][1].lifecycle_processed,4);
  const serialized=JSON.stringify(f.writes);
  assert.doesNotMatch(serialized,/email|bearer|token|object_path|user_id/i);
});

test("Cloudflare scheduled requests carry their source label",async()=>{
  const api=await loadRoute();const f=freshState();process.env.CRON_SECRET="QA_FAKE_CRON_SECRET";
  const r=await api.GET(call({authorization:"Bearer QA_FAKE_CRON_SECRET","x-lifespace-maintenance-source":"cloudflare"}));
  assert.equal(r.status,200);assert.equal(f.writes[0][1].source,"cloudflare");
});

test("worker failure still responds 500 and writes failed audit",async()=>{
  const api=await loadRoute();const f=freshState();f.workerFails=true;process.env.CRON_SECRET="QA_FAKE_CRON_SECRET";
  const original=console.error;console.error=()=>{};
  try {
    const r=await api.GET(call({authorization:"Bearer QA_FAKE_CRON_SECRET"}));
    assert.equal(r.status,500);
    assert.deepEqual(f.writes.map(x=>x[0]),["insert","update"]);
    assert.equal(f.writes[1][1].status,"failed");
    assert.equal(f.writes[1][1].error_code,"worker_failed");
  }finally{console.error=original;}
});

test("partial cleanup failures keep the original response and record failed counts",async()=>{
  const api=await loadRoute();const f=freshState();process.env.CRON_SECRET="QA_FAKE_CRON_SECRET";
  f.lifecycleCleanupFails=1;f.deletionFails=2;f.deletionRetryScheduled=1;
  const r=await api.GET(call({authorization:"Bearer QA_FAKE_CRON_SECRET"}));
  assert.equal(r.status,200);
  assert.equal(f.writes[1][1].status,"failed");
  assert.equal(f.writes[1][1].error_code,"partial_failure");
  assert.equal(f.writes[1][1].lifecycle_failed,2);
  assert.equal(f.writes[1][1].deletion_failed,2);
  assert.equal(f.writes[1][1].deletion_retry_scheduled,1);
});

test("a scheduled deletion retry remains visible as an incomplete run",async()=>{
  const api=await loadRoute();const f=freshState();process.env.CRON_SECRET="QA_FAKE_CRON_SECRET";
  f.deletionRetryScheduled=1;
  assert.equal((await api.GET(call({authorization:"Bearer QA_FAKE_CRON_SECRET"}))).status,200);
  assert.equal(f.writes[1][1].status,"failed");
  assert.equal(f.writes[1][1].deletion_retry_scheduled,1);
});

test("audit unavailability cannot change the 200 or 500 cleanup outcomes",async()=>{
  const api=await loadRoute();process.env.CRON_SECRET="QA_FAKE_CRON_SECRET";
  const originalWarn=console.warn,originalErr=console.error;console.warn=()=>{};console.error=()=>{};
  try{
    let f=freshState();f.auditFails=true;
    assert.equal((await api.GET(call({authorization:"Bearer QA_FAKE_CRON_SECRET"}))).status,200);
    assert.equal(f.lifecycleCalls,2);
    f=freshState();f.auditFails=true;f.workerFails=true;
    assert.equal((await api.GET(call({authorization:"Bearer QA_FAKE_CRON_SECRET"}))).status,500);
    assert.equal(f.lifecycleCalls,1);
  }finally{console.warn=originalWarn;console.error=originalErr;}
});

test("audit source contains only count and status fields", () => {
  const source = readFileSync("lib/server/maintenance-run-audit.ts", "utf8");
  assert.match(source, /lifecycle_failed: summary.lifecycleFailed/);
  assert.match(source, /deletion_retry_scheduled: summary.deletionRetryScheduled/);
  assert.doesNotMatch(source, /object_path|email|password|service_role_key|user_id/i);
});
