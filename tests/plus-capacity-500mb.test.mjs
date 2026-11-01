import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const migration = read("supabase/migrations/20261030061429_align_plus_capacity_500mb.sql");
const baseline = read("tests/fixtures/plus-capacity-qa-functions.sql");
const ids = Array.from({length:10},(_,i)=>"26000000-0000-4000-8000-"+String(i+1).padStart(12,"0"));
const [admin,free,legacy,user,manual] = ids;
const signature="public.confirm_paypal_membership_payment_json(uuid,text,text,timestamptz)";

// Memory-only QA fixtures. Never connects to Supabase/PayPal or stores real orders.
const setup = [
  "create role anon; create role authenticated; create role service_role; create schema auth;",
  "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
  "create function public.is_app_admin(id uuid) returns boolean language sql stable as $$ select id='26000000-0000-4000-8000-000000000001'::uuid $$;",
  "create table auth.users(id uuid primary key,email text);",
  "create table public.users(id uuid primary key,username text,created_at timestamptz,role text,status text);",
  "create table profiles(id uuid primary key,username text,storage_limit bigint,storage_used bigint,updated_at timestamptz);",
  "create table user_memberships(user_id uuid primary key,plan text,status text,trial_started_at timestamptz,trial_ends_at timestamptz,paid_until timestamptz,storage_limit_bytes bigint,base_market_post_limit integer,updated_at timestamptz);",
  "create table membership_payments(id uuid primary key default gen_random_uuid(),user_id uuid,plan text,status text,amount numeric,currency text,payment_method text,payment_reference text,note text,paid_at timestamptz,service_started_at timestamptz,service_ends_at timestamptz,created_by uuid,updated_at timestamptz,created_at timestamptz default now(),order_number text,proof_path text,submitted_at timestamptz,reviewed_at timestamptz,reviewed_by uuid,review_note text,expires_at timestamptz,closed_at timestamptz,close_reason text,provider_order_id text unique,provider_capture_id text unique,provider_paid_at timestamptz);"
].join("\n");

async function snapshot(db,id) {
  return (await db.query("select (select to_jsonb(m) from user_memberships m where user_id=$1) membership,(select to_jsonb(p) from profiles p where id=$1) profile,(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from membership_payments p where user_id=$1) payments",[id])).rows[0];
}
async function seed(db,n,method="paypal",status="pending_payment") {
  const id=ids[n];
  await db.query("insert into membership_payments(id,user_id,plan,status,amount,currency,payment_method,order_number,provider_order_id,proof_path,submitted_at) values($1,$2,'basic',$3,$4,$5,$6,$7,$8,$9,now())",
    [id,user,status,method==="paypal"?8:64,method==="paypal"?"USD":"CNY",method,"R26-INVOICE-"+n,method==="paypal"?"R26-ORDER-"+n:null,method==="paypal"?null:"isolated-proof"]);
  return id;
}
async function confirm(db,n) {
  return (await db.query("select confirm_paypal_membership_payment_json($1,$2,$3,'2026-10-30T04:53:57Z') result",[ids[n],"R26-ORDER-"+n,"R26-CAPTURE-"+n])).rows[0].result;
}
async function assert500Year(db,id=user) {
  const s=await snapshot(db,id),p=s.payments.at(-1);
  assert.equal(Number(s.membership.storage_limit_bytes),500000000);
  assert.equal(Number(s.profile.storage_limit),500000000);
  assert.equal(s.membership.status,"active");
  assert.equal(s.membership.plan,"basic");
  const r=(await db.query("select service_ends_at=service_started_at+interval '12 months' as one_year from membership_payments where id=$1",[p.id])).rows[0];
  assert.equal(r.one_year,true);
  assert.equal(s.membership.paid_until,p.service_ends_at);
}

async function webhook(db,id) {
  const mocks={
    "next/server":"export const NextResponse={json:(v,o={})=>Response.json(v,o)};",
    "@/lib/paypal-runtime-gate":"export const isPayPalRuntimeEnabled=()=>true;",
    "@/lib/paypal":"export const PAYPAL_MEMBERSHIP_AMOUNT='8.00';export const PAYPAL_MEMBERSHIP_CURRENCY='USD';export const verifyPayPalWebhookSignature=async()=>true;export const getPayPalOrder=()=>{throw Error('duplicate must not query PayPal')};export const capturePayPalOrder=()=>{throw Error('duplicate must not capture')};export const getCompletedMembershipCapture=()=>{throw Error('duplicate must not parse')};",
    "@/lib/paypal-membership":"export const confirmMembershipFromPayPalOrder=()=>{throw Error('duplicate must not grant')};",
    "@/lib/supabaseAdmin":"export const getSupabaseAdmin=()=>globalThis.r26Admin;"
  };
  const bundle=await build({entryPoints:[path.join(process.cwd(),"app/api/paypal/webhook/route.ts")],bundle:true,platform:"node",format:"cjs",write:false,
    plugins:[{name:"r26-no-network",setup(p){
      p.onResolve({filter:/^(next\/server|@\/lib\/.*)$/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:"mock"}:null);
      p.onLoad({filter:/.*/,namespace:"mock"},a=>({contents:mocks[a.path],loader:"js"}));
    }}]});
  const r26Admin={from:()=>({select(){return this;},eq(){return this;},async maybeSingle(){return {data:(await db.query("select * from membership_payments where id=$1",[id])).rows[0],error:null};}})};
  const module={exports:{}};
  new Function("module","exports","globalThis","Response","console",bundle.outputFiles[0].text)(module,module.exports,{r26Admin},Response,console);
  return module.exports.POST;
}

test("Historical R26 intermediate 500 MB migration, superseded by the 1 GB forward correction (PGlite only)",async(t)=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(setup);await db.exec(baseline);
  await db.exec("revoke all on function "+signature+" from public,anon,authenticated;grant execute on function "+signature+" to service_role;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  for(const id of ids.slice(0,5)){
    await db.query("insert into auth.users values($1,$2)",[id,id+"@isolated.example.test"]);
    await db.query("insert into profiles values($1,'fixture',30000000,1000,'2026-01-01Z')",[id]);
  }
  await db.query("insert into user_memberships(user_id,plan,status,paid_until,storage_limit_bytes,base_market_post_limit,updated_at) values($1,'trial','trialing',null,30000000,3,'2026-01-01Z'),($2,'basic','active','2030-01-01Z',1000000000,30,'2026-01-01Z')",[free,legacy]);
  await db.query("update profiles set storage_limit=1000000000 where id=$1",[legacy]);
  const freeBefore=await snapshot(db,free),legacyBefore=await snapshot(db,legacy);
  await t.test("migration changes only two quota literals per function, preserves metadata and stored rows; rerun is safe",async()=>{
    const sql="select oid,proname,prosrc,proacl::text,proowner,proconfig,prosecdef from pg_proc where proname in ('confirm_paypal_membership_payment_json','admin_confirm_membership_payment_json','admin_confirm_submitted_membership_payment_json') order by proname";
    const before=(await db.query(sql)).rows;await db.exec(migration);const after=(await db.query(sql)).rows;
    assert.equal(after.length,3);
    for(let i=0;i<3;i++){
      assert.equal(after[i].prosrc,before[i].prosrc.replaceAll("1000000000","500000000"));
      for(const key of ["oid","proacl","proowner","proconfig","prosecdef"]) assert.deepEqual(after[i][key],before[i][key]);
    }
    await db.exec(migration);
    assert.deepEqual(await snapshot(db,free),freeBefore);assert.deepEqual(await snapshot(db,legacy),legacyBefore);
    assert.deepEqual((await db.query("select has_function_privilege('anon',$1,'execute') anon,has_function_privilege('authenticated',$1,'execute') authenticated,has_function_privilege('service_role',$1,'execute') service_role",[signature])).rows[0],{anon:false,authenticated:false,service_role:true});
  });
  await t.test("new Plus grants 500 MB in both database fields for exactly twelve months",async()=>{
    await seed(db,5);assert.equal((await confirm(db,5)).ok,true);await assert500Year(db);
  });
  await t.test("same completed Webhook twice and same RPC preserve capacity, dates, timestamps and payment history",async()=>{
    const before=await snapshot(db,user),post=await webhook(db,ids[5]);
    for(let i=0;i<2;i++){
      const req=new Request("https://isolated.example/api/paypal/webhook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:"R26-SAME-EVENT",event_type:"PAYMENT.CAPTURE.COMPLETED",resource:{id:"R26-CAPTURE-5",supplementary_data:{related_ids:{order_id:"R26-ORDER-5"}}}})});
      assert.equal((await post(req)).status,200);
    }
    assert.equal((await confirm(db,5)).already_confirmed,true);assert.deepEqual(await snapshot(db,user),before);
  });
  await t.test("active renewal grants 500 MB and adds twelve months from existing paid end",async()=>{
    await db.query("update user_memberships set paid_until='2030-02-01Z',storage_limit_bytes=1000000000 where user_id=$1",[user]);
    await seed(db,6);assert.equal((await confirm(db,6)).ok,true);await assert500Year(db);
    const p=(await snapshot(db,user)).payments.find(p=>p.id===ids[6]);assert.equal(Date.parse(p.service_started_at),Date.parse("2030-02-01T00:00:00Z"));
  });
  await t.test("expired renewal starts now and grants 500 MB for twelve months",async()=>{
    await db.query("update user_memberships set paid_until='2020-01-01Z',storage_limit_bytes=1000000000 where user_id=$1",[user]);
    await seed(db,7);const start=Date.now();assert.equal((await confirm(db,7)).ok,true);await assert500Year(db);
    const p=(await snapshot(db,user)).payments.find(p=>p.id===ids[7]);assert.ok(Date.parse(p.service_started_at)>=start-1000 && Date.parse(p.service_started_at)<=Date.now()+1000);
  });
  await t.test("submitted manual payment grants 500 MB and twelve months; duplicate leaves all fields unchanged",async()=>{
    await seed(db,8,"alipay","submitted");
    const r=(await db.query("select admin_confirm_submitted_membership_payment_json($1) result",[ids[8]])).rows[0].result;
    assert.equal(r.ok,true);await assert500Year(db);
    const before=await snapshot(db,user);
    assert.equal((await db.query("select admin_confirm_submitted_membership_payment_json($1) result",[ids[8]])).rows[0].result.already_confirmed,true);
    assert.deepEqual(await snapshot(db,user),before);
  });
  await t.test("manual basic default is 500 MB; explicitly authorized custom/legacy quota is not removed",async()=>{
    let r=(await db.query("select admin_confirm_membership_payment_json($1,'basic',64,'CNY','manual','R26-DEFAULT') result",[manual])).rows[0].result;
    assert.equal(r.ok,true);await assert500Year(db,manual);
    r=(await db.query("select admin_confirm_membership_payment_json($1,'basic',65,'CNY','manual','R26-CUSTOM',null,now(),12,1000000000,30) result",[manual])).rows[0].result;
    assert.equal(r.ok,true);assert.equal(Number(r.storage_limit_bytes),1000000000);
  });
  await t.test("Free/trial and untouched historical paid rows remain byte-for-byte identical",async()=>{
    assert.deepEqual(await snapshot(db,free),freeBefore);assert.deepEqual(await snapshot(db,legacy),legacyBefore);
  });
  await t.test("unknown function drift blocks the entire migration atomically",async()=>{
    const sql="select proname,prosrc from pg_proc where proname like '%membership_payment_json' order by proname";
    await db.exec(baseline.replace("missing_paypal_confirmation","drifted_missing_confirmation"));
    const before=(await db.query(sql)).rows;
    await assert.rejects(db.exec(migration),/function drift/);
    assert.deepEqual((await db.query(sql)).rows,before);
  });
});

test("R26 current UI defaults and bilingual Plus offers are 1 GB",()=>{
  const adminSource=read("app/admin/memberships/page.tsx");
  assert.match(adminSource,/key: "basic",\s+storageLimitBytes: 1_000_000_000,/);
  assert.match(adminSource,/useState\("1000000000"\)/);

  for(const lang of ["zh","en"]){
    const source=read("lib/i18n/"+lang+".ts");
    assert.match(source,/cloud_storage_hint: "[^"]*1 ?GB/);
    assert.match(source,/plan_basic_note: "[^"]*1 ?GB/);
    assert.doesNotMatch(source,/500 ?MB/);
  }
});
